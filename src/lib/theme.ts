import type { ThemePreference } from '../storage/schemas';

export type ResolvedTheme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  const media = window.matchMedia(QUERY);
  return media?.matches ? 'dark' : 'light';
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

/** Calls back when the OS theme changes, but only while the preference is 'system'. */
export function watchSystemTheme(preference: ThemePreference, onChange: () => void): () => void {
  if (preference !== 'system' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(QUERY);
  const listener = () => onChange();
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
