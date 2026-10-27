import { useEffect, useState } from 'react';
import { ArrowRight, Camera, LayoutDashboard, Loader2, Plus, Sparkles } from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import { Button } from '../components/Button';
import { createDrawing } from '../storage/documents';
import { repository } from '../storage/repository';
import { formatRelative } from '../lib/format';
import { applyTheme, resolveTheme } from '../lib/theme';
import { openDashboard, openEditorTab, readPreferences } from '../platform/browser';
import type { DrawingMetadata } from '../storage/schemas';

export function PopupApp() {
  const [recent, setRecent] = useState<DrawingMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    void readPreferences().then((preferences) => applyTheme(resolveTheme(preferences.theme)));
    void (async () => {
      const result = await repository.list({ sortBy: 'modified' });
      if (result.ok) setRecent(result.value.slice(0, 4));
      else setError(result.error.message);
      setLoading(false);
    })();
  }, []);

  /**
   * Capture is delegated to the background worker: it owns the tabs API, and it is the
   * only context that survives this popup closing. Any failure comes back as copy the
   * user can act on — the popup never closes on a silent error.
   */
  const capturePage = async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'capture.tab' })) as
        | { ok: true }
        | { ok: false; message: string; hint?: string }
        | undefined;
      if (response && !response.ok) {
        setCaptureError({ message: response.message, hint: response.hint });
        setCapturing(false);
        return;
      }
      // The worker opened the editor in a new tab; this popup is about to be dismissed.
      window.close();
    } catch (cause) {
      setCaptureError({
        message: 'SketchPilot could not reach its background worker.',
        hint: cause instanceof Error ? cause.message : 'Reload the extension on chrome://extensions and try again.',
      });
      setCapturing(false);
    }
  };

  const newDrawing = async (openAi = false) => {
    const drawing = createDrawing();
    const saved = await repository.save(drawing);
    if (!saved.ok) {
      setError(saved.error.message);
      return;
    }
    openEditorTab(drawing.id, { openAi });
    window.close();
  };

  return (
    <div className="flex min-h-[420px] flex-col bg-white dark:bg-ink-900">
      <header className="flex items-center gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
        <AppLogo size={22} />
        <div className="text-sm font-semibold leading-none">
          SketchPilot
          <span className="ml-1 rounded bg-pilot-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pilot-700 dark:bg-pilot-900/50 dark:text-pilot-200">
            AI
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2 p-3">
        <Button variant="primary" className="justify-start" onClick={() => void newDrawing()}>
          <Plus size={16} aria-hidden />
          New drawing
        </Button>
        <Button variant="secondary" className="justify-start" onClick={() => openDashboard()}>
          <LayoutDashboard size={16} aria-hidden />
          Open dashboard
        </Button>
        <Button
          variant="secondary"
          className="justify-start"
          title="Create a drawing and open the AI assistant"
          onClick={() => void newDrawing(true)}
        >
          <Sparkles size={16} aria-hidden />
          Generate diagram with AI
        </Button>
        <Button
          variant="secondary"
          className="justify-start"
          title="Screenshot the page you are looking at and open it in a drawing"
          disabled={capturing}
          onClick={() => void capturePage()}
        >
          {capturing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Camera size={16} aria-hidden />}
          Capture this page
        </Button>
        <p className="px-1 text-[11px] leading-snug muted">
          To capture text instead, select it on the page and right-click →{' '}
          <span className="font-medium">Create a sticky note from this selection</span>.
        </p>
        {captureError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <p className="font-medium">{captureError.message}</p>
            {captureError.hint ? <p className="mt-0.5 opacity-90">{captureError.hint}</p> : null}
          </div>
        ) : null}
      </div>

      <section className="min-h-0 flex-1 px-3 pb-3">
        <h2 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Recent
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 px-1 py-3 text-xs muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Loading…
          </div>
        ) : error ? (
          <p role="alert" className="px-1 py-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : recent.length === 0 ? (
          <p className="px-1 py-3 text-xs muted">No drawings yet. Create one to get started.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    openEditorTab(item.id);
                    window.close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <span className="flex-1 truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-[11px] muted">{formatRelative(item.updatedAt)}</span>
                  <ArrowRight size={13} className="shrink-0 text-ink-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-ink-200 px-3 py-2 text-[11px] muted dark:border-ink-800">
        Everything is stored locally in this browser. No account required.
      </footer>
    </div>
  );
}
