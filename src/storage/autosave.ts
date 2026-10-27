import type { Result } from '../lib/errors';
import type { DrawingDocument, DrawingMetadata } from './schemas';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export type SaveState = {
  status: SaveStatus;
  lastSavedAt: number | null;
  errorMessage: string | null;
  errorHint: string | null;
};

export const INITIAL_SAVE_STATE: SaveState = {
  status: 'idle',
  lastSavedAt: null,
  errorMessage: null,
  errorHint: null,
};

type SaveFn = (document: DrawingDocument) => Promise<Result<DrawingMetadata>>;

export type AutosaveOptions = {
  save: SaveFn;
  /** Quiet period after the last change before writing. */
  debounceMs?: number;
  /** Hard ceiling: a burst of continuous edits still commits at this interval. */
  maxWaitMs?: number;
  onStateChange?: (state: SaveState) => void;
};

/**
 * Debounced, serialised autosave.
 *
 * Guarantees:
 *  - at most one write is in flight at a time (no interleaved stale writes),
 *  - the newest document always wins (a change during a write re-schedules),
 *  - continuous editing still commits within `maxWaitMs`,
 *  - failures are surfaced as state, never thrown into React's render path.
 */
export class AutosaveController {
  private readonly save: SaveFn;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly onStateChange?: (state: SaveState) => void;

  private state: SaveState = { ...INITIAL_SAVE_STATE };
  private latest: DrawingDocument | null = null;
  private dirty = false;
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt: number | null = null;
  private disposed = false;

  constructor(options: AutosaveOptions) {
    this.save = options.save;
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 10_000;
    this.onStateChange = options.onStateChange;
  }

  getState(): SaveState {
    return this.state;
  }

  /** Records a new document revision and (re)arms the debounce. */
  schedule(document: DrawingDocument): void {
    if (this.disposed) return;
    this.latest = document;
    this.dirty = true;
    const now = Date.now();
    this.firstDirtyAt ??= now;
    this.setState({ status: this.inFlight ? 'saving' : 'pending', errorMessage: null, errorHint: null });
    this.arm();
  }

  /** Forces an immediate write of the pending revision (unload, manual save, navigation). */
  async flush(): Promise<void> {
    this.clearTimer();
    if (!this.dirty || !this.latest) return;
    await this.runSave();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private arm(): void {
    this.clearTimer();
    const elapsed = this.firstDirtyAt === null ? 0 : Date.now() - this.firstDirtyAt;
    const remaining = Math.max(0, Math.min(this.debounceMs, this.maxWaitMs - elapsed));
    this.timer = setTimeout(() => {
      void this.runSave();
    }, remaining);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async runSave(): Promise<void> {
    if (this.inFlight || !this.dirty || !this.latest || this.disposed) return;
    this.inFlight = true;
    this.dirty = false;
    this.firstDirtyAt = null;
    const snapshot = this.latest;
    this.setState({ status: 'saving', errorMessage: null, errorHint: null });

    const result = await this.save(snapshot);
    this.inFlight = false;

    if (!result.ok) {
      this.setState({
        status: 'failed',
        errorMessage: result.error.message,
        errorHint: result.error.hint ?? null,
      });
      // Keep the revision pending so a later change or retry can still commit it.
      this.dirty = true;
      this.firstDirtyAt = Date.now();
      if (!this.disposed) this.arm();
      return;
    }

    this.setState({ status: 'saved', lastSavedAt: Date.now(), errorMessage: null, errorHint: null });
    if (this.dirty) this.arm();
  }

  private setState(patch: Partial<SaveState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange?.(this.state);
  }
}
