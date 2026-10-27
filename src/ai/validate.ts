import type { z } from 'zod';
import {
  AI_LIMITS,
  aiDiagramSchema,
  type AiDiagram,
  type AiEdge,
  type AiNode,
} from './schemas';
import { appError, type AppError } from '../lib/errors';

/**
 * Validation is layered and never throws:
 *   1. shape   — zod: types, enums, limits. Anything surprising is rejected outright.
 *   2. meaning — graph checks zod cannot express: duplicate ids, dangling edges,
 *                self-loops, disconnected fragments, duplicate edges.
 *   3. layout  — after placement: finite coordinates and sane canvas extent.
 * Callers get either a usable diagram or a list of reasons a human can act on.
 */

export type AiIssue = { path: string; message: string };

export type ValidateOutcome =
  | { ok: true; diagram: AiDiagram }
  | { ok: false; stage: 'shape' | 'meaning'; issues: AiIssue[] };

function zodIssues(error: z.ZodError): AiIssue[] {
  return error.issues.slice(0, 10).map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validateDiagramShape(input: unknown): ValidateOutcome {
  const parsed = aiDiagramSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, stage: 'shape', issues: zodIssues(parsed.error) };
  }
  return { ok: true, diagram: parsed.data };
}

export type GraphAnalysis = {
  duplicateNodeIds: string[];
  selfLoops: AiEdge[];
  duplicateEdges: AiEdge[];
  danglingEdges: AiEdge[];
  isolatedNodes: AiNode[];
  /** Nodes not reachable from the first node — a sign of two diagrams glued together. */
  unreachableNodes: AiNode[];
};

export function analyzeGraph(diagram: AiDiagram): GraphAnalysis {
  const seen = new Set<string>();
  const duplicateNodeIds: string[] = [];
  for (const node of diagram.nodes) {
    if (seen.has(node.id)) duplicateNodeIds.push(node.id);
    seen.add(node.id);
  }

  const selfLoops: AiEdge[] = [];
  const duplicateEdges: AiEdge[] = [];
  const danglingEdges: AiEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const edge of diagram.edges) {
    const key = `${edge.from}->${edge.to}:${edge.label ?? ''}`;
    if (edge.from === edge.to) {
      selfLoops.push(edge);
      continue;
    }
    if (!seen.has(edge.from) || !seen.has(edge.to)) {
      danglingEdges.push(edge);
      continue;
    }
    if (edgeKeys.has(key)) duplicateEdges.push(edge);
    edgeKeys.add(key);
  }

  const connected = new Set<string>();
  for (const edge of diagram.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const isolatedNodes = diagram.nodes.filter((node) => !connected.has(node.id));

  // Breadth-first from the first node over the (already filtered) edge set.
  const adjacency = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    if (!seen.has(edge.from) || !seen.has(edge.to) || edge.from === edge.to) continue;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  const reachable = new Set<string>();
  const queue = diagram.nodes[0] ? [diagram.nodes[0].id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const next of adjacency.get(id) ?? []) queue.push(next);
  }
  const unreachableNodes = diagram.nodes.filter((node) => !reachable.has(node.id));

  return { duplicateNodeIds, selfLoops, duplicateEdges, danglingEdges, isolatedNodes, unreachableNodes };
}

/**
 * Accepts a diagram if it is structurally sound. Warnings (isolated nodes, unreachable
 * fragments) are tolerated: real diagrams legitimately contain floating annotations.
 * Anything that would corrupt the canvas is rejected.
 */
export function validateDiagramMeaning(diagram: AiDiagram): ValidateOutcome {
  const analysis = analyzeGraph(diagram);
  const issues: AiIssue[] = [];

  if (analysis.duplicateNodeIds.length) {
    issues.push({
      path: 'nodes',
      message: `duplicate ids: ${[...new Set(analysis.duplicateNodeIds)].slice(0, 5).join(', ')}`,
    });
  }
  if (analysis.danglingEdges.length) {
    issues.push({
      path: 'edges',
      message: `${analysis.danglingEdges.length} edge(s) reference nodes that do not exist`,
    });
  }
  if (diagram.edges.length === 0 && diagram.nodes.length > 1) {
    issues.push({ path: 'edges', message: 'a diagram with more than one node needs at least one edge' });
  }
  if (issues.length) return { ok: false, stage: 'meaning', issues };
  return { ok: true, diagram };
}

export function layoutProblems(points: Array<{ x: number; y: number }>): AiIssue[] {
  const issues: AiIssue[] = [];
  for (const [index, point] of points.entries()) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      issues.push({ path: `layout.${index}`, message: 'non-finite position' });
    } else if (
      Math.abs(point.x) > AI_LIMITS.maxCanvasExtent ||
      Math.abs(point.y) > AI_LIMITS.maxCanvasExtent
    ) {
      issues.push({ path: `layout.${index}`, message: 'position outside the allowed canvas' });
    }
  }
  return issues;
}

export function issuesToError(issues: AiIssue[], stage: 'shape' | 'meaning' | 'layout'): AppError {
  const first = issues[0];
  const detail = first ? `${first.path}: ${first.message}` : 'unknown problem';
  return appError(
    'invalid-import',
    stage === 'shape'
      ? `The model returned a diagram that does not match the required format (${detail}).`
      : `The model returned an unusable diagram (${detail}).`,
    'Try again, simplify your prompt, or pick a different diagram type or model.',
  );
}
