import { describe, expect, it } from 'vitest';
import { createDrawing } from '../storage/documents';
import {
  parseImportedDrawing,
  sanitizeSvg,
  serializeDrawing,
  suggestedFileName,
} from '../export/io';
import { SCHEMA_VERSION } from '../storage/schemas';

const rectangle = {
  id: 'rect-1',
  type: 'rectangle' as const,
  x: 10,
  y: 20,
  width: 120,
  height: 80,
  strokeColor: '#1e1e1e',
};

describe('import validation', () => {
  it('round-trips a drawing through export and import', () => {
    const drawing = createDrawing({ title: 'Round trip', elements: [rectangle] });
    const exported = serializeDrawing(drawing);
    const imported = parseImportedDrawing(exported);

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.value.title).toBe('Round trip');
      expect(imported.value.elements).toHaveLength(1);
      expect(imported.value.elements[0]?.x).toBe(10);
    }
  });

  it('assigns a new id so imports never overwrite existing drawings', () => {
    const drawing = createDrawing({ title: 'Copy me' });
    const imported = parseImportedDrawing(serializeDrawing(drawing));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.value.id).not.toBe(drawing.id);
  });

  it.each([
    ['not json at all', 'That file is not valid JSON'],
    ['{"type":"sketchpilot"}', 'malformed'],
    ['{"hello":"world"}', 'does not look like a SketchPilot drawing'],
    ['[1,2,3]', 'does not look like a SketchPilot drawing'],
  ])('rejects %s safely', (raw, expectedMessage) => {
    const result = parseImportedDrawing(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-import');
      expect(result.error.message).toContain(expectedMessage);
      expect(result.error.hint).toBeTruthy();
    }
  });

  it('rejects a file written by a newer schema version', () => {
    const drawing = createDrawing({ title: 'Future' });
    const payload = JSON.parse(serializeDrawing(drawing));
    payload.schemaVersion = SCHEMA_VERSION + 5;
    payload.drawing.schemaVersion = SCHEMA_VERSION + 5;

    const result = parseImportedDrawing(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-version');
      expect(result.error.hint).toContain('Update the extension');
    }
  });

  it('rejects duplicate element ids instead of loading a corrupt document', () => {
    const drawing = createDrawing({ title: 'Dupes' });
    const payload = JSON.parse(serializeDrawing(drawing));
    payload.drawing.elements = [rectangle, { ...rectangle }];

    const result = parseImportedDrawing(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('invalid elements');
  });

  it('rejects non-finite geometry', () => {
    const drawing = createDrawing({ title: 'NaN' });
    const serialized = serializeDrawing(drawing).replace('"elements": []', '"elements": []');
    const payload = JSON.parse(serialized);
    payload.drawing.elements = [{ ...rectangle, x: Number.POSITIVE_INFINITY }];

    const result = parseImportedDrawing(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });

  it('accepts a raw .excalidraw file', () => {
    const file = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [rectangle],
      appState: { viewBackgroundColor: '#ffffff' },
    });
    const result = parseImportedDrawing(file, 'my-diagram.excalidraw');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('my-diagram');
      expect(result.value.elements).toHaveLength(1);
    }
  });

  it('accepts a bare document with an elements array', () => {
    const drawing = createDrawing({ title: 'Bare', elements: [rectangle] });
    const result = parseImportedDrawing(JSON.stringify(drawing));
    expect(result.ok).toBe(true);
  });

  it('rejects oversized payloads before parsing', () => {
    const huge = 'x'.repeat(13 * 1024 * 1024);
    const result = parseImportedDrawing(huge);
    expect(result.ok).toBe(false);
  });
});

describe('svg sanitisation', () => {
  it('strips scripts, event handlers and javascript: urls', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(2)"><rect onclick="alert(3)" width="10" height="10"/></a><foreignObject><div>x</div></foreignObject></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).toContain('<rect');
  });

  it('drops the engine provenance comment from the exported file', () => {
    const stamped = `<svg xmlns="http://www.w3.org/2000/svg"><!-- svg-source:excalidraw --><rect width="10" height="10"/></svg>`;
    const clean = sanitizeSvg(stamped);
    expect(clean).not.toMatch(/excalidraw/i);
    expect(clean).not.toMatch(/<!--/);
    expect(clean).toContain('<rect');
  });
});

describe('file naming', () => {
  it('produces a safe, readable file name', () => {
    expect(suggestedFileName('My CI/CD Pipeline!', 'png')).toBe('my-ci-cd-pipeline.png');
    expect(suggestedFileName('   ', 'json')).toBe('sketchpilot-drawing.json');
  });
});
