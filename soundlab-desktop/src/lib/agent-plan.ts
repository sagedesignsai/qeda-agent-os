/**
 * lib/agent-plan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-safe plan types shared across all agent surfaces.
 *
 * The plan is the agent's structured todo-list: created once at the start of a
 * turn, updated as each item completes, and used as the primary stop condition
 * for the agent loop (all items done → stop). A hard step-count budget still
 * backs it up as a safety net.
 *
 * These types are intentionally free of Node/Electron imports so they can be
 * imported from both the main process (tools, plan-manager) and the renderer
 * (hooks, UI components).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PlanItemStatus = 'pending' | 'in-progress' | 'done' | 'failed';

export interface PlanItem {
  /** Stable short id, e.g. "task-1". */
  id: string;
  /** Human-readable one-line description. Starts with a verb. */
  title: string;
  status: PlanItemStatus;
}

export interface AgentPlan {
  /** Ordered list of tasks the agent committed to completing. */
  items: PlanItem[];
  /** Unix ms when the plan was created or last replaced. */
  createdAt: number;
  /**
   * Increments each time the agent calls createPlan again mid-run (re-plan).
   * Lets the UI animate a plan replacement rather than a diff.
   */
  version: number;
}

export type AgentPlanEvent =
  | { type: 'plan-created'; plan: AgentPlan }
  | { type: 'plan-item-updated'; itemId: string; status: PlanItemStatus };
