import type { AiProvider, ChatMessage, ChatOutcome, ProviderConfig, ProviderUsage } from './types';
import { httpError, networkError } from './types';

const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

function usageFrom(response: ChatCompletionResponse): ProviderUsage | undefined {
  if (!response.usage) return undefined;
  return {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  };
}

/** Extracts the assistant text, tolerating the two common response shapes. */
export function extractText(response: ChatCompletionResponse): string {
  return response.choices?.[0]?.message?.content ?? '';
}

/**
 * One adapter for every OpenAI-compatible endpoint: OpenAI itself, OpenRouter, and
 * local servers (Ollama, LM Studio, vLLM). Differences between them are configuration.
 */
export function createOpenAiCompatibleProvider(config: ProviderConfig): AiProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request(
    messages: ChatMessage[],
    options: { signal?: AbortSignal; maxTokens?: number; jsonMode?: boolean } = {},
  ): Promise<ChatOutcome> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 2_000,
    };
    // Not every compatible server supports response_format; only send it when asked.
    if (options.jsonMode) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
              ...(config.provider === 'openrouter'
                ? { 'HTTP-Referer': 'https://sketchpilot.local', 'X-Title': 'SketchPilot AI' }
                : {}),
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            // Retry only transient failures; auth and validation errors are terminal.
            if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
              await sleep(500 * 2 ** attempt);
              continue;
            }
            return { ok: false, error: httpError(response.status, text) };
          }

          const payload = (await response.json()) as ChatCompletionResponse;
          const text = extractText(payload);
          if (!text.trim()) {
            return {
              ok: false,
              error: {
                code: 'unknown',
                message: 'The provider returned an empty response.',
                hint: 'Try again, or choose a different model.',
              },
            };
          }
          return { ok: true, text, usage: usageFrom(payload), model: payload.model ?? config.model };
        } catch (cause) {
          const aborted = controller.signal.aborted;
          if (aborted && options.signal?.aborted) {
            return {
              ok: false,
              error: { code: 'unknown', message: 'Generation cancelled.', hint: 'Nothing was changed.' },
            };
          }
          if (attempt < MAX_RETRIES && !aborted) {
            await sleep(500 * 2 ** attempt);
            continue;
          }
          return { ok: false, error: networkError(cause) };
        }
      }
      return {
        ok: false,
        error: { code: 'unknown', message: 'The provider did not respond in time.', hint: 'Try again in a moment.' },
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    id: config.provider,
    label: config.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI-compatible',
    defaultBaseUrl: baseUrl,
    suggestedModels:
      config.provider === 'openrouter'
        ? ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5']
        : ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'llama3.1:8b'],
    chat: request,
    test: () => request([{ role: 'user', content: 'Reply with the single word: ready' }], { maxTokens: 16 }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
