import { AlertCircle, Check, CloudUpload, Loader2 } from 'lucide-react';
import type { SaveState } from '../storage/autosave';

function relative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The badge is a polite live region: a screen reader hears "Saving…" and "Saved" without
 * the user having to hunt for it, and without interrupting what they are typing.
 */
export function SaveStatusBadge({ state }: { state: SaveState }) {
  if (state.status === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        title={state.errorHint ?? undefined}
        role="status"
        aria-live="polite"
      >
        <AlertCircle size={13} aria-hidden />
        Save failed
      </span>
    );
  }
  if (state.status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300" role="status" aria-live="polite">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (state.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400" role="status" aria-live="polite">
        <CloudUpload size={13} aria-hidden />
        Unsaved changes
      </span>
    );
  }
  if (state.status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" role="status" aria-live="polite">
        <Check size={13} aria-hidden />
        Saved {state.lastSavedAt ? relative(state.lastSavedAt) : ''}
      </span>
    );
  }
  return null;
}
