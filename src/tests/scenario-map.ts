/**
 * The spec's §14 test matrix, as data (plan P5-T1).
 *
 * Every one of the eighteen required scenarios points at the *named* test that covers it —
 * not at a file, and never at "manual QA". `test-matrix.test.ts` fails if a reference goes
 * stale (a renamed or deleted test), which is what keeps this document honest as the code
 * changes.
 */

export type ScenarioReference =
  | { kind: 'unit'; file: string; title: string }
  | { kind: 'e2e'; file: string; title: string }
  | { kind: 'script'; file: string; marker: string };

export type Scenario = {
  id: number;
  requirement: string;
  references: ScenarioReference[];
  note?: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: 1,
    requirement: 'The extension installs and opens',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '1. the extension installs, registers a service worker and opens the editor' },
    ],
  },
  {
    id: 2,
    requirement: 'A new drawing can be created',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '2 + 3. a drawing can be created, shapes drawn, then undone and redone' },
      { kind: 'unit', file: 'src/tests/repository.test.ts', title: 'saves and reopens a drawing without losing element data' },
    ],
  },
  {
    id: 3,
    requirement: 'Shapes can be created and edited',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '2 + 3. a drawing can be created, shapes drawn, then undone and redone' },
      { kind: 'e2e', file: 'tests/e2e/milestone2.spec.ts', title: 'templates: using one creates an editable drawing with real elements' },
    ],
  },
  {
    id: 4,
    requirement: 'Undo and redo work',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '2 + 3. a drawing can be created, shapes drawn, then undone and redone' },
      { kind: 'e2e', file: 'tests/e2e/milestone3.spec.ts', title: '10 + 11. valid AI output previews, inserts as editable shapes, and undo restores' },
    ],
  },
  {
    id: 5,
    requirement: 'Drawings autosave and reopen correctly',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '5. drawings autosave and reopen after a reload' },
      { kind: 'unit', file: 'src/tests/autosave.test.ts', title: 'commits the newest revision and reports saved state' },
      { kind: 'unit', file: 'src/tests/reliability.test.ts', title: 'survives ten debounce cycles without losing or duplicating a write' },
    ],
  },
  {
    id: 6,
    requirement: 'Multiple drawings remain separate',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '6. multiple drawings stay separate' },
      { kind: 'unit', file: 'src/tests/repository.test.ts', title: 'keeps drawings separate' },
    ],
  },
  {
    id: 7,
    requirement: 'Import rejects invalid files safely',
    references: [
      { kind: 'e2e', file: 'tests/e2e/library.spec.ts', title: '7. importing an invalid file shows an error and creates nothing' },
      { kind: 'unit', file: 'src/tests/archive.test.ts', title: 'rejects a file that is not an archive' },
      { kind: 'unit', file: 'src/tests/archive.test.ts', title: 'rejects an archive containing a corrupt drawing, importing nothing' },
    ],
  },
  {
    id: 8,
    requirement: 'PNG and SVG exports work',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '8. PNG export produces a real image file' },
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '8b. SVG export produces sanitised vector output' },
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '8c. JSON export is a valid, re-importable document' },
    ],
  },
  {
    id: 9,
    requirement: 'AI output passes schema validation',
    references: [
      { kind: 'unit', file: 'src/tests/ai-validate.test.ts', title: 'accepts a well-formed diagram' },
      { kind: 'unit', file: 'src/tests/ai-validate.test.ts', title: 'never throws for adversarial payloads' },
    ],
  },
  {
    id: 10,
    requirement: 'Invalid AI responses do not corrupt drawings',
    references: [
      { kind: 'e2e', file: 'tests/e2e/milestone3.spec.ts', title: '10. an invalid AI payload is rejected instead of corrupting the drawing' },
      { kind: 'unit', file: 'src/tests/ai-validate.test.ts', title: 'fails cleanly, with an actionable message, on garbage' },
    ],
  },
  {
    id: 11,
    requirement: 'AI failure preserves existing content',
    references: [
      { kind: 'e2e', file: 'tests/e2e/milestone3.spec.ts', title: '11. a failed generation reports the problem and leaves the drawing byte-identical' },
      { kind: 'unit', file: 'src/tests/ai-provider.test.ts', title: 'returns an error, not a broken plan, when the model replies with prose' },
    ],
  },
  {
    id: 12,
    requirement: 'AI credentials can be configured and removed',
    references: [
      { kind: 'e2e', file: 'tests/e2e/milestone3.spec.ts', title: '12. AI settings can be configured, tested and removed' },
      { kind: 'unit', file: 'src/tests/ai-provider.test.ts', title: 'masks keys for display' },
    ],
  },
  {
    id: 13,
    requirement: 'Browser capture handles permission failures',
    references: [
      { kind: 'e2e', file: 'tests/e2e/milestone4.spec.ts', title: '13. a protected page is refused with honest copy, not a silent failure' },
      { kind: 'e2e', file: 'tests/e2e/milestone4.spec.ts', title: '13. capture without a grant explains what to do instead of hanging' },
      { kind: 'unit', file: 'src/tests/capture.test.ts', title: 'reports a denied permission as copy, not as a raw Chrome string' },
    ],
  },
  {
    id: 14,
    requirement: 'Storage errors produce actionable messages',
    references: [
      { kind: 'unit', file: 'src/tests/autosave.test.ts', title: 'surfaces a failed save and retries the pending revision' },
      { kind: 'unit', file: 'src/tests/reliability.test.ts', title: 'recovers cleanly from a failed save and reports it exactly once' },
    ],
  },
  {
    id: 15,
    requirement: 'Keyboard shortcuts do not interfere with text editing',
    references: [
      { kind: 'e2e', file: 'tests/e2e/milestone2.spec.ts', title: 'shortcuts: the sheet opens with "?" and never fires while renaming' },
      { kind: 'unit', file: 'src/tests/a11y-keyboard.test.ts', title: 'never lets a shortcut fire while text is being entered' },
    ],
  },
  {
    id: 16,
    requirement: 'Light and dark themes work',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '16. the theme toggle switches the editor between light and dark' },
      { kind: 'e2e', file: 'tests/e2e/milestone2.spec.ts', title: 'settings: theme choice applies immediately and persists' },
      { kind: 'unit', file: 'src/tests/a11y-contrast.test.ts', title: 'computes known ratios correctly (guards the maths itself)' },
      { kind: 'unit', file: 'src/tests/ui.test.tsx', title: 'applies the resolved theme to the document root' },
    ],
    note: 'Colour contrast for both themes is asserted numerically by the a11y suite.',
  },
  {
    id: 17,
    requirement: 'Core drawing features work offline after installation',
    references: [
      { kind: 'e2e', file: 'tests/e2e/extension.spec.ts', title: '17. no request ever leaves the extension while drawing and exporting' },
      { kind: 'e2e', file: 'tests/e2e/milestone5.spec.ts', title: '17. every surface loads with zero external requests' },
    ],
  },
  {
    id: 18,
    requirement: 'Chrome permissions match the documented requirements',
    references: [
      { kind: 'script', file: 'scripts/check-build.mjs', marker: 'permissions match PERMISSIONS.md' },
      { kind: 'unit', file: 'src/tests/permissions.test.ts', title: 'declares exactly the documented permissions' },
    ],
  },
];
