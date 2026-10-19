/**
 * __tests__/builder-project-scope.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Builder is the only agent surface that binds its own directory, so the
 * project link is deliberately one-way: the project supplies a *suggestion*
 * (its `repo_path` as the folder picker's `defaultPath`) and the user's pick in
 * the OS dialog remains the only thing that can actually bind a session.
 *
 * These tests pin both halves of that contract:
 *   1. `useBuilderSession.chooseWorkspace` forwards a path as `defaultPath` —
 *      and ignores a non-string first argument, because the Builder chrome
 *      passes the callback straight to `onClick`.
 *   2. The Builder page reads `?project=`, shows it, and resolves `repo_path`
 *      into that picker default.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useBuilderSession } from '@/hooks/use-builder-session';
import Builder from '@/renderer/pages/Builder';

// The page test swaps in a fake session hook; `chooseWorkspace`'s own contract
// is exercised below through the real implementation.
jest.mock('@/hooks/use-builder-session', () => ({
  ...jest.requireActual('@/hooks/use-builder-session'),
  useBuilderSession: jest.fn(),
}));

jest.mock('@/hooks/use-builder-runtime', () => ({
  useBuilderRuntime: () => ({
    status: {
      state: 'connected' as const,
      version: '2.0.24',
      message: 'Reachable.',
    },
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-builder-workspace', () => ({
  useBuilderWorkspace: () => ({
    surface: 'preview' as const,
    viewport: 'desktop' as const,
    setSurface: jest.fn(),
    setViewport: jest.fn(),
    previewUrl: '',
    setPreviewUrl: jest.fn(),
    prompt: '',
    setPrompt: jest.fn(),
    selectedFilePath: '',
    setSelectedFilePath: jest.fn(),
  }),
}));

const mockedUseBuilderSession = useBuilderSession as unknown as jest.Mock;

// jsdom implements neither :fullscreen, :modal nor :popover-open, and nwsapi's
// probe for them recurses through jsdom's own `matches` until the stack
// overflows (~80s per probe). Floating UI asks for them as soon as a popper
// opens, so short-circuit to the correct jsdom answer up front.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function matches(this: Element, selector: string) {
  if (
    selector === ':fullscreen' ||
    selector === ':modal' ||
    selector === ':popover-open'
  ) {
    return false;
  }
  return nativeMatches.call(this, selector);
} as typeof Element.prototype.matches;

const PROJECT = {
  id: 'proj-1',
  name: 'Vellum Core',
  description: '',
  status: 'active' as const,
  color: 'blue',
  icon: 'folder',
  deadline: null,
  repo_path: '/repo/vellum',
  notebook_id: null,
  sort_order: 1,
  created_at: 1,
  updated_at: 1,
};

/**
 * Install an IPC bridge that answers the handful of channels these tests touch.
 * `overrides` lets a test reshape `projects:get` or cancel the folder picker.
 */
function installIpc(overrides: Record<string, unknown> = {}) {
  const invoke = jest.fn((channel: string) => {
    if (channel in overrides) return Promise.resolve(overrides[channel]);
    if (channel === 'projects:get') return Promise.resolve(PROJECT);
    if (channel === 'builder:session-state') {
      return Promise.resolve({ session: null, workspace: null, events: [] });
    }
    return Promise.resolve(null);
  });
  window.electron = {
    ipc: { invoke, on: jest.fn(() => () => {}) },
  } as unknown as typeof window.electron;
  return invoke;
}

function makeSessionApi() {
  return {
    session: null,
    workspace: null,
    events: [],
    creating: false,
    sending: false,
    running: false,
    error: null,
    pendingResponse: null,
    chooseWorkspace: jest.fn(),
    createSession: jest.fn(),
    stopSession: jest.fn(),
    sendPrompt: jest.fn(),
    abort: jest.fn(),
    replyPermission: jest.fn(),
    replyForm: jest.fn(),
  };
}

describe('useBuilderSession.chooseWorkspace', () => {
  const { useBuilderSession: useRealBuilderSession } = jest.requireActual<
    typeof import('@/hooks/use-builder-session')
  >('@/hooks/use-builder-session');

  it('passes a path through as the picker default and binds the picked folder', async () => {
    const invoke = installIpc({
      'dialog:open-directory': '/repo/vellum',
      'builder:session-create': {
        session: { id: 'ses_1', title: 'Builder · vellum', createdAt: 1 },
        workspace: {
          directory: '/repo/vellum',
          name: 'vellum',
          branch: 'main',
          dirty: false,
          changedFileCount: 0,
        },
      },
    });

    const { result } = renderHook(() => useRealBuilderSession());
    await act(async () => {
      await result.current.chooseWorkspace('/repo/vellum');
    });

    expect(invoke).toHaveBeenCalledWith('dialog:open-directory', {
      title: 'Choose a project folder',
      defaultPath: '/repo/vellum',
    });
    // The suggestion is only a default: the directory actually bound is the one
    // the picker returned.
    expect(invoke).toHaveBeenCalledWith('builder:session-create', {
      directory: '/repo/vellum',
    });
  });

  it('omits the default when called as a bare click handler', async () => {
    const invoke = installIpc();

    const { result } = renderHook(() => useRealBuilderSession());
    await act(async () => {
      // The Builder chrome wires this to `onClick`, so a synthetic event — not a
      // path — is the realistic argument.
      await result.current.chooseWorkspace({
        type: 'click',
      } as unknown as string);
    });

    expect(invoke).toHaveBeenCalledWith('dialog:open-directory', {
      title: 'Choose a project folder',
    });
  });

  it('does not bind a session when the picker is cancelled', async () => {
    const invoke = installIpc({ 'dialog:open-directory': null });

    const { result } = renderHook(() => useRealBuilderSession());
    let bound: unknown;
    await act(async () => {
      bound = await result.current.chooseWorkspace('/repo/vellum');
    });

    expect(bound).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      'builder:session-create',
      expect.anything(),
    );
  });
});

describe('Builder project scope', () => {
  let sessionApi: ReturnType<typeof makeSessionApi>;

  beforeEach(() => {
    sessionApi = makeSessionApi();
    mockedUseBuilderSession.mockReturnValue(sessionApi);
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }) as unknown as typeof window.matchMedia;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
    window.HTMLElement.prototype.releasePointerCapture = jest.fn();
    window.HTMLElement.prototype.setPointerCapture = jest.fn();
  });

  function renderBuilder(entry = '/builder?project=proj-1') {
    return render(
      // `PageHeader` renders a `SidebarTrigger`, so the page needs the provider.
      <SidebarProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/builder" element={<Builder />} />
          </Routes>
        </MemoryRouter>
      </SidebarProvider>,
    );
  }

  it('shows the scoped project and binds its repo_path from the codebase menu', async () => {
    installIpc();
    renderBuilder();

    // The chip and the breadcrumb both carry the name.
    expect((await screen.findAllByText('Vellum Core')).length).toBeGreaterThan(
      0,
    );

    // The composer's codebase trigger suggests the project repo; choosing that
    // menu entry is what actually binds it.
    fireEvent.keyDown(
      screen.getByTitle('Pick the codebase Builder should build in'),
      { key: 'Enter' },
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /^Vellum Core/ }),
    );
    expect(sessionApi.chooseWorkspace).toHaveBeenCalledWith('/repo/vellum');
  });

  it('passes no default when the active project has no repo_path', async () => {
    installIpc({ 'projects:get': { ...PROJECT, repo_path: null } });
    renderBuilder();

    fireEvent.keyDown(
      screen.getByTitle('Pick the codebase Builder should build in'),
      { key: 'Enter' },
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Choose a folder/ }),
    );
    // `null` means "no default of your own" — the page maps it to `undefined`
    // rather than letting the project repo become the fallback.
    expect(sessionApi.chooseWorkspace).toHaveBeenCalledWith(undefined);
  });

  it('shows no scope chip when nothing is scoped', async () => {
    installIpc();
    renderBuilder('/builder');

    expect(screen.queryByText('Vellum Core')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Clear project filter')).not.toBeInTheDocument();

    // Drain the scope hook's async load so it cannot leak an act() warning.
    await act(async () => {});
  });
});
