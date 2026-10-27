import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  FileUp,
  Loader2,
  Moon,
  PencilRuler,
  Plus,
  Search,
  Settings,
  Sun,
  TriangleAlert,
} from 'lucide-react';
import { AppLogo } from '../components/AppLogo';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { IconButton } from '../components/IconButton';
import { ToastViewport, useToasts } from '../components/Toast';
import { DrawingCard } from './DrawingCard';
import { TemplateCard } from './TemplateCard';
import { useLibrary, type LibraryTab } from './useLibrary';
import { createDrawing } from '../storage/documents';
import { repository } from '../storage/repository';
import { formatBytes } from '../lib/format';
import { applyTheme, resolveTheme } from '../lib/theme';
import { openEditorTab, openSettings, readPreferences, writePreferences } from '../platform/browser';
import { parseImportedDrawing, readFileAsText, downloadText } from '../export/io';
import { buildLibraryArchive, importLibraryArchive, parseLibraryArchive } from '../export/archive';
import { TEMPLATE_CATEGORIES, type DrawingMetadata, type TemplateCategory, type ThemePreference } from '../storage/schemas';
import { TEMPLATE_CATEGORY_LABEL, type ResolvedTemplate } from '../templates/types';

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'all', label: 'All drawings' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'templates', label: 'Templates' },
];

export function DashboardApp() {
  const { toasts, push, dismiss } = useToasts();
  const library = useLibrary();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [deleting, setDeleting] = useState<DrawingMetadata | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<ResolvedTemplate | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void readPreferences().then((preferences) => {
      const resolved = resolveTheme(preferences.theme);
      setResolvedTheme(resolved);
      applyTheme(resolved);
    });
  }, []);

  useEffect(() => {
    if (library.error) push('error', library.error);
  }, [library.error, push]);

  const toggleTheme = async () => {
    const next: ThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark';
    setResolvedTheme(next);
    applyTheme(next);
    await writePreferences({ theme: next });
  };

  const startNewDrawing = useCallback(async () => {
    const drawing = createDrawing();
    const saved = await repository.save(drawing);
    if (!saved.ok) {
      push('error', saved.error.message, saved.error.hint);
      return;
    }
    openEditorTab(drawing.id);
  }, [push]);

  /**
   * Templates are instantiated inside the editor, which already owns the drawing
   * engine. Keeping the engine out of the library is what keeps this page small.
   */
  const createFromTemplate = (template: ResolvedTemplate) => {
    setCreatingTemplate(template.id);
    openEditorTab(undefined, { templateId: template.id });
    window.setTimeout(() => setCreatingTemplate(null), 600);
  };

  const toggleFavorite = async (item: DrawingMetadata) => {
    const result = await repository.setFavorite(item.id, !item.favorite);
    if (!result.ok) push('error', result.error.message, result.error.hint);
    await library.refresh();
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    const result = await repository.remove(target.id);
    if (!result.ok) {
      push('error', result.error.message, result.error.hint);
      return;
    }
    push('success', `“${target.title}” deleted`, 'Its preview and draft were removed too.');
    await library.refresh();
  };

  const confirmDeleteTemplate = async () => {
    const target = deletingTemplate;
    setDeletingTemplate(null);
    if (!target) return;
    const result = await repository.removeTemplate(target.id);
    if (!result.ok) {
      push('error', result.error.message, result.error.hint);
      return;
    }
    push('success', `Template “${target.name}” deleted`);
    await library.refresh();
  };

  const importFile = async (file: File) => {
    const text = await readFileAsText(file);
    if (!text.ok) {
      push('error', text.error.message, text.error.hint);
      return;
    }

    // One import button handles both single drawings and whole-library archives.
    const isArchive = /"type"\s*:\s*"sketchpilot-library"/.test(text.value.slice(0, 400));
    if (isArchive) {
      const archive = parseLibraryArchive(text.value);
      if (!archive.ok) {
        push('error', archive.error.message, archive.error.hint);
        return;
      }
      const imported = await importLibraryArchive(archive.value);
      if (!imported.ok) {
        push('error', imported.error.message, imported.error.hint);
        return;
      }
      push(
        'success',
        `Imported ${imported.value.drawings} drawings and ${imported.value.templates} templates`,
        'Nothing existing was overwritten.',
      );
      await library.refresh();
      return;
    }

    const parsed = parseImportedDrawing(text.value, file.name);
    if (!parsed.ok) {
      push('error', parsed.error.message, parsed.error.hint);
      return;
    }
    const document = {
      ...parsed.value,
      title: parsed.value.title || file.name.replace(/\.(json|excalidraw)$/i, ''),
    };
    const saved = await repository.save(document);
    if (!saved.ok) {
      push('error', saved.error.message, saved.error.hint);
      return;
    }
    push('success', 'Drawing imported', 'It is now in your library.');
    await library.refresh();
  };

  const exportLibrary = async () => {
    const archive = await buildLibraryArchive();
    if (!archive.ok) {
      push('error', archive.error.message, archive.error.hint);
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(archive.value, `sketchpilot-library-${stamp}.json`);
    push('success', 'Library exported', 'Keep this file somewhere safe — it is a full backup.');
  };

  const clearAll = async () => {
    setConfirmClearAll(false);
    const result = await repository.clearAll();
    if (!result.ok) {
      push('error', result.error.message, result.error.hint);
      return;
    }
    push('success', 'All local drawings and templates deleted');
    await library.refresh();
  };

  const usageLabel = (() => {
    if (!library.usage) return null;
    const percent =
      library.usage.quota > 0 ? Math.min(100, Math.round((library.usage.usage / library.usage.quota) * 100)) : 0;
    return {
      text: `${formatBytes(library.usage.usage)} of ${formatBytes(library.usage.quota)} (${percent}%)`,
      percent,
    };
  })();

  const showDrawings = library.tab !== 'templates';

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AppLogo size={22} />
            SketchPilot
          </div>
          <span className="hidden text-xs muted sm:inline">Your drawing library</span>
          <div className="ml-auto flex items-center gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept=".json,.excalidraw,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <IconButton label="Import drawing or library" onClick={() => fileInput.current?.click()}>
              <FileUp size={16} aria-hidden />
            </IconButton>
            <IconButton label="Export library backup" onClick={() => void exportLibrary()}>
              <Archive size={16} aria-hidden />
            </IconButton>
            <Button size="sm" variant="primary" onClick={() => void startNewDrawing()}>
              <Plus size={15} aria-hidden />
              New drawing
            </Button>
            <IconButton
              label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => void toggleTheme()}
            >
              {resolvedTheme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            </IconButton>
            <IconButton label="Settings" onClick={() => openSettings()}>
              <Settings size={16} aria-hidden />
            </IconButton>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl items-center gap-1 px-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => library.setTab(tab.id)}
              aria-pressed={library.tab === tab.id}
              className={`-mb-px h-10 border-b-2 px-3 text-[13px] font-medium transition-colors ${
                library.tab === tab.id
                  ? 'border-pilot-600 text-pilot-700 dark:text-pilot-300'
                  : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-5">
        {showDrawings ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={library.query}
                onChange={(event) => library.setQuery(event.target.value)}
                placeholder="Search drawings by title"
                aria-label="Search drawings by title"
                className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm placeholder:text-ink-400 dark:border-ink-700 dark:bg-ink-900"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[13px] muted">
              Sort
              <select
                value={library.sortBy}
                onChange={(event) => library.setSortBy(event.target.value as typeof library.sortBy)}
                className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-[13px] text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
              >
                <option value="modified">Last modified</option>
                <option value="created">Date created</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter templates by category">
              {(['all', ...TEMPLATE_CATEGORIES] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => library.setCategory(value as TemplateCategory | 'all')}
                  aria-pressed={library.category === value}
                  className={`h-8 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                    library.category === value
                      ? 'bg-pilot-600 text-white'
                      : 'border border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
                  }`}
                >
                  {value === 'all' ? 'All templates' : TEMPLATE_CATEGORY_LABEL[value as TemplateCategory]}
                </button>
              ))}
            </div>
            <p className="ml-auto text-[12px] muted">
              Templates insert real, editable elements — nothing is baked into an image.
            </p>
          </div>
        )}

        {library.loading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-sm muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Loading your library…
          </div>
        ) : showDrawings ? (
          library.drawings.length === 0 ? (
            <div className="mt-10 rounded-xl border border-dashed border-ink-300 p-10 text-center dark:border-ink-700">
              <PencilRuler size={28} className="mx-auto text-ink-400" aria-hidden />
              <h2 className="mt-3 text-base font-semibold">
                {library.query || library.tab === 'favorites' ? 'No drawings match that' : 'No drawings yet'}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm muted">
                {library.query || library.tab === 'favorites'
                  ? 'Try a different search term, or switch back to All drawings.'
                  : 'Start blank, or pick a template that already has the structure you need.'}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="primary" onClick={() => void startNewDrawing()}>
                  <Plus size={15} aria-hidden />
                  New drawing
                </Button>
                <Button onClick={() => library.setTab('templates')}>Browse templates</Button>
              </div>
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {library.drawings.map((item) => (
                <DrawingCard
                  key={item.id}
                  item={item}
                  thumbnail={library.thumbnails[item.id]}
                  onOpen={() => openEditorTab(item.id)}
                  onToggleFavorite={() => void toggleFavorite(item)}
                  onDelete={() => setDeleting(item)}
                />
              ))}
            </ul>
          )
        ) : library.templates.length === 0 ? (
          <p className="mt-10 text-sm muted">No templates in this category yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {library.templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                busy={creatingTemplate === template.id}
                onUse={() => void createFromTemplate(template)}
                {...(template.source === 'user'
                  ? { onDelete: () => setDeletingTemplate(template) }
                  : {})}
              />
            ))}
          </ul>
        )}

        <section className="mt-10 flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-3 text-xs muted dark:border-ink-800">
          <span>
            {showDrawings
              ? `${library.drawings.length} ${library.drawings.length === 1 ? 'drawing' : 'drawings'} shown`
              : `${library.templates.length} templates`}
          </span>
          {usageLabel ? (
            <span className="flex flex-1 items-center gap-2">
              <span className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
                <span
                  className="block h-full rounded-full bg-pilot-500"
                  style={{ width: `${Math.max(2, usageLabel.percent)}%` }}
                />
              </span>
              Local storage: {usageLabel.text}
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setConfirmClearAll(true)}>
            <TriangleAlert size={14} aria-hidden />
            Delete all local data
          </Button>
        </section>
      </main>

      <Dialog
        open={deleting !== null}
        title="Delete this drawing?"
        description={`“${deleting?.title ?? ''}” will be removed from this browser, along with its preview. This cannot be undone.`}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Delete drawing
            </Button>
          </>
        }
      />

      <Dialog
        open={deletingTemplate !== null}
        title="Delete this template?"
        description={`“${deletingTemplate?.name ?? ''}” will be removed. Drawings created from it are untouched.`}
        onClose={() => setDeletingTemplate(null)}
        footer={
          <>
            <Button onClick={() => setDeletingTemplate(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDeleteTemplate()}>
              Delete template
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmClearAll}
        title="Delete all local data?"
        description="Every drawing, draft, preview and custom template stored by SketchPilot in this browser will be permanently removed."
        onClose={() => setConfirmClearAll(false)}
        footer={
          <>
            <Button onClick={() => setConfirmClearAll(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void clearAll()}>
              Delete everything
            </Button>
          </>
        }
      >
        <p className="muted">
          Export a library backup first if you might want any of it back: the archive button in the header
          writes one file containing every drawing.
        </p>
      </Dialog>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
