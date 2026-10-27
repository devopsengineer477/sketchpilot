import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, Select, TextInput } from '../components/Field';
import {
  DEFAULT_AI_SETTINGS,
  clearAiSettings,
  clearUsage,
  maskKey,
  readAiSettings,
  syncAiPreference,
  writeAiSettings,
  type AiSettings,
} from '../ai/credentials';
import { testConnection } from '../ai/generate';
import type { ProviderId } from '../ai/providers/types';
import { formatRelative } from '../lib/format';

const PROVIDER_INFO: Record<ProviderId, { label: string; baseUrl: string; models: string[]; help: string }> = {
  'openai-compatible': {
    label: 'OpenAI-compatible',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'llama3.1:8b'],
    help: 'Any endpoint that speaks the OpenAI chat-completions API: OpenAI, a local Ollama/LM Studio server, or your own gateway.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    help: 'One key for many models. OpenRouter reports the model actually used in each response.',
  },
};

export function AiSettingsSection({ onToast }: { onToast: (tone: 'success' | 'error' | 'info', message: string, hint?: string) => void }) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [draft, setDraft] = useState({ ...DEFAULT_AI_SETTINGS });
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const current = await readAiSettings();
    setSettings(current);
    setDraft(current);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const next: AiSettings = {
      ...settings,
      provider: draft.provider,
      model: draft.model.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      apiKey: draft.apiKey.trim(),
      enabled: draft.enabled,
    };
    await writeAiSettings(next);
    await syncAiPreference(next.enabled && next.apiKey.length > 0);
    setSettings(next);
    setDraft(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onToast('success', 'AI settings saved', next.enabled ? 'The AI panel is available in the editor.' : 'AI is turned off.');
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const outcome = await testConnection({
      ...settings,
      ...draft,
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      apiKey: draft.apiKey.trim(),
    });
    setTesting(false);
    setTestResult(
      outcome.ok
        ? { ok: true, message: `Connected — the model replied “${outcome.text.slice(0, 40)}”.` }
        : { ok: false, message: `${outcome.error.message} ${outcome.error.hint ?? ''}`.trim() },
    );
  };

  const removeCredentials = async () => {
    await clearAiSettings();
    await syncAiPreference(false);
    setRevealed(false);
    setTestResult(null);
    await load();
    onToast('success', 'API key removed', 'AI is disabled until you add a key again.');
  };

  const clearLog = async () => {
    await clearUsage();
    await load();
    onToast('info', 'Usage log cleared');
  };

  const provider = PROVIDER_INFO[draft.provider];

  return (
    <section className="surface mt-4 p-5" aria-labelledby="ai-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="ai-heading" className="text-sm font-semibold">
            AI assistant
          </h2>
          <p className="mt-1 text-[13px] muted">
            Optional. Turn text into editable diagrams. SketchPilot works fully without it.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            className="h-4 w-4 rounded border-ink-300"
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Provider" htmlFor="ai-provider" hint={provider.help}>
          <Select
            id="ai-provider"
            value={draft.provider}
            onChange={(event) => {
              const next = event.target.value as ProviderId;
              setDraft({
                ...draft,
                provider: next,
                baseUrl: PROVIDER_INFO[next].baseUrl,
                model: PROVIDER_INFO[next].models[0] ?? draft.model,
              });
            }}
          >
            {(Object.keys(PROVIDER_INFO) as ProviderId[]).map((id) => (
              <option key={id} value={id}>
                {PROVIDER_INFO[id].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Model" htmlFor="ai-model" hint="Any model id the provider accepts.">
          <TextInput
            id="ai-model"
            list="ai-model-options"
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            placeholder="gpt-4o-mini"
          />
          <datalist id="ai-model-options">
            {provider.models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </Field>

        <Field label="Base URL" htmlFor="ai-base-url" hint="Include the version segment, e.g. /v1.">
          <TextInput
            id="ai-base-url"
            value={draft.baseUrl}
            onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            spellCheck={false}
          />
        </Field>

        <Field label="API key" htmlFor="ai-key" hint="Stored in this browser profile — see the notice below.">
          <div className="flex gap-1.5">
            <TextInput
              id="ai-key"
              type={revealed ? 'text' : 'password'}
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? 'Hide API key' : 'Show API key'}
              title={revealed ? 'Hide API key' : 'Show API key'}
            >
              {revealed ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </Button>
          </div>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void save()}>
          Save settings
        </Button>
        <Button size="sm" onClick={() => void runTest()} disabled={testing || !draft.apiKey.trim()}>
          <KeyRound size={14} aria-hidden />
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        {settings.apiKey ? (
          <Button size="sm" variant="danger" onClick={() => void removeCredentials()}>
            <Trash2 size={14} aria-hidden />
            Remove key
          </Button>
        ) : null}
        {saved ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-emerald-700 dark:text-emerald-400" role="status">
            <CheckCircle2 size={14} aria-hidden /> Saved
          </span>
        ) : null}
      </div>

      {testResult ? (
        <p
          role={testResult.ok ? 'status' : 'alert'}
          className={`mt-3 flex items-start gap-1.5 rounded-lg p-2 text-[13px] ${
            testResult.ok
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {testResult.ok ? <CheckCircle2 size={15} aria-hidden /> : <XCircle size={15} aria-hidden />}
          <span>{testResult.message}</span>
        </p>
      ) : null}

      {settings.apiKey ? (
        <p className="mt-3 text-[12px] muted">
          Saved key: <span className="font-mono">{maskKey(settings.apiKey)}</span>
        </p>
      ) : null}

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="flex items-start gap-1.5 font-medium">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          What you should know before adding a key
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>
            The key is stored in this browser profile via <code>chrome.storage.local</code>. It is protected by
            your profile, <strong>not</strong> by a secret manager — anyone with access to this profile can read it.
          </li>
          <li>
            Your prompt (and, for refine, the selected diagram's labels and structure) is sent to the provider you
            choose. Nothing is sent until you press Generate.
          </li>
          <li>No drawing is uploaded in the background, and there is no analytics or telemetry.</li>
          <li>
            A server-side proxy is the right answer for shared or production keys; it is intentionally out of scope
            for this release.
          </li>
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide muted">Recent AI activity</h3>
          {settings.usage.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => void clearLog()}>
              Clear log
            </Button>
          ) : null}
        </div>
        {settings.usage.length === 0 ? (
          <p className="mt-1 text-[13px] muted">No AI requests yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-[12px]">
            {settings.usage.slice(0, 6).map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex items-center justify-between gap-2">
                <span className="muted">
                  {entry.kind} · {entry.model} · {formatRelative(entry.at)}
                </span>
                <span className={entry.outcome === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                  {entry.outcome}
                  {entry.totalTokens ? ` · ${entry.totalTokens} tokens` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] muted">
          This log records timing, model and token counts only — never prompt or diagram content.
        </p>
      </div>
    </section>
  );
}
