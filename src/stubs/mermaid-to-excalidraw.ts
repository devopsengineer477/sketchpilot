/**
 * Stub for @excalidraw/mermaid-to-excalidraw.
 *
 * The engine only reaches this module from its "Mermaid to Excalidraw" dialog, which
 * SketchPilot does not enable. Bundling it pulls in Mermaid + Cytoscape + KaTeX (about
 * 4 MB of JS and thousands of modules) into an offline extension that never uses it.
 * If that dialog is ever enabled, delete this stub and the alias in vite.config.ts.
 */
export async function parseMermaidToExcalidraw(): Promise<never> {
  throw new Error('Mermaid import is not bundled in SketchPilot.');
}

export default { parseMermaidToExcalidraw };
