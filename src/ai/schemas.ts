import { z } from 'zod';

/**
 * The AI contract.
 *
 * Models never produce coordinates. They produce a *graph* — labelled nodes and the
 * edges between them — and SketchPilot lays it out deterministically. That removes the
 * entire class of "valid JSON, unreadable diagram" failures (overlapping boxes, nodes
 * off-canvas, arrows through text) and shrinks what has to be trusted from the model.
 */

export const AI_SCHEMA_VERSION = 1;

export const AI_LIMITS = {
  /** Hard ceilings; the prompt states smaller targets so models rarely hit them. */
  maxNodes: 40,
  maxEdges: 80,
  // Hard ceilings: anything past these is treated as an abusive reply, whereas anything
  // between the working limit and the ceiling is truncated by the repair pass and still
  // yields a usable diagram.
  hardMaxNodes: 200,
  hardMaxEdges: 400,
  maxNotes: 5,
  maxLabelLength: 90,
  maxTitleLength: 120,
  maxNoteLength: 280,
  /** Layout guard: a plan that would exceed this canvas is rejected. */
  maxCanvasExtent: 20_000,
} as const;

export const NODE_SHAPES = ['rectangle', 'ellipse', 'diamond'] as const;
export const EDGE_STYLES = ['solid', 'dashed'] as const;

/** Provider ids are ours, not the model's, but kept enumerable for validation. */
export const DIAGRAM_TYPES = [
  'flowchart',
  'mindmap',
  'architecture',
  'pipeline',
  'sequence',
  'orgchart',
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const COMPLEXITIES = ['simple', 'balanced', 'detailed'] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

const idSchema = z
  .string()
  .min(1)
  .max(32)
  // Plain identifiers only: no markup, no paths, no whitespace to smuggle into ids.
  .regex(/^[A-Za-z0-9_-]+$/, 'ids must be letters, digits, hyphen or underscore');

const labelSchema = z.string().min(1).max(AI_LIMITS.maxLabelLength);

export const aiNodeSchema = z.object({
  id: idSchema,
  label: labelSchema,
  shape: z.enum(NODE_SHAPES).optional(),
  /** Optional visual grouping — used for palette assignment, never for layout maths. */
  group: z.string().max(40).optional(),
  /** Marks entry/exit points so layout can anchor them. */
  emphasis: z.boolean().optional(),
});

export const aiEdgeSchema = z.object({
  from: idSchema,
  to: idSchema,
  label: z.string().max(AI_LIMITS.maxLabelLength).optional(),
  style: z.enum(EDGE_STYLES).optional(),
});

export const aiNoteSchema = z.object({
  text: z.string().min(1).max(AI_LIMITS.maxNoteLength),
});

export const aiDiagramSchema = z.object({
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  title: z.string().min(1).max(AI_LIMITS.maxTitleLength),
  nodes: z.array(aiNodeSchema).min(1).max(AI_LIMITS.hardMaxNodes),
  edges: z.array(aiEdgeSchema).max(AI_LIMITS.hardMaxEdges).default([]),
  notes: z.array(aiNoteSchema).max(AI_LIMITS.maxNotes).default([]),
});

export type AiNode = z.infer<typeof aiNodeSchema>;
export type AiEdge = z.infer<typeof aiEdgeSchema>;
export type AiDiagram = z.infer<typeof aiDiagramSchema>;

/** What the UI asks for. Never sent verbatim — see prompt.ts. */
export type GenerationRequest = {
  prompt: string;
  diagramType: DiagramType;
  complexity: Complexity;
};

export type RefineIntent =
  | 'organize'
  | 'add-steps'
  | 'simplify'
  | 'improve-labels'
  | 'add-error-handling'
  | 'find-missing-links'
  | 'group'
  | 'explain'
  | 'document'
  | 'mermaid';

/** Intents that return a new diagram, versus text over the existing one. */
export const DIAGRAM_INTENTS: RefineIntent[] = [
  'organize',
  'add-steps',
  'simplify',
  'improve-labels',
  'add-error-handling',
  'find-missing-links',
  'group',
];

export type TextIntent = 'explain' | 'document' | 'mermaid';

export const TEXT_INTENTS: TextIntent[] = ['explain', 'document', 'mermaid'];

export const REFINE_INTENT_LABEL: Record<RefineIntent, string> = {
  organize: 'Align and organise',
  'add-steps': 'Add missing steps',
  simplify: 'Simplify the flow',
  'improve-labels': 'Improve the labels',
  'add-error-handling': 'Add error handling',
  'find-missing-links': 'Find missing connections',
  group: 'Group related parts',
  explain: 'Explain this diagram',
  document: 'Write documentation',
  mermaid: 'Convert to Mermaid',
};

/** A validated, laid-out plan ready to become canvas elements. */
export type DiagramPlan = {
  title: string;
  diagram: AiDiagram;
  /** Computed positions — this is what the user ends up seeing. */
  layout: import('../templates/types').TemplateSpec;
  stats: { nodes: number; edges: number; layers: number };
};
