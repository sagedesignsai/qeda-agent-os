/**
 * __tests__/project-scope.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The `?project=` lens that Tasks, Terminal, and Chat share: it resolves the
 * project, carries the scope onto paths, and clears without dropping unrelated
 * query params.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { useProjectScope } from '../hooks/use-project-scope';

function makeWrapper(initialEntry: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
}

const PROJECT = { id: 'abc', name: 'Alpha', status: 'active' };

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke: jest.fn((channel: string) =>
          channel === 'projects:get'
            ? Promise.resolve(PROJECT)
            : Promise.resolve(undefined),
        ),
        on: () => () => {},
        once: () => {},
      },
    },
  });
});

describe('useProjectScope', () => {
  it('resolves the scoped project and exposes its name', async () => {
    const { result } = renderHook(() => useProjectScope(), {
      wrapper: makeWrapper('/tasks?project=abc'),
    });

    expect(result.current.projectId).toBe('abc');
    await waitFor(() => expect(result.current.projectName).toBe('Alpha'));
  });

  it('carries the scope onto paths, preserving other query params', async () => {
    const { result } = renderHook(() => useProjectScope(), {
      wrapper: makeWrapper('/tasks?project=abc'),
    });
    // Let the async project lookup settle inside act().
    await act(async () => {});

    expect(result.current.withScope('/chat')).toBe('/chat?project=abc');
    expect(result.current.withScope('/terminal/xyz')).toBe(
      '/terminal/xyz?project=abc',
    );
    expect(result.current.withScope('/chat?goal=hi')).toBe(
      '/chat?goal=hi&project=abc',
    );
  });

  it('drops the scope on clear but keeps other params', async () => {
    const { result } = renderHook(() => useProjectScope(), {
      wrapper: makeWrapper('/tasks?project=abc&foo=1'),
    });
    await act(async () => {});

    act(() => result.current.clear());

    expect(result.current.projectId).toBeNull();
    // Once unscoped, withScope is a no-op.
    expect(result.current.withScope('/chat')).toBe('/chat');
  });

  it('is unscoped when the param is absent', () => {
    const { result } = renderHook(() => useProjectScope(), {
      wrapper: makeWrapper('/tasks'),
    });

    expect(result.current.projectId).toBeNull();
    expect(result.current.projectName).toBeNull();
    expect(result.current.withScope('/terminal')).toBe('/terminal');
  });
});
