import { describe, expect, it } from 'vitest';
import { isTextEntryTarget } from '../hooks/useShortcuts';
import { FOCUSABLE_SELECTOR } from '../components/Dialog';

/**
 * Scenario 15, at unit level: the guard that decides whether a keystroke belongs to the
 * document or to whatever the user is typing into. Getting this wrong is how a drawing app
 * eats the letter "d" out of a title.
 */
describe('keyboard guard (scenario 15)', () => {
  function element(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    return host.firstElementChild as HTMLElement;
  }

  it('never lets a shortcut fire while text is being entered', () => {
    expect(isTextEntryTarget(element('<input value="draft" />'))).toBe(true);
    expect(isTextEntryTarget(element('<textarea></textarea>'))).toBe(true);
    expect(isTextEntryTarget(element('<select></select>'))).toBe(true);
    expect(isTextEntryTarget(element('<div contenteditable="true"></div>'))).toBe(true);
  });

  it('lets shortcuts through on ordinary UI chrome', () => {
    expect(isTextEntryTarget(element('<button>Save</button>'))).toBe(false);
    expect(isTextEntryTarget(element('<div><span>label</span></div>'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(new EventTarget())).toBe(false);
  });

  it('treats the engine\'s in-canvas text editor as text entry, even inside the canvas', () => {
    const canvas = element('<div class="excalidraw"><textarea></textarea></div>');
    expect(isTextEntryTarget(canvas.querySelector('textarea'))).toBe(true);
    const editable = element('<div class="excalidraw"><div contenteditable="true"></div></div>');
    expect(isTextEntryTarget(editable.querySelector('[contenteditable]'))).toBe(true);
    expect(isTextEntryTarget(canvas)).toBe(false);
  });

  it('keeps a contenteditable="false" region out of the guard', () => {
    expect(isTextEntryTarget(element('<div contenteditable="false"></div>'))).toBe(false);
  });
});

describe('dialog focus order (the Tab cycle the trap walks)', () => {
  it('matches the controls a dialog actually contains, and skips the unreachable ones', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <a href="#one">link</a>
      <button>keep</button>
      <button disabled>disabled</button>
      <input />
      <select></select>
      <textarea></textarea>
      <div tabindex="-1">programmatic</div>
      <div tabindex="0">focusable div</div>
      <input type="hidden" />
    `;
    document.body.append(host);
    const matched = [...host.querySelectorAll(FOCUSABLE_SELECTOR)].map((node) => node.tagName.toLowerCase());
    // tabindex="-1" and disabled controls are excluded; the hidden input has no offsetParent
    // so the dialog's runtime filter drops it even though the selector matches.
    expect(matched).toEqual(['a', 'button', 'input', 'select', 'textarea', 'div']);
    expect(host.querySelectorAll(FOCUSABLE_SELECTOR)[1]?.hasAttribute('disabled')).toBe(false);
  });
});
