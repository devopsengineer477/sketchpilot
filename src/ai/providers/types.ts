import type { AppError } from '../../lib/errors';

export type ProviderId = 'openai-compatible' | 'openrouter';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ProviderConfig = {
  provider: ProviderId;
  model: string;
  /** Base URL including the version segment, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  apiKey: string;
};

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatOutcome =
  | { ok: true; text: string; usage?: ProviderUsage; model: string }
  | { ok: false; error: AppError };

export interface AiProvider {
  id: ProviderId;
  label: string;
  /** Default models offered in the UI; users can override. */
  suggestedModels: string[];
  defaultBaseUrl: string;
  chat(messages: ChatMessage[], options?: { signal?: AbortSignal; maxTokens?: number; jsonMode?: boolean }): Promise<ChatOutcome>;
  /** Cheap round-trip used by "Test connection". */
  test(): Promise<ChatOutcome>;
}

/** Human-readable mapping of HTTP failures; never includes the key or the request body. */
export function httpError(status: number, body: string): AppError {
  const snippet = body.replace(/\s+/g, ' ').slice(0, 200);
  switch (status) {
    case 401:
    case 403:
      return {
        code: 'unknown',
        message: 'The provider rejected the API key.',
        hint: 'Check the key in Settings → AI, and that it has access to the selected model.',
      };
    case 404:
      return {
        code: 'unknown',
        message: 'That model or endpoint was not found.',
        hint: 'Check the model name and the base URL in Settings → AI.',
      };
    case 429:
      return {
        code: 'unknown',
        message: 'The provider is rate limiting requests.',
        hint: 'Wait a moment and try again, or switch to a smaller model.',
      };
    default:
      return {
        code: 'unknown',
        message: `The provider returned an error (HTTP ${status}).`,
        hint: snippet ? `Provider said: ${snippet}` : 'Try again, or check the provider status page.',
      };
  }
}

export function networkError(cause: unknown): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const looksLikeCors = /failed to fetch|networkerror|load failed/i.test(message);
  return {
    code: 'unknown',
    message: looksLikeCors
      ? 'The request could not reach the provider.'
      : `The request failed (${message.slice(0, 120)}).`,
    hint: looksLikeCors
      ? 'The provider may not allow browser requests from an extension. Check the base URL, then use Settings → AI → “Grant network access” for that origin.'
      : 'Check your connection and try again.',
    cause,
  };
}
