import { useEffect } from 'react';

export type Shortcut = {
  /** Display form, e.g. "⌘/Ctrl + S". */
  label: string;
  description: string;
  /** Matching logic for the real event. */
  match: (event: KeyboardEvent) => boolean;
  /** What to run when the shortcut fires. */
  onFire: () => void;
};

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/** Shared modifier test so every shortcut behaves the same on macOS and elsewhere. */
export function withMod(event: KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/**
 * True when the user is typing. Shortcuts must never fire here — this is the guard
 * the spec calls out (test 15): rename fields, the AI prompt, and Excalidraw's own
 * in-canvas text editor all count as text entry.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  // jsdom (and some engines) do not implement `isContentEditable`, so the attribute is the
  // reliable signal: any editable ancestor makes this a text field.
  const editable = target.closest('[contenteditable]');
  if (editable && editable.getAttribute('contenteditable') !== 'false') return true;
  // Excalidraw renders bound-text editing into a textarea inside the canvas.
  if (target.closest('.excalidraw textarea, .excalidraw [contenteditable="true"]')) return true;
  return false;
}

/**
 * Binds window-level shortcuts in the capture phase.
 *
 * Capture matters: the canvas engine also listens for `?` (its help dialog) and for
 * plain letter keys. SketchPilot's own bindings must win those few keys, so when a
 * shortcut fires we stop the event before it reaches the engine. Everything the app
 * does not bind flows through untouched — text entry, repeats and already-handled
 * events are all ignored.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTextEntryTarget(event.target)) return;

      for (const shortcut of shortcuts) {
        if (event.defaultPrevented) continue;
        if (!shortcut.match(event)) continue;
        event.preventDefault();
        event.stopPropagation();
        shortcut.onFire();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [shortcuts, enabled]);
}

export const modKeyLabel = isMac ? '⌘' : 'Ctrl';

export function comboLabel(key: string, options: { shift?: boolean; mod?: boolean } = {}): string {
  const parts: string[] = [];
  if (options.mod) parts.push(modKeyLabel);
  if (options.shift) parts.push('Shift');
  parts.push(key);
  return parts.join(' + ');
}
