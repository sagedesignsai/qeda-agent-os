# Approval Policies & Derivation

How Qeda decides which tool calls require user approval. Single source of truth: `src/main/tools/capability.ts`.

## The Derivation Engine

All approval decisions flow through **one function**: `createApprovalPolicy(policyMap)` in `src/main/tools/capability.ts`.

This function takes a `ToolPolicyMap` (a name → capability/approval pair) and returns a policy function that:

1. Takes a tool call (name + dynamic flag)
2. Looks up the tool in the map
3. **Derives approval** from capability, checking for explicit overrides
4. **Fails closed**: Unknown tools are denied, not passed through

```typescript
// Used by agents:
agent.toolApproval = createApprovalPolicy(chatToolPolicies);

// Used by UI/IPC:
if (createApprovalPolicy(chatToolPolicies)({ toolCall: { toolName: 'writeFile', dynamic: false } }) === 'user-approval') {
  // Show approval card
}
```

## Approval Levels

### `not-applicable`
Tool never requires approval. Automatically granted. Examples:
- `readFile`, `listDir`, `getPage` (reads)
- `writePage`, `appendBlocks` (additive local writes)

### `user-approval`
Requires explicit user approval before execution. Approval card shown to user. Examples:
- `writeFile`, `deleteFile` (filesystem mutation)
- `runShell` (shell command execution)
- `completeTask` (destructive state change)

### `dynamic-only`
Derived from capability, but subject to override. See below.

## Capability Classification

Base capabilities (from `tools/capability.ts` derivation table):

| Capability | Default Approval | Meaning |
|-----------|------------------|---------|
| `read` | `not-applicable` | Pure read; no state change |
| `write-local` | `not-applicable` | Reversible local state (page, task, etc.) |
| `network` | `not-applicable` (user present) or `user-approval` (unattended) | Web calls |
| `cost` | `user-approval` | Billable operations (embeddings, images, TTS) |
| `destructive` | `user-approval` | Irrecoverable state change |

## Policy Maps

### 1. Chat Policy (`src/main/tools/policies/chat.ts`)

Used by: Chat agent + Tools page manual execution

**Structure**: 50+ entries, **4 explicit overrides**

#### Entries with Overrides

```
writeClipboard:
  capability: 'write-local'
  approval: 'user-approval'  ← override (stricter)
  reason: "Reaching user clipboard is visible and disruptive; keep guardrail"

writeFile:
  capability: 'write-local'
  approval: 'user-approval'  ← override (stricter)
  reason: "Writing to disk is not silently reversible for the user"

indexFile:
  capability: 'cost'
  approval: 'not-applicable'  ← override (looser)
  reason: "Chat is direct, user-initiated; embedding spend already bounded"

indexPage:
  capability: 'cost'
  approval: 'not-applicable'  ← override (looser)
  reason: "Same rationale as indexFile"
```

#### Why These Overrides

**`writeFile` / `writeClipboard` stricter (pre-existing guardrails):**
- These were explicit approval gates in earlier versions
- Preserve UX expectations: reaching the user's disk or clipboard is disruptive
- Not changing behavior, just making it derivable

**`indexFile` / `indexPage` looser (user presence matters):**
- Cost tools normally require approval to prevent unattended agents from burning quotas
- Chat surface is direct, user-initiated—user has already opted in by configuring providers
- Task copilot keeps strict default (more autonomous, runs on background intent)

### 2. Task Copilot Policy (`src/main/tools/policies/copilot.ts`)

Used by: Task copilot agent

**Structure**: 40 entries, **no overrides** (purely derived)

**Key principle**: The old hand-maintained `RISKY_TASK_TOOLS` set (6 names) matches exactly what the derivation table classifies as `destructive`. By removing the hand-maintained list and using derivation instead, the two can never drift.

**Approval-gated tools**:
- Destructive: `updateTask`, `completeTask`, `deleteTask`, `deleteBlock`, `moveBlock`, `assignTaskToProject`
- Cost: `indexFile`, `indexPage` (strict default kept)

**Auto-approved**:
- All additive task operations: `createTask`, `createTasks`, `addSteps`, `scheduleBlock`
- All reads: `listTasks`, `getTask`, `listBlocks`, `getFocusStats`
- Web/workspace grounding: `webSearch`, `fetchUrl`, `libraryDocs`, `findPages`, `searchDocs`, etc.
- Repository reads: `gitStatus`, `gitLog`, `grepSearch`, `gitDiffStat`

**Deliberately absent**:
- No `runShell` (copilot reaches shell via `handToTerminal`, which gates each command)
- No `removeFromIndex` (destructive delete over shared index; no corresponding UI affordance)

### 3. Drafter Policy (`src/main/tools/policies/drafter.ts`)

Used by: Document drafter agent

**Structure**: 8 entries, **no overrides** (purely derived)

**Design principle**: The real safety boundary is the tool set itself, not the approval map.

**Tools**:
- Read: `getDocumentOutline`, `readDocument`, `listProjectFiles`, `readProjectFile`
- Write: `createDocument`, `appendBlocks`, `insertBlocksAt`
- Destructive: `replaceBlock` ← only approval-gated call

**Deliberately absent** (no path for escalation):
- No `deleteDocument` / `deleteBlocks` (no unrecoverable delete)
- No `writeFile` / `deleteFile` (can only write to document store)
- No network tools (no send/export possible)
- No shell (no command execution)
- No task tools (taskId is prompt context only)
- No mail/filing/export (simple: no capability exists)

This design means: **A prompt injection in a source document cannot escalate past the absent tools.** The omissions are load-bearing.

### 4. Correspondence Policy (`src/main/tools/policies/correspondence.ts`)

Used by: Correspondence copilot agent

**Structure**: 10 entries, **no overrides** (derived)

**Key principle**: "Qeda does not send anything"

**Tools**:
- Read: `listMessages`, `getMessageDetail`, `listRecipients`, `listContacts`
- Write: `draftMessage`, `suggestRecipients`
- Destructive: `dispatchMessage`, `setMessageRecipients` ← approval-gated

**Deliberately absent**:
- No `sendEmail` / `sendSms` / `sendPostal` (no mail capability)
- No `exportMessage` (no export)
- No network tools (cannot reach external mail system)

**Safety**: The tool set structure, not the prompt, prevents unintended sends.

## Four Principles of the Approval System

### 1. One Source of Truth

`createApprovalPolicy(map)` is the **only** source of approval decisions.

- Agent uses it: `agent.toolApproval = createApprovalPolicy(chatToolPolicies)`
- UI uses it: `ipc/handlers/tools.ts` calls the same function for manual execution
- Result: UI and agent always agree; no approval bypass possible

### 2. Fail Closed

Unknown tools are **denied**, not passed through.

```typescript
// In createApprovalPolicy:
if (!map[toolName]) {
  return {
    approval: 'user-approval',  // Deny unknown tools
    reason: 'Tool not in capability map; see docs/agent-tooling-spec.md'
  }
}
```

This prevents silent expansion of capability when a new tool is added without updating the policy.

### 3. Overrides Are Justified

Every override in a policy map carries a `reason` string explaining why the derivation is being changed:

```typescript
// Chat policy
writeFile: {
  capability: 'write-local',
  approval: 'user-approval',
  reason: 'Pre-existing guardrail: writing to disk is not silently reversible.'
}
```

No mysteries: if an override exists, there's a documented reason.

### 4. Safety Is in Tool Sets

For sensitive domains (drafter, correspondence), the real safety boundary is the **deliberately absent tools**, not the approval map.

- Drafter has no `sendEmail` → cannot send
- Drafter has no `deleteDocument` → cannot unrecoverably delete
- Correspondence has no `dispatchEmail` → cannot send real mail
- A tool added to the agent without a corresponding capability map entry is denied

This design ensures: **You cannot escalate past the tool set.**

## Typical Workflow: Adding a New Tool

### Step 1: Define the Tool
Add a new tool to `src/main/tools/my-domain.ts`:

```typescript
export const myTools = {
  dangerousThing: tool({
    description: '...',
    parameters: z.object({...}),
    execute: async (params) => {...}
  })
}
```

### Step 2: Decide Approval Level
Ask: Does this tool need approval?

- **No**: `read`, `write-local` → goes into policy map as-is, derives automatically
- **Yes**: `destructive`, `cost` → goes into policy map, derives to `user-approval`
- **Maybe override?**: Does this tool have special context (e.g., cost tool in direct-user chat)? If so, add override with reason

### Step 3: Add to Policy Map
Update `src/main/tools/policies/agent-type.ts`:

```typescript
export const agentToolPolicies: ToolPolicyMap = {
  // ... existing entries ...
  dangerousThing: t('destructive'),  // or with override + reason
}
```

### Step 4: Export & Assign
Add to `src/main/tools/index.ts` and assign to agents:

```typescript
export const agentTools = {
  ...myTools,
  ...otherTools,
}
```

Then in agent factory:
```typescript
return new ToolLoopAgent({
  tools: agentTools,
  toolApproval: createApprovalPolicy(myPolicies),
  // ...
})
```

### Step 5: Test
`__tests__/agent-capabilities.test.ts` verifies all tools in agents have entries in their policy maps. Build fails if:
- Tool exists in agent but not in policy map
- Tool in policy map doesn't exist in agent
- Policy map has unknown tools

## FAQ

**Q: Why do chat and copilot have different approval for `indexFile`?**
→ Chat is direct (user present); copilot is autonomous (user absent). Cost tools in autonomous contexts require approval to prevent quota burn.

**Q: Can I remove `user-approval` from a tool?**
→ Only if the tool's capability derives to something lower. Example: if `deleteFile` were reclassified as `write-local` (bad idea), it would auto-approve. Better to keep it `destructive`.

**Q: What happens if I name a tool in a policy map but don't add it to the agent?**
→ No immediate error, but the entry is dead code. The test suite should catch this; file a bug if not.

**Q: How do I audit what was approved/denied in a session?**
→ Every tool call goes through `toolApproval`. Add logging to `createApprovalPolicy` return if needed.

**Q: Why is `replaceBl ock` the only approval-gated call in the drafter?**
→ It overwrites existing work. Everything else is additive or read-only. The real safety boundary is the absent tools (no delete, no send, no export, no shell).
