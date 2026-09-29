/**
 * __tests__/agent-capabilities.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The capability mechanism, and the §5.2 exhaustiveness guarantee.
 *
 * Per-agent declarations mean nothing at the type level forces a tool to be
 * classified — the AI SDK's `Tool` type is a closed union with no metadata slot
 * (and its `needsApproval` field is deprecated in v7). So this file IS the
 * enforcement mechanism, and a new tool added to an agent without a class must
 * fail here.
 *
 * It also pins the behaviour that must not drift while refactoring the policy:
 * the chat agent's four pre-existing approval guardrails, and the derivation
 * table itself.
 *
 * See docs/agent-tooling-spec.md §3–§5 and §8.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createApprovalPolicy,
  defaultApprovalFor,
  deriveApproval,
  policyDrift,
  type Capability,
  type ToolPolicyMap,
} from '../main/tools/capability';
import {
  chatToolPolicies,
  copilotToolPolicies,
  allTools,
} from '../main/tools/index';
import { copilotTools } from '../main/ai/task-copilot-agent';

/**
 * Ceilings from spec §8, with ~25% headroom above the current counts.
 *
 * Chat is 36 and copilot 34 today. Note `allTools` does NOT include the task
 * verbs — those are copilot-only — so the chat surface is smaller than the sum
 * of all registered tool groups suggests.
 */
const CEILING = { chat: 45, copilot: 42 } as const;

describe('capability derivation', () => {
  it('gates destructive and cost, and nothing else, by default', () => {
    expect(defaultApprovalFor('destructive')).toBe('user-approval');
    expect(defaultApprovalFor('cost')).toBe('user-approval');

    // An agent that cannot act, reach out, or record a change is not an agent.
    expect(defaultApprovalFor('read')).toBe('not-applicable');
    expect(defaultApprovalFor('write-local')).toBe('not-applicable');
    expect(defaultApprovalFor('network')).toBe('not-applicable');
  });

  it('lets an override win in either direction', () => {
    expect(
      deriveApproval({ capability: 'write-local', approval: 'user-approval' }),
    ).toBe('user-approval');
    expect(
      deriveApproval({ capability: 'cost', approval: 'not-applicable' }),
    ).toBe('not-applicable');
  });
});

describe('approval policy behaviour', () => {
  const policies: ToolPolicyMap = {
    readThing: { capability: 'read' },
    writeThing: { capability: 'write-local' },
    nukeThing: { capability: 'destructive' },
  };
  const policy = createApprovalPolicy(policies);

  it('fails closed on an unclassified tool, with a legible reason', () => {
    const decision = policy({ toolCall: { toolName: 'mysteryTool' } });
    expect(typeof decision).toBe('object');
    if (typeof decision === 'object') {
      expect(decision.type).toBe('denied');
      // The reason must name the tool and the fix, or it is useless in the UI.
      expect(decision.reason).toContain('mysteryTool');
      expect(decision.reason).toContain('capability');
    }
  });

  it('requires approval for a dynamic call, which no name table can cover', () => {
    expect(policy({ toolCall: { toolName: 'readThing', dynamic: true } })).toBe(
      'user-approval',
    );
  });

  it('resolves a classified tool by its class', () => {
    expect(policy({ toolCall: { toolName: 'readThing' } })).toBe(
      'not-applicable',
    );
    expect(policy({ toolCall: { toolName: 'writeThing' } })).toBe(
      'not-applicable',
    );
    expect(policy({ toolCall: { toolName: 'nukeThing' } })).toBe(
      'user-approval',
    );
  });
});

describe('§5.2 exhaustiveness — every exposed tool is classified', () => {
  it('classifies every tool the chat agent exposes, with no stale entries', () => {
    const drift = policyDrift(chatToolPolicies, Object.keys(allTools));
    expect(drift.unclassified).toEqual([]);
    expect(drift.stale).toEqual([]);
  });

  it('classifies every tool the copilot exposes, with no stale entries', () => {
    const drift = policyDrift(copilotToolPolicies, Object.keys(copilotTools));
    expect(drift.unclassified).toEqual([]);
    expect(drift.stale).toEqual([]);
  });
});

describe('behaviour preserved from the previous hand-maintained policies', () => {
  /**
   * `toolApprovalPolicy` used to be exactly these four names, in
   * tools/index.ts. Three of the four are stricter than the default table and
   * carry explicit overrides; deleteFile and runShell derive correctly because
   * they are `destructive`. If this test fails, a guardrail was lost.
   */
  const LEGACY_CHAT_GUARDRAILS = [
    'writeFile',
    'deleteFile',
    'runShell',
    'writeClipboard',
  ];

  it('still gates the four tools the chat agent always gated', () => {
    const chatGate = createApprovalPolicy(chatToolPolicies);
    for (const name of LEGACY_CHAT_GUARDRAILS) {
      expect(chatGate({ toolCall: { toolName: name } })).toBe('user-approval');
    }
  });

  it('still lets the chat agent run its metered tools without prompting', () => {
    // The `cost` override: a user in a direct chat is present for the call, and
    // gating every image/speech call would be noise rather than safety.
    const chatGate = createApprovalPolicy(chatToolPolicies);
    for (const name of [
      'indexFile',
      'indexPage',
      'findImages',
      'textToSpeech',
      'transcribeAudio',
    ]) {
      expect(chatGate({ toolCall: { toolName: name } })).toBe('not-applicable');
    }
  });

  it('documents why the four chat overrides exist', () => {
    // An override without a reason is indistinguishable from a mistake later.
    for (const [name, policy] of Object.entries(chatToolPolicies)) {
      if (policy.approval !== undefined) {
        expect(`${name}:${policy.reason ?? ''}`).not.toBe(`${name}:`);
      }
    }
  });
});

describe('§8 tool-count ceilings', () => {
  it('keeps the chat agent under its ceiling', () => {
    expect(Object.keys(allTools).length).toBeLessThanOrEqual(CEILING.chat);
  });

  it('keeps the copilot under its ceiling', () => {
    expect(Object.keys(copilotTools).length).toBeLessThanOrEqual(
      CEILING.copilot,
    );
  });
});

describe('taxonomy invariants', () => {
  it('uses only the five specified capabilities', () => {
    const valid: Capability[] = [
      'read',
      'write-local',
      'destructive',
      'network',
      'cost',
    ];
    const all = { ...chatToolPolicies, ...copilotToolPolicies };
    for (const [name, policy] of Object.entries(all)) {
      expect(valid).toContain(policy.capability);
      expect(name).toBeTruthy();
    }
  });

  it('gives the copilot no way to delete from the shared index', () => {
    // removeFromIndex is `destructive`; the copilot must not hold it at all.
    expect(copilotTools).not.toHaveProperty('removeFromIndex');
  });

  it('gives the copilot no arbitrary shell', () => {
    // handToTerminal is the sanctioned route to the shell, where the user
    // approves each command.
    expect(copilotTools).not.toHaveProperty('runShell');
    expect(copilotTools).toHaveProperty('handToTerminal');
  });
});
