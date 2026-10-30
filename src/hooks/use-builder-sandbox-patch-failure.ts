/**
 * hooks/use-builder-sandbox-patch-failure.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Surfaces a failed sandbox patch round-trip as a toast.
 *
 * Sandbox sessions are ephemeral: once the sandbox is destroyed, the captured
 * patch is the only copy of the agent's work. Main preserves it under
 * `userData/builder-patches` and emits `builder:sandbox-patch-failed` with that
 * path, so this hook must make the failure loud instead of letting the work
 * disappear silently when the user stops or detaches.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

export function useBuilderSandboxPatchFailureToast(): void {
  useEffect(() => {
    return window.electron.ipc.on('builder:sandbox-patch-failed', (payload) => {
      const failure = (payload ?? {}) as {
        error?: string;
        savedPath?: string;
      };
      toast.error('Sandbox changes could not be applied', {
        description: `${failure.error ?? 'git apply failed'}${
          failure.savedPath
            ? ` The patch was saved to ${failure.savedPath}.`
            : ''
        }`,
        duration: 12_000,
      });
    });
  }, []);
}
