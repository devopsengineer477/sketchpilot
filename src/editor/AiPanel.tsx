import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Field, Select, TextArea } from '../components/Field';
import type { AppError } from '../lib/errors';
import {
  askAboutDiagram,
  generateDiagram,
  refineDiagram,
  stripCodeFence,
} from '../ai/generate';
import { AI_LIMITS, REFINE_INTENT_LABEL, type AiDiagram, type Complexity, type DiagramPlan, type DiagramType, type RefineIntent } from '../ai/schemas';
import { isConfigured, readAiSettings, type AiSettings } from '../ai/credentials';
import { openSettings } from '../platform/browser';
import { consentSummary } from '../capture/model';
import type { RepairAction } from '../ai/repair';

export type AiSeed = {
  prompt: string;
  diagramType?: DiagramType;
  /** Set when the prompt contains text lifted from a web page. */
  origin?: { url: string; title: string; capturedAt: number };
  /** Changes when a new seed arrives, so the panel can react even to identical prompts. */
  token: number;
};

export type AiPanelProps = {
  seed?: AiSeed | null;
  onSeedConsumed?: () => void;
  /** Full diagram currently on the canvas, used for refine/explain. */
  getDiagram: () => AiDiagram | null;
  selectionSize: number;
  preview: DiagramPlan | null;
  repairs: RepairAction[];
  onPreview: (plan: DiagramPlan, repairs: RepairAction[]) => void;
  onClearPreview: () => void;
  onInsert: (plan: DiagramPlan) => void;
  onReplace: (plan: DiagramPlan) => void;
  onClose: () => void;
};

const DIAGRAM_TYPE_LABEL: Record<DiagramType, string> = {
  flowchart: 'Flowchart',
  mindmap: 'Mind map',
  architecture: 'Software architecture',
  pipeline: 'Pipeline',
  sequence: 'Sequence',
  orgchart: 'Org chart',
};

const COMPLEXITY_LABEL: Record<Complexity, string> = {
  simple: 'Simple',
  balanced: 'Balanced',
  detailed: 'Detailed',
};

/** Types enabled in this release. Others remain listed but visibly unavailable. */
const ENABLED_TYPES: DiagramType[] = ['flowchart', 'mindmap', 'architecture', 'pipeline'];

type Phase = 'idle' | 'loading' | 'preview' | 'error';

export function AiPanel({
  seed,
  onSeedConsumed,
  getDiagram,
  selectionSize,
  preview,
  repairs,
  onPreview,
  onClearPreview,
  onInsert,
  onReplace,
  onClose,
}: AiPanelProps) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [prompt, setPrompt] = useState('');
  const [diagramType, setDiagramType] = useState<DiagramType>('flowchart');
  const [complexity, setComplexity] = useState<Complexity>('balanced');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<AppError | null>(null);
  const [textResult, setTextResult] = useState<{ kind: 'explain' | 'document' | 'mermaid'; text: string } | null>(null);
  const [history, setHistory] = useState<DiagramPlan[]>([]);
  const [copied, setCopied] = useState(false);
  /**
   * Page text never leaves the machine without an explicit confirmation (spec §7,
   * plan P4-T11). Editing the prompt revokes it again: new content needs a new yes.
   */
  const [origin, setOrigin] = useState<AiSeed['origin'] | null>(null);
  const [consented, setConsented] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void readAiSettings().then(setSettings);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!seed) return;
    setPrompt(seed.prompt.slice(0, 4000));
    if (seed.diagramType) setDiagramType(seed.diagramType);
    setOrigin(seed.origin ?? null);
    setConsented(!seed.origin);
    setPhase('idle');
    setError(null);
    setTextResult(null);
    onSeedConsumed?.();
    // The seed token is the identity: a new token is a new intent.
  }, [seed?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const configured = settings ? isConfigured(settings) : false;

  const run = useCallback(
    async (task: (signal: AbortSignal) => Promise<{ ok: boolean; plan?: DiagramPlan; repairs?: RepairAction[]; error?: AppError }>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('loading');
      setError(null);
      setTextResult(null);

      const outcome = await task(controller.signal);
      if (controller.signal.aborted) {
        setPhase('idle');
        return;
      }
      if (!outcome.ok || !outcome.plan) {
        setError(
          outcome.error ?? {
            code: 'unknown',
            message: 'The model did not return a diagram.',
            hint: 'Try again with a more specific prompt.',
          },
        );
        setPhase('error');
        return;
      }
      setPhase('preview');
      setHistory((current) => [outcome.plan!, ...current].slice(0, 3));
      onPreview(outcome.plan, outcome.repairs ?? []);
    },
    [onPreview],
  );

  const consent = useMemo(() => {
    if (!origin) return null;
    return {
      ...consentSummary({
        prompt,
        endpoint: settings?.baseUrl ?? 'https://api.openai.com/v1',
        pageUrl: origin.url,
        pageTitle: origin.title,
      }),
      model: settings?.model ?? '',
    };
  }, [origin, prompt, settings?.baseUrl, settings?.model]);

  const awaitingConsent = Boolean(consent) && !consented;

  const generate = () => {
    if (!settings || !prompt.trim() || awaitingConsent) return;
    void run(async (signal) => {
      const outcome = await generateDiagram(
        settings,
        { prompt, diagramType, complexity },
        { signal },
      );
      return outcome.ok
        ? { ok: true, plan: outcome.plan, repairs: outcome.repairs }
        : { ok: false, error: outcome.error };
    });
  };

  const refine = (intent: RefineIntent) => {
    const diagram = getDiagram();
    if (!settings || !diagram) return;
    if (intent === 'explain' || intent === 'document' || intent === 'mermaid') {
      setPhase('loading');
      setError(null);
      void askAboutDiagram(settings, diagram, intent).then((outcome) => {
        setPhase(outcome.ok ? 'idle' : 'error');
        if (outcome.ok) setTextResult({ kind: intent, text: outcome.text });
        else setError(outcome.error);
      });
      return;
    }
    void run(async (signal) => {
      const outcome = await refineDiagram(settings, diagram, intent, diagramType, { signal });
      return outcome.ok
        ? { ok: true, plan: outcome.plan, repairs: outcome.repairs }
        : { ok: false, error: outcome.error };
    });
  };

  const copyText = async () => {
    if (!textResult) return;
    const text = textResult.kind === 'mermaid' ? stripCodeFence(textResult.text) : textResult.text;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const previewStats = useMemo(() => {
    if (!preview) return null;
    return `${preview.stats.nodes} nodes · ${preview.stats.edges} edges · ${preview.stats.layers} columns`;
  }, [preview]);

  if (settings === null) {
    return (
      <aside className="flex w-80 shrink-0 items-center justify-center border-l border-ink-200 dark:border-ink-800">
        <Loader2 size={16} className="animate-spin text-ink-400" aria-hidden />
      </aside>
    );
  }

  return (
    <aside
      aria-label="AI assistant"
      className="flex w-[340px] shrink-0 flex-col border-l border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
    >
      <header className="flex items-center gap-2 border-b border-ink-200 px-3 py-2.5 dark:border-ink-800">
        <Sparkles size={15} className="text-pilot-600" aria-hidden />
        <h2 className="text-[13px] font-semibold">AI assistant</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistant"
          className="ml-auto rounded p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          <X size={15} aria-hidden />
        </button>
      </header>

      {!configured ? (
        <div className="p-4 text-[13px]">
          <p className="font-medium">AI is not configured</p>
          <p className="mt-1 muted">
            Add a provider and API key in Settings to generate diagrams. Everything else in SketchPilot works
            without it — nothing here is required to draw.
          </p>
          <Button variant="primary" size="sm" className="mt-3" onClick={() => openSettings()}>
            Open AI settings
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Field label="Describe the diagram" htmlFor="ai-prompt">
            <TextArea
              id="ai-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value.slice(0, 4000));
                if (origin) setConsented(false);
              }}
              rows={4}
              placeholder="A CI/CD pipeline: developer pushes to GitHub, Actions builds and tests, image goes to ECR, deploys to ECS Fargate, talks to PostgreSQL RDS."
            />
          </Field>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Type" htmlFor="ai-type">
              <Select
                id="ai-type"
                value={diagramType}
                onChange={(event) => setDiagramType(event.target.value as DiagramType)}
              >
                {(Object.keys(DIAGRAM_TYPE_LABEL) as DiagramType[]).map((type) => (
                  <option key={type} value={type} disabled={!ENABLED_TYPES.includes(type)}>
                    {DIAGRAM_TYPE_LABEL[type]}
                    {ENABLED_TYPES.includes(type) ? '' : ' (coming soon)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Detail" htmlFor="ai-complexity">
              <Select
                id="ai-complexity"
                value={complexity}
                onChange={(event) => setComplexity(event.target.value as Complexity)}
              >
                {(Object.keys(COMPLEXITY_LABEL) as Complexity[]).map((value) => (
                  <option key={value} value={value}>
                    {COMPLEXITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {consent ? (
            <section
              aria-labelledby="ai-consent-heading"
              className={`mt-3 rounded-lg border p-2.5 text-[12px] ${
                awaitingConsent
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50'
                  : 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-950/60'
              }`}
            >
              <h3 id="ai-consent-heading" className="font-semibold">
                {awaitingConsent ? 'This prompt contains text from a web page' : 'Page text included — you confirmed it'}
              </h3>
              <p className="mt-0.5 muted">
                {consent.pageLabel} · {consent.characters.toLocaleString()} characters · to{' '}
                <span className="font-medium">{consent.host}</span>
                {consent.model ? ` (${consent.model})` : ''}
              </p>
              <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] leading-relaxed dark:bg-ink-900/70">
                {consent.preview}
              </pre>
              {awaitingConsent ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => setConsented(true)}>
                    Send to {consent.host}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPrompt('');
                      setOrigin(null);
                      setConsented(true);
                    }}
                  >
                    Remove page text
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConsented(false)}
                  className="mt-1.5 text-[12px] font-medium text-pilot-700 hover:underline dark:text-pilot-300"
                >
                  Review again
                </button>
              )}
              <p className="mt-1.5 text-[11px] muted">
                Nothing has been sent. This is the exact text that will leave the browser, and only when you
                press Generate.
              </p>
            </section>
          ) : null}

          <p role="status" aria-live="polite" className="sr-only">
            {phase === 'loading'
              ? 'Generating a diagram. Nothing will be added until you approve the preview.'
              : phase === 'preview'
                ? 'Preview ready. Review it and choose Insert, Replace or Discard.'
                : phase === 'error'
                  ? 'Generation failed. Your drawing was not changed.'
                  : ''}
          </p>

          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={phase === 'loading' || prompt.trim().length < 3 || awaitingConsent}
              title={awaitingConsent ? 'Confirm what will be sent first' : undefined}
              onClick={generate}
            >
              {phase === 'loading' ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden /> Generating…
                </>
              ) : (
                <>
                  <Wand2 size={14} aria-hidden /> Generate
                </>
              )}
            </Button>
            {phase === 'loading' ? (
              <Button size="sm" variant="secondary" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              <p className="font-medium">{error.message}</p>
              {error.hint ? <p className="mt-0.5 opacity-90">{error.hint}</p> : null}
              <p className="mt-1.5 font-medium">Your drawing was not changed.</p>
            </div>
          ) : null}

          {preview ? (
            <section aria-labelledby="ai-preview-heading" className="mt-3 rounded-lg border border-pilot-200 bg-pilot-50/60 p-2.5 dark:border-pilot-900 dark:bg-pilot-950/40">
              <h3 id="ai-preview-heading" className="text-[12px] font-semibold">
                Preview — not on the canvas yet
              </h3>
              <p className="mt-0.5 text-[12px] muted">{previewStats}</p>
              <p className="mt-1 line-clamp-2 text-[12px] font-medium">{preview.title}</p>
              {repairs.length > 0 ? (
                <p className="mt-1 text-[11px] muted">
                  {repairs.length} automatic fix{repairs.length === 1 ? '' : 'es'} applied (duplicate or invalid
                  parts removed).
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" onClick={() => onInsert(preview)}>
                  <Check size={13} aria-hidden /> Insert
                </Button>
                <Button size="sm" onClick={() => onReplace(preview)}>
                  Replace canvas
                </Button>
                <Button size="sm" variant="ghost" onClick={onClearPreview}>
                  Discard
                </Button>
              </div>
              <button
                type="button"
                onClick={generate}
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-pilot-700 hover:underline dark:text-pilot-300"
              >
                <RefreshCw size={12} aria-hidden /> Regenerate
              </button>
            </section>
          ) : null}

          {textResult ? (
            <section aria-labelledby="ai-text-heading" className="mt-3 rounded-lg border border-ink-200 p-2.5 dark:border-ink-700">
              <div className="flex items-center justify-between">
                <h3 id="ai-text-heading" className="text-[12px] font-semibold capitalize">
                  {textResult.kind === 'document' ? 'Documentation' : textResult.kind}
                </h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void copyText()}>
                    {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTextResult(null)} aria-label="Dismiss result">
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </div>
              </div>
              <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] leading-relaxed dark:bg-ink-950">
                {textResult.kind === 'mermaid' ? stripCodeFence(textResult.text) : textResult.text}
              </pre>
              <p className="mt-1 text-[11px] muted">Text results never modify the canvas.</p>
            </section>
          ) : null}

          <section className="mt-4 border-t border-ink-200 pt-3 dark:border-ink-800">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">
              Work on this drawing
            </h3>
            <p className="mt-1 text-[12px] muted">
              {selectionSize > 0
                ? `${selectionSize} selected element(s) will be sent.`
                : 'The whole diagram will be sent.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['organize', 'add-steps', 'simplify', 'improve-labels', 'add-error-handling', 'find-missing-links', 'group'] as RefineIntent[]).map(
                (intent) => (
                  <Button
                    key={intent}
                    size="sm"
                    variant="secondary"
                    disabled={phase === 'loading'}
                    onClick={() => refine(intent)}
                  >
                    {REFINE_INTENT_LABEL[intent]}
                  </Button>
                ),
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['explain', 'document', 'mermaid'] as const).map((intent) => (
                <Button key={intent} size="sm" variant="ghost" disabled={phase === 'loading'} onClick={() => refine(intent)}>
                  <ArrowRight size={12} aria-hidden />
                  {REFINE_INTENT_LABEL[intent]}
                </Button>
              ))}
            </div>
          </section>

          {history.length > 1 ? (
            <section className="mt-4 border-t border-ink-200 pt-3 dark:border-ink-800">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">
                Earlier candidates
              </h3>
              <ul className="mt-1.5 space-y-1">
                {history.slice(1).map((plan, index) => (
                  <li key={`${plan.title}-${index}`}>
                    <button
                      type="button"
                      onClick={() => onPreview(plan, [])}
                      className="w-full truncate rounded px-1.5 py-1 text-left text-[12px] hover:bg-ink-100 dark:hover:bg-ink-800"
                    >
                      {plan.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="mt-4 text-[11px] muted">
            Prompts and diagram content are sent to your configured provider only when you press a button. Limits:{' '}
            {AI_LIMITS.maxNodes} nodes, {AI_LIMITS.maxEdges} edges per diagram.
          </p>
        </div>
      )}
    </aside>
  );
}
