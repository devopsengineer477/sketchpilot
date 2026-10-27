import { describe, expect, it } from 'vitest';
import { qualityOption } from '../export/quality';

/**
 * The canvas engine logs `"quality" will be ignored for "image/png" mimeType` whenever a numeric
 * `quality` is passed with a lossless format. That warning was visible in the extension's console,
 * so `qualityOption` is the single gate that decides whether the option is sent at all.
 */
describe('export quality option', () => {
  it('never sends quality for PNG', () => {
    expect(qualityOption('image/png', 1)).toEqual({});
    expect('quality' in qualityOption('image/png', 1)).toBe(false);
  });

  it('never sends quality for SVG', () => {
    expect(qualityOption('image/svg+xml', 0.8)).toEqual({});
  });

  it('passes quality through for lossy formats', () => {
    expect(qualityOption('image/jpeg', 0.85)).toEqual({ quality: 0.85 });
    expect(qualityOption('image/webp', 0.6)).toEqual({ quality: 0.6 });
  });

  it('matches mime types case-insensitively', () => {
    expect(qualityOption('IMAGE/JPEG', 0.5)).toEqual({ quality: 0.5 });
    expect(qualityOption('Image/PNG', 0.5)).toEqual({});
  });
});
