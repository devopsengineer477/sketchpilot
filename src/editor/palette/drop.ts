/**
 * Drag-to-place maths.
 *
 * The panel lives in screen coordinates, the canvas in scene coordinates. Dropping a symbol means
 * converting a pointer position into a scene position, which is the same transform the editor uses
 * for `insertStickyNote`: subtract the canvas origin, undo the zoom, then undo the scroll.
 *
 * Kept as pure functions so the mapping can be unit-tested without a browser.
 */

export type CanvasGeometry = {
  /** Canvas host's position on screen (CSS pixels). */
  left: number;
  top: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
};

export type Size = { w: number; h: number };

/**
 * Scene coordinates of a symbol's top-left corner when the pointer is at `point` — the symbol is
 * centred on the cursor, which is what people expect when placing something by hand.
 */
export function symbolTopLeftAt(
  point: { x: number; y: number },
  geometry: CanvasGeometry,
  size: Size,
): { x: number; y: number } {
  const zoom = geometry.zoom > 0 ? geometry.zoom : 1;
  const sceneX = (point.x - geometry.left) / zoom - geometry.scrollX;
  const sceneY = (point.y - geometry.top) / zoom - geometry.scrollY;
  return { x: sceneX - size.w / 2, y: sceneY - size.h / 2 };
}

/** True when the pointer is inside the canvas host, i.e. a drop there is meaningful. */
export function isOverCanvas(point: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number } | null): boolean {
  if (!rect) return false;
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/**
 * Movement (CSS px) a pointer must travel before a press becomes a drag rather than a click.
 * Small enough to feel instant, large enough that a shaky click never becomes a drop.
 */
export const DRAG_THRESHOLD_PX = 4;
