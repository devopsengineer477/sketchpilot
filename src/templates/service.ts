import { BUILTIN_TEMPLATES } from './catalog';
import { newDrawingId } from '../storage/documents';
import { repository } from '../storage/repository';
import type { DrawingElement, Template, TemplateCategory } from '../storage/schemas';
import { APP_VERSION, SCHEMA_VERSION } from '../storage/schemas';
import type { ResolvedTemplate } from './types';

/**
 * One list of templates for the UI: built-ins (code) plus the user's own (IndexedDB),
 * normalised to a single shape so the gallery does not branch on origin.
 */

export function builtinAsResolved(): ResolvedTemplate[] {
  return BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    source: 'builtin' as const,
    createdAt: 0,
    updatedAt: 0,
    // Built-ins carry a spec, not elements; the empty array is a marker the
    // instantiator understands. Preview/instantiation resolve through the catalog.
    elements: [],
  }));
}

function userAsResolved(template: Template): ResolvedTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    source: 'user',
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    elements: template.elements,
  };
}

export async function listAllTemplates(): Promise<{ builtin: ResolvedTemplate[]; user: ResolvedTemplate[]; error?: string }> {
  const result = await repository.listTemplates();
  if (!result.ok) {
    return { builtin: builtinAsResolved(), user: [], error: result.error.message };
  }
  return { builtin: builtinAsResolved(), user: result.value.map(userAsResolved) };
}

export async function saveDrawingAsTemplate(options: {
  name: string;
  description?: string;
  category?: TemplateCategory;
  elements: DrawingElement[];
  appState?: Record<string, unknown>;
}): Promise<{ ok: true; template: Template } | { ok: false; message: string }> {
  const name = options.name.trim();
  if (!name) return { ok: false, message: 'Give the template a name first.' };
  if (options.elements.length === 0) {
    return { ok: false, message: 'There is nothing on the canvas to save as a template.' };
  }

  const now = Date.now();
  const template: Template = {
    id: newDrawingId(),
    name: name.slice(0, 80),
    description: (options.description ?? '').slice(0, 240),
    category: options.category ?? 'custom',
    source: 'user',
    createdAt: now,
    updatedAt: now,
    elements: options.elements,
    appState: (options.appState ?? {}) as Template['appState'],
  };

  const saved = await repository.saveTemplate(template);
  if (!saved.ok) return { ok: false, message: saved.error.message };
  return { ok: true, template };
}

export async function resolveTemplate(id: string): Promise<ResolvedTemplate | null> {
  const builtin = builtinAsResolved().find((template) => template.id === id);
  if (builtin) return builtin;

  const stored = await repository.listTemplates();
  if (!stored.ok) return null;
  const match = stored.value.find((template) => template.id === id);
  return match ? userAsResolved(match) : null;
}

export function appVersionLabel(): string {
  return `${APP_VERSION} · schema v${SCHEMA_VERSION}`;
}
