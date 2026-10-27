import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { formatCapturedAt, hostOf, sourceLabel, textWithSource, type SourceReference } from '../capture/model';
import { copyText } from '../platform/browser';

/**
 * The visible provenance of whatever is captured from the web (plan P4-T7).
 *
 * It sits over the canvas rather than inside the engine's inspector, because the engine's
 * panel is not ours to extend — and because the point is that you cannot miss where a
 * diagram came from.
 */
export function SourceChip({
  source,
  text,
  onDismiss,
}: {
  source: SourceReference;
  /** The captured text, so Copy can include the URL alongside it. */
  text: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const ok = await copyText(textWithSource(text || source.excerpt || '', source));
    setCopied(ok);
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-10 flex max-w-[420px] items-center gap-2 rounded-lg border border-ink-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-card backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
      <Link2 size={13} className="shrink-0 text-pilot-600" aria-hidden />
      <div className="min-w-0">
        <p className="truncate font-medium" title={sourceLabel(source)}>
          {source.title || hostOf(source.url)}
        </p>
        <p className="truncate muted" title={source.url}>
          {hostOf(source.url)} · {formatCapturedAt(source.capturedAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="ml-1 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 font-medium text-pilot-700 hover:bg-pilot-50 dark:text-pilot-300 dark:hover:bg-pilot-950"
        title="Copy the text with its source URL"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-pilot-700 hover:bg-pilot-50 dark:text-pilot-300 dark:hover:bg-pilot-950"
          title="Open the source page"
        >
          <ExternalLink size={12} aria-hidden />
        </a>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded px-1.5 py-1 muted hover:bg-ink-100 dark:hover:bg-ink-800"
        aria-label="Hide source details"
      >
        ×
      </button>
    </div>
  );
}
