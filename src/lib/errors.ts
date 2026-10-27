/**
 * Errors are values across module boundaries: nothing in storage/, export/ or ai/
 * throws for an expected failure, so the UI can always render an actionable message.
 */

export type AppErrorCode =
  | 'storage-unavailable'
  | 'storage-quota-exceeded'
  | 'storage-write-failed'
  | 'drawing-not-found'
  | 'invalid-import'
  | 'unsupported-version'
  | 'export-failed'
  | 'capture-blocked'
  | 'capture-failed'
  | 'selection-empty'
  | 'unknown';

export type AppError = {
  code: AppErrorCode;
  /** Safe for humans. Never contains credentials or document content. */
  message: string;
  /** What the user can do next. Present for every user-visible error. */
  hint?: string;
  cause?: unknown;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });

export const err = <T,>(error: AppError): Result<T> => ({ ok: false, error });

export function appError(
  code: AppErrorCode,
  message: string,
  hint?: string,
  cause?: unknown,
): AppError {
  return { code, message, hint, cause };
}

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Maps a thrown storage error to a user-facing AppError. */
export function toStorageError(error: unknown): AppError {
  if (isQuotaExceeded(error)) {
    return appError(
      'storage-quota-exceeded',
      'Local storage is full, so this change was not saved.',
      'Export the drawing as JSON to keep a copy, then delete drawings you no longer need.',
      error,
    );
  }
  const message = error instanceof Error ? error.message : 'Unknown storage error';
  return appError(
    'storage-write-failed',
    `Could not save to local storage (${message}).`,
    'Check that the extension has storage access, then retry. Your work is still open in the editor.',
    error,
  );
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
