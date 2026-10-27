import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only controls must always expose an accessible name. */
  label: string;
  active?: boolean;
};

/**
 * Icon-only control. `label` is used for both the tooltip (title) and the
 * accessible name, which keeps every icon discoverable to sighted and
 * screen-reader users alike.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active = false, className = '', type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={props['aria-pressed'] ?? undefined}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-pilot-100 text-pilot-700 dark:bg-pilot-900/50 dark:text-pilot-200'
          : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
