/**
 * Imported before anything that touches Excalidraw. The engine resolves its font
 * directory from the global at font-load time, and we must never let it fall back
 * to the public CDN (CSP violation + a third-party request from an offline app).
 */
import { configureExcalidrawAssets } from './engine/assets';

configureExcalidrawAssets();
