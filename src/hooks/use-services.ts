/**
 * hooks/use-services.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the external-service registry status (which search / scrape / docs /
 * image / speech services have a usable key) over IPC. Kept thin and read-only,
 * like the other data hooks — the store lives in main.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ServiceStatus } from '../main/ipc/channels';

export function useServices() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await window.electron.ipc.invoke<ServiceStatus[]>('services:list');
      setServices(data ?? []);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Services that are actually usable right now. */
  const configured = useMemo(
    () => services.filter((service) => service.configured),
    [services],
  );

  return { services, configured, loading, reload };
}
