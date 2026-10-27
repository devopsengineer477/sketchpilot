/**
 * Context-menu definitions and routing, kept free of `chrome.*` so the mapping from a
 * clicked menu id to an action is unit-testable (plan P4-T8/T12).
 */

export type MenuAction =
  | { kind: 'new-drawing' }
  | { kind: 'open-dashboard' }
  | { kind: 'capture-tab' }
  | { kind: 'note'; selectionText: string }
  | { kind: 'mindmap'; selectionText: string }
  | { kind: 'ignore' };

export type MenuDefinition = {
  id: string;
  title?: string;
  contexts: Array<'page' | 'selection' | 'image' | 'action'>;
  type?: 'normal' | 'separator';
};

export const CONTEXT_MENUS: MenuDefinition[] = [
  { id: 'sketchpilot.new', title: 'New SketchPilot drawing', contexts: ['page', 'selection', 'action'] },
  { id: 'sketchpilot.dashboard', title: 'Open the SketchPilot library', contexts: ['page', 'selection', 'action'] },
  { id: 'sketchpilot.separator', type: 'separator', contexts: ['page', 'selection', 'action'] },
  { id: 'sketchpilot.capture', title: 'Capture this page as an image', contexts: ['page', 'image', 'action'] },
  { id: 'sketchpilot.note', title: 'Create a sticky note from this selection', contexts: ['selection'] },
  { id: 'sketchpilot.mindmap', title: 'Make a mind map from this selection (AI)', contexts: ['selection'] },
];

/**
 * Chrome hands over `selectionText` for selection-context items, so note creation needs no
 * `scripting` injection at all — the text is already in hand.
 */
export function resolveMenuAction(menuItemId: string, selectionText?: string): MenuAction {
  const text = (selectionText ?? '').trim();
  switch (menuItemId) {
    case 'sketchpilot.new':
      return { kind: 'new-drawing' };
    case 'sketchpilot.dashboard':
      return { kind: 'open-dashboard' };
    case 'sketchpilot.capture':
      return { kind: 'capture-tab' };
    case 'sketchpilot.note':
      return text ? { kind: 'note', selectionText: text } : { kind: 'ignore' };
    case 'sketchpilot.mindmap':
      return text ? { kind: 'mindmap', selectionText: text } : { kind: 'ignore' };
    default:
      return { kind: 'ignore' };
  }
}
