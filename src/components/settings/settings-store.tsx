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

/** The subset of `settings:get` the sections actually read. */
export interface SettingsSnapshot {
  activeProvider: string;
  activeModel: string;
  fallbackEnabled: boolean;
  braveApiKeySet: boolean;
  /** RAG embedding endpoint + model; empty means "fall back to the environment". */
  embeddingProvider: string;
  embeddingModel: string;
}

const EMPTY: SettingsSnapshot = {
  activeProvider: '',
  activeModel: '',
  fallbackEnabled: true,
  braveApiKeySet: false,
  embeddingProvider: '',
  embeddingModel: '',
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
        if (cancelled) return;
        setSnapshot({
          ...EMPTY,
          ...s,
          fallbackEnabled: s.fallbackEnabled !== false,
        });
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
