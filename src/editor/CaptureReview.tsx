import { useMemo, useRef, useState } from 'react';
import { Crop, ImagePlus, Quote, StickyNote, Sparkles, Trash2, Type } from 'lucide-react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import {
  excerptOf,
  formatCapturedAt,
  hostOf,
  type CapturedImage,
  type CapturedSelection,
} from '../capture/model';

export type CropRect = { x: number; y: number; width: number; height: number };

export type SelectionAction = 'note' | 'text' | 'source' | 'mindmap';

/**
 * Review step for a screenshot.
 *
 * The picture is not in the document yet — it lives in this dialog until the user picks
 * Insert. That is what makes "remove the capture immediately" true rather than a promise
 * (spec §7, plan P4-T4/T5).
 */
export function CaptureImageDialog({
  capture,
  onInsert,
  onDiscard,
}: {
  capture: CapturedImage;
  onInsert: (input: { dataUrl: string; width: number; height: number }) => void;
  onDiscard: () => void;
}) {
  const [cropMode, setCropMode] = useState(false);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const preview = useMemo(
    () => ({ width: Math.min(720, capture.width), height: 0 }),
    [capture.width],
  );

  const toImageSpace = (selection: CropRect, element: HTMLElement): CropRect => {
    const bounds = element.getBoundingClientRect();
    const scaleX = capture.width / bounds.width;
    const scaleY = capture.height / bounds.height;
    const x = Math.max(0, Math.round(selection.x * scaleX));
    const y = Math.max(0, Math.round(selection.y * scaleY));
    const width = Math.max(8, Math.round(selection.width * scaleX));
    const height = Math.max(8, Math.round(selection.height * scaleY));
    return {
      x: Math.min(x, capture.width - 1),
      y: Math.min(y, capture.height - 1),
      width: Math.min(width, capture.width - x),
      height: Math.min(height, capture.height - y),
    };
  };

  const pointerToLocal = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = surfaceRef.current;
    if (!element) return { x: 0, y: 0 };
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.min(Math.max(0, event.clientX - bounds.left), bounds.width),
      y: Math.min(Math.max(0, event.clientY - bounds.top), bounds.height),
    };
  };

  const finishCrop = () => {
    setDragging(null);
  };

  const insert = async () => {
    if (!rect || !cropMode) {
      onInsert({ dataUrl: capture.dataUrl, width: capture.width, height: capture.height });
      return;
    }
    const element = surfaceRef.current;
    if (!element) return;
    const cropped = toImageSpace(rect, element);
    const dataUrl = await cropDataUrl(capture.dataUrl, cropped);
    onInsert({ dataUrl, width: cropped.width, height: cropped.height });
  };

  return (
    <Dialog
      open
      title="Capture this page?"
      description="The screenshot is not part of the drawing yet. Insert keeps it; Discard drops it, and nothing is written to disk."
      onClose={onDiscard}
      footer={
        <>
          <Button onClick={onDiscard}>
            <Trash2 size={14} aria-hidden /> Discard
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCropMode((value) => !value);
              setRect(null);
            }}
          >
            <Crop size={14} aria-hidden /> {cropMode ? 'Use the whole page' : 'Crop…'}
          </Button>
          <Button variant="primary" onClick={() => void insert()}>
            <ImagePlus size={14} aria-hidden /> {rect && cropMode ? 'Insert crop' : 'Insert into drawing'}
          </Button>
        </>
      }
    >
      <p className="text-[12px] muted">
        {hostOf(capture.pageUrl)} · {capture.width}×{capture.height} px · captured{' '}
        {formatCapturedAt(capture.capturedAt)}
      </p>
      <div
        ref={surfaceRef}
        className={`relative mt-2 select-none overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700 ${
          cropMode ? 'cursor-crosshair' : ''
        }`}
        style={{ maxHeight: 320 }}
        onPointerDown={(event) => {
          if (!cropMode) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = pointerToLocal(event);
          setDragging(point);
          setRect({ x: point.x, y: point.y, width: 0, height: 0 });
        }}
        onPointerMove={(event) => {
          if (!cropMode || !dragging) return;
          const point = pointerToLocal(event);
          setRect({
            x: Math.min(dragging.x, point.x),
            y: Math.min(dragging.y, point.y),
            width: Math.abs(point.x - dragging.x),
            height: Math.abs(point.y - dragging.y),
          });
        }}
        onPointerUp={finishCrop}
        onPointerCancel={finishCrop}
      >
        <img
          src={capture.dataUrl}
          alt={`Screenshot of ${capture.pageTitle || hostOf(capture.pageUrl)}`}
          className="block max-h-80 w-full object-contain"
          draggable={false}
          width={preview.width}
        />
        {cropMode ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-ink-950/40" aria-hidden />
            {rect && rect.width > 4 && rect.height > 4 ? (
              <div
                className="pointer-events-none absolute border-2 border-pilot-400 bg-white/10"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                aria-hidden
              />
            ) : null}
          </>
        ) : null}
      </div>
      {cropMode ? (
        <p className="mt-1.5 text-[11px] muted">
          {rect && rect.width > 4 && rect.height > 4
            ? `Crop: ${Math.round(rect.width)}×${Math.round(rect.height)} on screen`
            : 'Drag on the image to choose the part you want.'}
        </p>
      ) : null}
    </Dialog>
  );
}

/** Crops a data URL using an offscreen canvas. Returns the original if anything fails. */
export async function cropDataUrl(dataUrl: string, rect: CropRect): Promise<string> {
  try {
    const response = await fetch(dataUrl);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    bitmap.close?.();
    return canvas.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

/**
 * Review step for captured text: the same four destinations the spec asks for, all of
 * which carry the page as a source reference.
 */
export function SelectionDialog({
  capture,
  onAction,
  onDiscard,
}: {
  capture: CapturedSelection;
  onAction: (action: SelectionAction) => void;
  onDiscard: () => void;
}) {
  const characters = capture.text.length;

  return (
    <Dialog
      open
      title="Text captured from this page"
      description={`${capture.pageTitle || hostOf(capture.pageUrl)} — ${characters.toLocaleString()} characters. Nothing has been added to the drawing yet.`}
      onClose={onDiscard}
      footer={
        <>
          <Button onClick={onDiscard}>
            <Trash2 size={14} aria-hidden /> Discard
          </Button>
          <Button variant="primary" onClick={() => onAction(capture.intent === 'mindmap' ? 'mindmap' : 'note')}>
            {capture.intent === 'mindmap' ? (
              <>
                <Sparkles size={14} aria-hidden /> Make a mind map
              </>
            ) : (
              <>
                <StickyNote size={14} aria-hidden /> Add as sticky note
              </>
            )}
          </Button>
        </>
      }
    >
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-2.5 text-[12px] leading-relaxed dark:bg-ink-950">
        {excerptOf(capture.text, 900)}
      </pre>
      <p className="mt-2 text-[11px] muted">
        Source: {hostOf(capture.pageUrl)} · {formatCapturedAt(capture.capturedAt)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onAction('note')}>
          <StickyNote size={13} aria-hidden /> Sticky note
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAction('text')}>
          <Type size={13} aria-hidden /> Canvas text
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAction('source')}>
          <Quote size={13} aria-hidden /> Source reference
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAction('mindmap')}>
          <Sparkles size={13} aria-hidden /> Mind map (AI)
        </Button>
      </div>
      <p className="mt-2 text-[11px] muted">
        The AI option opens the assistant with this text in the prompt and sends nothing until you review
        the exact payload and confirm it.
      </p>
    </Dialog>
  );
}
