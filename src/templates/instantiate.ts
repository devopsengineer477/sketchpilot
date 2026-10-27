import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';
import type { DrawingElement } from '../storage/schemas';
import { APP_VERSION, SCHEMA_VERSION } from '../storage/schemas';
import { newDrawingId } from '../storage/documents';
import { PALETTE, type ResolvedTemplate, type TemplateSpec } from './types';

/**
 * Templates are stored as data. This module turns them into real elements through
 * the engine (so text metrics, groups and arrow bindings are the engine's own), and
 * is loaded lazily so the dashboard entry stays small.
 */

type Node = TemplateSpec['nodes'][number];
type Point = { x: number; y: number };

/**
 * Where a straight line from a node's centre towards `target` leaves the node.
 * Arrows must start and end on the shape edges — anchoring them at the centres makes
 * them draw straight through the label text.
 */
export function edgePoint(node: Node, target: Point): Point {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const t = Math.min(scaleX, scaleY);
  return { x: cx + dx * t, y: cy + dy * t };
}

function centre(node: Node): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function specToSkeleton(spec: TemplateSpec): ExcalidrawElementSkeleton[] {
  const nodes: ExcalidrawElementSkeleton[] = spec.nodes.map((node) => {
    const base: Record<string, unknown> = {
      type: node.shape,
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      backgroundColor: node.fill ?? PALETTE.blue,
      strokeColor: PALETTE.ink,
      strokeWidth: node.emphasis ? 2 : 1,
      fillStyle: 'solid',
      roundness: node.shape === 'rectangle' ? { type: 3 } : null,
      label: {
        text: node.label,
        fontSize: 15,
        textAlign: 'center',
        verticalAlign: 'middle',
        // Bound text wraps to this width; without it long labels overflow the shape.
        width: Math.max(40, node.width - 24),
      },
    };
    return base as unknown as ExcalidrawElementSkeleton;
  });

  const edges: ExcalidrawElementSkeleton[] = spec.edges.flatMap((edge) => {
    const from = spec.nodes.find((node) => node.id === edge.from);
    const to = spec.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return [];

    const start = edgePoint(from, centre(to));
    const end = edgePoint(to, centre(from));

    return [{
      type: 'arrow',
      id: edge.id,
      x: start.x,
      y: start.y,
      // Explicit points plus the bindings: the arrow renders edge-to-edge now, and
      // still follows its nodes when the user moves them.
      points: [
        [0, 0],
        [end.x - start.x, end.y - start.y],
      ],
      start: { id: edge.from },
      end: { id: edge.to },
      strokeColor: PALETTE.ink,
      strokeWidth: 1,
      strokeStyle: edge.dashed ? 'dashed' : 'solid',
      endArrowhead: 'arrow',
      startArrowhead: null,
      label: edge.label
        ? { text: edge.label, fontSize: 13, textAlign: 'center', verticalAlign: 'middle', width: 120 }
        : undefined,
    } as unknown as ExcalidrawElementSkeleton];
  });

  const notes: ExcalidrawElementSkeleton[] = (spec.notes ?? []).map(
    (note) =>
      ({
        type: 'text',
        id: note.id,
        x: note.x,
        y: note.y,
        text: note.text,
        fontSize: note.fontSize ?? 16,
        strokeColor: PALETTE.muted,
        width: note.width,
      }) as unknown as ExcalidrawElementSkeleton,
  );

  return [...nodes, ...edges, ...notes];
}

/** Converts a built-in spec into elements with fresh ids. */
export async function elementsFromSpec(spec: TemplateSpec): Promise<DrawingElement[]> {
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
  const elements = convertToExcalidrawElements(specToSkeleton(spec), { regenerateIds: true });
  return elements as unknown as DrawingElement[];
}

/**
 * Instantiates any template (built-in or user-saved) with brand-new ids, so using a
 * template twice never produces duplicate element identifiers.
 */
export async function instantiateTemplate(template: ResolvedTemplate): Promise<DrawingElement[]> {
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
  if (template.source === 'builtin') {
    const builtin = await import('./catalog');
    const match = builtin.findBuiltinTemplate(template.id);
    if (!match) throw new Error(`Unknown built-in template "${template.id}"`);
    return elementsFromSpec(match.spec);
  }
  const elements = convertToExcalidrawElements(
    template.elements as unknown as ExcalidrawElementSkeleton[],
    { regenerateIds: true },
  );
  return elements as unknown as DrawingElement[];
}

export function createDrawingFromTemplate(
  template: ResolvedTemplate,
  elements: DrawingElement[],
  title = template.name,
) {
  const now = Date.now();
  return {
    id: newDrawingId(),
    schemaVersion: SCHEMA_VERSION,
    title,
    createdAt: now,
    updatedAt: now,
    appVersion: APP_VERSION,
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}
