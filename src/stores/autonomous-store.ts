/**
 * stores/autonomous-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand store managing the Autonomous Self-Driving HUD overlay state and
 * live operator events.
 */

import { create } from 'zustand';
import type { AutonomousOperatorEvent, OperatorStatus } from '@/main/ai/autonomous-operator';

export interface AutonomousStoreState {
  overlayOpen: boolean;
  status: OperatorStatus;
  latestThought: string | null;
  latestAction: string | null;
  isThinking: boolean;
  
  // Actions
  setOverlayOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleOverlay: () => void;
  setStatus: (status: OperatorStatus) => void;
  handleEvent: (event: AutonomousOperatorEvent) => void;
  refreshStatus: () => Promise<void>;
  pause: () => Promise<void>;
  startTask: (taskId?: string, maxSteps?: number) => Promise<void>;
  dispatchInstruction: (prompt: string, maxSteps?: number) => Promise<void>;
}

export const useAutonomousStore = create<AutonomousStoreState>((set, get) => ({
  overlayOpen: false,
  status: {
    running: false,
    paused: false,
    currentTaskId: null,
    currentTaskTitle: null,
    stepCount: 0,
    maxSteps: 30,
  },
  latestThought: null,
  latestAction: null,
  isThinking: false,

  setOverlayOpen: (open) => {
    if (typeof open === 'function') {
      set((state) => ({ overlayOpen: open(state.overlayOpen) }));
    } else {
      set({ overlayOpen: open });
    }
  },

  toggleOverlay: () => {
    set((state) => ({ overlayOpen: !state.overlayOpen }));
  },

  setStatus: (status) => {
    set({
      status,
      isThinking: status.running && !status.paused && !!status.currentTaskId,
    });
  },

  handleEvent: (event) => {
    if (!event) return;
    if (event.type === 'status') {
      get().setStatus(event.status);
    } else if (event.type === 'task-started') {
      set((state) => ({
        status: {
          ...state.status,
          running: true,
          paused: false,
          currentTaskId: event.taskId,
          currentTaskTitle: event.title,
          stepCount: 0,
        },
        latestThought: `Initiating plan for "${event.title}"...`,
        latestAction: `Starting autonomous execution`,
        isThinking: true,
      }));
    } else if (event.type === 'step') {
      set((state) => ({
        status: {
          ...state.status,
          stepCount: state.status.stepCount + 1,
        },
        latestAction: event.message,
        latestThought: event.message.startsWith('Plan') ? event.message : state.latestThought,
        isThinking: true,
      }));
    } else if (event.type === 'thought') {
      set((state) => ({
        latestThought: (state.latestThought || '') + event.thought,
        isThinking: true,
      }));
    } else if (event.type === 'task-finished') {
      set((state) => ({
        status: {
          ...state.status,
          currentTaskId: null,
          currentTaskTitle: null,
        },
        latestAction: event.ok ? 'Task completed successfully' : `Task failed: ${event.error || 'Unknown error'}`,
        isThinking: false,
      }));
    } else if (event.type === 'error') {
      set({
        latestAction: `Error: ${event.error}`,
        isThinking: false,
      });
    }
  },

  refreshStatus: async () => {
    try {
      const res = await window.electron.ipc.invoke<OperatorStatus>('autonomous:status');
      if (res) {
        get().setStatus(res);
      }
    } catch {
      // best-effort
    }
  },

  pause: async () => {
    try {
      const res = await window.electron.ipc.invoke<OperatorStatus>('autonomous:pause');
      if (res) {
        get().setStatus(res);
      }
    } catch {
      // best-effort
    }
  },

  startTask: async (taskId, maxSteps) => {
    try {
      const res = await window.electron.ipc.invoke<OperatorStatus>('autonomous:start-task', {
        taskId,
        maxSteps,
      });
      if (res) {
        get().setStatus(res);
      }
    } catch {
      // best-effort
    }
  },

  dispatchInstruction: async (prompt: string, maxSteps?: number) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    try {
      // 1. Create an autonomous task
      const task = await window.electron.ipc.invoke<{ id: string; title: string }>('tasks:create', {
        title: trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed,
        description: trimmed,
        autonomous: 1,
      });

      // 2. Start the autonomous operator on this task
      if (task?.id) {
        await get().startTask(task.id, maxSteps);
      }
    } catch {
      // best-effort
    }
  },
}));
