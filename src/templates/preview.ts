import type { DrawingElement } from '../storage/schemas';
import { PALETTE, type ResolvedTemplate, type TemplateSpec } from './types';

/**
 * Template previews are drawn from the template data itself, so a card can never
 * show something the template does not insert. This is a small, dependency-free
 * SVG renderer — the library does not load the drawing engine at all.
 */

type Primitive =
  | { kind: 'box'; id: string; x: number; y: number; width: number; height: number; label: string; fill: string; shape: 'rectangle' | 'ellipse' | 'diamond' }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; dashed: boolean }
  | { kind: 'text'; x: number; y: number; text: string; size: number };

const VIEW_WIDTH = 400;
const PADDING = 16;

function primitivesFromSpec(spec: TemplateSpec): Primitive[] {
  const centers = new Map<string, { x: number; y: number }>();
  const boxes: Primitive[] = spec.nodes.map((node) => {
    centers.set(node.id, { x: node.x + node.width / 2, y: node.y + node.height / 2 });
    return {
      kind: 'box',
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      label: node.label,
      fill: node.fill ?? PALETTE.blue,
      shape: node.shape,
    };
  });

  const lines: Primitive[] = spec.edges.flatMap((edge) => {
    const from = centers.get(edge.from);
    const to = centers.get(edge.to);
    if (!from || !to) return [];
    return [{ kind: 'line', x1: from.x, y1: from.y, x2: to.x, y2: to.y, dashed: edge.dashed ?? false }];
  });

  const notes: Primitive[] = (spec.notes ?? []).map((note) => ({
    kind: 'text',
    x: note.x,
    y: note.y,
    text: note.text.length > 64 ? `${note.text.slice(0, 61)}…` : note.text,
    size: note.fontSize ?? 16,
  }));

  return [...lines, ...boxes, ...notes];
}

/** Best-effort preview for a user-saved template, from its stored elements. */
function primitivesFromElements(elements: DrawingElement[]): Primitive[] {
  const boxes: Primitive[] = [];
  const lines: Primitive[] = [];

  for (const element of elements) {
    const record = element as unknown as Record<string, unknown>;
    if (record.isDeleted === true) continue;
    if (element.type === 'arrow' || element.type === 'line') {
      const points = (record.points as Array<[number, number]> | undefined) ?? [];
      const last = points[points.length - 1] ?? [element.width, element.height];
      lines.push({
        kind: 'line',
        x1: element.x,
        y1: element.y,
        x2: element.x + last[0],
        y2: element.y + last[1],
        dashed: record.strokeStyle === 'dashed',
      });
      continue;
    }
    if (element.type === 'text') continue;
    if (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond') {
      boxes.push({
        kind: 'box',
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        label: '',
        fill: (record.backgroundColor as string) ?? PALETTE.blue,
        shape: element.type,
      });
    }
  }

  return [...lines, ...boxes];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function boundsOf(primitives: Primitive[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const primitive of primitives) {
    if (primitive.kind === 'box') {
      minX = Math.min(minX, primitive.x);
      minY = Math.min(minY, primitive.y);
      maxX = Math.max(maxX, primitive.x + primitive.width);
      maxY = Math.max(maxY, primitive.y + primitive.height);
    } else if (primitive.kind === 'line') {
      minX = Math.min(minX, primitive.x1, primitive.x2);
      minY = Math.min(minY, primitive.y1, primitive.y2);
      maxX = Math.max(maxX, primitive.x1, primitive.x2);
      maxY = Math.max(maxY, primitive.y1, primitive.y2);
    } else {
      minX = Math.min(minX, primitive.x);
      minY = Math.min(minY, primitive.y);
      maxX = Math.max(maxX, primitive.x + primitive.text.length * primitive.size * 0.5);
      maxY = Math.max(maxY, primitive.y + primitive.size);
    }
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function specToPreviewSvg(spec: TemplateSpec): string {
  return primitivesToSvg(primitivesFromSpec(spec));
}

export function elementsToPreviewSvg(elements: DrawingElement[]): string {
  return primitivesToSvg(primitivesFromElements(elements));
}

export function templateToPreviewSvg(template: ResolvedTemplate, spec?: TemplateSpec): string | null {
  if (spec) return specToPreviewSvg(spec);
  if (template.elements.length > 0) return elementsToPreviewSvg(template.elements);
  return null;
}

function primitivesToSvg(primitives: Primitive[]): string {
  const { minX, minY, width, height } = boundsOf(primitives);
  const scale = (VIEW_WIDTH - PADDING * 2) / width;
  const viewHeight = Math.max(120, Math.round(height * scale + PADDING * 2));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} ${viewHeight}" width="${VIEW_WIDTH}" height="${viewHeight}" role="img">`,
    `<rect width="${VIEW_WIDTH}" height="${viewHeight}" fill="#ffffff"/>`,
    `<g transform="translate(${PADDING - minX * scale} ${PADDING - minY * scale}) scale(${scale.toFixed(4)})">`,
  ];

  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      parts.push(
        `<line x1="${primitive.x1}" y1="${primitive.y1}" x2="${primitive.x2}" y2="${primitive.y2}" stroke="${PALETTE.ink}" stroke-width="1.5"${primitive.dashed ? ' stroke-dasharray="6 4"' : ''} opacity="0.55"/>`,
      );
    } else if (primitive.kind === 'text') {
      parts.push(
        `<text x="${primitive.x}" y="${primitive.y + primitive.size}" font-family="system-ui, sans-serif" font-size="${primitive.size}" fill="${PALETTE.muted}">${escapeXml(primitive.text)}</text>`,
      );
    } else {
      const common = `fill="${primitive.fill}" stroke="${PALETTE.ink}" stroke-width="2"`;
      if (primitive.shape === 'ellipse') {
        parts.push(
          `<ellipse cx="${primitive.x + primitive.width / 2}" cy="${primitive.y + primitive.height / 2}" rx="${primitive.width / 2}" ry="${primitive.height / 2}" ${common}/>`,
        );
      } else if (primitive.shape === 'diamond') {
        const cx = primitive.x + primitive.width / 2;
        const cy = primitive.y + primitive.height / 2;
        parts.push(
          `<polygon points="${cx},${primitive.y} ${primitive.x + primitive.width},${cy} ${cx},${primitive.y + primitive.height} ${primitive.x},${cy}" ${common}/>`,
        );
      } else {
        parts.push(
          `<rect x="${primitive.x}" y="${primitive.y}" width="${primitive.width}" height="${primitive.height}" rx="10" ${common}/>`,
        );
      }
      if (primitive.label) {
        parts.push(
          `<text x="${primitive.x + primitive.width / 2}" y="${primitive.y + primitive.height / 2}" font-family="system-ui, sans-serif" font-size="15" fill="${PALETTE.ink}" text-anchor="middle" dominant-baseline="middle">${escapeXml(primitive.label)}</text>`,
        );
      }
    }
  }

  parts.push('</g></svg>');
  return parts.join('');
}

export function previewDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
