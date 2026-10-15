/**
 * __tests__/plan-manager.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for PlanManager and createPlanTools.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlanManager } from '../main/ai/plan-manager';
import { createPlanTools } from '../main/tools/plan';
import type { AgentPlanEvent } from '../lib/agent-plan';

describe('PlanManager', () => {
  it('creates a fresh plan and emits plan-created event', () => {
    const events: AgentPlanEvent[] = [];
    const manager = new PlanManager((e) => events.push(e));

    const plan = manager.createPlan([
      { id: 'task-1', title: 'Inspect workspace' },
      { id: 'task-2', title: 'Write code' },
    ]);

    expect(plan.version).toBe(1);
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]).toEqual({
      id: 'task-1',
      title: 'Inspect workspace',
      status: 'pending',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'plan-created', plan });
  });

  it('increments version on re-planning', () => {
    const manager = new PlanManager();
    const p1 = manager.createPlan([{ id: 'task-1', title: 'First' }]);
    expect(p1.version).toBe(1);

    const p2 = manager.createPlan([
      { id: 'task-1', title: 'First' },
      { id: 'task-2', title: 'Second' },
    ]);
    expect(p2.version).toBe(2);
  });

  it('updates plan items and emits plan-item-updated', () => {
    const events: AgentPlanEvent[] = [];
    const manager = new PlanManager((e) => events.push(e));

    manager.createPlan([
      { id: 'task-1', title: 'Step 1' },
      { id: 'task-2', title: 'Step 2' },
    ]);

    manager.updateItem('task-1', 'in-progress');
    expect(manager.getSnapshot()?.items[0].status).toBe('in-progress');
    expect(events[1]).toEqual({
      type: 'plan-item-updated',
      itemId: 'task-1',
      status: 'in-progress',
    });

    manager.updateItem('task-1', 'done');
    expect(manager.getSnapshot()?.items[0].status).toBe('done');
  });

  it('ignores updates for non-existent items without throwing', () => {
    const events: AgentPlanEvent[] = [];
    const manager = new PlanManager((e) => events.push(e));
    manager.createPlan([{ id: 'task-1', title: 'Step 1' }]);

    manager.updateItem('non-existent', 'done');
    expect(events).toHaveLength(1); // Only plan-created
  });

  it('evaluates stop condition correctly', () => {
    const manager = new PlanManager();
    const stopCondition = manager.stopCondition();

    // No plan yet -> false
    expect((stopCondition as any)({})).toBe(false);

    manager.createPlan([
      { id: 'task-1', title: 'Task 1' },
      { id: 'task-2', title: 'Task 2' },
    ]);

    // Items pending -> false
    expect((stopCondition as any)({})).toBe(false);

    manager.updateItem('task-1', 'done');
    // Task 2 still pending -> false
    expect((stopCondition as any)({})).toBe(false);

    manager.updateItem('task-2', 'failed');
    // All items done or failed -> true!
    expect((stopCondition as any)({})).toBe(true);
  });

  it('formats context block for LLM prompt', () => {
    const manager = new PlanManager();
    expect(manager.toContextBlock()).toBe('');

    manager.createPlan([
      { id: 'task-1', title: 'Inspect' },
      { id: 'task-2', title: 'Build' },
    ]);
    manager.updateItem('task-1', 'done');
    manager.updateItem('task-2', 'in-progress');

    const block = manager.toContextBlock();
    expect(block).toContain('## Current plan');
    expect(block).toContain('✅ [task-1] Inspect (done)');
    expect(block).toContain('⏳ [task-2] Build (in-progress)');
  });

  it('resets state cleanly', () => {
    const manager = new PlanManager();
    manager.createPlan([{ id: 'task-1', title: 'Task' }]);
    expect(manager.getSnapshot()).not.toBeNull();

    manager.reset();
    expect(manager.getSnapshot()).toBeNull();
    expect((manager.stopCondition() as any)({})).toBe(false);
  });
});

describe('createPlanTools', () => {
  it('executes createPlan and updatePlanItem tools', async () => {
    const manager = new PlanManager();
    const tools = createPlanTools(manager);

    const createResult = await tools.createPlan.execute(
      {
        items: [
          { id: 'step-1', title: 'Initialize project' },
          { id: 'step-2', title: 'Deploy service' },
        ],
      },
      {} as any,
    );
    expect(createResult).toContain('Plan created (v1): 2 task(s)');

    const updateResult = await tools.updatePlanItem.execute(
      { id: 'step-1', status: 'in-progress' },
      {} as any,
    );
    expect(updateResult).toContain('Plan item "step-1" → in-progress');
    expect(manager.getSnapshot()?.items[0].status).toBe('in-progress');
  });
});
