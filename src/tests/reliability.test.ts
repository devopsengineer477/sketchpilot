import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveController } from '../storage/autosave';
import { createDrawing, withTimestamp } from '../storage/documents';
import { ok, err, appError, type Result } from '../lib/errors';
import type { DrawingDocument, DrawingMetadata } from '../storage/schemas';
import { parseLibraryArchive } from '../export/archive';
import { parseImportedDrawing, serializeDrawing } from '../export/io';
import { SCHEMA_VERSION, APP_VERSION } from '../storage/schemas';

/**
 * Reliability suite (plan P5-T2).
 *
 * These are not feature tests: they are the "what happens after a long day, a jammed
 * keyboard, and a 200-element diagram" tests. Every one of them would have been the kind
 * of bug a user reports as "it lost my work".
 */

function metadataFor(document: DrawingDocument): DrawingMetadata {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    elementCount: document.elements.length,
    favorite: false,
    hasThumbnail: false,
  };
}

/** A rectangle element with just enough shape for validation and export. */
function element(index: number) {
  return {
    id: `el-${index}`,
    type: 'rectangle' as const,
    x: (index % 20) * 120,
    y: Math.floor(index / 20) * 90,
    width: 100,
    height: 60,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid' as const,
    strokeWidth: 1,
    strokeStyle: 'solid' as const,
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 as const },
    seed: index + 1,
    version: 1,
    versionNonce: index + 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

describe('autosave soak (10 cycles)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('survives ten debounce cycles without losing or duplicating a write', async () => {
    const written: string[] = [];
    const controller = new AutosaveController({
      save: async (document) => {
        written.push(document.id);
        return ok(metadataFor(document));
      },
      debounceMs: 800,
    });
    const base = createDrawing({ title: 'soak' });

    for (let cycle = 1; cycle <= 10; cycle += 1) {
      controller.schedule(withTimestamp({ ...base, elements: Array.from({ length: cycle }, (_, i) => element(i)) as never }));
      await vi.advanceTimersByTimeAsync(900);
      // Each cycle produces exactly one write, and it is for the newest revision.
      expect(written).toHaveLength(cycle);
    }

    expect(controller.getState().status).toBe('saved');
  });

  it('turns a burst of edits without a pause into one forced write past maxWait', async () => {
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => ok(metadataFor(document)));
    const controller = new AutosaveController({ save, debounceMs: 800, maxWaitMs: 2_000 });
    const base = createDrawing();

    // Edits every 100 ms for 5 s: the debounce never fires on its own, maxWait must.
    for (let elapsed = 0; elapsed < 5_000; elapsed += 100) {
      controller.schedule(withTimestamp({ ...base, elements: [element(elapsed / 100)] as never }));
      await vi.advanceTimersByTimeAsync(100);
    }

    // maxWait forced a write mid-burst; the tail is flushed once the burst ends.
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(save.mock.calls.length).toBeLessThan(15);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.getState().status).toBe('saved');
  });

  it('does not pile up writes when saves are slow (interrupted-write simulation)', async () => {
    let inFlight = 0;
    let peak = 0;
    const controller = new AutosaveController({
      save: async (document) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        // A slow disk: 300 ms per write.
        await new Promise((resolve) => setTimeout(resolve, 300));
        inFlight -= 1;
        return ok(metadataFor(document));
      },
      debounceMs: 100,
    });
    const base = createDrawing();

    for (let index = 0; index < 20; index += 1) {
      controller.schedule(withTimestamp({ ...base, elements: [element(index)] as never }));
      await vi.advanceTimersByTimeAsync(120);
    }
    await vi.advanceTimersByTimeAsync(2_000);

    expect(peak).toBe(1);
  });
});

describe('undo/redo fuzz on the save path', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lands on the last revision after a rapid random walk of document states', async () => {
    const saved: DrawingDocument[] = [];
    const controller = new AutosaveController({
      save: async (document) => {
        saved.push(document);
        return ok(metadataFor(document));
      },
      debounceMs: 50,
    });
    const base = createDrawing({ title: 'fuzz' });

    // Deterministic pseudo-random walk — reproducible when it fails.
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };

    let count = 0;
    for (let step = 0; step < 200; step += 1) {
      count = next() > 0.5 ? count + 1 : Math.max(0, count - 1);
      controller.schedule(
        withTimestamp({ ...base, title: `step-${step}`, elements: Array.from({ length: count }, (_, i) => element(i)) as never }),
      );
      if (step % 7 === 0) await vi.advanceTimersByTimeAsync(60);
    }
    await vi.advanceTimersByTimeAsync(500);

    const last = saved[saved.length - 1];
    expect(last).toBeTruthy();
    expect(last!.title).toBe('step-199');
    expect(last!.elements).toHaveLength(count);
  });

  it('recovers cleanly from a failed save and reports it exactly once', async () => {
    let attempts = 0;
    const states: string[] = [];
    const controller = new AutosaveController({
      save: async (document) => {
        attempts += 1;
        if (attempts === 1) return err(appError('storage-quota-exceeded', 'Storage full', 'Export your work'));
        return ok(metadataFor(document));
      },
      debounceMs: 50,
      onStateChange: (state) => states.push(state.status),
    });

    controller.schedule(createDrawing());
    await vi.advanceTimersByTimeAsync(60);
    expect(controller.getState().status).toBe('failed');
    // The controller retries the pending revision by itself rather than waiting for the user.
    await vi.advanceTimersByTimeAsync(600);
    expect(states.filter((status) => status === 'failed')).toHaveLength(1);
    expect(controller.getState().status).toBe('saved');
  });
});

describe('200-element stress scene', () => {
  it('round-trips a 200-element drawing through JSON export and import unchanged', () => {
    const drawing = createDrawing({
      title: 'stress',
      elements: Array.from({ length: 200 }, (_, index) => element(index)) as never,
    });

    const serialized = serializeDrawing(drawing);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe('sketchpilot');
    expect(parsed.drawing.elements).toHaveLength(200);

    const validated = parseImportedDrawing(serialized, 'stress.json');
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.elements).toHaveLength(200);
    // Import is deliberately additive: the content survives, under a fresh id.
    expect(validated.value.id).not.toBe(drawing.id);
    expect(validated.value.elements.map((element) => element.id)).toEqual(
      drawing.elements.map((element) => element.id),
    );
  });

  it('keeps a 200-element archive under a sane size and re-imports it', () => {
    const drawing = createDrawing({
      title: 'stress',
      elements: Array.from({ length: 200 }, (_, index) => element(index)) as never,
    });
    const archive = JSON.stringify({
      type: 'sketchpilot-library',
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: Date.now(),
      drawings: [drawing],
      templates: [],
    });
    expect(archive.length).toBeLessThan(4_000_000);

    const parsed = parseLibraryArchive(archive);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.drawings[0]!.elements).toHaveLength(200);
  });

  it('rejects rather than truncates a scene that is too large to be real', () => {
    const drawing = createDrawing({
      title: 'absurd',
      elements: Array.from({ length: 60_000 }, (_, index) => element(index)) as never,
    });
    expect(() => serializeDrawing(drawing)).not.toThrow();
    const validated = parseImportedDrawing(serializeDrawing(drawing), 'absurd.json');
    expect(validated.ok).toBe(false);
  });
});
