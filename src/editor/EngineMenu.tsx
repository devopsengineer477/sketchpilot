import { MainMenu } from '@excalidraw/excalidraw';
import { Keyboard } from 'lucide-react';

/**
 * SketchPilot's own canvas menu.
 *
 * Passing children to `<Excalidraw>` replaces the engine's default menu. That default menu
 * ends with a group literally titled **"Excalidraw links"** — GitHub, X, Discord and a link
 * back to excalidraw.com — plus a Help item whose dialog links to the engine's documentation
 * and YouTube channel. None of that belongs to this product: a user inside SketchPilot should
 * not be handed links to somebody else's site, and an offline extension should not advertise
 * destinations that only work online.
 *
 * So the menu is rebuilt from the engine's own primitives (same markup, same styling, same
 * behaviour) with only the two items that do something here: the canvas background picker and
 * Clear canvas. Everything SketchPilot owns — save, export, library, templates, AI, shortcuts —
 * lives in the app's own top bar and `?` sheet, so nothing is duplicated or lost.
 *
 * `tests/e2e/milestone5.spec.ts` asserts that no anchor in any surface points off-extension.
 */
export function EngineMenu({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {/* Replaces the engine's Help item, whose dialog was a list of links to
          excalidraw.com. Same information, our own (offline) sheet. */}
      <MainMenu.Item icon={<Keyboard size={14} aria-hidden />} onSelect={onShowShortcuts}>
        Keyboard shortcuts
      </MainMenu.Item>
    </MainMenu>
  );
}
