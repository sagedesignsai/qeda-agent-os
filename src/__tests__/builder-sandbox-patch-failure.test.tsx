/**
 * __tests__/builder-sandbox-patch-failure.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A sandbox patch is the only copy of the agent's work once the sandbox is
 * destroyed. This pins that main's `builder:sandbox-patch-failed` event reaches
 * the user with the preserved patch path, rather than being swallowed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { useBuilderSandboxPatchFailureToast } from '@/hooks/use-builder-sandbox-patch-failure';

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

describe('useBuilderSandboxPatchFailureToast', () => {
  let listener: ((...args: unknown[]) => void) | undefined;
  const on = jest.fn(
    (channel: string, callback: (...args: unknown[]) => void) => {
      if (channel === 'builder:sandbox-patch-failed') listener = callback;
      return () => undefined;
    },
  );

  beforeEach(() => {
    listener = undefined;
    on.mockClear();
    (toast.error as jest.Mock).mockClear();
    window.electron = {
      ipc: { invoke: jest.fn(), on },
    } as unknown as typeof window.electron;
  });

  afterEach(() => {
    delete (window as { electron?: unknown }).electron;
  });

  it('shows the error and the saved patch path', () => {
    renderHook(() => useBuilderSandboxPatchFailureToast());

    expect(on).toHaveBeenCalledWith(
      'builder:sandbox-patch-failed',
      expect.any(Function),
    );
    expect(listener).toBeDefined();

    listener?.({
      error: 'patch does not apply',
      savedPath: '/tmp/qeda/builder-patches/failed-1.patch',
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Sandbox changes could not be applied',
      expect.objectContaining({
        description: expect.stringContaining(
          '/tmp/qeda/builder-patches/failed-1.patch',
        ),
      }),
    );
  });
});
