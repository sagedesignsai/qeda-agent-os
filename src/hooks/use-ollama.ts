/**
 * hooks/use-ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for Ollama server management and local model operations.
 *
 * Provides connection checking, model listing, and setup instructions to UI
 * components managing Ollama provider settings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import { useIpc } from './use-ipc';

export interface UseOllamaOptions {
  baseURL?: string;
}

export function useOllamaConnection(options?: UseOllamaOptions) {
  const ipc = useIpc();
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ipc.invoke('ollama:check-connection', {
        baseURL: options?.baseURL,
      });
      setIsRunning(result.isRunning);
      if (result.error) setError(result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsRunning(false);
    } finally {
      setIsLoading(false);
    }
  }, [ipc, options?.baseURL]);

  return { isLoading, isRunning, error, checkConnection };
}

export function useOllamaModels(options?: UseOllamaOptions) {
  const ipc = useIpc();
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const listModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setModels([]);
    try {
      const result = await ipc.invoke('ollama:list-models', {
        baseURL: options?.baseURL,
      });
      setModels(result.models);
      if (result.error) setError(result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [ipc, options?.baseURL]);

  return { isLoading, models, error, listModels };
}

export function useOllamaSetupInstructions() {
  const ipc = useIpc();
  const [isLoading, setIsLoading] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getInstructions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ipc.invoke('ollama:get-setup-instructions', undefined);
      setInstructions(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [ipc]);

  return { isLoading, instructions, error, getInstructions };
}
