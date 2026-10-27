/**
 * Excalidraw resolves fonts from `window.EXCALIDRAW_ASSET_PATH` and falls back to a
 * public CDN when it is unset. In an MV3 extension that fallback is a CSP violation,
 * a privacy leak, and an offline-mode failure — so we always point it at the
 * extension-local copy produced by the build (`dist/assets/fonts/`) — the same `assets/`
 * folder Vite writes its chunks to, so the package has one asset root rather than two.
 */
export function configureExcalidrawAssets(): void {
  const extensionRoot =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('')
      : `${window.location.origin}/`;
  const base = `${extensionRoot.replace(/\/$/, '')}/assets/`;
  (window as unknown as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = base;
}
