import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';
import {
  LABEL_FONT_SIZE,
  LABEL_GAP,
  estimateLabelWidth,
  type PaletteSymbol,
  type Point,
} from './catalog';

/**
 * Recipe → engine elements.
 *
 * The output is deliberately boring: plain `rect`/`ellipse`/`line`/`text` skeletons, every part
 * carrying the same group id and the theme's ink colour, with no fill. Nothing here is engine
 * specific beyond the skeleton shape, which is the same mechanism the template library uses.
 */

export type BuildContext = {
  /** Scene coordinates of the symbol's top-left corner. */
  x: number;
  y: number;
  /** One id shared by every part, so the symbol behaves as one object. */
  groupId: string;
  /** Stroke colour — the theme's ink, so a symbol is legible in light and dark mode. */
  ink: string;
  fontSize?: number;
};

/** Stroke width for monochrome symbols: heavy enough to read, light enough to stay calm. */
const STROKE_WIDTH = 2;

function inkBase(context: BuildContext) {
  return {
    strokeColor: context.ink,
    backgroundColor: 'transparent',
    fillStyle: 'solid' as const,
    strokeWidth: STROKE_WIDTH,
    roughness: 1,
    groupIds: [context.groupId],
  };
}

/** Closed polylines are drawn by repeating the first point: the engine has no polygon type. */
function linePoints(shape: { points: Point[]; closed?: boolean }): Point[] {
  if (!shape.closed || shape.points.length === 0) return shape.points;
  const first = shape.points[0]!;
  const last = shape.points[shape.points.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return shape.points;
  return [...shape.points, first];
}

export function buildSymbol(symbol: PaletteSymbol, context: BuildContext): ExcalidrawElementSkeleton[] {
  const fontSize = context.fontSize ?? LABEL_FONT_SIZE;
  const base = inkBase(context);

  const shapes = symbol.shapes.map((shape) => {
    switch (shape.kind) {
      case 'rect':
        return {
          type: 'rectangle',
          x: context.x + shape.x,
          y: context.y + shape.y,
          width: shape.w,
          height: shape.h,
          roundness: shape.round ? { type: 3 } : null,
          strokeStyle: shape.dashed ? 'dashed' : 'solid',
          ...base,
        };
      case 'ellipse':
        return {
          type: 'ellipse',
          x: context.x + shape.x,
          y: context.y + shape.y,
          width: shape.w,
          height: shape.h,
          ...base,
        };
      case 'polyline': {
        // Two invariants the engine relies on, both learned the hard way:
        //  1. a line's `x`/`y` is the position of `points[0]`, and `points[0]` must be `[0, 0]`
        //     (otherwise the part slides away from its siblings the first time the group is dragged);
        //  2. `width`/`height` must be the real bounding box of the points. Left at the default
        //     `0`, drawing still worked but a group resize multiplied the points by a scale derived
        //     from a zero-height box, which flattened every arc into a straight line.
        const raw = linePoints(shape);
        const xs = raw.map(([px]) => px);
        const ys = raw.map(([, py]) => py);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const width = Math.max(...xs) - minX;
        const height = Math.max(...ys) - minY;
        return {
          type: 'line',
          x: context.x + minX,
          y: context.y + minY,
          width,
          height,
          points: raw.map(([px, py]) => [px - minX, py - minY]),
          strokeStyle: shape.dashed ? 'dashed' : 'solid',
          ...base,
        };
      }
    }
  });

  // The label is a real text element (not a bound label) so it can sit *under* the figure, which
  // is where these symbols read best, and so the user can retype it without touching the geometry.
  const labelWidth = estimateLabelWidth(symbol.label, fontSize);
  const label = {
    type: 'text',
    x: context.x + symbol.box.w / 2 - labelWidth / 2,
    y: context.y + symbol.box.h + LABEL_GAP,
    width: labelWidth,
    text: symbol.label,
    fontSize,
    fontFamily: 1,
    textAlign: 'center',
    verticalAlign: 'top',
    strokeColor: context.ink,
    backgroundColor: 'transparent',
    groupIds: [context.groupId],
  };

  return [...shapes, label] as unknown as ExcalidrawElementSkeleton[];
}

/** Bounding box of an inserted symbol, including the label, for centring and tests. */
export function symbolBounds(symbol: PaletteSymbol, fontSize = LABEL_FONT_SIZE) {
  return {
    w: symbol.box.w,
    h: symbol.box.h + LABEL_GAP + fontSize * 1.25,
  };
}

/** Excalidraw group ids are opaque strings; this keeps them unique per insertion. */
export function newGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `palette-${crypto.randomUUID()}`;
  }
  return `palette-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
