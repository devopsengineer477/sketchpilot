import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, convertToExcalidrawElements, getSceneVersion } from '@excalidraw/excalidraw';
import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';

import { TopBar, type ExportFormat } from './TopBar';
import { useDrawingSession } from './useDrawingSession';
import { configureExcalidrawAssets } from './engine/assets';
import {
  applyZoom,
  requestHistoryStep,
  setEngineTheme,
  snapshotDocument,
  toEngineElements,
  toEngineFiles,
} from './engine/scene';
import { renderPng, renderSvg } from '../export/render';
import { downloadBlob, downloadText, serializeDrawing, suggestedFileName } from '../export/io';
import { Dialog } from '../components/Dialog';
import { Button } from '../components/Button';
import { ShortcutSheet } from '../components/ShortcutSheet';
import { EngineMenu } from './EngineMenu';
import { ThumbnailScheduler } from './thumbnails';
import { saveDrawingAsTemplate } from '../templates/service';
import { useShortcuts, withMod, comboLabel } from '../hooks/useShortcuts';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '../storage/schemas';
import { Field, Select, TextArea, TextInput } from '../components/Field';
import { AiPanel } from './AiPanel';
import { specToSkeleton } from '../templates/instantiate';
import { boundsOf, recentreSpec } from '../ai/layout';
import type { AiDiagram, DiagramPlan } from '../ai/schemas';
import type { RepairAction } from '../ai/repair';
import { ToastViewport, useToasts } from '../components/Toast';
import { CaptureImageDialog, SelectionDialog, type SelectionAction } from './CaptureReview';
import { SourceChip } from './SourceChip';
import {
  SOURCE_KEY,
  noteTextFor,
  readSource,
  sourceCardTextFor,
  sourceFromCapture,
  type CapturedImage,
  type CapturedSelection,
  type PendingCapture,
  type SourceReference,
} from '../capture/model';
import { takePendingCapture } from '../platform/capture';
import type { DiagramType } from '../ai/schemas';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { applyTheme, resolveTheme } from '../lib/theme';
import { readPreferences, writePreferences, openDashboard, readCommandBindings, type CommandBinding } from '../platform/browser';
import type { ThemePreference } from '../storage/schemas';

configureExcalidrawAssets();

const EXCALIDRAW_UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: false,
    toggleTheme: false,
    changeViewBackgroundColor: true,
    clearCanvas: true,
  },
} as const;

export function EditorApp({
  initialDrawingId,
  initialTemplateId = null,
}: {
  initialDrawingId: string | null;
  initialTemplateId?: string | null;
}) {
  const session = useDrawingSession(initialDrawingId, initialTemplateId);
  const { toasts, push, dismiss } = useToasts();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const canvasHostRef = useRef<HTMLElement | null>(null);
  const lastSceneSignatureRef = useRef<string>('');

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>('custom');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [aiOpen, setAiOpen] = useState(
    () => new URLSearchParams(window.location.search).get('ai') === '1',
  );
  const [aiPreview, setAiPreview] = useState<DiagramPlan | null>(null);
  const [aiRepairs, setAiRepairs] = useState<RepairAction[]>([]);
  const [pendingReplace, setPendingReplace] = useState<DiagramPlan | null>(null);
  // Captured when the confirmation opens, not during render: reading scene elements off the
  // engine ref while rendering would be a render-time side read (and lint agrees).
  const [pendingReplaceExisting, setPendingReplaceExisting] = useState(0);
  const [selectionSize, setSelectionSize] = useState(0);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [selectionSource, setSelectionSource] = useState<SourceReference | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [captureNotice, setCaptureNotice] = useState<{ message: string; hint?: string } | null>(null);
  const [commandBindings, setCommandBindings] = useState<CommandBinding[]>([]);
  const [aiSeed, setAiSeed] = useState<{
    prompt: string;
    diagramType?: DiagramType;
    origin?: { url: string; title: string; capturedAt: number };
    token: number;
  } | null>(null);
  const thumbnailScheduler = useRef(new ThumbnailScheduler());

  // Theme: persisted preference → resolved light/dark → engine + document class.
  useEffect(() => {
    let cancelled = false;
    void readPreferences().then((preferences) => {
      if (cancelled) return;
      const resolved = resolveTheme(preferences.theme);
      setResolvedTheme(resolved);
      applyTheme(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(resolvedTheme);
    const api = apiRef.current;
    if (api) setEngineTheme(api, resolvedTheme);
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark';
    setResolvedTheme(next);
    void writePreferences({ theme: next });
  }, [resolvedTheme]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const base = session.getBase();
      if (!base) return;

      setZoom(appState.zoom.value);
      const selectedIds = Object.keys(appState.selectedElementIds ?? {});
      setSelectionSize(selectedIds.length);

      // Provenance chip: show where the selected content came from, if it came from a page.
      const selected = elements.filter((element) => selectedIds.includes(element.id));
      const sourced = selected.find((element) => readSource((element as unknown as { customData?: unknown }).customData));
      const source = sourced
        ? readSource((sourced as unknown as { customData?: unknown }).customData)
        : null;
      if (source) {
        const boundText = elements.find(
          (element) =>
            element.type === 'text' &&
            (sourced as unknown as { boundElements?: Array<{ id: string }> | null }).boundElements?.some(
              (bound) => bound.id === element.id,
            ),
        ) as unknown as { text?: string } | undefined;
        const ownText = (sourced as unknown as { text?: string }).text;
        setSelectionText(boundText?.text ?? ownText ?? '');
      } else {
        setSelectionText('');
      }
      setSelectionSource((current) => {
        if (!source) return current === null ? current : null;
        if (current && current.url === source.url && current.capturedAt === source.capturedAt) return current;
        return source;
      });

      // Ignore pure viewport changes: they must not trigger a document write.
      const appStateKey = [
        appState.viewBackgroundColor,
        appState.gridSize,
        appState.currentItemStrokeColor,
        appState.currentItemBackgroundColor,
        appState.currentItemStrokeWidth,
        appState.currentItemFontSize,
        appState.currentItemOpacity,
      ].join('|');
      // Excalidraw mutates element objects in place during a gesture, so comparing
      // array identity would miss resizes. Its scene version is the engine's own
      // change detector and costs only a pass over numeric fields.
      const signature = `${getSceneVersion(elements)}|${appStateKey}`;
      if (signature === lastSceneSignatureRef.current) return;
      lastSceneSignatureRef.current = signature;

      session.scheduleSave(snapshotDocument(base, elements, appState, files));
    },
    [session],
  );

  // Refresh the library preview after a save, off the editing path.
  useEffect(() => {
    if (session.saveState.status !== 'saved') return;
    const snapshot = session.getBase();
    if (snapshot) thumbnailScheduler.current.schedule(snapshot);
  }, [session.saveState.status, session]);

  const openTemplateDialog = useCallback(() => {
    const base = session.getBase();
    if (!base) return;
    setTemplateName(base.title === 'Untitled drawing' ? '' : base.title);
    setTemplateDescription('');
    setTemplateCategory('custom');
    setTemplateDialogOpen(true);
  }, [session]);

  /**
   * A pending capture is picked up once, on mount, and then deleted from storage — the
   * screenshot or the selection exists exactly as long as this review (plan P4-T5).
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pendingId = params.get('pending');
    const errorMessage = params.get('captureError');

    if (errorMessage) {
      setCaptureNotice({
        message: errorMessage,
        hint: params.get('captureHint') ?? undefined,
      });
      params.delete('captureError');
      params.delete('captureHint');
      const query = params.toString();
      window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
    }

    if (!pendingId) return;
    params.delete('pending');
    const query = params.toString();
    window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);

    void (async () => {
      const capture = await takePendingCapture(pendingId);
      if (!capture) {
        setCaptureNotice({
          message: 'That capture is no longer available.',
          hint: 'Captures are held in memory only and expire when the browser closes. Capture the page again.',
        });
        return;
      }
      setPendingCapture(capture);
    })();
  }, []);

  useEffect(() => {
    void readCommandBindings().then(setCommandBindings);
  }, []);

  /** Where a freshly inserted element should land: the middle of what you can see. */
  const viewportCentre = useCallback(() => {
    const api = apiRef.current;
    const host = canvasHostRef.current?.getBoundingClientRect();
    const width = host?.width ?? window.innerWidth;
    const height = host?.height ?? window.innerHeight - 48;
    const zoom = api?.getAppState().zoom.value || 1;
    return { width, height, zoom };
  }, []);

  const insertElements = useCallback(
    (skeletons: unknown[], options: { files?: Parameters<ExcalidrawImperativeAPI['addFiles']>[0] } = {}) => {
      const api = apiRef.current;
      if (!api) return [];
      if (options.files?.length) api.addFiles(options.files);
      const created = convertToExcalidrawElements(skeletons as never, { regenerateIds: true });
      api.updateScene({
        elements: [...api.getSceneElements(), ...created],
        appState: {
          selectedElementIds: Object.fromEntries(created.map((element) => [element.id, true])),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return created;
    },
    [],
  );

  /** Inserts the screenshot as a real image element, scaled to a comfortable size. */
  const insertCaptureImage = useCallback(
    (capture: CapturedImage, image: { dataUrl: string; width: number; height: number }) => {
      const { width, height, zoom } = viewportCentre();
      const maxWidth = Math.max(240, Math.min(680, (width - 120) / zoom));
      const maxHeight = Math.max(200, (height - 120) / zoom);
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const drawWidth = Math.round(image.width * scale);
      const drawHeight = Math.round(image.height * scale);

      const fileId = `capture-${capture.id}` as never;
      const centre = {
        x: -(apiRef.current?.getAppState().scrollX ?? 0) + width / 2 / zoom - drawWidth / 2,
        y: -(apiRef.current?.getAppState().scrollY ?? 0) + height / 2 / zoom - drawHeight / 2,
      };

      insertElements(
        [
          {
            type: 'image',
            x: centre.x,
            y: centre.y,
            width: drawWidth,
            height: drawHeight,
            fileId,
            status: 'saved',
            link: capture.pageUrl || null,
            customData: { [SOURCE_KEY]: sourceFromCapture(capture) },
          },
        ],
        {
          files: [
            {
              id: fileId,
              mimeType: 'image/png',
              dataURL: image.dataUrl,
              created: Date.now(),
              lastRetrieved: Date.now(),
            } as never,
          ],
        },
      );

      setPendingCapture(null);
      push('success', 'Page captured', 'It is part of the drawing now — Undo removes it again.');
    },
    [insertElements, push, viewportCentre],
  );

  /** Sticky note / text element / source card, all carrying the page as a source ref. */
  const insertFromSelection = useCallback(
    (capture: CapturedSelection, action: Exclude<SelectionAction, 'mindmap'>) => {
      const { width, height, zoom } = viewportCentre();
      const scrollX = apiRef.current?.getAppState().scrollX ?? 0;
      const scrollY = apiRef.current?.getAppState().scrollY ?? 0;
      const x = -scrollX + width / 2 / zoom - 150;
      const y = -scrollY + height / 2 / zoom - 110;
      const source = sourceFromCapture(capture);
      const customData = { [SOURCE_KEY]: source };
      const link = capture.pageUrl || null;

      if (action === 'source') {
        insertElements([
          {
            type: 'rectangle',
            x,
            y,
            width: 320,
            height: 170,
            backgroundColor: '#e7f5ff',
            strokeColor: '#1971c2',
            fillStyle: 'solid',
            roundness: { type: 3 },
            link,
            customData,
            label: {
              text: sourceCardTextFor(capture),
              fontSize: 13,
              textAlign: 'left',
              verticalAlign: 'top',
            },
          },
        ]);
        push('success', 'Source reference added', 'The URL travels with the element and in JSON exports.');
        setPendingCapture(null);
        return;
      }

      if (action === 'text') {
        insertElements([
          {
            type: 'text',
            x,
            y,
            text: noteTextFor(capture),
            fontSize: 20,
            link,
            customData,
          },
        ]);
        push('success', 'Selection added as text', 'Source details are on the element chip.');
        setPendingCapture(null);
        return;
      }

      insertElements([
        {
          type: 'rectangle',
          x,
          y,
          width: 280,
          height: 200,
          backgroundColor: '#ffec99',
          strokeColor: '#e8a30a',
          fillStyle: 'solid',
          roundness: { type: 3 },
          link,
          customData,
          label: {
            text: noteTextFor(capture),
            fontSize: 16,
            textAlign: 'left',
            verticalAlign: 'top',
          },
        },
      ]);
      push('success', 'Sticky note added', 'It keeps a link back to the page it came from.');
      setPendingCapture(null);
    },
    [insertElements, push, viewportCentre],
  );

  /** The one path from page text to an AI provider: pre-fill, then require confirmation. */
  const startMindMapFromSelection = useCallback((capture: CapturedSelection) => {
    const text = capture.text.slice(0, 4000);
    setAiOpen(true);
    setAiSeed({
      prompt: `Create a mind map of the key ideas in the text below. Use a short centre label and group related points as branches.\n\n"""\n${text}\n"""`,
      diagramType: 'mindmap',
      origin: { url: capture.pageUrl, title: capture.pageTitle, capturedAt: capture.capturedAt },
      token: Date.now(),
    });
    setPendingCapture(null);
  }, []);

  /** Reads the live canvas as the AI contract's graph shape (labels + edges only). */
  const readCanvasDiagram = useCallback((): AiDiagram | null => {
    const api = apiRef.current;
    if (!api) return null;
    const elements = api.getSceneElements();
    const nodes = elements
      .filter((element) => ['rectangle', 'ellipse', 'diamond'].includes(element.type) && !element.isDeleted)
      .slice(0, 40)
      .map((element, index) => {
        const container = element as unknown as { boundElements?: Array<{ id: string }> | null };
        const label = elements.find(
          (candidate) => candidate.type === 'text' && container.boundElements?.some((bound) => bound.id === candidate.id),
        ) as unknown as { text?: string } | undefined;
        return {
          id: `n${index}`,
          label: (label?.text ?? `Node ${index + 1}`).replace(/\s+/g, ' ').trim().slice(0, 90) || `Node ${index + 1}`,
          shape: element.type as 'rectangle' | 'ellipse' | 'diamond',
        };
      });

    if (nodes.length === 0) return null;

    const arrows = elements.filter((element) => element.type === 'arrow' && !element.isDeleted);
    const idFor = new Map(elements.map((element, index) => [element.id, `n${index}`]));
    const boxedIds = new Set(
      elements
        .filter((element) => ['rectangle', 'ellipse', 'diamond'].includes(element.type) && !element.isDeleted)
        .map((element) => element.id),
    );
    const edges = arrows.flatMap((arrow) => {
      const source = (arrow as unknown as { startBinding?: { elementId: string } | null }).startBinding;
      const target = (arrow as unknown as { endBinding?: { elementId: string } | null }).endBinding;
      if (!source?.elementId || !target?.elementId) return [];
      if (!boxedIds.has(source.elementId) || !boxedIds.has(target.elementId)) return [];
      const from = idFor.get(source.elementId);
      const to = idFor.get(target.elementId);
      if (!from || !to) return [];
      return [{ from, to }];
    });

    return {
      schemaVersion: 1,
      title: session.getBase()?.title ?? 'Diagram',
      nodes,
      edges: edges.slice(0, 80),
      notes: [],
    };
  }, [session]);

  /** Drops a laid-out plan onto the canvas through the same skeleton path as templates. */
  const applyPlan = useCallback(
    (plan: DiagramPlan, mode: 'insert' | 'replace') => {
      const api = apiRef.current;
      if (!api) return;
      setAiPreview(null);
      setAiRepairs([]);

      const appState = api.getAppState();
      const host = canvasHostRef.current?.getBoundingClientRect();
      // Screen pixels available to the canvas itself — the AI panel is not part of it.
      const width = host?.width ?? window.innerWidth;
      const height = host?.height ?? window.innerHeight - 48;
      const zoom = appState.zoom.value || 1;

      const bounds = boundsOf(plan.layout);
      // Fit the generated diagram into the current viewport, never magnifying past 100%.
      const fit = Math.min(
        1,
        (width - 80) / Math.max(1, bounds.width),
        (height - 80) / Math.max(1, bounds.height),
      );
      const nextZoom = Number.isFinite(fit) && fit > 0.1 ? Math.min(zoom, fit) : zoom;

      // Lay the plan out around the origin, then scroll so the origin is the canvas centre.
      const elements = convertToExcalidrawElements(specToSkeleton(recentreSpec(plan.layout, { x: 0, y: 0 })), {
        regenerateIds: true,
      });

      const existing = mode === 'replace' ? [] : api.getSceneElements();
      api.updateScene({
        elements: [...existing, ...elements],
        appState: {
          zoom: { value: nextZoom as never },
          scrollX: width / (2 * nextZoom),
          scrollY: height / (2 * nextZoom),
          selectedElementIds: {},
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      push(
        'success',
        mode === 'replace' ? 'Canvas replaced with the AI diagram' : 'AI diagram inserted',
        'Every shape is editable. Undo restores the previous state.',
      );
    },
    [push],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const api = apiRef.current;
      const base = session.getBase();
      if (!api || !base) return;
      setExporting(true);
      try {
        const elements = api.getSceneElements();
        if (elements.length === 0) {
          push('info', 'Nothing to export yet', 'Draw or import something first, then export.');
          return;
        }
        const document = snapshotDocument(base, elements, api.getAppState(), api.getFiles());
        const appState = document.appState;
        const files = toEngineFiles(document);
        const fileName = suggestedFileName(document.title, format);

        if (format === 'json') {
          downloadText(serializeDrawing(document), fileName);
          push('success', 'JSON export ready', 'Re-import it any time from the dashboard.');
          return;
        }
        if (format === 'png') {
          const blob = await renderPng(elements, appState, files, {
            darkMode: resolvedTheme === 'dark',
          });
          downloadBlob(blob, fileName);
          push('success', 'PNG exported');
          return;
        }
        const svg = await renderSvg(elements, appState, files, { darkMode: resolvedTheme === 'dark' });
        downloadText(svg, fileName, 'image/svg+xml');
        push('success', 'SVG exported', 'Scripts and embedded HTML are stripped from the file.');
      } catch (error) {
        push(
          'error',
          'Export failed',
          error instanceof Error ? error.message : 'Try exporting a smaller area of the canvas.',
        );
      } finally {
        setExporting(false);
      }
    },
    [push, resolvedTheme, session],
  );

  const insertStickyNote = useCallback(() => {
    const api = apiRef.current;
    const base = session.getBase();
    if (!api || !base) return;

    const appState = api.getAppState();
    const zoomValue = appState.zoom.value || 1;
    const centerX = -appState.scrollX + window.innerWidth / 2 / zoomValue - 110;
    const centerY = -appState.scrollY + (window.innerHeight - 48) / 2 / zoomValue - 90;

    const created = convertToExcalidrawElements([
      {
        type: 'rectangle',
        x: centerX,
        y: centerY,
        width: 220,
        height: 180,
        backgroundColor: '#ffec99',
        strokeColor: '#e8a30a',
        fillStyle: 'solid',
        roundness: { type: 3 },
        label: {
          text: 'Sticky note',
          fontSize: 18,
          textAlign: 'left',
          verticalAlign: 'top',
        },
      },
    ] as never);

    api.updateScene({
      elements: [...api.getSceneElements(), ...created],
      appState: {
        selectedElementIds: Object.fromEntries(created.map((element) => [element.id, true])),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [session]);

  const handleZoom = useCallback((action: 'in' | 'out' | 'reset' | 'fit') => {
    const api = apiRef.current;
    if (api) applyZoom(api, action);
  }, []);

  const shortcuts = useMemo(
    () => [
      {
        label: comboLabel('S', { mod: true }),
        description: 'Save now',
        match: (event: KeyboardEvent) => withMod(event) && event.key.toLowerCase() === 's',
        onFire: () => void session.flush(),
      },
      {
        label: comboLabel('E', { mod: true, shift: true }),
        description: 'Export PNG',
        match: (event: KeyboardEvent) => withMod(event) && event.shiftKey && event.key.toLowerCase() === 'e',
        onFire: () => void handleExport('png'),
      },
      {
        label: '?',
        description: 'Keyboard shortcuts',
        match: (event: KeyboardEvent) => event.key === '?' || (event.shiftKey && event.key === '/'),
        onFire: () => setShortcutsOpen(true),
      },
    ],
    [handleExport, session],
  );

  useShortcuts(shortcuts);

  const initialData = useMemo(() => {
    if (!session.document) return null;
    const document = session.document;
    return {
      elements: toEngineElements(document),
      appState: {
        ...(document.appState as Record<string, unknown>),
        theme: resolvedTheme,
        viewBackgroundColor: (document.appState.viewBackgroundColor as string) ?? '#ffffff',
      },
      files: toEngineFiles(document),
      scrollToContent: true,
    };
  }, [session.document?.id, resolvedTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // A brand-new drawing only gets an id once it exists; reflect that in the URL so a
  // reload (or a copied link) reopens the same document instead of creating another.
  useEffect(() => {
    if (session.saveState.status !== 'saved' || !session.document) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('id') === session.document.id) return;
    url.searchParams.set('id', session.document.id);
    window.history.replaceState({}, '', url.toString());
  }, [session.saveState.status, session.document]);

  if (session.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm muted" role="status">
        Opening your drawing…
      </div>
    );
  }

  if (session.status === 'error' || !session.document) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="surface max-w-md p-6">
          <h1 className="text-base font-semibold">This drawing could not be opened</h1>
          <p className="mt-2 text-sm muted">{session.error?.message ?? 'The drawing is unavailable.'}</p>
          {session.error?.hint ? <p className="mt-1 text-sm muted">{session.error.hint}</p> : null}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => session.retryLoad()}>
              Try again
            </Button>
            <Button onClick={() => openDashboard()}>Back to dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={session.document.title}
        saveState={session.saveState}
        theme={resolvedTheme}
        zoom={zoom}
        onRename={session.rename}
        onUndo={() => requestHistoryStep('undo')}
        onRedo={() => requestHistoryStep('redo')}
        onZoom={handleZoom}
        onToggleTheme={toggleTheme}
        onExport={(format) => void handleExport(format)}
        onInsertStickyNote={insertStickyNote}
        onSaveAsTemplate={openTemplateDialog}
        onToggleAi={() => setAiOpen((open) => !open)}
        aiOpen={aiOpen}
        onOpenDashboard={() => openDashboard()}
        busy={exporting}
      />

      {session.saveState.status === 'failed' ? (
        <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <span className="font-medium">{session.saveState.errorMessage}</span>
          {session.saveState.errorHint ? <span className="opacity-80">{session.saveState.errorHint}</span> : null}
        </div>
      ) : null}

      {captureNotice ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <span className="font-medium">{captureNotice.message}</span>
          {captureNotice.hint ? <span className="opacity-90">{captureNotice.hint}</span> : null}
          <button
            type="button"
            onClick={() => setCaptureNotice(null)}
            className="ml-auto rounded px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main ref={canvasHostRef} className="excalidraw-host relative min-w-0 flex-1">
        <ErrorBoundary fallbackTitle="The canvas hit an error">
          <Excalidraw
            key={session.document.id}
            excalidrawAPI={(api) => {
              apiRef.current = api;
              setEngineTheme(api, resolvedTheme);
            }}
            initialData={initialData as never}
            theme={resolvedTheme}
            name={session.document.title}
            onChange={handleChange}
            UIOptions={EXCALIDRAW_UI_OPTIONS as never}
            langCode="en"
          >
            {/* Replaces the engine's menu, which ships "Excalidraw links" — see EngineMenu. */}
            <EngineMenu onShowShortcuts={() => setShortcutsOpen(true)} />
          </Excalidraw>
        </ErrorBoundary>
        {selectionSource ? (
          <SourceChip
            source={selectionSource}
            text={selectionText}
            onDismiss={() => {
              setSelectionSource(null);
              setSelectionText('');
            }}
          />
        ) : null}
        </main>
        {aiOpen ? (
          <AiPanel
            seed={aiSeed}
            onSeedConsumed={() => setAiSeed(null)}
            getDiagram={readCanvasDiagram}
            selectionSize={selectionSize}
            preview={aiPreview}
            repairs={aiRepairs}
            onPreview={(plan, repairs) => {
              setAiPreview(plan);
              setAiRepairs(repairs);
            }}
            onClearPreview={() => {
              setAiPreview(null);
              setAiRepairs([]);
            }}
            onInsert={(plan) => applyPlan(plan, 'insert')}
            onReplace={(plan) => {
              setPendingReplaceExisting(
                apiRef.current?.getSceneElements().filter((element) => !element.isDeleted).length ?? 0,
              );
              setPendingReplace(plan);
            }}
            onClose={() => setAiOpen(false)}
          />
        ) : null}

      </div>

      {pendingCapture?.kind === 'image' ? (
        <CaptureImageDialog
          capture={pendingCapture}
          onInsert={(image) => insertCaptureImage(pendingCapture, image)}
          onDiscard={() => {
            setPendingCapture(null);
            push('info', 'Capture discarded', 'Nothing was added to the drawing or saved to disk.');
          }}
        />
      ) : null}

      {pendingCapture?.kind === 'selection' ? (
        <SelectionDialog
          capture={pendingCapture}
          onAction={(action) => {
            if (action === 'mindmap') startMindMapFromSelection(pendingCapture);
            else insertFromSelection(pendingCapture, action);
          }}
          onDiscard={() => {
            setPendingCapture(null);
            push('info', 'Selection discarded', 'Nothing was added to the drawing.');
          }}
        />
      ) : null}

      <Dialog
        open={session.recovery !== null}
        title="Recover unsaved changes?"
        description="SketchPilot found a newer revision of this drawing that was never committed — usually because the tab closed mid-edit."
        onClose={session.discardRecovery}
        footer={
          <>
            <Button onClick={session.discardRecovery}>Keep saved version</Button>
            <Button variant="primary" onClick={session.acceptRecovery}>
              Restore unsaved work
            </Button>
          </>
        }
      >
        <p className="muted">
          Restoring replaces what is currently on the canvas with the recovered revision
          ({session.recovery?.elements.length ?? 0} elements). You can undo afterwards.
        </p>
      </Dialog>

      <Dialog
        open={pendingReplace !== null}
        title="Replace everything on the canvas?"
        description="The AI diagram will replace all current elements. Pick Insert instead if you want to keep them."
        onClose={() => setPendingReplace(null)}
        footer={
          <>
            <Button onClick={() => setPendingReplace(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const plan = pendingReplace;
                setPendingReplace(null);
                if (plan) applyPlan(plan, 'replace');
              }}
            >
              Replace canvas
            </Button>
          </>
        }
      >
        <p className="muted">
          This removes {pendingReplaceExisting} existing element(s) and replaces them with{' '}
          {pendingReplace?.stats.nodes ?? 0} nodes and {pendingReplace?.stats.edges ?? 0}{' '}
          connections. You can undo immediately after, or export a JSON copy first.
        </p>
      </Dialog>

      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        // `shortcuts` is a plain useMemo array of {label, description, match, onFire}; the
        // react-hooks v6 "refs" rule misreads the handler closures as ref reads.
        // eslint-disable-next-line react-hooks/refs
        appShortcuts={shortcuts.map(({ label, description }) => ({ label, description }))}
        commandShortcuts={commandBindings.map((command) => ({
          label: command.shortcut || 'Unbound',
          description: command.description || command.name,
        }))}
      />

      <Dialog
        open={templateDialogOpen}
        title="Save as template"
        description="The canvas becomes a reusable starting point. Your drawing stays exactly as it is."
        onClose={() => setTemplateDialogOpen(false)}
        footer={
          <>
            <Button onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={savingTemplate || templateName.trim().length === 0}
              onClick={() => {
                const api = apiRef.current;
                if (!api) return;
                setSavingTemplate(true);
                void saveDrawingAsTemplate({
                  name: templateName,
                  description: templateDescription,
                  category: templateCategory,
                  elements: api.getSceneElements().filter((element) => !element.isDeleted) as never,
                  appState: api.getAppState() as unknown as Record<string, unknown>,
                }).then((result) => {
                  setSavingTemplate(false);
                  if (!result.ok) {
                    push('error', 'Template not saved', result.message);
                    return;
                  }
                  setTemplateDialogOpen(false);
                  push('success', `“${result.template.name}” saved to your templates`, 'Find it on the dashboard under Templates → Mine.');
                });
              }}
            >
              {savingTemplate ? 'Saving…' : 'Save template'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="template-name">
            <TextInput
              id="template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="e.g. Service onboarding flow"
              maxLength={80}
              autoFocus
            />
          </Field>
          <Field label="Description" htmlFor="template-description" hint="Optional — shown on the template card.">
            <TextArea
              id="template-description"
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              rows={2}
              maxLength={240}
              placeholder="What is this template for?"
            />
          </Field>
          <Field label="Category" htmlFor="template-category">
            <Select
              id="template-category"
              value={templateCategory}
              onChange={(event) => setTemplateCategory(event.target.value as TemplateCategory)}
            >
              {TEMPLATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category === 'custom' ? 'Mine' : category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <p className="sr-only" aria-live="polite">
        {session.saveState.status === 'saved' ? 'Drawing saved' : ''}
        {session.saveState.status === 'failed' ? 'Saving failed' : ''}
      </p>
    </div>
  );
}
