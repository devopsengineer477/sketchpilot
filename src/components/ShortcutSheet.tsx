import { Dialog } from './Dialog';
import { Button } from './Button';

export type ShortcutRow = { label: string; description: string };

export const CANVAS_SHORTCUTS: ShortcutRow[] = [
  { label: 'V', description: 'Selection tool' },
  { label: 'H', description: 'Pan / hand tool' },
  { label: 'R', description: 'Rectangle' },
  { label: 'D', description: 'Diamond' },
  { label: 'O', description: 'Ellipse' },
  { label: 'A', description: 'Arrow' },
  { label: 'L', description: 'Line' },
  { label: 'P / X', description: 'Freehand pencil / eraser' },
  { label: 'T', description: 'Text' },
  { label: 'Ctrl/⌘ + Z', description: 'Undo' },
  { label: 'Ctrl/⌘ + Shift + Z', description: 'Redo' },
  { label: 'Ctrl/⌘ + A', description: 'Select all' },
  { label: 'Ctrl/⌘ + D', description: 'Duplicate selection' },
  { label: 'Delete', description: 'Delete selection' },
  { label: 'Ctrl/⌘ + C / V', description: 'Copy / paste' },
  { label: 'Space + drag', description: 'Pan the canvas' },
  { label: 'Ctrl/⌘ + scroll', description: 'Zoom' },
  { label: 'Shift + 1', description: 'Zoom to fit content' },
  { label: 'Shift + 2', description: 'Zoom to selection' },
];

export function ShortcutSheet({
  open,
  onClose,
  appShortcuts,
  commandShortcuts = [],
}: {
  open: boolean;
  onClose: () => void;
  appShortcuts: ShortcutRow[];
  /** Bindings Chrome actually has for our commands — users can rebind them, so we read them. */
  commandShortcuts?: ShortcutRow[];
}) {
  return (
    <Dialog
      open={open}
      title="Keyboard shortcuts"
      description="Canvas shortcuts come from the drawing engine; SketchPilot additions are listed first."
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">SketchPilot</h3>
          <dl className="mt-2 space-y-1.5">
            {appShortcuts.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <dt className="muted">{row.description}</dt>
                <dd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-700">
                  {row.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">Canvas</h3>
          <dl className="mt-2 space-y-1.5">
            {CANVAS_SHORTCUTS.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <dt className="muted">{row.description}</dt>
                <dd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-700">
                  {row.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {commandShortcuts.length > 0 ? (
        <section className="mt-4 border-t border-ink-200 pt-3 dark:border-ink-800">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide muted">
            Browser commands
          </h3>
          <p className="mt-1 text-[11px] muted">
            These work anywhere in Chrome and can be rebound at chrome://extensions/shortcuts — what you see
            here is what is currently bound.
          </p>
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {commandShortcuts.map((row) => (
              <div key={row.description} className="flex items-baseline justify-between gap-3 text-[13px]">
                <dt className="muted">{row.description}</dt>
                <dd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] dark:border-ink-700">
                  {row.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </Dialog>
  );
}
