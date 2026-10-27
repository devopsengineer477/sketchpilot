import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/export/render.ts` is the wrapper around the canvas engine's rasteriser. The engine
 * itself needs a real canvas, so it is mocked here and the *wrapper's* contract is what is
 * asserted: the empty-scene guard, the pixel budget, option mapping, and SVG sanitising.
 * The real rendering path is covered end-to-end by the PNG/SVG export specs.
 */

const exportToBlob = vi.fn();
const exportToSvg = vi.fn();

vi.mock('@excalidraw/excalidraw', () => ({
  exportToBlob: (...args: unknown[]) => exportToBlob(...args),
  exportToSvg: (...args: unknown[]) => exportToSvg(...args),
}));

const { renderPng, renderSvg } = await import('../export/render');

const element = { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } as never;

beforeEach(() => {
  exportToBlob.mockReset();
  exportToSvg.mockReset();
  exportToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

describe('PNG export wrapper', () => {
  it('refuses to render an empty canvas with a human message', async () => {
    await expect(renderPng([], {}, {} as never)).rejects.toThrow(/nothing on the canvas/i);
    expect(exportToBlob).not.toHaveBeenCalled();
  });

  it('asks for a 2× export on ordinary scenes and maps the options through', async () => {
    await renderPng([element], { viewBackgroundColor: '#fafafa' } as never, {} as never, {
      darkMode: true,
      transparent: true,
    });
    const call = exportToBlob.mock.calls[0]![0] as {
      appState: Record<string, unknown>;
      mimeType: string;
      quality: number;
      getDimensions: (width: number, height: number) => { width: number; height: number; scale: number };
    };
    expect(call.mimeType).toBe('image/png');
    expect(call.quality).toBe(1);
    expect(call.appState.exportBackground).toBe(false); // transparent
    expect(call.appState.exportWithDarkMode).toBe(true);
    expect(call.appState.viewBackgroundColor).toBe('#fafafa');
    expect(call.getDimensions(800, 600)).toEqual({ width: 1600, height: 1200, scale: 2 });
  });

  it('defaults to an opaque white background', async () => {
    await renderPng([element], {} as never, {} as never);
    const call = exportToBlob.mock.calls[0]![0] as { appState: Record<string, unknown> };
    expect(call.appState.exportBackground).toBe(true);
    expect(call.appState.exportWithDarkMode).toBe(false);
    expect(call.appState.viewBackgroundColor).toBe('#ffffff');
  });

  it('caps a pathological scene instead of producing a 200 MB PNG', async () => {
    await renderPng([element], {} as never, {} as never);
    const call = exportToBlob.mock.calls[0]![0] as {
      getDimensions: (width: number, height: number) => { scale: number; width: number; height: number };
    };
    // 20 000 × 20 000 px is 400 MP — the budget is 40 MP, so scale must fall to 0.31…
    const huge = call.getDimensions(20_000, 20_000);
    expect(huge.width * huge.height).toBeLessThanOrEqual(40_000_000 * 1.0001);
    expect(huge.scale).toBeLessThan(2);
  });

  it('never scales below 1×, even when the caller asks for a fraction', async () => {
    await renderPng([element], {} as never, {} as never, { scale: 0.25 });
    const call = exportToBlob.mock.calls[0]![0] as {
      getDimensions: (width: number, height: number) => { width: number; scale: number };
    };
    const dims = call.getDimensions(100, 100);
    expect(dims.scale).toBe(1);
    expect(dims.width).toBe(100);
  });
});

describe('SVG export wrapper', () => {
  it('refuses an empty canvas too', async () => {
    await expect(renderSvg([], {}, {} as never)).rejects.toThrow(/nothing on the canvas/i);
  });

  it('sanitises what the engine produces before it reaches the user', async () => {
    // A hand-written element can carry a `javascript:` href into the rendered SVG.
    const fake = {
      outerHTML:
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(2)">x</a><rect onclick="bad()" /></svg>',
    };
    exportToSvg.mockResolvedValue(fake);

    const svg = await renderSvg([element], {} as never, {} as never);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/javascript:/i);
    expect(svg).not.toMatch(/onclick=/i);
    const call = exportToSvg.mock.calls[0]![0] as { exportPadding: number };
    expect(call.exportPadding).toBe(16);
  });
});
