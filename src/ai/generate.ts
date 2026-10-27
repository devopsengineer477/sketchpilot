import type { AppError } from '../lib/errors';
import { layoutProblems, validateDiagramMeaning, validateDiagramShape, issuesToError } from './validate';
import { repairDiagram, type RepairAction } from './repair';
import { layoutDiagram } from './layout';
import { buildGenerationMessages, buildRefineMessages, buildTextIntentMessages } from './prompt';
import {
  recordUsage,
  toProviderConfig,
  type AiSettings,
} from './credentials';
import { createOpenAiCompatibleProvider } from './providers/openaiCompatible';
import { AI_SCHEMA_VERSION, type AiDiagram, type DiagramPlan, type DiagramType, type GenerationRequest, type RefineIntent } from './schemas';
import type { AiProvider, ChatMessage } from './providers/types';

/**
 * The AI orchestrator.
 *
 * Model output is treated as hostile input at every step:
 *   raw text → JSON extraction → shape validation → repair → meaning validation →
 *   layout → Layout validation.
 * Any stage failing returns an error and leaves the drawing untouched. Nothing here
 * touches the canvas; the caller decides whether to preview or insert.
 */

export type PlanOutcome =
  | { ok: true; plan: DiagramPlan; repairs: RepairAction[]; raw: string }
  | { ok: false; error: AppError; issues?: unknown };

export type TextOutcome =
  | { ok: true; text: string }
  | { ok: false; error: AppError };

/**
 * Pulls a JSON object out of whatever the model actually replied with: bare JSON, a
 * fenced block, or JSON wrapped in a sentence. Anything else is rejected.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      // Reject prototype-pollution keys before they can reach any object merge.
      // `Object.hasOwn` matters here: `in` would match every object via its prototype.
      if (
        parsed &&
        typeof parsed === 'object' &&
        (Object.hasOwn(parsed, '__proto__') || Object.hasOwn(parsed, 'constructor') || Object.hasOwn(parsed, 'prototype'))
      ) {
        return null;
      }
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function buildProvider(settings: AiSettings): AiProvider {
  return createOpenAiCompatibleProvider(toProviderConfig(settings));
}

async function callModel(
  settings: AiSettings,
  messages: ChatMessage[],
  kind: Parameters<typeof recordUsage>[0]['kind'],
  options: { signal?: AbortSignal; jsonMode?: boolean } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: AppError }> {
  const provider = buildProvider(settings);
  const startedAt = Date.now();
  const outcome = await provider.chat(messages, {
    maxTokens: 2_400,
    jsonMode: options.jsonMode ?? false,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  await recordUsage({
    provider: settings.provider,
    model: settings.model,
    kind,
    outcome: outcome.ok ? 'ok' : 'error',
    durationMs: Date.now() - startedAt,
    ...(outcome.ok && outcome.usage?.totalTokens ? { totalTokens: outcome.usage.totalTokens } : {}),
  });

  return outcome.ok ? { ok: true, text: outcome.text } : { ok: false, error: outcome.error };
}

/** Shared tail: validate → repair → re-validate → layout. */
export function planFromRaw(
  raw: string,
  diagramType: DiagramType,
): PlanOutcome {
  const parsed = extractJson(raw);
  if (!parsed) {
    return {
      ok: false,
      error: {
        code: 'invalid-import',
        message: 'The model did not return usable JSON.',
        hint: 'Try again, or switch to a model with stronger instruction following.',
      },
    };
  }

  const shape = validateDiagramShape({
    ...(parsed as Record<string, unknown>),
    schemaVersion:
      (parsed as Record<string, unknown>).schemaVersion ?? AI_SCHEMA_VERSION,
  });
  if (!shape.ok) {
    return { ok: false, error: issuesToError(shape.issues, 'shape'), issues: shape.issues };
  }

  const repaired = repairDiagram(shape.diagram);
  const meaning = validateDiagramMeaning(repaired.diagram);
  if (!meaning.ok) {
    return { ok: false, error: issuesToError(meaning.issues, 'meaning'), issues: meaning.issues };
  }

  const { spec, layers } = layoutDiagram(meaning.diagram, diagramType);

  const problems = layoutProblems(spec.nodes.map((node) => ({ x: node.x, y: node.y })));
  if (problems.length) {
    return { ok: false, error: issuesToError(problems, 'layout'), issues: problems };
  }

  return {
    ok: true,
    raw,
    repairs: repaired.actions,
    plan: {
      title: meaning.diagram.title,
      diagram: meaning.diagram,
      layout: spec,
      stats: { nodes: meaning.diagram.nodes.length, edges: meaning.diagram.edges.length, layers },
    },
  };
}

export async function generateDiagram(
  settings: AiSettings,
  request: GenerationRequest,
  options: { signal?: AbortSignal } = {},
): Promise<PlanOutcome> {
  const reply = await callModel(settings, buildGenerationMessages(request), 'generate', {
    jsonMode: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!reply.ok) return { ok: false, error: reply.error };
  return planFromRaw(reply.text, request.diagramType);
}

export async function refineDiagram(
  settings: AiSettings,
  diagram: AiDiagram,
  intent: RefineIntent,
  diagramType: DiagramType,
  options: { signal?: AbortSignal } = {},
): Promise<PlanOutcome> {
  const reply = await callModel(settings, buildRefineMessages(diagram, intent), 'refine', {
    jsonMode: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!reply.ok) return { ok: false, error: reply.error };
  return planFromRaw(reply.text, diagramType);
}

export async function askAboutDiagram(
  settings: AiSettings,
  diagram: AiDiagram,
  intent: 'explain' | 'document' | 'mermaid',
  options: { signal?: AbortSignal } = {},
): Promise<TextOutcome> {
  const reply = await callModel(settings, buildTextIntentMessages(diagram, intent), intent, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!reply.ok) return { ok: false, error: reply.error };
  return { ok: true, text: reply.text.trim() };
}

export async function testConnection(settings: AiSettings): Promise<TextOutcome> {
  const provider = buildProvider(settings);
  const startedAt = Date.now();
  const outcome = await provider.test();
  await recordUsage({
    provider: settings.provider,
    model: settings.model,
    kind: 'test',
    outcome: outcome.ok ? 'ok' : 'error',
    durationMs: Date.now() - startedAt,
  });
  return outcome.ok ? { ok: true, text: outcome.text.trim() } : { ok: false, error: outcome.error };
}

/** Strips a ```mermaid fence so the code panel contains only the diagram source. */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}
