import type { DrawingElement, TemplateCategory } from '../storage/schemas';

/** Palette shared by every built-in template so the library looks coherent. */
export const PALETTE = {
  ink: '#1e1e1e',
  muted: '#868e96',
  surface: '#ffffff',
  blue: '#a5d8ff',
  green: '#b2f2bb',
  amber: '#ffec99',
  red: '#ffc9c9',
  violet: '#d0bfff',
  grey: '#e9ecef',
} as const;

export type NodeShape = 'rectangle' | 'ellipse' | 'diamond';

export type TemplateNode = {
  id: string;
  shape: NodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fill?: string;
  /** Emphasised nodes (entry points, decisions) get a thicker stroke. */
  emphasis?: boolean;
};

export type TemplateEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
};

export type TemplateNote = {
  id: string;
  x: number;
  y: number;
  width?: number;
  text: string;
  fontSize?: number;
};

export type TemplateSpec = {
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  notes?: TemplateNote[];
};

export type BuiltinTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  spec: TemplateSpec;
};

/** A template ready to drop on a canvas, whether built-in or user-saved. */
export type ResolvedTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  source: 'builtin' | 'user';
  createdAt: number;
  updatedAt: number;
  elements: DrawingElement[];
};

export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = {
  engineering: 'Engineering',
  planning: 'Planning',
  learning: 'Learning',
  custom: 'Mine',
};
