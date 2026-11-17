/**
 * hooks/use-ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for Ollama server management and local model operations.
 *
 * Provides connection checking, model listing, server control, and model pulling
 * to UI components managing Ollama provider settings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import { useIpcInvoke } from './use-ipc';

export interface UseOllamaOptions {
  baseURL?: string;
}

export function useOllamaConnection(options?: UseOllamaOptions) {
  const invoke = useIpcInvoke();
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<{ isRunning: boolean; error?: string }>(
        'ollama:check-connection',
        {
          baseURL: options?.baseURL,
        },
      );
      setIsRunning(result.isRunning);
      if (result.error) setError(result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsRunning(false);
    } finally {
      setIsLoading(false);
    }
  }, [invoke, options?.baseURL]);

  return { isLoading, isRunning, error, checkConnection };
}

export function useOllamaModels(options?: UseOllamaOptions) {
  const invoke = useIpcInvoke();
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const listModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setModels([]);
    try {
      const result = await invoke<{ models: string[]; error?: string }>(
        'ollama:list-models',
        {
          baseURL: options?.baseURL,
        },
      );
      setModels(result.models);
      if (result.error) setError(result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [invoke, options?.baseURL]);

  return { isLoading, models, error, listModels };
}

export function useOllamaSetupInstructions() {
  const invoke = useIpcInvoke();
  const [isLoading, setIsLoading] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getInstructions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<string>('ollama:get-setup-instructions', undefined);
      setInstructions(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [invoke]);

  return { isLoading, instructions, error, getInstructions };
}

export function useOllamaInstallation() {
  const invoke = useIpcInvoke();
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkInstallation = useCallback(async () => {
    setIsChecking(true);
    try {
      const [installed, ver] = await Promise.all([
        invoke<boolean>('ollama:is-installed', undefined),
        invoke<string | null>('ollama:get-version', undefined),
      ]);
      setIsInstalled(installed);
      setVersion(installed ? ver : null);
    } catch {
      setIsInstalled(false);
      setVersion(null);
    } finally {
      setIsChecking(false);
    }
  }, [invoke]);

  return { isInstalled, version, isChecking, checkInstallation };
}

export function useOllamaServerControl() {
  const invoke = useIpcInvoke();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startMessage, setStartMessage] = useState<string | null>(null);

  const startServer = useCallback(async () => {
    setIsStarting(true);
    setStartError(null);
    setStartMessage(null);
    try {
      const result = await invoke<{
        success: boolean;
        pid?: number;
        error?: string;
        message?: string;
      }>('ollama:start-server', undefined);
      if (result.success) {
        setStartMessage(result.message || 'Ollama server started');
      } else {
        setStartError(result.error || 'Failed to start Ollama');
      }
      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start Ollama';
      setStartError(message);
      return false;
    } finally {
      setIsStarting(false);
    }
  }, [invoke]);

  return { isStarting, startError, startMessage, startServer };
}

export function useOllamaModelPull() {
  const invoke = useIpcInvoke();
  const [isPulling, setIsPulling] = useState(false);
  const [pullError, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const pullModel = useCallback(async (modelId: string) => {
    setIsPulling(true);
    setError(null);
    setProgress(null);
    try {
      const result = await invoke<{
        success: boolean;
        modelId?: string;
        progress?: string;
        error?: string;
      }>('ollama:pull-model', { modelId });
      if (result.success) {
        setProgress(result.progress || `Pulling ${modelId}...`);
      } else {
        setError(result.error || 'Failed to pull model');
      }
      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pull model';
      setError(message);
      return false;
    } finally {
      setIsPulling(false);
    }
  }, [invoke]);

  return { isPulling, pullError, progress, pullModel };
}

export function useOllamaRunningModels() {
  const invoke = useIpcInvoke();
  const [running, setRunning] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRunning = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const models = await invoke<string[]>('ollama:get-running', undefined);
      setRunning(models || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [invoke]);

  const stopModel = useCallback(
    async (modelId: string) => {
      try {
        const success = await invoke<boolean>('ollama:stop-model', { modelId });
        if (success) {
          setRunning((prev) => prev.filter((m) => m !== modelId));
        }
        return success;
      } catch {
        return false;
      }
    },
    [invoke],
  );

  return { running, isLoading, error, getRunning, stopModel };
}
