/**
 * hooks/use-builder-models.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the models available to the active OpenCode workspace and switches the
 * current session's model. OpenCode owns provider credentials/configuration;
 * this hook only presents the project-scoped catalog it reports over IPC.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type { BuilderModelOption } from '@/main/ipc/channels';

export function useBuilderModels(sessionId?: string) {
  const [models, setModels] = useState<BuilderModelOption[]>([]);
  const [selected, setSelected] = useState<BuilderModelOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setModels([]);
      setSelected(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.ipc.invoke<{
        models: BuilderModelOption[];
        selected: BuilderModelOption | null;
      }>('builder:models');
      setModels(result.models);
      setSelected(result.selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback(
    async (key: string) => {
      const model = models.find(
        (option) => `${option.providerID}/${option.id}` === key,
      );
      if (!model || !sessionId) return;

      setSwitching(true);
      setError(null);
      try {
        await window.electron.ipc.invoke('builder:model-select', {
          providerID: model.providerID,
          modelID: model.id,
        });
        setSelected(model);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSwitching(false);
      }
    },
    [models, sessionId],
  );

  return { models, selected, loading, switching, error, refresh, select };
}
