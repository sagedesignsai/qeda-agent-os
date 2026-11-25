/**
 * hooks/use-autonomous-operator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom hook following Qeda's copilot pattern (similar to useCopilotChat).
 * Encapsulates the Autonomous Operator state, live streaming event listeners,
 * and command actions.
 */

import { useCallback, useEffect } from 'react';
import { useAutonomousStore, type AutonomousStoreState } from '@/stores/autonomous-store';
import { useIpcEvent } from './use-ipc';
import type { AutonomousOperatorEvent } from '@/main/ai/autonomous-operator';

export interface UseAutonomousOperatorReturn {
  // State
  overlayOpen: boolean;
  status: AutonomousStoreState['status'];
  latestThought: string | null;
  latestAction: string | null;
  isThinking: boolean;
  isExecuting: boolean;

  // Actions
  setOverlayOpen: AutonomousStoreState['setOverlayOpen'];
  toggleOverlay: () => void;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  resume: () => Promise<void>;
  startTask: (taskId?: string, maxSteps?: number) => Promise<void>;
  dispatchInstruction: (prompt: string, maxSteps?: number) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useAutonomousOperator(): UseAutonomousOperatorReturn {
  const {
    overlayOpen,
    setOverlayOpen,
    toggleOverlay,
    status,
    latestThought,
    latestAction,
    isThinking,
    handleEvent,
    refreshStatus,
    pause,
    stop,
    startTask,
    dispatchInstruction,
  } = useAutonomousStore();

  // Wire up the IPC event listener matching useIpcEvent in copilots
  useIpcEvent('autonomous:event', (event: unknown) => {
    handleEvent(event as AutonomousOperatorEvent);
  });

  // Keep state synchronized on initial load
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const resume = useCallback(async () => {
    await startTask();
  }, [startTask]);

  const isExecuting = status.running && !status.paused;

  return {
    overlayOpen,
    setOverlayOpen,
    toggleOverlay,
    status,
    latestThought,
    latestAction,
    isThinking,
    isExecuting,
    pause,
    stop,
    resume,
    startTask,
    dispatchInstruction,
    refreshStatus,
  };
}
