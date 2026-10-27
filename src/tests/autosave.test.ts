import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AutosaveController, type SaveState } from '../storage/autosave';
import { createDrawing } from '../storage/documents';
import { ok, err, appError, type Result } from '../lib/errors';
import type { DrawingDocument, DrawingMetadata } from '../storage/schemas';

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

describe('AutosaveController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes once after the debounce window, not on every change', async () => {
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => ok(metadataFor(document)));
    const controller = new AutosaveController({ save, debounceMs: 800 });

    controller.schedule(createDrawing());
    controller.schedule(createDrawing());
    controller.schedule(createDrawing());
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('commits the newest revision and reports saved state', async () => {
    const saved: DrawingDocument[] = [];
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => {
      saved.push(document);
      return ok(metadataFor(document));
    });
    const states: SaveState[] = [];
    const controller = new AutosaveController({
      save,
      debounceMs: 100,
      onStateChange: (state) => states.push(state),
    });

    const first = createDrawing({ title: 'first' });
    const second = createDrawing({ id: first.id, title: 'second' });
    controller.schedule(first);
    await vi.advanceTimersByTimeAsync(50);
    controller.schedule(second);
    await vi.advanceTimersByTimeAsync(120);

    expect(saved.at(-1)?.title).toBe('second');
    expect(controller.getState().status).toBe('saved');
    expect(states.map((state) => state.status)).toContain('pending');
  });

  it('never runs two writes concurrently', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 200));
      inFlight -= 1;
      return ok(metadataFor(document));
    });
    const controller = new AutosaveController({ save, debounceMs: 50, maxWaitMs: 2000 });

    const base = createDrawing();
    controller.schedule(base);
    await vi.advanceTimersByTimeAsync(60);
    controller.schedule({ ...base, title: 'during-flight' });
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(400);

    expect(maxConcurrent).toBe(1);
    expect(save.mock.calls.at(-1)?.[0].title).toBe('during-flight');
  });

  it('flushes immediately when asked', async () => {
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => ok(metadataFor(document)));
    const controller = new AutosaveController({ save, debounceMs: 5000 });
    controller.schedule(createDrawing());
    await controller.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed save and retries the pending revision', async () => {
    let attempt = 0;
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => {
      attempt += 1;
      if (attempt === 1) return err(appError('storage-quota-exceeded', 'Storage full', 'Export your work'));
      return ok(metadataFor(document));
    });
    const controller = new AutosaveController({ save, debounceMs: 50 });

    controller.schedule(createDrawing());
    await vi.advanceTimersByTimeAsync(60);
    expect(controller.getState().status).toBe('failed');
    expect(controller.getState().errorMessage).toBe('Storage full');
    expect(controller.getState().errorHint).toBe('Export your work');

    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('saved');
  });

  it('does not write after dispose', async () => {
    const save = vi.fn(async (document: DrawingDocument): Promise<Result<DrawingMetadata>> => ok(metadataFor(document)));
    const controller = new AutosaveController({ save, debounceMs: 50 });
    controller.schedule(createDrawing());
    controller.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
});
