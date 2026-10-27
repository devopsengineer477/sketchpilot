import type { AiDiagram, Complexity, DiagramType, GenerationRequest, RefineIntent } from './schemas';
import { AI_LIMITS, AI_SCHEMA_VERSION } from './schemas';

/**
 * Prompts are built here and nowhere else. The system prompt pins the JSON contract and
 * is paired with a compact example, because structured output support varies by provider.
 */

const DIAGRAM_TYPE_GUIDANCE: Record<DiagramType, string> = {
  flowchart: 'a decision flow: start/end as ellipses, decisions as diamonds, actions as rectangles',
  mindmap: 'a central idea in one emphasised node, with branches radiating from it',
  architecture: 'services and data stores, with one clear direction of dependency',
  pipeline: 'ordered stages left to right, with a failure branch where it matters',
  sequence: 'actors as nodes and the messages between them as edges, in order',
  orgchart: 'an ownership hierarchy, one parent per node except the root',
};

const COMPLEXITY_GUIDANCE: Record<Complexity, string> = {
  simple: 'Keep it to 4–7 nodes. Only essential steps.',
  balanced: 'Aim for 8–14 nodes with the important branches.',
  detailed: 'Aim for 15–24 nodes, including error paths and supporting services.',
};

export function systemPrompt(): string {
  return [
    'You design diagrams that are rendered as editable shapes on a canvas.',
    'Reply with a single JSON object and nothing else — no prose, no markdown fences.',
    '',
    'Required JSON shape:',
    `{"schemaVersion": ${AI_SCHEMA_VERSION}, "title": string, "nodes": [{"id": string, "label": string, "shape"?: "rectangle" | "ellipse" | "diamond", "group"?: string, "emphasis"?: boolean}], "edges": [{"from": string, "to": string, "label"?: string, "style"?: "solid" | "dashed"}], "notes"?: [{"text": string}]}`,
    '',
    'Rules:',
    `- node ids: 1–32 characters, letters, digits, hyphen or underscore only, unique.`,
    `- labels: 1–${AI_LIMITS.maxLabelLength} characters, plain text, no markdown, no line breaks.`,
    `- at most ${AI_LIMITS.maxNodes} nodes, ${AI_LIMITS.maxEdges} edges and ${AI_LIMITS.maxNotes} notes.`,
    '- every edge must reference ids that exist in "nodes"; no self-loops.',
    '- do NOT output coordinates, sizes, colours or any layout values — SketchPilot lays the diagram out.',
    '- "group" is optional and only groups related nodes visually.',
    '- "emphasis": true marks a start point or a terminal outcome (at most 3 nodes).',
    '- "notes" is optional; use at most two short notes for caveats worth calling out.',
    '- Prefer concrete, specific labels (real services, real steps) over generic ones.',
  ].join('\n');
}

export function examplePayload(): string {
  const example: AiDiagram = {
    schemaVersion: AI_SCHEMA_VERSION,
    title: 'Password reset',
    nodes: [
      { id: 'start', label: 'User requests reset', shape: 'ellipse', emphasis: true },
      { id: 'exists', label: 'Account exists?', shape: 'diamond' },
      { id: 'send', label: 'Email reset link', group: 'email' },
      { id: 'deny', label: 'Show generic message' },
    ],
    edges: [
      { from: 'start', to: 'exists' },
      { from: 'exists', to: 'send', label: 'yes' },
      { from: 'exists', to: 'deny', label: 'no' },
    ],
    notes: [{ text: 'Never reveal whether an address is registered.' }],
  };
  return JSON.stringify(example);
}

export function buildGenerationMessages(request: GenerationRequest): Array<{ role: 'system' | 'user'; content: string }> {
  const prompt = request.prompt.trim().slice(0, 4000);
  return [
    { role: 'system', content: systemPrompt() },
    {
      role: 'user',
      content: [
        `Diagram type: ${request.diagramType} — ${DIAGRAM_TYPE_GUIDANCE[request.diagramType]}.`,
        COMPLEXITY_GUIDANCE[request.complexity],
        '',
        'Describe this as a diagram:',
        prompt,
        '',
        'Example of the exact format expected:',
        examplePayload(),
      ].join('\n'),
    },
  ];
}

const REFINE_INSTRUCTIONS: Record<RefineIntent, string> = {
  organize: 'Reorganise the diagram so the flow reads clearly, keeping all content.',
  'add-steps': 'Add the missing steps that this diagram implies but does not show.',
  simplify: 'Remove redundant steps and merge duplicates so the diagram is simpler.',
  'improve-labels': 'Rewrite labels to be specific, short and consistent. Keep the structure identical.',
  'add-error-handling': 'Add failure and error-handling branches where they are missing.',
  'find-missing-links': 'Add the connections that are clearly missing between existing nodes.',
  group: 'Assign a "group" to related nodes so the diagram reads in clusters. Keep structure identical.',
  explain: '',
  document: '',
  mermaid: '',
};

/**
 * Refining sends a compact, content-only view of the selection: ids, labels, shapes and
 * edges. No styles, no coordinates, no metadata, and never anything outside the selection.
 */
export function summariseDiagram(diagram: AiDiagram): string {
  return JSON.stringify({ title: diagram.title, nodes: diagram.nodes, edges: diagram.edges });
}

export function buildRefineMessages(
  diagram: AiDiagram,
  intent: RefineIntent,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: systemPrompt() },
    {
      role: 'user',
      content: [
        REFINE_INSTRUCTIONS[intent],
        'Return the complete revised diagram in the same JSON format (not a diff).',
        '',
        'Current diagram:',
        summariseDiagram(diagram),
      ].join('\n'),
    },
  ];
}

export function buildTextIntentMessages(
  diagram: AiDiagram,
  intent: 'explain' | 'document' | 'mermaid',
): Array<{ role: 'system' | 'user'; content: string }> {
  const instruction =
    intent === 'explain'
      ? 'Explain what this diagram shows in 3–6 short sentences, and call out anything that looks wrong or missing.'
      : intent === 'document'
        ? 'Write concise technical documentation for this diagram as Markdown: a one-paragraph overview, then the components and how they connect.'
        : 'Convert this diagram to Mermaid syntax. Reply with the Mermaid code in a single fenced block and nothing else.';

  return [
    { role: 'system', content: 'You are a precise technical writer. Reply in plain prose or the requested format only.' },
    {
      role: 'user',
      content: [instruction, '', 'Diagram:', summariseDiagram(diagram)].join('\n'),
    },
  ];
}
