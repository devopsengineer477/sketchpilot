import type { AiDiagram, AiEdge } from './schemas';
import { AI_LIMITS } from './schemas';

/**
 * Bounded, deterministic repair of model output.
 *
 * Rules that keep this honest:
 *  - repair never invents content — it only drops, clamps, dedupes or renames ids;
 *  - every repair is recorded so the UI can say what changed;
 *  - if the result would still be unusable, the caller rejects the whole payload.
 */

export type RepairAction = {
  kind: 'dropped-edge' | 'dropped-node' | 'deduped-edge' | 'renamed-id' | 'truncated-text' | 'coerced-shape';
  detail: string;
};

export type RepairResult = {
  diagram: AiDiagram;
  actions: RepairAction[];
};

const SAFE_SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Replaces unusable ids with a deterministic, collision-free one. */
function sanitizeIds(diagram: AiDiagram, actions: RepairAction[]): AiDiagram {
  const used = new Set<string>();
  const remap = new Map<string, string>();

  const nodes = diagram.nodes.flatMap((node) => {
    const label = truncate(node.label.trim(), AI_LIMITS.maxLabelLength);
    // A shape with no visible label is dead weight on the canvas. Dropping it is a change
    // we can report; inventing a label would be us writing content the user never asked for.
    if (!label) {
      actions.push({ kind: 'dropped-node', detail: `${node.id} (empty label)` });
      return [];
    }
    const cleaned = node.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    let id = cleaned || `n${used.size + 1}`;
    let suffix = 2;
    while (used.has(id)) {
      id = `${cleaned || `n${used.size + 1}`}-${suffix++}`.slice(0, 32);
    }
    if (id !== node.id) {
      actions.push({ kind: 'renamed-id', detail: `${node.id} → ${id}` });
      remap.set(node.id, id);
    }
    used.add(id);
    const shape = SAFE_SHAPES.has(node.shape ?? '') ? node.shape : 'rectangle';
    if (node.shape && shape !== node.shape) {
      actions.push({ kind: 'coerced-shape', detail: `${node.id}: ${node.shape} → rectangle` });
    }
    return [
      {
        ...node,
        id,
        shape,
        label,
        ...(node.group ? { group: truncate(node.group, 40) } : {}),
      },
    ];
  });

  const ids = new Set(nodes.map((node) => node.id));
  const seenEdges = new Set<string>();

  const edges = diagram.edges.flatMap((edge) => {
    const from = remap.get(edge.from) ?? edge.from;
    const to = remap.get(edge.to) ?? edge.to;

    if (!ids.has(from) || !ids.has(to)) {
      actions.push({ kind: 'dropped-edge', detail: `${edge.from} → ${edge.to} (unknown node)` });
      return [];
    }
    if (from === to) {
      actions.push({ kind: 'dropped-edge', detail: `${from} → itself` });
      return [];
    }
    const key = `${from}->${to}:${edge.label ?? ''}`;
    if (seenEdges.has(key)) {
      actions.push({ kind: 'deduped-edge', detail: key });
      return [];
    }
    seenEdges.add(key);

    const repaired: AiEdge = {
      from,
      to,
      ...(edge.label ? { label: truncate(edge.label.trim(), AI_LIMITS.maxLabelLength) } : {}),
      ...(edge.style ? { style: edge.style } : {}),
    };
    return [repaired];
  });

  return { ...diagram, nodes, edges };
}

export function repairDiagram(diagram: AiDiagram): RepairResult {
  const actions: RepairAction[] = [];

  const limited = {
    ...diagram,
    title: truncate(diagram.title.trim(), AI_LIMITS.maxTitleLength) || 'Untitled diagram',
    nodes: diagram.nodes.slice(0, AI_LIMITS.maxNodes),
    edges: diagram.edges.slice(0, AI_LIMITS.maxEdges),
    notes: diagram.notes.slice(0, AI_LIMITS.maxNotes).map((note) => ({
      text: truncate(note.text.trim(), AI_LIMITS.maxNoteLength),
    })),
  };

  if (diagram.nodes.length > limited.nodes.length) {
    actions.push({ kind: 'dropped-node', detail: `${diagram.nodes.length - limited.nodes.length} beyond the ${AI_LIMITS.maxNodes}-node limit` });
  }
  if (diagram.edges.length > limited.edges.length) {
    actions.push({ kind: 'dropped-edge', detail: `${diagram.edges.length - limited.edges.length} beyond the ${AI_LIMITS.maxEdges}-edge limit` });
  }

  const sanitized = sanitizeIds(limited, actions);

  // A graph with one node and no edges is still a legitimate answer ("a single box").
  return { diagram: sanitized, actions };
}
