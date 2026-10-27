import type { ProviderConfig, ProviderId } from './providers/types';
import { readPreferences, writePreferences } from '../platform/browser';

/**
 * AI settings storage.
 *
 * Honest disclosure, enforced in the UI and documented in PRIVACY/README: a key held in
 * `chrome.storage.local` is protected by the browser profile, not by a secret manager.
 * Anyone with access to the profile can read it, which is exactly why the product ships
 * with no key, never sends one anywhere except the provider, and offers one-click removal.
 *
 * The key is never logged, never included in error messages, and never stored in a drawing.
 */

const AI_KEY = 'sketchpilot.ai';

export type AiSettings = {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  /** Local, content-free log of recent calls for the usage panel. */
  usage: AiUsageEntry[];
};

export type AiUsageEntry = {
  at: number;
  provider: ProviderId;
  model: string;
  kind: 'generate' | 'refine' | 'explain' | 'document' | 'mermaid' | 'test';
  outcome: 'ok' | 'error';
  totalTokens?: number;
  durationMs: number;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'openai-compatible',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  enabled: false,
  usage: [],
};

const MAX_USAGE_ENTRIES = 25;

type StoredShape = Partial<AiSettings>;

function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
}

export async function readAiSettings(): Promise<AiSettings> {
  if (!hasChrome()) return { ...DEFAULT_AI_SETTINGS };
  try {
    const result = await chrome.storage.local.get(AI_KEY);
    const raw = (result?.[AI_KEY] ?? {}) as StoredShape;
    return {
      provider: raw.provider === 'openrouter' ? 'openrouter' : 'openai-compatible',
      model: typeof raw.model === 'string' && raw.model ? raw.model : DEFAULT_AI_SETTINGS.model,
      baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : DEFAULT_AI_SETTINGS.baseUrl,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      enabled: raw.enabled === true,
      usage: Array.isArray(raw.usage) ? raw.usage.slice(0, MAX_USAGE_ENTRIES) : [],
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export async function writeAiSettings(patch: Partial<AiSettings>): Promise<void> {
  if (!hasChrome()) return;
  const current = await readAiSettings();
  const next: AiSettings = { ...current, ...patch };
  await chrome.storage.local.set({ [AI_KEY]: next });
}

export async function clearAiSettings(): Promise<void> {
  if (!hasChrome()) return;
  await chrome.storage.local.remove(AI_KEY);
}

export async function recordUsage(entry: Omit<AiUsageEntry, 'at'>): Promise<void> {
  const current = await readAiSettings();
  const usage = [{ ...entry, at: Date.now() }, ...current.usage].slice(0, MAX_USAGE_ENTRIES);
  await writeAiSettings({ usage });
}

export async function clearUsage(): Promise<void> {
  await writeAiSettings({ usage: [] });
}

/** True when the settings are complete enough to make a request. */
export function isConfigured(settings: AiSettings): boolean {
  return settings.enabled && settings.apiKey.trim().length > 0 && settings.model.trim().length > 0;
}

/** Masks a key for display: keeps the last four characters only. */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${'•'.repeat(Math.min(20, key.length - 4))}${key.slice(-4)}`;
}

/** Never let a key reach a log line or an error surface. */
export function redact(text: string, key: string): string {
  if (!key) return text;
  return text.split(key).join('[redacted]');
}

export function toProviderConfig(settings: AiSettings): ProviderConfig {
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  };
}

export const AI_PREFERENCES_KEY = 'ai-enabled';

/** Mirrors "AI is enabled" into the general preferences for other surfaces. */
export async function syncAiPreference(enabled: boolean): Promise<void> {
  await writePreferences({ aiEnabled: enabled });
  void AI_PREFERENCES_KEY;
}

export async function readAiPreference(): Promise<boolean> {
  const preferences = await readPreferences();
  return preferences.aiEnabled;
}
