import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; fallbackTitle?: string; onReset?: () => void };
type State = { error: Error | null };

/**
 * Last line of defence: a render error in a panel must never take the canvas
 * (and the user's unsaved work) down with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured, content-free log — never include document data or credentials.
    console.error('[sketchpilot] render error', { name: error.name, message: error.message, component: info.componentStack?.slice(0, 200) });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <p className="font-semibold">{this.props.fallbackTitle ?? 'Something went wrong in this panel'}</p>
        <p className="mt-1 opacity-90">
          Your drawing is still open and has been saved locally. Try reloading this panel.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Reload panel
        </button>
      </div>
    );
  }
}
