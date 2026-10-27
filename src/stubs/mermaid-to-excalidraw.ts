/**
 * Mermaid import is not part of SketchPilot.
 *
 * The canvas engine ships a "Mermaid to …" importer; it is switched off at the source
 * (`aiEnabled={false}` on the canvas), so no menu item, command-palette action or shortcut can
 * reach it. This module stays aliased in its place for two reasons:
 *
 * 1. **It keeps ~4 MB out of the package.** The real `@excalidraw/mermaid-to-excalidraw` pulls in
 *    Mermaid, Cytoscape and KaTeX (thousands of modules) into an extension that never converts
 *    Mermaid. `npm run check:build` and the bundle budget would both notice if it came back.
 * 2. **It fails loudly rather than silently.** If a future engine version re-exposes the dialog
 *    and something calls through, this throws instead of half-importing a diagram.
 *
 * SketchPilot's own AI panel can turn a drawing *into* Mermaid text (the opposite direction, plain
 * text, no renderer) — that is our feature and lives in `src/ai/`.
 */
export async function parseMermaidToExcalidraw(): Promise<never> {
  throw new Error('Mermaid import is not part of SketchPilot.');
}

export default { parseMermaidToExcalidraw };
