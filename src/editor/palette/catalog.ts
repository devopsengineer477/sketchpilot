/**
 * Standard diagram elements — the catalogue.
 *
 * These are the symbols people reach for again and again when they *explain* a system while
 * drawing: a user, a browser, a server, a database. Each one is described here as plain geometry
 * in a local coordinate box, and `build.ts` turns that into ordinary engine elements
 * (rectangles, ellipses, polylines and a text label, sharing one group id).
 *
 * Consequences of that choice, which are the whole point:
 *  - an inserted symbol is **editable** — recolour it, resize the group, retype the label, ungroup
 *    it and take the parts apart;
 *  - it is **native** — it saves, exports to PNG/SVG/JSON, and appears in thumbnails through the
 *    code paths that already exist, with no schema change;
 *  - it needs **no assets, no dependency and no network** — the shapes are numbers in this file.
 *
 * Style rule (v1.2): monochrome. Every stroke uses the theme's ink colour and nothing is filled,
 * so a symbol looks right in light and dark mode and prints cleanly. `role` is used for grouping
 * in the panel, not for colour.
 */

export type PaletteRole = 'people' | 'compute' | 'data' | 'network';

export type Point = [number, number];

export type PaletteShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; round?: boolean; dashed?: boolean }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  /** Open or closed polyline; points are in the symbol's local box. */
  | { kind: 'polyline'; points: Point[]; closed?: boolean; dashed?: boolean };

export type PaletteSymbol = {
  /** Stable id — used by the panel, tests and the insert call. Never rename. */
  id: string;
  label: string;
  /** Spoken/visible group in the panel. */
  role: PaletteRole;
  /** Extra search terms, so "db", "sql" and "postgres" all find the database. */
  aliases: string[];
  /** Local drawing box; the label sits just below it. */
  box: { w: number; h: number };
  shapes: PaletteShape[];
};

export const ROLE_LABELS: Record<PaletteRole, string> = {
  people: 'People',
  compute: 'Compute',
  data: 'Data',
  network: 'Network',
};

/** Rounding keeps the generated element JSON small and stable across platforms. */
const r = (value: number): number => Math.round(value * 10) / 10;

/** Upward arc, left → top → right (screen coordinates: y grows downwards). */
export function arcUp(cx: number, cy: number, rx: number, ry: number, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = Math.PI - (Math.PI * index) / steps;
    return [r(cx + rx * Math.cos(t)), r(cy - ry * Math.sin(t))];
  });
}

/** Downward arc, left → bottom → right. */
export function arcDown(cx: number, cy: number, rx: number, ry: number, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = Math.PI - (Math.PI * index) / steps;
    return [r(cx + rx * Math.cos(t)), r(cy + ry * Math.sin(t))];
  });
}

export const PALETTE_SYMBOLS: PaletteSymbol[] = [
  // ---------------------------------------------------------------- people
  {
    id: 'user',
    label: 'User',
    role: 'people',
    aliases: ['user', 'person', 'actor', 'human', 'end user'],
    box: { w: 120, h: 100 },
    shapes: [
      { kind: 'ellipse', x: 42, y: 6, w: 36, h: 36 },
      { kind: 'polyline', points: arcUp(60, 96, 44, 42, 14) },
    ],
  },
  {
    id: 'client-desktop',
    label: 'Client',
    role: 'people',
    aliases: ['client', 'desktop', 'browser', 'computer', 'workstation', 'pc', 'web client'],
    box: { w: 120, h: 96 },
    shapes: [
      { kind: 'rect', x: 8, y: 8, w: 104, h: 64, round: true },
      { kind: 'polyline', points: [[60, 72], [60, 86]] },
      { kind: 'polyline', points: [[42, 88], [78, 88]] },
    ],
  },
  {
    id: 'client-mobile',
    label: 'Mobile',
    role: 'people',
    aliases: ['mobile', 'phone', 'smartphone', 'app', 'ios', 'android', 'tablet'],
    box: { w: 120, h: 100 },
    shapes: [
      { kind: 'rect', x: 38, y: 6, w: 44, h: 80, round: true },
      { kind: 'polyline', points: [[50, 16], [70, 16]] },
      { kind: 'polyline', points: [[52, 76], [68, 76]] },
    ],
  },

  // ---------------------------------------------------------------- compute
  {
    id: 'web-server',
    label: 'Web server',
    role: 'compute',
    aliases: ['web server', 'server', 'app server', 'backend', 'vm', 'host', 'rack'],
    box: { w: 120, h: 96 },
    shapes: [
      { kind: 'rect', x: 16, y: 6, w: 88, h: 24, round: true },
      { kind: 'rect', x: 16, y: 36, w: 88, h: 24, round: true },
      { kind: 'rect', x: 16, y: 66, w: 88, h: 24, round: true },
      { kind: 'ellipse', x: 24, y: 14, w: 8, h: 8 },
      { kind: 'ellipse', x: 24, y: 44, w: 8, h: 8 },
      { kind: 'ellipse', x: 24, y: 74, w: 8, h: 8 },
    ],
  },
  {
    id: 'worker',
    label: 'Worker',
    role: 'compute',
    aliases: ['worker', 'job', 'queue consumer', 'cron', 'task', 'batch', 'processor'],
    box: { w: 120, h: 96 },
    // A chip: square body, inner core and pins. Reads as "compute" and is visibly different
    // from the rack-shaped web server.
    shapes: [
      { kind: 'rect', x: 28, y: 20, w: 64, h: 56, round: true },
      { kind: 'rect', x: 46, y: 36, w: 28, h: 24, round: true },
      { kind: 'polyline', points: [[40, 20], [40, 8]] },
      { kind: 'polyline', points: [[60, 20], [60, 8]] },
      { kind: 'polyline', points: [[80, 20], [80, 8]] },
      { kind: 'polyline', points: [[40, 76], [40, 88]] },
      { kind: 'polyline', points: [[60, 76], [60, 88]] },
      { kind: 'polyline', points: [[80, 76], [80, 88]] },
    ],
  },

  // ---------------------------------------------------------------- data
  {
    id: 'database',
    label: 'Database',
    role: 'data',
    aliases: ['database', 'db', 'sql', 'postgres', 'postgresql', 'mysql', 'oracle', 'rds', 'store'],
    box: { w: 120, h: 96 },
    shapes: [
      { kind: 'ellipse', x: 20, y: 6, w: 80, h: 20 },
      {
        kind: 'polyline',
        points: [[20, 16], [20, 82], ...arcDown(60, 82, 40, 10, 12), [100, 82], [100, 16]],
      },
    ],
  },
  {
    id: 'cache',
    label: 'Cache',
    role: 'data',
    aliases: ['cache', 'redis', 'memcached', 'memory', 'in-memory', 'session store'],
    box: { w: 120, h: 92 },
    shapes: [{ kind: 'rect', x: 22, y: 18, w: 76, h: 56, round: true, dashed: true }],
  },
  {
    id: 'object-storage',
    label: 'Object storage',
    role: 'data',
    aliases: ['object storage', 'bucket', 's3', 'blob', 'file storage', 'blob store'],
    box: { w: 120, h: 96 },
    shapes: [
      { kind: 'ellipse', x: 18, y: 6, w: 84, h: 18 },
      {
        kind: 'polyline',
        points: [[18, 15], [30, 84], ...arcDown(60, 84, 30, 9, 10), [90, 84], [102, 15]],
      },
    ],
  },
  {
    id: 'queue',
    label: 'Queue',
    role: 'data',
    aliases: ['queue', 'sqs', 'kafka topic', 'buffer', 'stream', 'fifo', 'backlog'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'rect', x: 8, y: 22, w: 104, h: 48, round: true },
      { kind: 'polyline', points: [[34, 22], [34, 70]] },
      { kind: 'polyline', points: [[60, 22], [60, 70]] },
      { kind: 'polyline', points: [[86, 22], [86, 70]] },
    ],
  },
  {
    id: 'broker',
    label: 'Message broker',
    role: 'data',
    aliases: ['broker', 'message broker', 'pubsub', 'pub sub', 'kafka', 'rabbitmq', 'event bus'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'rect', x: 8, y: 22, w: 104, h: 48, round: true },
      // Two arrows in opposite directions: messages published in, delivered out.
      { kind: 'polyline', points: [[28, 38], [86, 38]] },
      { kind: 'polyline', points: [[78, 32], [86, 38], [78, 44]] },
      { kind: 'polyline', points: [[92, 56], [34, 56]] },
      { kind: 'polyline', points: [[42, 50], [34, 56], [42, 62]] },
    ],
  },

  // ---------------------------------------------------------------- network
  {
    id: 'load-balancer',
    label: 'Load balancer',
    role: 'network',
    aliases: ['load balancer', 'lb', 'elb', 'alb', 'balancer', 'ingress', 'proxy'],
    box: { w: 120, h: 92 },
    shapes: [
      {
        kind: 'polyline',
        closed: true,
        points: [[30, 14], [90, 14], [110, 46], [90, 78], [30, 78], [10, 46]],
      },
    ],
  },
  {
    id: 'api-gateway',
    label: 'API gateway',
    role: 'network',
    aliases: ['api gateway', 'gateway', 'api', 'reverse proxy', 'edge proxy', 'bff'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'rect', x: 10, y: 20, w: 100, h: 52, round: true },
      { kind: 'rect', x: 22, y: 30, w: 76, h: 32, round: true },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    role: 'network',
    aliases: ['cloud', 'internet', 'public cloud', 'aws', 'azure', 'gcp', 'saas', 'external'],
    box: { w: 120, h: 92 },
    shapes: [
      {
        kind: 'polyline',
        closed: true,
        // Three bumps resting on one baseline; `closed` draws the base line back to the start.
        points: [...arcUp(30, 78, 18, 14, 8), ...arcUp(62, 78, 26, 26, 12), ...arcUp(92, 78, 16, 12, 8)],
      },
    ],
  },
  {
    id: 'cdn',
    label: 'CDN / Edge',
    role: 'network',
    aliases: ['cdn', 'edge', 'cloudfront', 'akamai', 'pop', 'cache layer', 'static'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'ellipse', x: 26, y: 8, w: 68, h: 68 },
      { kind: 'ellipse', x: 48, y: 8, w: 24, h: 68 },
      { kind: 'polyline', points: [[26, 42], [94, 42]] },
    ],
  },
  {
    id: 'firewall',
    label: 'Firewall',
    role: 'network',
    aliases: ['firewall', 'waf', 'security', 'gatekeeper', 'network policy', 'brick wall'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'rect', x: 10, y: 16, w: 100, h: 60 },
      { kind: 'polyline', points: [[10, 36], [110, 36]] },
      { kind: 'polyline', points: [[10, 56], [110, 56]] },
      { kind: 'polyline', points: [[38, 16], [38, 36]] },
      { kind: 'polyline', points: [[72, 16], [72, 36]] },
      { kind: 'polyline', points: [[54, 36], [54, 56]] },
      { kind: 'polyline', points: [[88, 36], [88, 56]] },
      { kind: 'polyline', points: [[38, 56], [38, 76]] },
      { kind: 'polyline', points: [[72, 56], [72, 76]] },
    ],
  },
  {
    id: 'external-api',
    label: 'External API',
    role: 'network',
    aliases: ['external api', 'third party', 'integration', 'webhook', 'vendor', 'partner'],
    box: { w: 120, h: 92 },
    shapes: [
      { kind: 'rect', x: 10, y: 20, w: 100, h: 52, round: true, dashed: true },
      { kind: 'polyline', points: [[34, 46], [74, 46]] },
      { kind: 'polyline', points: [[66, 39], [74, 46], [66, 53]] },
    ],
  },
];

/** Label font size used for every inserted symbol (and in the previews). */
export const LABEL_FONT_SIZE = 14;

/** Vertical gap between the symbol box and its label. */
export const LABEL_GAP = 6;

export function findSymbol(id: string): PaletteSymbol | undefined {
  return PALETTE_SYMBOLS.find((symbol) => symbol.id === id);
}

/**
 * Case-insensitive search over the label and aliases. An empty query returns everything, so the
 * panel shows the full catalogue by default.
 */
export function searchSymbols(query: string): PaletteSymbol[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return PALETTE_SYMBOLS;
  return PALETTE_SYMBOLS.filter((symbol) => {
    if (symbol.label.toLowerCase().includes(needle)) return true;
    if (symbol.role.includes(needle)) return true;
    return symbol.aliases.some((alias) => alias.includes(needle));
  });
}

/** Symbols grouped by role, in catalogue order, for the panel's sections. */
export function symbolsByRole(symbols: PaletteSymbol[]): { role: PaletteRole; title: string; symbols: PaletteSymbol[] }[] {
  const roles: PaletteRole[] = ['people', 'compute', 'data', 'network'];
  return roles
    .map((role) => ({
      role,
      title: ROLE_LABELS[role],
      symbols: symbols.filter((symbol) => symbol.role === role),
    }))
    .filter((group) => group.symbols.length > 0);
}

/** Rough text width used to centre a label before the engine measures it. */
export function estimateLabelWidth(text: string, fontSize = LABEL_FONT_SIZE): number {
  return Math.ceil(text.length * fontSize * 0.58) + 6;
}
