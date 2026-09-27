/**
 * tools/capability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The capability mechanism: what it MEANS to classify a tool and how an
 * approval decision is derived from that classification.
 *
 * This module deliberately contains no tool names and no agent knowledge. The
 * per-agent declarations live in `tools/policies/*.ts` so that adding a tool to
 * an agent is a data change in one obvious place, and so the derivation rules
 * can be unit-tested without constructing an agent or touching a model.
 *
 * Design note — why a side table rather than metadata on the tool definition:
 * the AI SDK's `Tool` type is a closed union (FunctionTool | DynamicTool |
 * ProviderDefinedTool | ProviderExecutedTool) with no index signature, so
 * `tool({ ..., capability: 'read' })` is an excess property and will not
 * compile. The SDK's older `needsApproval` field is deprecated in v7. So the
 * classification lives beside the tool set, keyed by tool name.
 *
 * See docs/agent-tooling-spec.md §3–§5 for the normative rules this implements.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * What a tool call can DO, independent of how it is usually used.
 *
 * Ordered from least to most dangerous. This is a blast-radius scale, not a
 * usefulness scale.
 */
export type Capability =
  /** Observes local state. No mutation, no egress, no cost. */
  | 'read'
  /** Creates or overwrites local state, reversibly. */
  | 'write-local'
  /** Removes or overwrites existing work irrecoverably. */
  | 'destructive'
  /** Reaches off the machine. */
  | 'network'
  /** Consumes a metered or quota-limited resource. */
  | 'cost';

/** Statuses the AI SDK accepts from a `toolApproval` rule (v7). */
export type ApprovalStatus =
  | 'not-applicable'
  | 'approved'
  | 'denied'
  | 'user-approval';

export interface ToolPolicy {
  /**
   * The strictest class that applies. When a call both mutates and reaches the
   * network, or both mutates and bills, record the strictest one — there is
   * deliberately no composite class.
   */
  capability: Capability;
  /**
   * Overrides the derived status, in either direction.
   *
   * Required whenever you want behaviour that differs from `deriveApproval`.
   * This is not decoration: several of today's chat-agent guardrails (writeFile,
   * writeClipboard) are stricter than the default table, and the `cost` tools
   * are looser. See `tools/policies/chat.ts` for the worked examples.
   */
  approval?: ApprovalStatus;
  /** Why this override exists. Required by convention whenever `approval` is set. */
  reason?: string;
}

/** Tool name → policy. Keys MUST exactly cover the agent's exposed tool set. */
export type ToolPolicyMap = Readonly<Record<string, ToolPolicy>>;

/**
 * Default derivation.
 *
 * `destructive` and `cost` gate because their failure modes are irreversible
 * and billable respectively. `read` / `write-local` / `network` run freely,
 * because an agent that cannot act is not an agent — and because every one of
 * those is recoverable by the user without a support ticket.
 */
const DEFAULT_APPROVAL: Readonly<Record<Capability, ApprovalStatus>> = {
  read: 'not-applicable',
  'write-local': 'not-applicable',
  network: 'not-applicable',
  destructive: 'user-approval',
  cost: 'user-approval',
};

export function deriveApproval(policy: ToolPolicy): ApprovalStatus {
  return policy.approval ?? DEFAULT_APPROVAL[policy.capability];
}

/** The status a capability implies on its own, ignoring overrides. */
export function defaultApprovalFor(capability: Capability): ApprovalStatus {
  return DEFAULT_APPROVAL[capability];
}

/**
 * The subset of the SDK's approval options this function reads.
 *
 * Typed structurally rather than importing the SDK's `GenericToolApprovalFunction`
 * so the mechanism stays testable with a plain object and does not break if
 * that type is renamed. Passing this to `toolApproval` is assignable: the SDK
 * passes a superset of these fields.
 */
export interface ApprovalOptions {
  toolCall: { toolName: string; dynamic?: boolean };
}

export interface ApprovalPolicyOptions {
  /**
   * What to do when a tool is exposed but unclassified.
   *
   * Defaults to `deny` (fail closed). The spec's §5.2 exhaustiveness test is
   * the primary guard; this is the runtime backstop so a forgotten
   * classification degrades to "refused" rather than "silently allowed".
   */
  onUnclassified?: 'deny' | 'allow';
}

/**
 * Build a `toolApproval` function from a per-agent classification.
 *
 * Behaviour:
 *  1. A dynamic tool call is never covered by a name-keyed table, so it always
 *     requires user approval. This mirrors the SDK's own documented example.
 *  2. A classified tool resolves to its override, else its derived status.
 *  3. An unclassified tool denies with an explanatory reason, so the failure is
 *     legible in the UI instead of looking like a random refusal.
 */
export function createApprovalPolicy(
  policies: ToolPolicyMap,
  { onUnclassified = 'deny' }: ApprovalPolicyOptions = {},
) {
  return ({ toolCall }: ApprovalOptions): ApprovalStatus | { type: 'denied'; reason: string } => {
    // (1) Dynamic calls bypass name lookup entirely.
    if (toolCall.dynamic) {
      return 'user-approval';
    }

    const policy = policies[toolCall.toolName];

    // (3) Unclassified: fail closed, and say why.
    if (!policy) {
      if (onUnclassified === 'allow') return 'not-applicable';
      return {
        type: 'denied',
        reason:
          `"${toolCall.toolName}" has no capability class in this agent's policy ` +
          `(tools/policies/). Add it before exposing the tool — see ` +
          `docs/agent-tooling-spec.md §5.2.`,
      };
    }

    // (2) Override wins, else derive.
    return deriveApproval(policy);
  };
}

/**
 * Tool names in a policy map that are not in `exposed`, and vice versa.
 *
 * Purely for tests (spec §5.2 / §10.2). Drift in either direction is a bug:
 * an extra key is dead policy, a missing key is a tool that will be denied.
 */
export function policyDrift(
  policies: ToolPolicyMap,
  exposed: readonly string[],
): { unclassified: string[]; stale: string[] } {
  const declared = new Set(Object.keys(policies));
  const live = new Set(exposed);
  return {
    unclassified: [...live].filter((n) => !declared.has(n)).sort(),
    stale: [...declared].filter((n) => !live.has(n)).sort(),
  };
}
