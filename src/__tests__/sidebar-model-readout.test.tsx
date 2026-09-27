/**
 * __tests__/sidebar-model-readout.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test: the sidebar footer's provider/model readout went stale after
 * a model change.
 *
 * The readout used to fetch `settings:get` once on mount and never again. The
 * Settings dialog mounts *after* the sidebar and saves without touching sidebar
 * state, so the label only corrected itself on a remount (i.e. an app restart).
 * The fix is a `settings:changed` broadcast from main on every `settings:save`;
 * this pins the renderer half of that contract.
 *
 * If someone reverts to a one-shot fetch, this test fails.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** Mutable stand-in for the settings file on disk. */
let currentSettings = { activeProvider: 'groq', activeModel: 'old-model' };

/** Listeners registered through `ipc.on`, keyed by channel. */
const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

const invoke = jest.fn((channel: string) => {
  switch (channel) {
    case 'settings:get':
      return Promise.resolve({ ...currentSettings });
    case 'projects:rollups':
      return Promise.resolve([]);
    case 'sessions:list':
      return Promise.resolve([]);
    default:
      return Promise.resolve(undefined);
  }
});

beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke,
        on: (channel: string, listener: (...args: unknown[]) => void) => {
          const existing = listeners.get(channel) ?? [];
          existing.push(listener);
          listeners.set(channel, existing);
          return () => {
            listeners.set(
              channel,
              (listeners.get(channel) ?? []).filter((l) => l !== listener),
            );
          };
        },
        once: () => {},
      },
    },
  });

  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
});

beforeEach(() => {
  currentSettings = { activeProvider: 'groq', activeModel: 'old-model' };
  listeners.clear();
  invoke.mockClear();
});

/** Simulate main broadcasting `settings:changed` after a `settings:save`. */
function broadcastSettingsChanged() {
  for (const listener of listeners.get('settings:changed') ?? []) listener();
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar onOpenCommandPalette={jest.fn()} onOpenSettings={jest.fn()} />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const TEST_TIMEOUT = 20_000;

describe('AppSidebar model readout', () => {
  it('subscribes to settings:changed so a model change is picked up', async () => {
    renderSidebar();

    // Initial read.
    expect(await screen.findByText('old-model')).toBeInTheDocument();
    expect(listeners.get('settings:changed')).toHaveLength(1);

    // The user switches model in Settings; main saves and broadcasts.
    currentSettings = { activeProvider: 'openrouter', activeModel: 'new-model' };
    broadcastSettingsChanged();

    await waitFor(() => {
      expect(screen.getByText('new-model')).toBeInTheDocument();
    });
    expect(screen.queryByText('old-model')).not.toBeInTheDocument();
    // The provider half of the readout refreshes too. The span renders the
    // provider plus a literal colon, so match the full string.
    expect(screen.getByText('openrouter:')).toBeInTheDocument();
  }, TEST_TIMEOUT);
});
