import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, findBuiltinTemplate } from '../templates/catalog';
import { specToSkeleton } from '../templates/instantiate';
import { specToPreviewSvg, elementsToPreviewSvg } from '../templates/preview';
import { chain, columnX, rowY } from '../templates/dsl';

describe('built-in template catalog', () => {
  it('ships the twelve templates the spec asks for', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(12);
    const names = BUILTIN_TEMPLATES.map((template) => template.name);
    for (const expected of [
      'Simple flowchart',
      'Decision tree',
      'Mind map',
      'Software architecture',
      'CI/CD pipeline',
      'AWS three-tier',
      'API request lifecycle',
      'Test automation framework',
      'Incident response',
      'Project planning',
      'Daily task planning',
      'Learning roadmap',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('gives every template a unique id, a description and sane content', () => {
    const ids = new Set<string>();
    for (const template of BUILTIN_TEMPLATES) {
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
      expect(template.description.length).toBeGreaterThan(10);
      expect(template.spec.nodes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('only connects edges to nodes that exist', () => {
    for (const template of BUILTIN_TEMPLATES) {
      const nodeIds = new Set(template.spec.nodes.map((node) => node.id));
      for (const edge of template.spec.edges) {
        expect(nodeIds.has(edge.from), `${template.id}: ${edge.from}`).toBe(true);
        expect(nodeIds.has(edge.to), `${template.id}: ${edge.to}`).toBe(true);
      }
    }
  });

  it('uses unique element ids within each template', () => {
    for (const template of BUILTIN_TEMPLATES) {
      const elementIds = [
        ...template.spec.nodes.map((node) => node.id),
        ...template.spec.edges.map((edge) => edge.id),
        ...(template.spec.notes ?? []).map((note) => note.id),
      ];
      expect(new Set(elementIds).size, template.id).toBe(elementIds.length);
    }
  });

  it('keeps every node inside reasonable canvas bounds', () => {
    for (const template of BUILTIN_TEMPLATES) {
      for (const node of template.spec.nodes) {
        expect(node.width).toBeGreaterThan(0);
        expect(node.height).toBeGreaterThan(0);
        expect(Math.abs(node.x)).toBeLessThan(10_000);
        expect(Math.abs(node.y)).toBeLessThan(10_000);
        expect(node.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('looks up a template by id', () => {
    expect(findBuiltinTemplate('builtin-cicd')?.name).toBe('CI/CD pipeline');
    expect(findBuiltinTemplate('nope')).toBeUndefined();
  });
});

describe('skeleton conversion', () => {
  it('turns nodes, edges and notes into engine skeletons', () => {
    const template = BUILTIN_TEMPLATES[0]!;
    const skeleton = specToSkeleton(template.spec);
    const expected =
      template.spec.nodes.length + template.spec.edges.length + (template.spec.notes?.length ?? 0);
    expect(skeleton).toHaveLength(expected);
  });

  it('binds arrows to their source and target nodes', () => {
    const skeleton = specToSkeleton({
      nodes: [
        { id: 'a', shape: 'rectangle', x: 0, y: 0, width: 100, height: 50, label: 'A' },
        { id: 'b', shape: 'rectangle', x: 200, y: 0, width: 100, height: 50, label: 'B' },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', label: 'next' }],
    });

    const arrow = skeleton.find((element) => (element as { type: string }).type === 'arrow') as unknown as {
      start: { id: string };
      end: { id: string };
      label: { text: string };
    };
    expect(arrow.start.id).toBe('a');
    expect(arrow.end.id).toBe('b');
    expect(arrow.label.text).toBe('next');
  });
});

describe('template previews', () => {
  it('renders a self-contained SVG with no external references', () => {
    const svg = specToPreviewSvg(BUILTIN_TEMPLATES[3]!.spec);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // The only absolute URL allowed is the SVG namespace itself.
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<image|href=/i);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).toContain('<text');
  });

  it('escapes label text so previews cannot inject markup', () => {
    const svg = specToPreviewSvg({
      nodes: [{ id: 'x', shape: 'rectangle', x: 0, y: 0, width: 100, height: 40, label: '<script>alert(1)</script>' }],
      edges: [],
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders previews for user templates from stored elements', () => {
    const svg = elementsToPreviewSvg([
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 120, height: 60, backgroundColor: '#ffec99' },
      { id: 'a1', type: 'arrow', x: 120, y: 30, width: 80, height: 0, points: [[0, 0], [80, 0]] },
    ]);
    expect(svg).toContain('<rect');
    expect(svg).toContain('<line');
  });
});

describe('layout helpers', () => {
  it('builds a connected chain with predictable geometry', () => {
    const spec = chain('t', [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]);
    expect(spec.nodes).toHaveLength(3);
    expect(spec.edges).toHaveLength(2);
    expect(spec.nodes[1]!.x).toBeGreaterThan(spec.nodes[0]!.x);
    expect(spec.nodes[1]!.y).toBe(spec.nodes[0]!.y);
    expect(columnX(2)).toBeGreaterThan(columnX(1));
    expect(rowY(2)).toBeGreaterThan(rowY(1));
  });
});

describe('template arrow geometry', () => {
  it('starts and ends on the node edges, never through the label', () => {
    const spec = {
      nodes: [
        { id: 'a', shape: 'rectangle' as const, x: 0, y: 0, width: 100, height: 60, label: 'A' },
        { id: 'b', shape: 'rectangle' as const, x: 200, y: 0, width: 100, height: 60, label: 'B' },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    };

    const skeleton = specToSkeleton(spec);
    const arrow = skeleton.find((element) => (element as { type: string }).type === 'arrow') as unknown as {
      x: number;
      y: number;
      points: Array<[number, number]>;
    };

    // Starts on A's right edge (100, 30) and ends on B's left edge (200, 30);
    // points are relative to the arrow origin.
    expect(arrow.x).toBe(100);
    expect(arrow.y).toBe(30);
    expect(arrow.x + arrow.points[1]![0]).toBe(200);
    expect(arrow.points[1]![1]).toBe(0);
  });

  it('clips vertical and diagonal connections to the shape bounds', () => {
    const spec = {
      nodes: [
        { id: 'a', shape: 'rectangle' as const, x: 0, y: 0, width: 100, height: 60, label: 'A' },
        { id: 'b', shape: 'rectangle' as const, x: 0, y: 160, width: 100, height: 60, label: 'B' },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
    };
    const arrow = specToSkeleton(spec).find(
      (element) => (element as { type: string }).type === 'arrow',
    ) as unknown as { x: number; y: number; points: Array<[number, number]> };

    expect(arrow.x).toBe(50);
    expect(arrow.y).toBe(60);
    expect(arrow.points[1]![1]).toBe(100);
  });

  it('drops edges that reference a missing node instead of producing broken arrows', () => {
    const skeleton = specToSkeleton({
      nodes: [{ id: 'a', shape: 'rectangle', x: 0, y: 0, width: 10, height: 10, label: 'A' }],
      edges: [{ id: 'e', from: 'a', to: 'ghost' }],
    });
    expect(skeleton.some((element) => (element as { type: string }).type === 'arrow')).toBe(false);
  });
});
