import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Circle,
  Download,
  FileJson,
  Image as ImageIcon,
  LayoutDashboard,
  Moon,
  Redo2,
  Scan,
  BookmarkPlus,
  Sparkles,
  StickyNote,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import { IconButton } from '../components/IconButton';
import { SaveStatusBadge } from '../components/SaveStatusBadge';
import type { SaveState } from '../storage/autosave';

export type ExportFormat = 'png' | 'svg' | 'json';

type Props = {
  title: string;
  saveState: SaveState;
  theme: 'light' | 'dark';
  zoom: number;
  onRename: (title: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoom: (action: 'in' | 'out' | 'reset' | 'fit') => void;
  onToggleTheme: () => void;
  onExport: (format: ExportFormat) => void;
  onInsertStickyNote: () => void;
  onSaveAsTemplate: () => void;
  onToggleAi: () => void;
  aiOpen: boolean;
  onOpenDashboard: () => void;
  busy?: boolean;
};

export function TopBar({
  title,
  saveState,
  theme,
  zoom,
  onRename,
  onUndo,
  onRedo,
  onZoom,
  onToggleTheme,
  onExport,
  onInsertStickyNote,
  onSaveAsTemplate,
  onToggleAi,
  aiOpen,
  onOpenDashboard,
  busy = false,
}: Props) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraftTitle(title), [title]);

  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportOpen]);

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (!next) {
      setDraftTitle(title);
      return;
    }
    if (next !== title) onRename(next);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 dark:border-ink-800 dark:bg-ink-900">
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onOpenDashboard();
        }}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold tracking-tight"
        aria-label="SketchPilot AI — open dashboard"
      >
        <AppLogo size={22} />
        <span className="hidden sm:inline">SketchPilot</span>
      </a>

      <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-ink-700" aria-hidden />

      <input
        value={draftTitle}
        onChange={(event) => setDraftTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraftTitle(title);
            event.currentTarget.blur();
          }
        }}
        aria-label="Drawing title"
        className="min-w-0 max-w-[32vw] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-ink-200 focus:border-pilot-500 focus:outline-none dark:hover:border-ink-700"
        spellCheck={false}
      />

      <SaveStatusBadge state={saveState} />

      <div className="ml-auto flex items-center gap-0.5">
        <IconButton label="Undo (Ctrl+Z)" onClick={onUndo}>
          <Undo2 size={16} aria-hidden />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={onRedo}>
          <Redo2 size={16} aria-hidden />
        </IconButton>

        <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-ink-700" aria-hidden />

        <IconButton label="Zoom out" onClick={() => onZoom('out')}>
          <ZoomOut size={16} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={() => onZoom('reset')}
          title="Reset zoom to 100%"
          className="h-8 min-w-[52px] rounded-lg px-1 text-xs font-medium tabular-nums text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => onZoom('in')}>
          <ZoomIn size={16} aria-hidden />
        </IconButton>
        <IconButton label="Fit to content" onClick={() => onZoom('fit')}>
          <Scan size={16} aria-hidden />
        </IconButton>

        <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-ink-700" aria-hidden />

        <IconButton label="Insert sticky note" onClick={onInsertStickyNote}>
          <StickyNote size={16} aria-hidden />
        </IconButton>
        <IconButton label="Save selection as template" onClick={onSaveAsTemplate}>
          <BookmarkPlus size={16} aria-hidden />
        </IconButton>

        <button
          type="button"
          onClick={onToggleAi}
          aria-pressed={aiOpen}
          title="AI assistant"
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
            aiOpen
              ? 'bg-pilot-100 text-pilot-800 dark:bg-pilot-900/50 dark:text-pilot-200'
              : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800'
          }`}
        >
          <Sparkles size={15} aria-hidden />
          <span className="hidden md:inline">AI</span>
        </button>

        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <Download size={15} aria-hidden />
            <span className="hidden md:inline">Export</span>
            <ChevronDown size={13} aria-hidden />
          </button>
          {exportOpen ? (
            <div
              role="menu"
              aria-label="Export drawing"
              className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-panel dark:border-ink-700 dark:bg-ink-900"
            >
              {[
                { id: 'png' as const, label: 'PNG image', icon: ImageIcon, hint: '2× scale' },
                { id: 'svg' as const, label: 'SVG vector', icon: Circle, hint: 'Sanitised' },
                { id: 'json' as const, label: 'Editable JSON', icon: FileJson, hint: 'Re-importable' },
              ].map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onExport(item.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <item.icon size={15} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[11px] muted">{item.hint}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </IconButton>

        <IconButton label="Open dashboard" onClick={onOpenDashboard}>
          <LayoutDashboard size={16} aria-hidden />
        </IconButton>
      </div>
    </header>
  );
}
