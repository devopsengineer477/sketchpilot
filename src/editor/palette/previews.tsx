import { LABEL_FONT_SIZE, type PaletteSymbol } from './catalog';

/**
 * Thumbnails for the Elements panel.
 *
 * Drawn from the *same* geometry the insert uses (`symbol.shapes`), so a preview can never drift
 * from what lands on the canvas. Inline SVG, `currentColor` strokes (so it follows the theme) and
 * no icon files — nothing to load, nothing to keep in sync, no network.
 */
export function Preview({ symbol, size = 44 }: { symbol: PaletteSymbol; size?: number }) {
  const { w, h } = symbol.box;
  const viewH = h + 22;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${viewH}`}
      width={size}
      height={Math.round((size * viewH) / w)}
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="palette-preview"
    >
      {symbol.shapes.map((shape, index) => {
        if (shape.kind === 'rect') {
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              rx={shape.round ? 10 : 0}
              strokeDasharray={shape.dashed ? '10 8' : undefined}
            />
          );
        }
        if (shape.kind === 'ellipse') {
          return (
            <ellipse
              key={index}
              cx={shape.x + shape.w / 2}
              cy={shape.y + shape.h / 2}
              rx={shape.w / 2}
              ry={shape.h / 2}
            />
          );
        }
        return (
          <polyline
            key={index}
            points={shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
            strokeDasharray={shape.dashed ? '10 8' : undefined}
          />
        );
      })}
      {/* The label is part of the panel card's own text, so it is not repeated inside the SVG. */}
    </svg>
  );
}

/** Kept next to the preview so the card's text and the inserted label cannot diverge. */
export const PREVIEW_LABEL_SIZE = LABEL_FONT_SIZE;
