import { describe, expect, it } from 'vitest';
import {
  LABEL_FONT_SIZE,
  PALETTE_SYMBOLS,
  arcDown,
  arcUp,
  estimateLabelWidth,
  findSymbol,
  searchSymbols,
  symbolsByRole,
  type PaletteSymbol,
} from '../editor/palette/catalog';
import { buildSymbol, newGroupId, symbolBounds } from '../editor/palette/build';
import { DRAG_THRESHOLD_PX, isOverCanvas, symbolTopLeftAt } from '../editor/palette/drop';

/**
 * The Elements panel inserts *native* geometry, so the things worth asserting are the invariants
 * the rest of the app relies on: every symbol is inside its own box (so nothing overflows into a
 * neighbour), every part carries one shared group id (so undo and move treat it as one object),
 * nothing is filled (monochrome rule), and no symbol needs an image, a network call or a file.
 */

const ink = '#1e1e1e';

function build(symbol: PaletteSymbol) {
  return buildSymbol(symbol, { x: 0, y: 0, groupId: 'g1', ink }) as unknown as {
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: [number, number][];
    text?: string;
    fontSize?: number;
    groupIds?: string[];
    backgroundColor?: string;
    strokeColor?: string;
  }[];
}

describe('palette catalogue', () => {
  it('ships the 16 documented symbols with unique ids', () => {
    expect(PALETTE_SYMBOLS).toHaveLength(16);
    expect(new Set(PALETTE_SYMBOLS.map((symbol) => symbol.id)).size).toBe(16);
  });

  it('covers the four roles the panel groups by', () => {
    const groups = symbolsByRole(PALETTE_SYMBOLS);
    expect(groups.map((group) => group.title)).toEqual(['People', 'Compute', 'Data', 'Network']);
    expect(groups.reduce((total, group) => total + group.symbols.length, 0)).toBe(16);
  });

  it('includes the four symbols that motivated the feature', () => {
    for (const id of ['user', 'client-desktop', 'web-server', 'database']) {
      expect(findSymbol(id), id).toBeTruthy();
    }
  });

  it('gives every symbol a label, aliases and at least one shape', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      expect(symbol.label.length, symbol.id).toBeGreaterThan(2);
      expect(symbol.aliases.length, symbol.id).toBeGreaterThan(1);
      expect(symbol.shapes.length, symbol.id).toBeGreaterThan(0);
    }
  });

  it('keeps every shape inside its own box, so symbols cannot overlap their label', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      for (const shape of symbol.shapes) {
        const points =
          shape.kind === 'polyline'
            ? shape.points
            : [
                [shape.x, shape.y] as [number, number],
                [shape.x + shape.w, shape.y + shape.h] as [number, number],
              ];
        for (const [x, y] of points) {
          expect(x, `${symbol.id} x`).toBeGreaterThanOrEqual(-1);
          expect(y, `${symbol.id} y`).toBeGreaterThanOrEqual(-1);
          expect(x, `${symbol.id} x`).toBeLessThanOrEqual(symbol.box.w + 1);
          expect(y, `${symbol.id} y`).toBeLessThanOrEqual(symbol.box.h + 1);
        }
      }
    }
  });
});

describe('palette build', () => {
  it('emits one element per shape plus exactly one label', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      const elements = build(symbol);
      expect(elements, symbol.id).toHaveLength(symbol.shapes.length + 1);
      expect(elements.filter((element) => element.type === 'text'), symbol.id).toHaveLength(1);
      expect(elements[0]!.type, symbol.id).not.toBe('image');
    }
  });

  it('groups every part under one id so the symbol behaves as a single object', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      const elements = build(symbol);
      for (const element of elements) {
        expect(element.groupIds, symbol.id).toEqual(['g1']);
      }
    }
  });

  it('is monochrome: no fills, and every part uses the supplied ink', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      for (const element of build(symbol)) {
        if (element.backgroundColor !== undefined) expect(element.backgroundColor).toBe('transparent');
        expect(element.strokeColor).toBe(ink);
      }
    }
  });

  it('labels the symbol at the catalogue name', () => {
    for (const symbol of PALETTE_SYMBOLS) {
      const label = build(symbol).find((element) => element.type === 'text')!;
      expect(label.text).toBe(symbol.label);
      expect(label.fontSize).toBe(LABEL_FONT_SIZE);
    }
  });

  it('places the label under the symbol, horizontally centred', () => {
    const symbol = findSymbol('database')!;
    const label = build(symbol).find((element) => element.type === 'text')!;
    expect(label.y).toBe(symbol.box.h + 6);
    const centre = label.x + (label.width ?? 0) / 2;
    expect(Math.abs(centre - symbol.box.w / 2)).toBeLessThan(4);
  });

  it('offsets geometry by the insertion point', () => {
    const symbol = findSymbol('user')!;
    const atOrigin = build(symbol);
    const moved = buildSymbol(symbol, { x: 500, y: 300, groupId: 'g2', ink }) as unknown as {
      type: string;
      x: number;
      y: number;
      points?: [number, number][];
    }[];
    expect(moved[0]!.x).toBe(atOrigin[0]!.x + 500);
    expect(moved[0]!.y).toBe(atOrigin[0]!.y + 300);
    // Polyline points are local to the element's own x/y, so they must not shift.
    const line = moved.find((element) => element.points)!;
    const originLine = atOrigin.find((element) => element.points)!;
    expect(line.points).toEqual(originLine.points);
  });

  it('keeps every polyline inside its own bounding box, at a non-zero size', () => {
    // The engine resizes a line by scaling its points against `width`/`height`. Leaving those at
    // the default 0 drew the symbol fine but made a group resize collapse every arc into a
    // straight line — the "resizing breaks the shape" bug. So: the box must be the real extent of
    // the points (an axis-aligned stroke may legitimately be zero in one axis, never in both).
    for (const symbol of PALETTE_SYMBOLS) {
      for (const element of build(symbol)) {
        if (!element.points) continue;
        const xs = element.points.map(([x]) => x);
        const ys = element.points.map(([, y]) => y);
        expect(Math.min(...xs), symbol.id).toBeGreaterThanOrEqual(0);
        expect(Math.min(...ys), symbol.id).toBeGreaterThanOrEqual(0);
        expect(element.width, symbol.id).toBe(Math.max(...xs));
        expect(element.height, symbol.id).toBe(Math.max(...ys));
        expect((element.width ?? 0) + (element.height ?? 0), symbol.id).toBeGreaterThan(0);
      }
    }
  });

  it('positions a polyline at the top-left of its own bounding box', () => {
    // The database body starts at (20, 16) in its box and spans to (100, 92), so the element sits
    // at box + (20, 16) and its points run from [0, 0] to [80, 76].
    const symbol = findSymbol('database')!;
    const body = buildSymbol(symbol, { x: 100, y: 50, groupId: 'g', ink }) as unknown as {
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      points?: [number, number][];
    }[];
    const line = body.find((element) => element.points)!;
    expect([line.x, line.y]).toEqual([120, 66]);
    expect([line.width, line.height]).toEqual([80, 76]);
    expect(line.points![0]).toEqual([0, 0]);
  });

  it('closes a polygon by repeating its first point', () => {
    const cloud = build(findSymbol('cloud')!)[0]!;
    const points = cloud.points!;
    expect(points).toHaveLength(new Set(points.map((point) => point.join(','))).size + 1);
    expect(points[0]).toEqual(points[points.length - 1]);
  });

  it('mints a distinct group id per insertion', () => {
    const first = newGroupId();
    const second = newGroupId();
    expect(first).not.toBe(second);
    expect(first.startsWith('palette-')).toBe(true);
  });

  it('reports bounds that include the label', () => {
    const symbol = findSymbol('user')!;
    const bounds = symbolBounds(symbol);
    expect(bounds.w).toBe(symbol.box.w);
    expect(bounds.h).toBeGreaterThan(symbol.box.h);
  });
});

describe('palette search', () => {
  it('returns everything for an empty query', () => {
    expect(searchSymbols('')).toHaveLength(16);
    expect(searchSymbols('   ')).toHaveLength(16);
  });

  it('finds the database by the words people actually type', () => {
    for (const query of ['db', 'database', 'sql', 'postgres', 'Postgres']) {
      const ids = searchSymbols(query).map((symbol) => symbol.id);
      expect(ids, query).toContain('database');
    }
  });

  it('matches labels, aliases and roles case-insensitively', () => {
    expect(searchSymbols('LOAD BALANCER').map((symbol) => symbol.id)).toEqual(['load-balancer']);
    expect(searchSymbols('network').map((symbol) => symbol.role)).toContain('network');
    expect(searchSymbols('kafka').length).toBeGreaterThan(0);
  });

  it('returns nothing for a query that matches no symbol', () => {
    expect(searchSymbols('zzzz')).toEqual([]);
  });
});

describe('geometry helpers', () => {
  it('arcs run left to right and stay on one side of the centre', () => {
    const up = arcUp(50, 50, 20, 10, 4);
    const down = arcDown(50, 50, 20, 10, 4);
    expect(up).toHaveLength(5);
    expect(up[0]![0]).toBe(30);
    expect(up[4]![0]).toBe(70);
    expect(up.every(([, y]) => y <= 50)).toBe(true);
    expect(down.every(([, y]) => y >= 50)).toBe(true);
  });

  it('estimates a label width that grows with the text', () => {
    expect(estimateLabelWidth('Cache')).toBeLessThan(estimateLabelWidth('Message broker'));
    expect(estimateLabelWidth('')).toBeGreaterThan(0);
  });
});

describe('drag-to-place maths', () => {
  const geometry = { left: 200, top: 48, scrollX: -100, scrollY: 50, zoom: 1 };
  const size = { w: 120, h: 100 };

  it('centres the symbol on the pointer in scene coordinates', () => {
    // Pointer at viewport (500, 348): 300 px into the canvas, 300 px down, 1:1 zoom, scrolled by
    // (-100, 50) → scene (400, 250); the symbol's top-left sits half a symbol back from that.
    const at = symbolTopLeftAt({ x: 500, y: 348 }, geometry, size);
    expect(at).toEqual({ x: 340, y: 200 });
  });

  it('divides by the zoom factor, so a drop is where it looks', () => {
    // At 2× the same 300 px of pointer travel is only 150 scene units: scene (250, 100), and the
    // symbol's top-left is half its size (60, 50) back from that.
    const at = symbolTopLeftAt({ x: 500, y: 348 }, { ...geometry, zoom: 2 }, size);
    expect(at).toEqual({ x: 190, y: 50 });
  });

  it('treats a zero or negative zoom as 1:1 rather than dividing by zero', () => {
    const at = symbolTopLeftAt({ x: 500, y: 348 }, { ...geometry, zoom: 0 }, size);
    expect(Number.isFinite(at.x)).toBe(true);
    expect(at).toEqual(symbolTopLeftAt({ x: 500, y: 348 }, { ...geometry, zoom: 1 }, size));
  });

  it('accepts a drop inside the canvas and refuses one outside it', () => {
    const rect = { left: 200, top: 48, width: 800, height: 600 };
    expect(isOverCanvas({ x: 500, y: 300 }, rect)).toBe(true);
    expect(isOverCanvas({ x: 199, y: 300 }, rect)).toBe(false);
    expect(isOverCanvas({ x: 500, y: 649 }, rect)).toBe(false);
    expect(isOverCanvas({ x: 500, y: 300 }, null)).toBe(false);
  });

  it('requires a few pixels of travel before a press becomes a drag', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(3);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(8);
  });
});
