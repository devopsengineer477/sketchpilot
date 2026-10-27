import { PALETTE, type TemplateSpec } from './types';

/**
 * Templates are authored as data, not as JSON blobs pasted from the app, so they
 * stay reviewable in diffs and testable without a browser.
 */

export const GRID = {
  nodeWidth: 168,
  nodeHeight: 72,
  columnGap: 72,
  rowGap: 64,
  originX: 0,
  originY: 0,
};

export function columnX(index: number, width = GRID.nodeWidth): number {
  return GRID.originX + index * (width + GRID.columnGap);
}

export function rowY(index: number, height = GRID.nodeHeight): number {
  return GRID.originY + index * (height + GRID.rowGap);
}

/** A straight left-to-right or top-to-bottom run of nodes, wired in order. */
export function chain(
  prefix: string,
  items: Array<{
    label: string;
    fill?: string;
    shape?: 'rectangle' | 'ellipse' | 'diamond';
    emphasis?: boolean;
  }>,
  options: { direction?: 'horizontal' | 'vertical'; startX?: number; startY?: number; width?: number; height?: number } = {},
): TemplateSpec {
  const {
    direction = 'horizontal',
    startX = GRID.originX,
    startY = GRID.originY,
    width = GRID.nodeWidth,
    height = GRID.nodeHeight,
  } = options;

  const nodes = items.map((item, index) => ({
    id: `${prefix}-n${index}`,
    shape: item.shape ?? ('rectangle' as const),
    x: direction === 'horizontal' ? startX + index * (width + GRID.columnGap) : startX,
    y: direction === 'vertical' ? startY + index * (height + GRID.rowGap) : startY,
    width,
    height,
    label: item.label,
    fill: item.fill ?? PALETTE.blue,
    emphasis: item.emphasis,
  }));

  const edges = items.slice(1).map((_, index) => ({
    id: `${prefix}-e${index}`,
    from: `${prefix}-n${index}`,
    to: `${prefix}-n${index + 1}`,
  }));

  return { nodes, edges };
}

export function mergeSpecs(...specs: TemplateSpec[]): TemplateSpec {
  return {
    nodes: specs.flatMap((spec) => spec.nodes),
    edges: specs.flatMap((spec) => spec.edges),
    notes: specs.flatMap((spec) => spec.notes ?? []),
  };
}
