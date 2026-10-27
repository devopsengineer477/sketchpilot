import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Monitor, Moon, Sun } from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ToastViewport, useToasts } from '../components/Toast';
import { applyTheme, resolveTheme, watchSystemTheme } from '../lib/theme';
import { formatBytes } from '../lib/format';
import { openDashboard, readPreferences, writePreferences } from '../platform/browser';
import { repository } from '../storage/repository';
import { APP_VERSION, SCHEMA_VERSION, type ThemePreference } from '../storage/schemas';
import { CANVAS_SHORTCUTS } from '../components/ShortcutSheet';
import { AiSettingsSection } from './AiSettingsSection';
import { modKeyLabel } from '../hooks/useShortcuts';

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Match system', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const APP_SHORTCUTS = [
  { label: `${modKeyLabel} + S`, description: 'Save immediately' },
  { label: '?', description: 'Open the shortcut sheet' },
  { label: `${modKeyLabel} + Shift + E`, description: 'Export as PNG' },
];

export function SettingsApp() {
  const { toasts, push, dismiss } = useToasts();
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [usage, setUsage] = useState<{ usage: number; quota: number; count: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadStorage = async () => {
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    setUsage({
      usage: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
      count: await repository.count(),
    });
  };

  useEffect(() => {
    void readPreferences().then((preferences) => {
      setTheme(preferences.theme);
      applyTheme(resolveTheme(preferences.theme));
    });
    void loadStorage();
  }, []);

  useEffect(() => watchSystemTheme(theme, () => applyTheme(resolveTheme(theme))), [theme]);

  const chooseTheme = async (next: ThemePreference) => {
    setTheme(next);
    applyTheme(resolveTheme(next));
    await writePreferences({ theme: next });
  };

  const clearAll = async () => {
    setConfirmClear(false);
    const result = await repository.clearAll();
    if (!result.ok) {
      push('error', result.error.message, result.error.hint);
      return;
    }
    push('success', 'All local data deleted');
    await loadStorage();
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => openDashboard()}>
          <ArrowLeft size={15} aria-hidden />
          Library
        </Button>
        <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
          <AppLogo size={20} />
          Settings
        </div>
      </header>

      <section className="surface mt-6 p-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-sm font-semibold">
          Appearance
        </h2>
        <p className="mt-1 text-[13px] muted">
          Applies to the library, settings and the editor canvas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map((option) => {
            const Icon = option.icon;
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => void chooseTheme(option.value)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
                  selected
                    ? 'border-pilot-500 bg-pilot-50 text-pilot-800 dark:bg-pilot-900/40 dark:text-pilot-200'
                    : 'border-ink-200 text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800'
                }`}
              >
                <Icon size={15} aria-hidden />
                {option.label}
                {selected ? <Check size={14} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface mt-4 p-5" aria-labelledby="storage-heading">
        <h2 id="storage-heading" className="text-sm font-semibold">
          Storage
        </h2>
        <p className="mt-1 text-[13px] muted">
          Drawings, drafts and previews live in IndexedDB in this browser profile. Nothing is uploaded.
        </p>
        {usage ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="muted">Drawings stored</dt>
              <dd className="font-medium tabular-nums">{usage.count}</dd>
            </div>
            <div>
              <dt className="muted">Space used</dt>
              <dd className="font-medium tabular-nums">
                {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-[13px] muted">Storage estimate unavailable in this browser.</p>
        )}
        <Button variant="danger" size="sm" className="mt-4" onClick={() => setConfirmClear(true)}>
          Delete all local data
        </Button>
      </section>

      <section className="surface mt-4 p-5" aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className="text-sm font-semibold">
          Keyboard shortcuts
        </h2>
        <p className="mt-1 text-[13px] muted">
          Press <kbd className="rounded border border-ink-300 px-1 font-mono text-[11px] dark:border-ink-600">?</kbd> in
          the editor to see this list. Shortcuts never fire while you are typing.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">SketchPilot</h3>
            <dl className="mt-2 space-y-1.5">
              {APP_SHORTCUTS.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="muted">{row.description}</dt>
                  <dd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-700">
                    {row.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">Canvas</h3>
            <dl className="mt-2 space-y-1.5">
              {CANVAS_SHORTCUTS.slice(0, 8).map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="muted">{row.description}</dt>
                  <dd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-700">
                    {row.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <AiSettingsSection onToast={push} />

      <section className="surface mt-4 p-5" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-sm font-semibold">
          About
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="muted">Version</dt>
            <dd className="font-medium">{APP_VERSION}</dd>
          </div>
          <div>
            <dt className="muted">Data schema</dt>
            <dd className="font-medium">v{SCHEMA_VERSION}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[13px] muted">
          SketchPilot AI keeps everything on this device: no account, no analytics, no remote code. AI is
          opt-in — nothing leaves the browser until you add a provider above and press a button in the editor,
          and each request shows exactly what is being sent.
        </p>
        <p className="mt-3 text-[13px] muted">
          SketchPilot AI is an independent product. It is not affiliated with, endorsed by or sponsored by any
          other project, and no other product&rsquo;s name, links or offers appear anywhere in this extension.
          It is built on open-source software; the required copyright notices and licence texts ship inside
          this package as{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 text-[12px] dark:bg-ink-800">THIRD-PARTY-NOTICES.txt</code>.
        </p>
      </section>

      <Dialog
        open={confirmClear}
        title="Delete all local data?"
        description="Every drawing, draft, preview and custom template in this browser will be permanently removed."
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void clearAll()}>
              Delete everything
            </Button>
          </>
        }
      />

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
