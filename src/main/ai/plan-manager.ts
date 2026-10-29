/**
 * main/ai/plan-manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mutable in-session plan state shared across the three agent surfaces
 * (Builder, Chat, Task Copilot).
 *
 * One PlanManager is created per agent run (or per LocalBuilderSession).
 * It holds the current AgentPlan in memory, exposes mutating methods for the
 * plan tools, and returns a StopCondition that the ToolLoopAgent's `stopWhen`
 * array can include.
 *
 * The emit callback bridges plan mutations to whichever event transport the
 * surface uses:
 *   • Builder  → LocalBuilderSession.emit() → BuilderSessionEvent stream
 *   • Chat     → serialised into agent:stream-chunk as a custom part type
 *   • Copilot  → serialised into copilot:stream-chunk
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StopCondition, ToolSet } from 'ai';
import type {
  AgentPlan,
  PlanItem,
  PlanItemStatus,
  AgentPlanEvent,
} from '../../lib/agent-plan.js';

export type PlanEmitFn = (event: AgentPlanEvent) => void;

export class PlanManager {
  private plan: AgentPlan | null = null;
  private emit: PlanEmitFn;

  constructor(emit?: PlanEmitFn) {
    this.emit = emit ?? (() => {});
  }

  setEmit(emit: PlanEmitFn): void {
    this.emit = emit;
  }

  reset(): void {
    this.plan = null;
  }

  // ─── Plan tool implementations ──────────────────────────────────────────────

  /**
   * Create or replace the plan. Each call increments the version number so the
   * UI can distinguish a fresh plan from a re-plan mid-run.
   */
  createPlan(items: Array<{ id: string; title: string }>): AgentPlan {
    const version = (this.plan?.version ?? 0) + 1;
    const plan: AgentPlan = {
      version,
      createdAt: Date.now(),
      items: items.map(({ id, title }): PlanItem => ({
        id,
        title,
        status: 'pending',
      })),
    };
    this.plan = plan;
    this.emit({ type: 'plan-created', plan });
    return plan;
  }

  /**
   * Transition a single item's status. No-ops silently on unknown ids so a
   * mis-matched id from the model doesn't crash the loop.
   */
  updateItem(itemId: string, status: PlanItemStatus): void {
    if (!this.plan) return;
    const item = this.plan.items.find((i) => i.id === itemId);
    if (!item) return;
    item.status = status;
    this.emit({ type: 'plan-item-updated', itemId, status });
  }

  // ─── Stop condition ─────────────────────────────────────────────────────────

  /**
   * Returns a ToolLoopAgent StopCondition that fires when every item in the
   * plan is either 'done' or 'failed'. Returns false when no plan exists yet
   * (the agent hasn't called createPlan), so the loop never exits prematurely
   * on an empty plan.
   */
  stopCondition(): StopCondition<ToolSet, any> {
    return () => {
      if (!this.plan || this.plan.items.length === 0) return false;
      return this.plan.items.every(
        (item) => item.status === 'done' || item.status === 'failed',
      );
    };
  }

  /** Read the current snapshot (for context injection). */
  getSnapshot(): AgentPlan | null {
    return this.plan;
  }

  /** Format the current plan as a prompt context block for prepareStep. */
  toContextBlock(): string {
    if (!this.plan || this.plan.items.length === 0) return '';
    const lines = this.plan.items.map((item) => {
      const icon =
        item.status === 'done'
          ? '✅'
          : item.status === 'failed'
            ? '❌'
            : item.status === 'in-progress'
              ? '⏳'
              : '○';
      return `  ${icon} [${item.id}] ${item.title} (${item.status})`;
    });
    return `\n## Current plan\n${lines.join('\n')}\n`;
  }
}
