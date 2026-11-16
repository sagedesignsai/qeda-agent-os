/**
 * __tests__/presence-agent.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards the Presence Copilot's approval surface and project scoping.
 *
 * The agent's instructions require it to call `createPlan` before acting, and
 * its policy used to omit the planning tools (and return an approval status the
 * SDK no longer accepts). These tests pin the fixed contract: every exposed
 * tool is classified, mutations gate, reads do not, and a tool built without a
 * project refuses to write instead of creating an orphan row.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { policyDrift } from '../main/tools/capability';
import {
  presenceCopilotApprovalPolicy,
  presenceCopilotToolPolicies,
} from '../main/tools/policies/presence-copilot';
import { createPresenceTools } from '../main/tools/presence';
import { createPlanTools } from '../main/tools/plan';
import { presenceContextTools } from '../main/ai/presence-copilot-agent';
import { PlanManager } from '../main/ai/plan-manager';

function exposedToolNames(): string[] {
  return [
    ...Object.keys(createPresenceTools('project-1')),
    ...Object.keys(presenceContextTools),
    ...Object.keys(createPlanTools(new PlanManager())),
  ];
}

describe('presence copilot policy', () => {
  it('classifies every exposed tool, with no stale entries', () => {
    const drift = policyDrift(presenceCopilotToolPolicies, exposedToolNames());
    expect(drift.unclassified).toEqual([]);
    expect(drift.stale).toEqual([]);
  });

  it('lets the planning protocol run without approval', () => {
    // The agent is instructed to call these first; gating them would stall it.
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'createPlan', dynamic: false },
      }),
    ).toBe('not-applicable');
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'updatePlanItem', dynamic: false },
      }),
    ).toBe('not-applicable');
  });

  it('runs additive generation but gates mutation', () => {
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'createPresenceBatch', dynamic: false },
      }),
    ).toBe('not-applicable');
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'createPresenceItem', dynamic: false },
      }),
    ).toBe('not-applicable');

    for (const toolName of [
      'updatePresenceItem',
      'deletePresenceItem',
      'updatePresenceProfile',
    ]) {
      expect(
        presenceCopilotApprovalPolicy({
          toolCall: { toolName, dynamic: false },
        }),
      ).toBe('user-approval');
    }
  });

  it('classifies contacts tools as read', () => {
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'listContacts', dynamic: false },
      }),
    ).toBe('not-applicable');
    expect(
      presenceCopilotApprovalPolicy({
        toolCall: { toolName: 'getContact', dynamic: false },
      }),
    ).toBe('not-applicable');
  });

  it('fails closed on an unclassified tool', () => {
    const decision = presenceCopilotApprovalPolicy({
      toolCall: { toolName: 'mysteryPresenceTool', dynamic: false },
    });
    expect(decision).toEqual(expect.objectContaining({ type: 'denied' }));
    expect((decision as { reason?: string }).reason).toContain(
      'mysteryPresenceTool',
    );
  });
});

describe('presence tools project scoping', () => {
  it('refuses to create a batch without a project', async () => {
    const tools = createPresenceTools(null);
    const execute = (tools.createPresenceBatch as any).execute;
    const result = await execute({ focus: 'LinkedIn' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No project selected/i);
  });
});
