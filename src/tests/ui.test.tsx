import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveStatusBadge } from '../components/SaveStatusBadge';
import { Dialog } from '../components/Dialog';
import { IconButton } from '../components/IconButton';
import { ToastViewport } from '../components/Toast';
import { resolveTheme, applyTheme } from '../lib/theme';
import { formatBytes, formatRelative } from '../lib/format';
import { INITIAL_SAVE_STATE } from '../storage/autosave';

describe('SaveStatusBadge', () => {
  it('announces each save state to assistive tech', () => {
    const { rerender } = render(<SaveStatusBadge state={{ ...INITIAL_SAVE_STATE, status: 'saving' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving');

    rerender(<SaveStatusBadge state={{ ...INITIAL_SAVE_STATE, status: 'saved', lastSavedAt: Date.now() }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Saved/);

    rerender(
      <SaveStatusBadge
        state={{ ...INITIAL_SAVE_STATE, status: 'failed', errorMessage: 'Storage full', errorHint: 'Export your work' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Export your work');
  });

  it('renders nothing before the first change', () => {
    const { container } = render(<SaveStatusBadge state={INITIAL_SAVE_STATE} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('IconButton', () => {
  it('always exposes an accessible name and tooltip', () => {
    render(<IconButton label="Fit to content">x</IconButton>);
    const button = screen.getByRole('button', { name: 'Fit to content' });
    expect(button).toHaveAttribute('title', 'Fit to content');
  });
});

describe('Dialog', () => {
  it('closes on Escape and traps nothing behind a closed state', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open title="Delete this drawing?" onClose={onClose} footer={<button>Delete</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete this drawing?');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    rerender(
      <Dialog open={false} title="Delete this drawing?" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ToastViewport', () => {
  it('marks errors as alerts and shows the recovery hint', () => {
    render(
      <ToastViewport
        toasts={[{ id: 1, tone: 'error', message: 'Local storage is full', hint: 'Export as JSON' }]}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Local storage is full');
    expect(screen.getByRole('alert')).toHaveTextContent('Export as JSON');
  });
});

describe('theme', () => {
  it('resolves an explicit preference without consulting the OS', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(['light', 'dark']).toContain(resolveTheme('system'));
  });

  it('applies the resolved theme to the document root', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('formatting', () => {
  it('formats byte counts and relative timestamps readably', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatRelative(Date.now() - 5 * 60_000)).toBe('5 min ago');
  });
});
