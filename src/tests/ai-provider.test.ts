import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from '../ai/providers/openaiCompatible';
import { httpError, networkError } from '../ai/providers/types';
import { maskKey, redact, isConfigured, DEFAULT_AI_SETTINGS, toProviderConfig } from '../ai/credentials';
import { askAboutDiagram, generateDiagram, testConnection } from '../ai/generate';

const config = {
  provider: 'openai-compatible' as const,
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.example.test/v1',
  apiKey: 'sk-test-key-1234567890',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const validDiagram = {
  schemaVersion: 1,
  title: 'Reset flow',
  nodes: [
    { id: 'a', label: 'Start', shape: 'ellipse', emphasis: true },
    { id: 'b', label: 'Check account', shape: 'diamond' },
    { id: 'c', label: 'Send email' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c', label: 'yes' },
  ],
};

describe('openai-compatible provider', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /chat/completions with the key in a bearer header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: 'ready' } }],
      usage: { total_tokens: 12 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAiCompatibleProvider(config);
    const outcome = await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(outcome.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${config.apiKey}`);
  });

  it('maps 401 to an actionable key error without echoing the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'invalid api key sk-test-key-1234567890' } }, 401)));
    const provider = createOpenAiCompatibleProvider(config);
    const outcome = await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message).toContain('rejected the API key');
      expect(JSON.stringify(outcome.error)).not.toContain('sk-test-key');
    }
  });

  it('does not retry auth failures but retries 429s', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetchMock);
    await createOpenAiCompatibleProvider(config).chat([{ role: 'user', content: 'hi' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let attempt = 0;
    const flaky = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse({ error: 'slow down' }, 429);
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    vi.stubGlobal('fetch', flaky);
    const outcome = await createOpenAiCompatibleProvider(config).chat([{ role: 'user', content: 'hi' }]);
    expect(outcome.ok).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it('reports a network/CORS failure in terms a user can act on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const outcome = await createOpenAiCompatibleProvider(config).chat([{ role: 'user', content: 'hi' }]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message).toContain('could not reach the provider');
      expect(outcome.error.hint).toContain('Grant network access');
    }
  });

  it('rejects an empty completion instead of treating it as a diagram', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [{ message: { content: '   ' } }] })));
    const outcome = await createOpenAiCompatibleProvider(config).chat([{ role: 'user', content: 'hi' }]);
    expect(outcome.ok).toBe(false);
  });

  it('honours cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        controller.abort();
      });
    }));

    const outcome = await createOpenAiCompatibleProvider(config).chat(
      [{ role: 'user', content: 'hi' }],
      { signal: controller.signal },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.message).toContain('cancelled');
  });
});

describe('generation pipeline against a mocked provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  const settings = { ...DEFAULT_AI_SETTINGS, apiKey: config.apiKey, baseUrl: config.baseUrl, enabled: true, model: 'gpt-4o-mini' };

  it('produces a plan from a fenced JSON reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(validDiagram)}\n\`\`\`` } }],
      usage: { total_tokens: 200 },
    })));

    const outcome = await generateDiagram(settings, {
      prompt: 'password reset flow',
      diagramType: 'flowchart',
      complexity: 'simple',
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.plan.stats.nodes).toBe(3);
      expect(outcome.plan.layout.nodes).toHaveLength(3);
    }
  });

  it('returns an error, not a broken plan, when the model replies with prose', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: 'Here is a lovely diagram for you.' } }],
    })));
    const outcome = await generateDiagram(settings, {
      prompt: 'x',
      diagramType: 'flowchart',
      complexity: 'simple',
    });
    expect(outcome.ok).toBe(false);
  });

  it('propagates provider errors unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)));
    const outcome = await generateDiagram(settings, { prompt: 'x', diagramType: 'flowchart', complexity: 'simple' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.message).toContain('HTTP 500');
  });

  it('returns text for explain requests instead of a diagram', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: 'This diagram shows a reset flow.' } }],
    })));
    const outcome = await askAboutDiagram(settings, validDiagram as never, 'explain');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toContain('reset flow');
  });

  it('tests a connection without touching the drawing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'ready' } }] })));
    const outcome = await testConnection(settings);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toBe('ready');
  });
});

describe('credential handling', () => {
  it('masks keys for display', () => {
    expect(maskKey('sk-abcdefghijklmnop')).toMatch(/^•+mnop$/);
    expect(maskKey('sk-abcdefghijklmnop')).not.toContain('abcdefgh');
    expect(maskKey('short')).toBe('•••••');
    expect(maskKey('')).toBe('');
  });

  it('redacts keys from any text before it is shown or logged', () => {
    expect(redact('failed with sk-test-key-1234567890', 'sk-test-key-1234567890')).toBe('failed with [redacted]');
    expect(redact('nothing to redact', '')).toBe('nothing to redact');
  });

  it('treats AI as unconfigured until a key and model exist', () => {
    expect(isConfigured(DEFAULT_AI_SETTINGS)).toBe(false);
    expect(isConfigured({ ...DEFAULT_AI_SETTINGS, apiKey: 'k', enabled: true })).toBe(true);
    expect(isConfigured({ ...DEFAULT_AI_SETTINGS, apiKey: 'k', enabled: false })).toBe(false);
  });

  it('maps settings to provider config without leaking extra fields', () => {
    const mapped = toProviderConfig({ ...DEFAULT_AI_SETTINGS, apiKey: 'k' });
    expect(Object.keys(mapped).sort()).toEqual(['apiKey', 'baseUrl', 'model', 'provider']);
  });

  it('maps http statuses to distinct, actionable errors', () => {
    expect(httpError(429, '').message).toContain('rate limiting');
    expect(httpError(404, '').hint).toContain('model name');
    expect(networkError(new TypeError('Failed to fetch')).hint).toContain('Grant network access');
  });
});
