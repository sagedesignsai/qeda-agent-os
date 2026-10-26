/**
 * hooks/use-opencode-setup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-side state for OpenCode installation detection and plugin
 * registration. Thin wrapper over the opencode:* IPC channels.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  OpenCodeDetection,
  RegistrationResult,
} from '@/main/ipc/channels';

export interface OpencodeSetupState {
  detection: OpenCodeDetection | null;
  detecting: boolean;
  registeredPlugins: string[];
  registering: boolean;
  error: string | null;
}

export function useOpencodeSetup() {
  const [state, setState] = useState<OpencodeSetupState>({
    detection: null,
    detecting: false,
    registeredPlugins: [],
    registering: false,
    error: null,
  });

  const detect = useCallback(async () => {
    setState((s) => ({ ...s, detecting: true, error: null }));
    try {
      const detection =
        await window.electron.ipc.invoke<OpenCodeDetection>('opencode:detect');
      const registeredPlugins = await window.electron.ipc.invoke<string[]>(
        'opencode:registered-plugins',
      );
      setState((s) => ({
        ...s,
        detection,
        registeredPlugins,
        detecting: false,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        detecting: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  const registerPlugin = useCallback(
    async (
      mode: 'bundled' | 'published',
      resourcePath?: string,
    ): Promise<RegistrationResult> => {
      setState((s) => ({ ...s, registering: true, error: null }));
      try {
        const result = await window.electron.ipc.invoke<RegistrationResult>(
          'opencode:register-plugin',
          { mode, resourcePath },
        );
        const registeredPlugins = await window.electron.ipc.invoke<string[]>(
          'opencode:registered-plugins',
        );
        setState((s) => ({ ...s, registeredPlugins, registering: false }));
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((s) => ({ ...s, registering: false, error: message }));
        return {
          ok: false,
          configPath: '',
          pluginEntry: '',
          added: false,
          message,
        };
      }
    },
    [],
  );

  const unregisterPlugin = useCallback(
    async (entry: string): Promise<RegistrationResult> => {
      setState((s) => ({ ...s, registering: true, error: null }));
      try {
        const result = await window.electron.ipc.invoke<RegistrationResult>(
          'opencode:unregister-plugin',
          { entry },
        );
        const registeredPlugins = await window.electron.ipc.invoke<string[]>(
          'opencode:registered-plugins',
        );
        setState((s) => ({ ...s, registeredPlugins, registering: false }));
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((s) => ({ ...s, registering: false, error: message }));
        return {
          ok: false,
          configPath: '',
          pluginEntry: entry,
          added: false,
          message,
        };
      }
    },
    [],
  );

  const openInstallPage = useCallback(async () => {
    await window.electron.ipc.invoke<void>('opencode:open-install-page');
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  return {
    ...state,
    detect,
    registerPlugin,
    unregisterPlugin,
    openInstallPage,
  };
}
