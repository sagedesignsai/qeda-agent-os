/**
 * __tests__/builder-changes-hook.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The review loop's renderer half: the change list loads for an attached
 * session, refreshes when a tool finishes, and refreshes again after Keep so
 * the panel cannot show a stale diff that was just applied.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useBuilderChanges } from '@/hooks/use-builder-changes';
import type { BuilderSessionEvent } from '@/lib/builder-session';
import type { BuilderFileChange } from '@/lib/builder-workspace';

const CHANGES: BuilderFileChange[] = [
  {
    path: 'src/app.ts',
    kind: 'modified',
    additions: 1,
    deletions: 1,
    diff: '--- a/src/app.ts\n+++ b/src/app.ts\n',
  },
];

function installIpc() {
  const invoke = jest.fn((channel: string) => {
    if (channel === 'builder:workspace-changes') {
      return Promise.resolve(CHANGES);
    }
    if (channel === 'builder:changes-keep') {
      return Promise.resolve({ paths: ['src/app.ts'] });
    }
    if (channel === 'builder:changes-discard') return Promise.resolve(null);
    return Promise.resolve(null);
  });
  window.electron = {
    ipc: { invoke, on: jest.fn(() => () => {}) },
  } as unknown as typeof window.electron;
  return invoke;
}

function completedToolEvent(eventId: string): BuilderSessionEvent {
  return {
    sessionId: 'ses_1',
    eventId,
    createdAt: 1,
    type: 'tool-completed',
    callId: 'call-1',
    output: 'done',
  };
}

describe('useBuilderChanges', () => {
  it('loads the worktree diff, refreshes after a tool, and refreshes after Keep', async () => {
    const invoke = installIpc();
    const { result, rerender } = renderHook(
      ({ events }: { events: BuilderSessionEvent[] }) =>
        useBuilderChanges('ses_1', events),
      { initialProps: { events: [] as BuilderSessionEvent[] } },
    );

    await waitFor(() => expect(result.current.changes).toEqual(CHANGES));
    const initialCalls = invoke.mock.calls.filter(
      ([channel]) => channel === 'builder:workspace-changes',
    ).length;
    expect(initialCalls).toBe(1);

    rerender({ events: [completedToolEvent('ev-1')] });
    await waitFor(() => {
      const calls = invoke.mock.calls.filter(
        ([channel]) => channel === 'builder:workspace-changes',
      ).length;
      expect(calls).toBeGreaterThan(initialCalls);
    });

    const beforeKeep = invoke.mock.calls.filter(
      ([channel]) => channel === 'builder:workspace-changes',
    ).length;
    await act(async () => {
      await result.current.keep();
    });
    expect(invoke).toHaveBeenCalledWith('builder:changes-keep');
    await waitFor(() => {
      const calls = invoke.mock.calls.filter(
        ([channel]) => channel === 'builder:workspace-changes',
      ).length;
      expect(calls).toBeGreaterThan(beforeKeep);
    });
    expect(result.current.keeping).toBe(false);
  });

  it('clears the list when the session detaches', async () => {
    installIpc();
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string | undefined }) =>
        useBuilderChanges(sessionId, []),
      { initialProps: { sessionId: 'ses_1' as string | undefined } },
    );

    await waitFor(() => expect(result.current.changes).toEqual(CHANGES));
    rerender({ sessionId: undefined });
    await waitFor(() => expect(result.current.changes).toEqual([]));
  });
});
