import { useCallback, useEffect, useRef, useState } from 'react';
import { AutosaveController, INITIAL_SAVE_STATE, type SaveState } from '../storage/autosave';
import { createDrawing, withTimestamp } from '../storage/documents';
import { repository } from '../storage/repository';
import type { DrawingDocument } from '../storage/schemas';
import { readPreferences, writePreferences } from '../platform/browser';
import type { AppError } from '../lib/errors';
import { resolveTemplate } from '../templates/service';
import { instantiateTemplate } from '../templates/instantiate';

export type SessionStatus = 'loading' | 'ready' | 'error';

export type DrawingSession = {
  status: SessionStatus;
  document: DrawingDocument | null;
  error: AppError | null;
  recovery: DrawingDocument | null;
  saveState: SaveState;
  /** Base revision used when snapshotting the live canvas. */
  getBase: () => DrawingDocument | null;
  updateBase: (document: DrawingDocument) => void;
  scheduleSave: (document: DrawingDocument) => void;
  flush: () => Promise<void>;
  rename: (title: string) => void;
  acceptRecovery: () => void;
  discardRecovery: () => void;
  retryLoad: () => void;
};

const DRAFT_INTERVAL_MS = 1200;

/**
 * Owns the lifecycle of one open drawing: load → recovery check → autosave → flush.
 * All persistence goes through the repository, so this hook has no IndexedDB knowledge.
 */
export function useDrawingSession(drawingId: string | null, templateId: string | null = null): DrawingSession {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [currentDoc, setCurrentDoc] = useState<DrawingDocument | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [recovery, setRecovery] = useState<DrawingDocument | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(INITIAL_SAVE_STATE);

  const baseRef = useRef<DrawingDocument | null>(null);
  const autosaveRef = useRef<AutosaveController | null>(null);
  /**
   * True once the document exists in the library. A brand-new drawing that still has no
   * elements is not worth a record — which is what lets "capture, then discard" leave
   * literally nothing behind (spec §7, plan P4-T5).
   */
  const persistedRef = useRef(false);
  const lastDraftAt = useRef(0);

  const buildAutosave = useCallback(() => {
    autosaveRef.current?.dispose();
    const controller = new AutosaveController({
      save: async (snapshot) => {
        const result = await repository.save(snapshot);
        if (result.ok) await repository.clearDraft(snapshot.id);
        return result;
      },
      onStateChange: setSaveState,
    });
    autosaveRef.current = controller;
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    if (!drawingId && templateId) {
      // Created from a template: instantiate real elements, then commit immediately so
      // the drawing exists the moment the tab opens.
      const template = await resolveTemplate(templateId);
      if (!template) {
        setError({
          code: 'drawing-not-found',
          message: 'That template is no longer available.',
          hint: 'Pick another template from the library, or start a blank drawing.',
        });
        setStatus('error');
        return;
      }
      try {
        const elements = await instantiateTemplate(template);
        const created = createDrawing({
          title: template.name,
          elements,
          appState: { viewBackgroundColor: '#ffffff' },
        });
        baseRef.current = created;
        setCurrentDoc(created);
        buildAutosave();
        setStatus('ready');
        const saved = await repository.save(created);
        if (saved.ok) {
          persistedRef.current = true;
          void writePreferences({ lastOpenedDrawingId: created.id });
          window.history.replaceState({}, '', `?id=${encodeURIComponent(created.id)}`);
        }
      } catch (cause) {
        setError({
          code: 'unknown',
          message: 'That template could not be created.',
          hint: 'Try a different template, or start a blank drawing.',
          cause,
        });
        setStatus('error');
      }
      return;
    }

    if (!drawingId) {
      // A bare editor visit is not a drawing yet: stay in memory until the first
      // change, so opening a blank tab never litters the library with empty entries.
      const created = createDrawing();
      baseRef.current = created;
      setCurrentDoc(created);
      buildAutosave();
      setStatus('ready');
      return;
    }

    const result = await repository.get(drawingId);
    if (!result.ok) {
      setError(result.error);
      setStatus('error');
      return;
    }

    const saved = result.value;
    persistedRef.current = true;
    baseRef.current = saved;
    setCurrentDoc(saved);
    buildAutosave();
    setStatus('ready');
    void writePreferences({ lastOpenedDrawingId: saved.id });

    const draft = await repository.getDraft(drawingId);
    if (draft && draft.updatedAt > saved.updatedAt && draft.elements.length > 0) {
      setRecovery(draft);
    }
  }, [drawingId, templateId, buildAutosave]);

  useEffect(() => {
    void load();
    return () => {
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
    };
  }, [load]);

  // Commit pending work when the tab is hidden or closed; last-ditch protection
  // beyond the debounce window.
  useEffect(() => {
    const flush = () => {
      void autosaveRef.current?.flush();
    };
    const onVisibility = () => {
      if (globalThis.document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    globalThis.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      globalThis.document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const scheduleSave = useCallback((next: DrawingDocument) => {
    const hasContent = next.elements.some((element) => !(element as { isDeleted?: boolean }).isDeleted);
    // Never create a library entry for an empty drawing that was never saved: the engine
    // fires an initial onChange on mount, and that must not leave a blank record behind.
    if (!persistedRef.current && !hasContent) {
      baseRef.current = next;
      return;
    }
    persistedRef.current = true;
    baseRef.current = next;
    setCurrentDoc((current) => (current && current.id === next.id ? { ...current, title: next.title, updatedAt: next.updatedAt } : next));
    autosaveRef.current?.schedule(next);

    // A separate, cheaper revision snapshot supports crash recovery between saves.
    const now = Date.now();
    if (now - lastDraftAt.current > DRAFT_INTERVAL_MS) {
      lastDraftAt.current = now;
      void repository.saveDraft(next);
    }
  }, []);

  const rename = useCallback((title: string) => {
    const base = baseRef.current;
    if (!base) return;
    const next = withTimestamp({ ...base, title: title.slice(0, 200) || 'Untitled drawing' });
    baseRef.current = next;
    setCurrentDoc(next);
    autosaveRef.current?.schedule(next);
  }, []);

  const flush = useCallback(async () => {
    await autosaveRef.current?.flush();
  }, []);

  const acceptRecovery = useCallback(() => {
    const draft = recovery;
    if (!draft) return;
    setRecovery(null);
    baseRef.current = draft;
    setCurrentDoc(draft);
    autosaveRef.current?.schedule(draft);
  }, [recovery]);

  const discardRecovery = useCallback(() => {
    const draft = recovery;
    setRecovery(null);
    if (draft) void repository.clearDraft(draft.id);
  }, [recovery]);

  const updateBase = useCallback((next: DrawingDocument) => {
    baseRef.current = next;
  }, []);

  return {
    status,
    document: currentDoc,
    error,
    recovery,
    saveState,
    getBase: () => baseRef.current,
    updateBase,
    scheduleSave,
    flush,
    rename,
    acceptRecovery,
    discardRecovery,
    retryLoad: () => {
      void load();
    },
  };
}

/** Reads preferences once for surfaces that need the stored theme. */
export function usePreferences() {
  const [preferences, setPreferences] = useState<Awaited<ReturnType<typeof readPreferences>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readPreferences().then((value) => {
      if (!cancelled) setPreferences(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { preferences, setPreferences };
}
