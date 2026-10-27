import type { AiDiagram, AiNode, DiagramType } from './schemas';
import { GRID } from '../templates/dsl';
import { PALETTE, type TemplateNode, type TemplateSpec } from '../templates/types';

/**
 * Deterministic layout: the model supplies a graph, we decide geometry.
 *
 * Two strategies:
 *  - `layered`  — longest-path layers left→right, rows within a layer. Used for
 *                 flowcharts, pipelines, architecture, org charts, sequences.
 *  - `radial`   — centre node with spokes. Used for mind maps.
 *
 * Both guarantee: no overlapping boxes, bounded extents, arrows that run between
 * shape edges (template instantiation clips them), and grouping by colour.
 */

const COLOR_CYCLE = [PALETTE.blue, PALETTE.violet, PALETTE.green, PALETTE.amber, PALETTE.grey, PALETTE.red];

const H_GAP = 78;
const V_GAP = 46;

/** Widest a generated node may get before its label is allowed to wrap. */
export const MAX_NODE_WIDTH = 320;

export function nodeWidthFor(label: string): number {
  // Text metrics have to be estimated here, not measured: the model's labels are laid out
  // before the hand-drawn webfont has loaded, and Excalidraw's own measurement then uses
  // the fallback font's narrower glyphs — which is how labels end up spilling out of their
  // boxes. ~10 px per character at 15 px plus padding keeps every label comfortably inside.
  const estimate = Math.round(label.length * 10) + 48;
  return Math.min(MAX_NODE_WIDTH, Math.max(GRID.nodeWidth, estimate));
}

function nodeHeightFor(label: string): number {
  const width = nodeWidthFor(label);
  const lines = Math.max(1, Math.ceil(Math.round(label.length * 10) / (width - 24)));
  return GRID.nodeHeight + (lines - 1) * 20;
}

/**
 * Layer assignment for a graph that may contain cycles.
 *
 * Depth-first walk first: any edge pointing back into the current recursion stack is a
 * back edge (a retry/loop) and is excluded from depth maths, which is what stops a
 * single "retry" arrow from pushing the whole diagram 20 columns to the right. The
 * remaining DAG is then layered longest-path-first.
 */
function computeLayers(diagram: AiDiagram): { depth: Map<string, number>; backEdges: Set<number> } {
  const ids = diagram.nodes.map((node) => node.id);
  const outgoing = new Map<string, Array<{ to: string; index: number }>>();
  diagram.edges.forEach((edge, index) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), { to: edge.to, index }]);
  });

  const backEdges = new Set<number>();
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string) => {
    state.set(id, 'visiting');
    for (const { to, index } of outgoing.get(id) ?? []) {
      const target = state.get(to);
      if (target === 'visiting') {
        backEdges.add(index);
        continue;
      }
      if (target !== 'done') visit(to);
    }
    state.set(id, 'done');
  };

  for (const id of ids) {
    if (!state.has(id)) visit(id);
  }

  // Longest path over the acyclic remainder; nodes settle as soon as their inputs do.
  const depth = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    diagram.edges.forEach((edge, index) => {
      if (backEdges.has(index)) return;
      const from = depth.get(edge.from) ?? 0;
      if ((depth.get(edge.to) ?? 0) < from + 1) {
        depth.set(edge.to, from + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const min = Math.min(...depth.values());
  if (Number.isFinite(min) && min !== 0) {
    for (const [id, value] of depth) depth.set(id, value - min);
  }
  return { depth, backEdges };
}

function colourForNode(node: AiNode, indexInGroup: number, groups: Map<string, number>): string {
  if (node.shape === 'diamond') return PALETTE.amber;
  if (node.emphasis) return PALETTE.green;
  const key = node.group ?? `__default_${indexInGroup % 3}`;
  const slot = groups.get(key) ?? groups.size;
  if (!groups.has(key)) groups.set(key, slot);
  return COLOR_CYCLE[slot % COLOR_CYCLE.length]!;
}

function layeredLayout(diagram: AiDiagram): { nodes: TemplateNode[]; layers: number } {
  const { depth } = computeLayers(diagram);
  const byLayer = new Map<number, AiNode[]>();
  for (const node of diagram.nodes) {
    const layer = depth.get(node.id) ?? 0;
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), node]);
  }

  const layerCount = Math.max(...byLayer.keys(), 0) + 1;
  const groups = new Map<string, number>();
  const placed: TemplateNode[] = [];

  for (let layer = 0; layer < layerCount; layer += 1) {
    const nodes = byLayer.get(layer) ?? [];
    // Column width follows the widest box in the layer so nothing can overlap.
    const columnWidth = Math.max(GRID.nodeWidth, ...nodes.map((node) => nodeWidthFor(node.label)));
    const x = [...Array(layer).keys()].reduce((acc, previousLayer) => {
      const previous = byLayer.get(previousLayer) ?? [];
      const previousWidth = Math.max(GRID.nodeWidth, ...previous.map((node) => nodeWidthFor(node.label)));
      return acc + previousWidth + H_GAP;
    }, 0);

    const columnHeight = nodes.reduce(
      (total, node) => total + nodeHeightFor(node.label) + V_GAP,
      -V_GAP,
    );
    let y = -Math.max(0, columnHeight / 2) + Math.max(0, columnHeight / 2);

    nodes.forEach((node, index) => {
      const height = nodeHeightFor(node.label);
      placed.push({
        id: node.id,
        shape: node.shape ?? 'rectangle',
        x,
        y,
        width: columnWidth,
        height,
        label: node.label,
        fill: colourForNode(node, index, groups),
        emphasis: node.emphasis,
      });
      y += height + V_GAP;
    });
  }

  return { nodes: placed, layers: layerCount };
}

function radialLayout(diagram: AiDiagram): { nodes: TemplateNode[]; layers: number } {
  const centre = diagram.nodes.find((node) => node.emphasis) ?? diagram.nodes[0];
  if (!centre) return { nodes: [], layers: 0 };

  const others = diagram.nodes.filter((node) => node.id !== centre.id);
  const radius = Math.max(320, 90 * Math.ceil(Math.sqrt(others.length)) + 60);
  const groups = new Map<string, number>();

  const placed: TemplateNode[] = [
    {
      id: centre.id,
      shape: 'ellipse',
      x: -110,
      y: -55,
      width: 220,
      height: 110,
      label: centre.label,
      fill: PALETTE.violet,
      emphasis: true,
    },
  ];

  others.forEach((node, index) => {
    const angle = (index / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    const width = Math.min(200, nodeWidthFor(node.label));
    const height = nodeHeightFor(node.label);
    placed.push({
      id: node.id,
      shape: node.shape === 'rectangle' ? 'rectangle' : (node.shape ?? 'rectangle'),
      x: Math.round(Math.cos(angle) * radius - width / 2),
      y: Math.round(Math.sin(angle) * radius - height / 2),
      width,
      height,
      label: node.label,
      fill: colourForNode(node, index, groups),
      emphasis: node.emphasis,
    });
  });

  return { nodes: placed, layers: 2 };
}

export function layoutDiagram(diagram: AiDiagram, diagramType: DiagramType): { spec: TemplateSpec; layers: number } {
  const useRadial = diagramType === 'mindmap';
  const { nodes, layers } = useRadial ? radialLayout(diagram) : layeredLayout(diagram);

  const spec: TemplateSpec = {
    nodes,
    edges: diagram.edges.map((edge, index) => ({
      id: `ai-edge-${index}`,
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
      dashed: edge.style === 'dashed',
    })),
    notes: diagram.notes.map((note, index) => ({
      id: `ai-note-${index}`,
      x: 0,
      // Notes sit below the whole diagram, out of the way of the flow.
      y: Math.max(...nodes.map((node) => node.y + node.height), 0) + 64 + index * 40,
      width: 520,
      text: note.text,
      fontSize: 16,
    })),
  };

  return { spec, layers };
}

/** Offsets a laid-out spec so it lands in the middle of the current viewport. */
export type SpecBounds = { minX: number; minY: number; width: number; height: number };

/** Bounding box of a laid-out spec, used to fit generated diagrams into the viewport. */
export function boundsOf(spec: TemplateSpec): SpecBounds {
  if (spec.nodes.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...spec.nodes.map((node) => node.x));
  const minY = Math.min(...spec.nodes.map((node) => node.y));
  const maxX = Math.max(...spec.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...spec.nodes.map((node) => node.y + node.height));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function recentreSpec(spec: TemplateSpec, centre: { x: number; y: number }): TemplateSpec {
  if (spec.nodes.length === 0) return spec;
  const minX = Math.min(...spec.nodes.map((node) => node.x));
  const maxX = Math.max(...spec.nodes.map((node) => node.x + node.width));
  const minY = Math.min(...spec.nodes.map((node) => node.y));
  const maxY = Math.max(...spec.nodes.map((node) => node.y + node.height));

  const dx = Math.round(centre.x - (minX + maxX) / 2);
  const dy = Math.round(centre.y - (minY + maxY) / 2);

  return {
    ...spec,
    nodes: spec.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    notes: (spec.notes ?? []).map((note) => ({ ...note, x: note.x + dx, y: note.y + dy })),
  };
}
