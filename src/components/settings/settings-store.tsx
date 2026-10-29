/**
 * components/settings/settings-store.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared state for the multiview Settings dialog.
 *
 * Why this exists: the dialog loads `settings:get` exactly once per open and
 * hands the result to every section. Without it, each section would refetch on
 * mount — so tabbing away from a half-typed API key and back would silently
 * discard it.
 *
 * Sections save independently. `settings:save` merges the incoming patch over
 * the stored settings rather than replacing them (see ipc/handlers.ts), so a
 * section can send only the fields it edits without clobbering provider keys,
 * service keys, or the embedding setup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { BuilderEngine, McpServerSettings } from '@/main/ipc/channels';
import { DEFAULT_BUILDER_MAX_STEPS } from '@/lib/builder-engine';

/** The subset of `settings:get` the sections actually read. */
export interface SettingsSnapshot {
  activeProvider: string;
  activeModel: string;
  fallbackEnabled: boolean;
  /** RAG embedding endpoint + model; empty means "fall back to the environment". */
  embeddingProvider: string;
  embeddingModel: string;
  /** Which agent runtime powers Builder coding turns. */
  builderEngine: BuilderEngine;
  /** Maximum model/tool steps in one Local Builder turn. */
  builderMaxSteps: number;
  /**
   * Configured MCP server list (env/headers stripped of secret values;
   * use hasEnv/hasHeaders booleans as presence indicators).
   */
  mcpServers: Array<
    Omit<McpServerSettings, 'env' | 'headers'> & {
      hasEnv: boolean;
      hasHeaders: boolean;
    }
  >;
  /**
   * E2B sandbox session timeout in ms. Defaults to 3_600_000 (1 hour).
   * Only meaningful when the Builder engine is OpenCode and the user opts
   * into running a session inside a remote E2B sandbox.
   */
  e2bSandboxTimeoutMs: number;
  /**
   * Whether an encrypted GitHub PAT is stored for cloning private repos
   * into the E2B sandbox. The value itself never leaves the main process.
   */
  githubPatSet: boolean;
}

const EMPTY: SettingsSnapshot = {
  activeProvider: '',
  activeModel: '',
  fallbackEnabled: true,
  embeddingProvider: '',
  embeddingModel: '',
  builderEngine: 'local',
  builderMaxSteps: DEFAULT_BUILDER_MAX_STEPS,
  mcpServers: [],
  e2bSandboxTimeoutMs: 3_600_000,
  githubPatSet: false,
};

interface SettingsStoreValue {
  /** Null until the first `settings:get` resolves. */
  snapshot: SettingsSnapshot | null;
  saving: boolean;
  /** Merge `patch` into the stored settings. Throws so callers can toast. */
  save: (patch: Record<string, unknown>) => Promise<void>;
}

const SettingsStoreContext = createContext<SettingsStoreValue | null>(null);

export function SettingsStoreProvider({
  active,
  children,
}: {
  /** While true, (re)load the snapshot — pass the dialog's `open` flag. */
  active: boolean;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!active) {
      // Drop the previous open's state so a reopened dialog never shows a
      // half-stale snapshot while the new one is in flight.
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    window.electron.ipc
      .invoke<Partial<SettingsSnapshot>>('settings:get')
      .then((s) => {
        if (cancelled) return undefined;
        setSnapshot({
          ...EMPTY,
          ...s,
          fallbackEnabled: s.fallbackEnabled !== false,
        });
        return undefined;
      })
      .catch((err) => {
        console.error('settings:get failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await window.electron.ipc.invoke('settings:save', patch);
      setSnapshot((prev) =>
        prev ? { ...prev, ...(patch as Partial<SettingsSnapshot>) } : prev,
      );
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <SettingsStoreContext.Provider value={{ snapshot, saving, save }}>
      {children}
    </SettingsStoreContext.Provider>
  );
}

export function useSettingsStore(): SettingsStoreValue {
  const ctx = useContext(SettingsStoreContext);
  if (!ctx) {
    throw new Error(
      'useSettingsStore must be used within a SettingsStoreProvider.',
    );
  }
  return ctx;
}
