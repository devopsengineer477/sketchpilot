import { GRID, chain, columnX, rowY } from './dsl';
import { PALETTE, type BuiltinTemplate, type TemplateSpec } from './types';

/**
 * The twelve starting points promised in the spec. Each one is authored from the
 * shared grid so layouts stay legible, and every element is a normal editable
 * element once instantiated.
 */

const { nodeWidth: W, nodeHeight: H } = GRID;

function node(
  id: string,
  label: string,
  x: number,
  y: number,
  options: { fill?: string; shape?: 'rectangle' | 'ellipse' | 'diamond'; emphasis?: boolean; width?: number; height?: number } = {},
) {
  return {
    id,
    label,
    x,
    y,
    width: options.width ?? W,
    height: options.height ?? H,
    fill: options.fill ?? PALETTE.blue,
    shape: options.shape ?? ('rectangle' as const),
    emphasis: options.emphasis,
  };
}

// 1 ─ Simple flowchart with a branch and a loop back.
const simpleFlowchart: TemplateSpec = {
  nodes: [
    node('sfc-start', 'Start', columnX(0), rowY(1), { fill: PALETTE.green, shape: 'ellipse', emphasis: true }),
    node('sfc-input', 'Collect request', columnX(1), rowY(1)),
    node('sfc-check', 'Valid?', columnX(2), rowY(1), { fill: PALETTE.amber, shape: 'diamond', width: 180, height: 110 }),
    node('sfc-fix', 'Ask for details', columnX(2), rowY(2), { fill: PALETTE.red }),
    node('sfc-done', 'Confirm', columnX(3), rowY(1), { fill: PALETTE.green, shape: 'ellipse' }),
  ],
  edges: [
    { id: 'sfc-e1', from: 'sfc-start', to: 'sfc-input' },
    { id: 'sfc-e2', from: 'sfc-input', to: 'sfc-check' },
    { id: 'sfc-e3', from: 'sfc-check', to: 'sfc-fix', label: 'No' },
    { id: 'sfc-e4', from: 'sfc-fix', to: 'sfc-input', label: 'retry', dashed: true },
    { id: 'sfc-e5', from: 'sfc-check', to: 'sfc-done', label: 'Yes' },
  ],
};

// 2 ─ Decision tree, two levels deep.
const decisionTree: TemplateSpec = {
  nodes: [
    node('dt-root', 'Which channel?', columnX(1), rowY(0), { fill: PALETTE.amber, shape: 'diamond', width: 190, height: 110 }),
    node('dt-web', 'Web app', columnX(0), rowY(1.6), { fill: PALETTE.blue }),
    node('dt-mobile', 'Mobile app', columnX(2.2), rowY(1.6), { fill: PALETTE.blue }),
    node('dt-web-a', 'Responsive', columnX(-0.6), rowY(3.1), { fill: PALETTE.grey }),
    node('dt-web-b', 'Keyboard-first', columnX(0.8), rowY(3.1), { fill: PALETTE.grey }),
    node('dt-mob-a', 'Offline first', columnX(2), rowY(3.1), { fill: PALETTE.grey }),
    node('dt-mob-b', 'Push alerts', columnX(3.4), rowY(3.1), { fill: PALETTE.grey }),
  ],
  edges: [
    { id: 'dt-e1', from: 'dt-root', to: 'dt-web' },
    { id: 'dt-e2', from: 'dt-root', to: 'dt-mobile' },
    { id: 'dt-e3', from: 'dt-web', to: 'dt-web-a' },
    { id: 'dt-e4', from: 'dt-web', to: 'dt-web-b' },
    { id: 'dt-e5', from: 'dt-mobile', to: 'dt-mob-a' },
    { id: 'dt-e6', from: 'dt-mobile', to: 'dt-mob-b' },
  ],
};

// 3 ─ Mind map: a centre and six branches.
const mindMap: TemplateSpec = {
  nodes: [
    node('mm-centre', 'Topic', columnX(1.6), rowY(1.6), { fill: PALETTE.violet, shape: 'ellipse', width: 200, height: 130, emphasis: true }),
    node('mm-1', 'What is it?', columnX(0), rowY(0), { fill: PALETTE.blue, width: 150 }),
    node('mm-2', 'Why it matters', columnX(3.4), rowY(0), { fill: PALETTE.blue, width: 150 }),
    node('mm-3', 'Key examples', columnX(0), rowY(1.7), { fill: PALETTE.green, width: 150 }),
    node('mm-4', 'How to practise', columnX(3.4), rowY(1.7), { fill: PALETTE.green, width: 150 }),
    node('mm-5', 'Common mistakes', columnX(0), rowY(3.3), { fill: PALETTE.red, width: 150 }),
    node('mm-6', 'Next steps', columnX(3.4), rowY(3.3), { fill: PALETTE.amber, width: 150 }),
  ],
  edges: [
    { id: 'mm-e1', from: 'mm-centre', to: 'mm-1' },
    { id: 'mm-e2', from: 'mm-centre', to: 'mm-2' },
    { id: 'mm-e3', from: 'mm-centre', to: 'mm-3' },
    { id: 'mm-e4', from: 'mm-centre', to: 'mm-4' },
    { id: 'mm-e5', from: 'mm-centre', to: 'mm-5' },
    { id: 'mm-e6', from: 'mm-centre', to: 'mm-6' },
  ],
};

// 4 ─ Software architecture.
const softwareArchitecture: TemplateSpec = {
  nodes: [
    node('sa-client', 'Browser client', columnX(0), rowY(1.2), { fill: PALETTE.grey }),
    node('sa-gateway', 'API gateway', columnX(1), rowY(1.2), { fill: PALETTE.violet }),
    node('sa-auth', 'Auth service', columnX(1), rowY(0), { fill: PALETTE.amber, width: 140 }),
    node('sa-app', 'Core service', columnX(2), rowY(1.2), { fill: PALETTE.blue }),
    node('sa-queue', 'Job queue', columnX(2), rowY(2.4), { fill: PALETTE.amber, width: 140 }),
    node('sa-db', 'Primary database', columnX(3), rowY(1.2), { fill: PALETTE.green }),
    node('sa-cache', 'Cache', columnX(3), rowY(0), { fill: PALETTE.green, width: 140 }),
  ],
  edges: [
    { id: 'sa-e1', from: 'sa-client', to: 'sa-gateway', label: 'HTTPS' },
    { id: 'sa-e2', from: 'sa-gateway', to: 'sa-auth', label: 'verify' },
    { id: 'sa-e3', from: 'sa-gateway', to: 'sa-app' },
    { id: 'sa-e4', from: 'sa-app', to: 'sa-db', label: 'read / write' },
    { id: 'sa-e5', from: 'sa-app', to: 'sa-cache', label: 'hot reads', dashed: true },
    { id: 'sa-e6', from: 'sa-app', to: 'sa-queue', label: 'async work', dashed: true },
  ],
  notes: [
    {
      id: 'sa-note',
      x: columnX(0),
      y: rowY(2.8),
      width: 340,
      text: 'Replace the boxes with your own services — arrows keep their binding when you move nodes.',
      fontSize: 16,
    },
  ],
};

// 5 ─ CI/CD pipeline (the spec's own example, as a template).
const cicdPipeline: TemplateSpec = {
  nodes: [
    node('ci-dev', 'Developer push', columnX(0), rowY(0), { fill: PALETTE.grey }),
    node('ci-repo', 'GitHub repo', columnX(1), rowY(0), { fill: PALETTE.violet }),
    node('ci-actions', 'Build & test', columnX(2), rowY(0), { fill: PALETTE.blue, width: 180 }),
    node('ci-image', 'Docker image', columnX(3), rowY(0), { fill: PALETTE.amber }),
    node('ci-ecr', 'Amazon ECR', columnX(4), rowY(0), { fill: PALETTE.green }),
    node('ci-ecs', 'ECS Fargate', columnX(4), rowY(1.8), { fill: PALETTE.blue }),
    node('ci-rds', 'PostgreSQL RDS', columnX(5.1), rowY(1.8), { fill: PALETTE.green }),
    node('ci-rollback', 'Rollback', columnX(3), rowY(1.8), { fill: PALETTE.red }),
  ],
  edges: [
    { id: 'ci-e1', from: 'ci-dev', to: 'ci-repo' },
    { id: 'ci-e2', from: 'ci-repo', to: 'ci-actions' },
    { id: 'ci-e3', from: 'ci-actions', to: 'ci-image' },
    { id: 'ci-e4', from: 'ci-image', to: 'ci-ecr' },
    { id: 'ci-e5', from: 'ci-ecr', to: 'ci-ecs', label: 'deploy' },
    { id: 'ci-e6', from: 'ci-ecs', to: 'ci-rds', label: 'queries' },
    { id: 'ci-e7', from: 'ci-actions', to: 'ci-rollback', label: 'tests fail', dashed: true },
  ],
};

// 6 ─ AWS three-tier architecture.
const awsThreeTier: TemplateSpec = {
  nodes: [
    node('aws-user', 'Users', columnX(0), rowY(1.4), { fill: PALETTE.grey, shape: 'ellipse', width: 120 }),
    node('aws-alb', 'Load balancer', columnX(1), rowY(1.4), { fill: PALETTE.violet, width: 180 }),
    node('aws-web1', 'Web tier · AZ-a', columnX(2.2), rowY(0.6), { fill: PALETTE.blue, width: 160 }),
    node('aws-web2', 'Web tier · AZ-b', columnX(2.2), rowY(2.2), { fill: PALETTE.blue, width: 160 }),
    node('aws-app', 'App tier', columnX(3.6), rowY(1.4), { fill: PALETTE.amber }),
    node('aws-rds', 'RDS primary', columnX(4.8), rowY(0.6), { fill: PALETTE.green, width: 160 }),
    node('aws-rds2', 'RDS replica', columnX(4.8), rowY(2.2), { fill: PALETTE.green, width: 160 }),
    node('aws-s3', 'S3 assets', columnX(3.6), rowY(3), { fill: PALETTE.red, width: 140 }),
  ],
  edges: [
    { id: 'aws-e1', from: 'aws-user', to: 'aws-alb' },
    { id: 'aws-e2', from: 'aws-alb', to: 'aws-web1' },
    { id: 'aws-e3', from: 'aws-alb', to: 'aws-web2' },
    { id: 'aws-e4', from: 'aws-web1', to: 'aws-app' },
    { id: 'aws-e5', from: 'aws-web2', to: 'aws-app' },
    { id: 'aws-e6', from: 'aws-app', to: 'aws-rds' },
    { id: 'aws-e7', from: 'aws-rds', to: 'aws-rds2', label: 'replicates', dashed: true },
    { id: 'aws-e8', from: 'aws-app', to: 'aws-s3', label: 'uploads', dashed: true },
  ],
};

// 7 ─ API request lifecycle.
const apiLifecycle = chain(
  'api',
  [
    { label: 'Client request', fill: PALETTE.grey },
    { label: 'DNS lookup', fill: PALETTE.blue },
    { label: 'TLS handshake', fill: PALETTE.blue },
    { label: 'Gateway', fill: PALETTE.violet },
    { label: 'Authentication', fill: PALETTE.amber },
    { label: 'Handler + DB', fill: PALETTE.green },
    { label: 'Response (200)', fill: PALETTE.green, emphasis: true },
  ],
  { startY: rowY(0.4) },
);

// 8 ─ Test automation framework.
const testAutomation: TemplateSpec = {
  nodes: [
    node('ta-suite', 'Test suites', columnX(0), rowY(1), { fill: PALETTE.blue }),
    node('ta-runner', 'Runner', columnX(1), rowY(1), { fill: PALETTE.violet, width: 180 }),
    node('ta-fixtures', 'Fixtures', columnX(1), rowY(0), { fill: PALETTE.amber, width: 170 }),
    node('ta-pages', 'Page objects', columnX(2), rowY(1), { fill: PALETTE.blue }),
    node('ta-driver', 'Browser driver', columnX(3), rowY(1), { fill: PALETTE.grey }),
    node('ta-app', 'App under test', columnX(4), rowY(1), { fill: PALETTE.green, width: 180 }),
    node('ta-report', 'Reports', columnX(2), rowY(2.4), { fill: PALETTE.red, width: 160 }),
  ],
  edges: [
    { id: 'ta-e1', from: 'ta-suite', to: 'ta-runner' },
    { id: 'ta-e2', from: 'ta-fixtures', to: 'ta-runner', dashed: true },
    { id: 'ta-e3', from: 'ta-runner', to: 'ta-pages' },
    { id: 'ta-e4', from: 'ta-pages', to: 'ta-driver' },
    { id: 'ta-e5', from: 'ta-driver', to: 'ta-app' },
    { id: 'ta-e6', from: 'ta-runner', to: 'ta-report', label: 'results' },
  ],
};

// 9 ─ Incident response.
const incidentResponse: TemplateSpec = {
  nodes: [
    node('ir-detect', 'Detect alert', columnX(0), rowY(1), { fill: PALETTE.red, emphasis: true }),
    node('ir-triage', 'Triage', columnX(1), rowY(1), { fill: PALETTE.amber }),
    node('ir-mitigate', 'Mitigate', columnX(2), rowY(1), { fill: PALETTE.blue }),
    node('ir-communicate', 'Comms', columnX(2), rowY(0), { fill: PALETTE.violet, width: 150 }),
    node('ir-resolve', 'Resolve', columnX(3), rowY(1), { fill: PALETTE.green }),
    node('ir-post', 'Postmortem', columnX(4), rowY(1), { fill: PALETTE.violet, width: 150 }),
    node('ir-actions', 'Follow-ups', columnX(4), rowY(2.4), { fill: PALETTE.amber, width: 160 }),
  ],
  edges: [
    { id: 'ir-e1', from: 'ir-detect', to: 'ir-triage' },
    { id: 'ir-e2', from: 'ir-triage', to: 'ir-mitigate' },
    { id: 'ir-e3', from: 'ir-triage', to: 'ir-communicate', dashed: true },
    { id: 'ir-e4', from: 'ir-mitigate', to: 'ir-resolve' },
    { id: 'ir-e5', from: 'ir-resolve', to: 'ir-post' },
    { id: 'ir-e6', from: 'ir-post', to: 'ir-actions' },
    { id: 'ir-e7', from: 'ir-actions', to: 'ir-triage', label: 'prevents repeat', dashed: true },
  ],
};

// 10 ─ Project planning: phases with milestones.
const projectPlanning: TemplateSpec = {
  nodes: [
    node('pp-1', '1 · Discover', columnX(0), rowY(0), { fill: PALETTE.grey }),
    node('pp-2', '2 · Design', columnX(1), rowY(0), { fill: PALETTE.blue }),
    node('pp-3', '3 · Build', columnX(2), rowY(0), { fill: PALETTE.blue }),
    node('pp-4', '4 · Launch', columnX(3), rowY(0), { fill: PALETTE.green }),
    node('pp-m1', 'Scope agreed', columnX(0), rowY(1.5), { fill: PALETTE.amber, width: 190 }),
    node('pp-m2', 'Designs signed off', columnX(1), rowY(1.5), { fill: PALETTE.amber, width: 200 }),
    node('pp-m3', 'Beta live', columnX(2), rowY(1.5), { fill: PALETTE.amber, width: 210 }),
    node('pp-risk', 'Risks', columnX(3), rowY(1.5), { fill: PALETTE.red, width: 180 }),
  ],
  edges: [
    { id: 'pp-e1', from: 'pp-1', to: 'pp-2' },
    { id: 'pp-e2', from: 'pp-2', to: 'pp-3' },
    { id: 'pp-e3', from: 'pp-3', to: 'pp-4' },
    { id: 'pp-e4', from: 'pp-1', to: 'pp-m1', dashed: true },
    { id: 'pp-e5', from: 'pp-2', to: 'pp-m2', dashed: true },
    { id: 'pp-e6', from: 'pp-3', to: 'pp-m3', dashed: true },
    { id: 'pp-e7', from: 'pp-4', to: 'pp-risk', dashed: true },
  ],
};

// 11 ─ Daily task planning: a three-column board.
const dailyPlanning: TemplateSpec = {
  nodes: [
    node('dp-today', 'Today', columnX(0), rowY(0), { fill: PALETTE.blue, width: 220, height: 60, emphasis: true }),
    node('dp-doing', 'In progress', columnX(1.4), rowY(0), { fill: PALETTE.amber, width: 220, height: 60, emphasis: true }),
    node('dp-done', 'Done', columnX(2.8), rowY(0), { fill: PALETTE.green, width: 220, height: 60, emphasis: true }),
    node('dp-t1', 'Write the plan', columnX(0), rowY(1.1), { fill: PALETTE.grey, width: 220 }),
    node('dp-t2', 'Review yesterday', columnX(0), rowY(2.2), { fill: PALETTE.grey, width: 220 }),
    node('dp-t3', 'Deep work block', columnX(0), rowY(3.3), { fill: PALETTE.grey, width: 220 }),
    node('dp-d1', 'Draft the proposal', columnX(1.4), rowY(1.1), { fill: PALETTE.grey, width: 220 }),
    node('dp-x1', 'Clear inbox', columnX(2.8), rowY(1.1), { fill: PALETTE.grey, width: 220 }),
  ],
  edges: [
    { id: 'dp-e1', from: 'dp-t1', to: 'dp-d1' },
    { id: 'dp-e2', from: 'dp-d1', to: 'dp-x1' },
  ],
};

// 12 ─ Learning roadmap.
const learningRoadmap: TemplateSpec = {
  nodes: [
    node('lr-1', 'Fundamentals', columnX(0), rowY(1), { fill: PALETTE.blue, emphasis: true }),
    node('lr-2', 'Core concepts', columnX(1), rowY(1), { fill: PALETTE.blue }),
    node('lr-3', 'Practice', columnX(2), rowY(1), { fill: PALETTE.violet }),
    node('lr-4', 'Real depth', columnX(3), rowY(1), { fill: PALETTE.green }),
    node('lr-r1', 'Reading list', columnX(0), rowY(2.3), { fill: PALETTE.grey, width: 150 }),
    node('lr-r2', 'Exercises', columnX(1), rowY(2.3), { fill: PALETTE.grey, width: 150 }),
    node('lr-r3', 'Code review', columnX(2), rowY(2.3), { fill: PALETTE.grey, width: 150 }),
    node('lr-r4', 'Teach someone', columnX(3), rowY(2.3), { fill: PALETTE.amber, width: 150 }),
  ],
  edges: [
    { id: 'lr-e1', from: 'lr-1', to: 'lr-2' },
    { id: 'lr-e2', from: 'lr-2', to: 'lr-3' },
    { id: 'lr-e3', from: 'lr-3', to: 'lr-4' },
    { id: 'lr-e4', from: 'lr-1', to: 'lr-r1', dashed: true },
    { id: 'lr-e5', from: 'lr-2', to: 'lr-r2', dashed: true },
    { id: 'lr-e6', from: 'lr-3', to: 'lr-r3', dashed: true },
    { id: 'lr-e7', from: 'lr-4', to: 'lr-r4', dashed: true },
  ],
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-simple-flowchart',
    name: 'Simple flowchart',
    description: 'Start, one decision, a retry loop and a finish. The default starting point.',
    category: 'engineering',
    spec: simpleFlowchart,
  },
  {
    id: 'builtin-decision-tree',
    name: 'Decision tree',
    description: 'Two levels of branching, ready for your own criteria.',
    category: 'planning',
    spec: decisionTree,
  },
  {
    id: 'builtin-mind-map',
    name: 'Mind map',
    description: 'A centre idea with six branches for questions, examples and next steps.',
    category: 'learning',
    spec: mindMap,
  },
  {
    id: 'builtin-software-architecture',
    name: 'Software architecture',
    description: 'Client, gateway, auth, core service, queue, database and cache.',
    category: 'engineering',
    spec: softwareArchitecture,
  },
  {
    id: 'builtin-cicd',
    name: 'CI/CD pipeline',
    description: 'Push to GitHub, build with Actions, publish to ECR, deploy to ECS Fargate, RDS.',
    category: 'engineering',
    spec: cicdPipeline,
  },
  {
    id: 'builtin-aws-three-tier',
    name: 'AWS three-tier',
    description: 'Load balancer across two availability zones, app tier, RDS primary and replica.',
    category: 'engineering',
    spec: awsThreeTier,
  },
  {
    id: 'builtin-api-lifecycle',
    name: 'API request lifecycle',
    description: 'Seven hops from client request to response, for debugging or onboarding.',
    category: 'engineering',
    spec: apiLifecycle,
  },
  {
    id: 'builtin-test-automation',
    name: 'Test automation framework',
    description: 'Suites, runner, fixtures, page objects, driver, app under test, reporting.',
    category: 'engineering',
    spec: testAutomation,
  },
  {
    id: 'builtin-incident-response',
    name: 'Incident response',
    description: 'Detect, triage, mitigate, resolve, postmortem — with the loop back to triage.',
    category: 'planning',
    spec: incidentResponse,
  },
  {
    id: 'builtin-project-planning',
    name: 'Project planning',
    description: 'Four phases with their milestones and an open-questions lane.',
    category: 'planning',
    spec: projectPlanning,
  },
  {
    id: 'builtin-daily-planning',
    name: 'Daily task planning',
    description: 'A three-column board: today, in progress, done.',
    category: 'planning',
    spec: dailyPlanning,
  },
  {
    id: 'builtin-learning-roadmap',
    name: 'Learning roadmap',
    description: 'Four stages with a practice rail under each one.',
    category: 'learning',
    spec: learningRoadmap,
  },
];

export function findBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}
