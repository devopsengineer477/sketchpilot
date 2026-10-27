import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accessibility guard (plan P5-T8).
 *
 * The palette lives in tailwind.config.js, so the contrast pairs are read from there
 * rather than copied — a token tweak that breaks WCAG AA fails this test instead of
 * shipping. Tailwind's own palette values used in the UI are listed explicitly.
 */

const TAILWIND_DEFAULTS: Record<string, string> = {
  'red-50': '#fef2f2',
  'red-600': '#dc2626',
  'red-700': '#b91c1c',
  'red-300': '#fca5a5',
  'red-950': '#450a0a',
  'red-200': '#fecaca',
  'red-900': '#7f1d1d',
  'emerald-50': '#ecfdf5',
  'emerald-300': '#6ee7b7',
  'emerald-700': '#047857',
  'emerald-950': '#022c22',
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-900': '#78350f',
  'amber-950': '#451a03',
  'white': '#ffffff',
};

function readInk(): Record<string, string> {
  const source = readFileSync(resolve(process.cwd(), 'tailwind.config.js'), 'utf8');
  const ink: Record<string, string> = {};
  const block = /ink:\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
  for (const match of block.matchAll(/(\d+):\s*'(#[0-9a-fA-F]{6})'/g)) {
    ink[`ink-${match[1]}`] = match[2]!;
  }
  const pilot: Record<string, string> = {};
  const pilotBlock = /pilot:\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
  for (const match of pilotBlock.matchAll(/(\d+):\s*'(#[0-9a-fA-F]{6})'/g)) {
    pilot[`pilot-${match[1]}`] = match[2]!;
  }
  return { ...ink, ...pilot };
}

const TOKENS = { ...TAILWIND_DEFAULTS, ...readInk() };

/** Strict lookup: a missing token is a broken palette, not a `undefined` colour. */
function token(name: string): string {
  const value = TOKENS[name];
  if (!value) throw new Error(`unknown colour token: ${name}`);
  return value;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every foreground/background pair the product actually renders text in. */
const PAIRS: Array<[label: string, fg: string, bg: string, minimum: number]> = [
  ['body text, light', token('ink-900'), token('white'), 4.5],
  ['body text on page background', token('ink-900'), token('ink-50'), 4.5],
  ['muted text on a card', token('ink-500'), token('white'), 4.5],
  ['muted text on the page background', token('ink-500'), token('ink-50'), 4.5],
  ['secondary text', token('ink-600'), token('white'), 4.5],
  ['primary link', token('pilot-700'), token('white'), 4.5],
  ['primary button label', token('white'), token('pilot-600'), 4.5],
  ['danger button label', token('white'), token('red-600'), 4.5],
  ['active pill', token('pilot-800'), token('pilot-100'), 4.5],
  ['save-failed pill', token('red-700'), token('red-50'), 4.5],
  ['saved pill', token('emerald-700'), token('emerald-50'), 4.5],
  ['capture notice', token('amber-900'), token('amber-50'), 4.5],
  ['body text, dark', token('ink-100'), token('ink-950'), 4.5],
  ['muted text on a dark card', token('ink-400'), token('ink-900'), 4.5],
  ['muted text on the dark page', token('ink-400'), token('ink-950'), 4.5],
  ['dark link', token('pilot-300'), token('ink-900'), 4.5],
  ['dark error text', token('red-300'), token('red-950'), 4.5],
  ['dark saved pill', token('emerald-300'), token('emerald-950'), 4.5],
  ['dark capture notice', token('amber-100'), token('amber-950'), 4.5],
];

describe('colour contrast (WCAG AA, normal text)', () => {
  it.each(PAIRS)('%s meets its ratio', (_label, fg, bg, minimum) => {
    expect(fg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(minimum);
  });

  it('computes known ratios correctly (guards the maths itself)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });
});
