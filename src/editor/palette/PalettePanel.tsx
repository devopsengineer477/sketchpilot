import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { searchSymbols, symbolsByRole, type PaletteSymbol } from './catalog';
import { DRAG_THRESHOLD_PX, isOverCanvas } from './drop';
import { Preview } from './previews';

/**
 * The Elements panel: a left-hand library of standard diagram symbols.
 *
 * Two ways in, on purpose:
 *  - **click** (or Enter on the focused card) inserts in the middle of the canvas;
 *  - **drag** carries a ghost of the symbol and drops it exactly where the pointer is.
 *
 * Drag is implemented with pointer events on our own elements and listeners bound only while a
 * press is in flight, so it can never collide with the engine's drag handling or its file-drop
 * target. A press that never travels past `DRAG_THRESHOLD_PX` stays a plain click.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  /** `at` is a viewport position: the symbol is dropped centred on it. */
  onInsert: (symbolId: string, options?: { focusCanvas?: boolean; at?: { x: number; y: number } }) => void;
  /** Inserted symbols are reported back so the panel can show a brief confirmation. */
  lastInserted?: string | null;
  /** Canvas rect, so a drop outside the canvas can be refused before anything is inserted. */
  getCanvasRect: () => { left: number; top: number; width: number; height: number } | null;
  /** Lets the editor outline the canvas while a symbol is in flight. */
  onDragChange?: (dragging: boolean) => void;
  zoom: number;
};

type DragState = {
  symbol: PaletteSymbol;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** False until the pointer has travelled past the threshold. */
  active: boolean;
  overCanvas: boolean;
};

export function PalettePanel({
  open,
  onClose,
  onInsert,
  lastInserted,
  getCanvasRect,
  onDragChange,
  zoom,
}: Props) {
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  /** Set when a press became a drag, so the click that follows on pointerup is swallowed. */
  const suppressClickRef = useRef(false);

  const groups = useMemo(() => symbolsByRole(searchSymbols(query)), [query]);
  const total = groups.reduce((sum, group) => sum + group.symbols.length, 0);

  // Focus the search box when the panel opens, so the keyboard user can filter immediately.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  // Escape closes the panel while focus is inside it. Handled here rather than globally so it
  // never competes with the engine's own Escape handling.
  useEffect(() => {
    if (!open) return;
    const node = asideRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // ---------------------------------------------------------------- drag to place
  useEffect(() => {
    if (!drag) return;
    onDragChange?.(true);

    const onMove = (event: PointerEvent) => {
      setDrag((current) => {
        if (!current) return current;
        const traveled =
          Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY);
        const active = current.active || traveled >= DRAG_THRESHOLD_PX;
        return {
          ...current,
          x: event.clientX,
          y: event.clientY,
          active,
          overCanvas: active && isOverCanvas({ x: event.clientX, y: event.clientY }, getCanvasRect()),
        };
      });
    };

    const onUp = (event: PointerEvent) => {
      setDrag((current) => {
        if (!current) return current;
        if (current.active && current.overCanvas) {
          suppressClickRef.current = true;
          onInsert(current.symbol.id, { focusCanvas: true, at: { x: event.clientX, y: event.clientY } });
        } else if (current.active) {
          // Dropped on the panel, the top bar or outside the window: nothing is inserted, and the
          // click that follows must not sneak one in at the canvas centre.
          suppressClickRef.current = true;
        }
        return null;
      });
    };

    const onCancel = () => setDrag(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        suppressClickRef.current = true;
        setDrag(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      onDragChange?.(false);
    };
  }, [drag, getCanvasRect, onDragChange, onInsert]);

  const handlePointerDown = useCallback((symbol: PaletteSymbol, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    setDrag({
      symbol,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      overCanvas: false,
    });
  }, []);

  const moveFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(event.key)) return;
    const buttons = [...(asideRef.current?.querySelectorAll<HTMLButtonElement>('[data-symbol]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  if (!open) return null;

  const ghost = drag?.active ? drag : null;
  const ghostWidth = ghost ? Math.max(40, ghost.symbol.box.w * (zoom || 1)) : 0;

  return (
    <>
      <aside
        ref={asideRef}
        aria-label="Elements"
        onKeyDown={moveFocus}
        className="palette-panel flex w-[212px] shrink-0 flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
      >
        <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
          <h2 className="text-xs font-semibold tracking-wide uppercase muted">Elements</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close elements panel"
            className="rounded p-1 muted hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="relative px-3 pb-2">
          <Search
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search elements"
            aria-label="Search elements"
            className="w-full rounded border border-ink-200 bg-transparent py-1 pl-6 pr-2 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus:border-pilot-500 dark:border-ink-700 dark:text-ink-100"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {total === 0 ? (
            <p className="px-1 py-3 text-xs muted" role="status">
              No elements match “{query.trim()}”.
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.role} aria-label={group.title} className="mb-2">
              <h3 className="px-1 pb-1 pt-1 text-[10px] font-semibold tracking-wide uppercase muted">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-1">
                {group.symbols.map((symbol) => (
                  <button
                    key={symbol.id}
                    type="button"
                    data-symbol={symbol.id}
                    data-symbol-label={symbol.label}
                    aria-label={`Insert ${symbol.label}`}
                    title={`Insert ${symbol.label} — click, or drag onto the canvas`}
                    onPointerDown={(event) => handlePointerDown(symbol, event)}
                    onClick={(event) => {
                      // A press that travelled was a drag: the drop already handled it.
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      onInsert(symbol.id, { focusCanvas: event.detail > 0 });
                    }}
                    className={`palette-card group flex touch-none select-none flex-col items-center gap-1 rounded border px-1 py-1.5 text-[11px] leading-tight text-ink-700 hover:border-pilot-500 hover:bg-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pilot-500 dark:text-ink-200 dark:hover:bg-ink-800 ${
                      lastInserted === symbol.id
                        ? 'border-pilot-500'
                        : 'border-ink-200 dark:border-ink-700'
                    }`}
                  >
                    <span className="palette-preview-wrap flex h-9 items-center justify-center">
                      <Preview symbol={symbol} size={40} />
                    </span>
                    <span className="text-center">{symbol.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="border-t border-ink-200 px-3 py-2 text-[10px] leading-snug muted dark:border-ink-800">
          Click to drop a symbol in the middle of the canvas, or drag it where you want it. Everything
          stays editable.
        </p>
      </aside>

      {ghost
        ? createPortal(
            <div
              aria-hidden="true"
              data-palette-ghost={ghost.overCanvas ? 'over' : 'out'}
              className={`palette-ghost pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 ${
                ghost.overCanvas ? 'is-over' : ''
              }`}
              style={{ left: ghost.x, top: ghost.y }}
            >
              <div style={{ width: ghostWidth }}>
                <Preview symbol={ghost.symbol} size={ghostWidth} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
