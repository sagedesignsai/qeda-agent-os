# Agent Tooling Specification

> Normative rules for the AI/agents domain: how tools are defined, classified,
> exposed, and verified. Applies to every agent in the app.
>
> Status: proposed. Decisions below were taken in review; anything marked
> **MUST** / **MUST NOT** is binding on new work.

---

## 1. Scope

Governs tool composition, capability classification, approval derivation,
context injection, and the verification bar for **all** agents.

Out of scope: the terminal agent's internals (§7), provider selection and
fallback (`ai/fallback.ts`), and prompt wording except where §6 constrains it.

This document specifies. It does not implement. The capability-class
mechanism, the git/grep tools, and copilot RAG indexing are separate changes
that cite this document.

---

## 2. Agent inventory (verified)

There are **three** agents and they are not built the same way. This is the
single most important thing to know before changing any of them.

| Agent | Factory | Kind | Tools | Step budget | Approval mechanism |
| --- | --- | --- | --- | --- | --- |
| Chat | `createDesktopAgent` (`ai/agent.ts:190`) | `ToolLoopAgent` | `allTools` — **49** | `isStepCount(40)` | Name→status map (`toolApprovalPolicy`) |
| Focus copilot | `createTaskCopilotAgent` (`ai/task-copilot-agent.ts:146`) | `ToolLoopAgent` | 27 (17 task verbs + 10 context) | `isStepCount(25)` | Predicate over a `ReadonlySet` |
| Terminal | `runGoal` (`ai/terminal-agent.ts:610`) | **hand-rolled goal loop** | Not a tool registry | n/a | IPC round-trip: `resolveApproval` |

Corrections to existing beliefs, both verified:

- **"Four agents" is wrong.** Chat's `chat` / `research` / `notebook` are
  *modes* of one agent (`AgentMode`), not separate agents.
- **Deep research is not an agent.** It is four workspace tools
  (`startResearchRun`, `recordSource`, `recordEvidence`, `completeResearchRun`)
  driven by the chat agent.
- **The terminal agent is not a `ToolLoopAgent`.** It has no tool registry and
  cannot be given a `toolApproval` policy. See §7.
- `README.md` claims the chat agent has "a step budget of 30". The code says
  `isStepCount(40)`. The README is stale; fix it or delete the claim.

---

## 3. Capability taxonomy

Every tool an agent exposes **MUST** be assigned exactly one capability class.
Classes describe the *blast radius* of the call, not its usefulness.

| Class | Meaning | Examples today |
| --- | --- | --- |
| `read` | Observes local state; no mutation, no egress, no cost | `readFile`, `listDir`, `listTasks`, `getTask`, `searchDocs`, `webSearch`, `fetchUrl` |
| `write-local` | Creates or overwrites local state, reversibly | `createTask`, `addSteps`, `scheduleBlock`, `writeFile`, `writePage`, `writeClipboard` |
| `destructive` | Removes or overwrites existing work irrecoverably | `deleteTask`, `deleteBlock`, `deleteFile`, `updateTask`, `completeTask`, `moveBlock`, `assignTaskToProject` |
| `network` | Reaches off the machine | `webSearch`, `fetchUrl`, `scrapePage`, `advancedSearch`, `libraryDocs` |
| `cost` | Consumes a metered/quota resource | `indexFile`, `indexPage` (embedding calls), `findImages`, `textToSpeech`, `transcribeAudio` |

A tool may warrant more than one class (e.g. `indexFile` is `cost` **and**
`write-local`). Record the **strictest** one; §4 derives approval from it.

### Classification rules

1. A class is chosen by what the call *can do*, not what it is usually used for.
2. If you cannot decide between `write-local` and `destructive`, it is
   `destructive`. The asymmetry is deliberate: a false `destructive` costs one
   approval card, a false `write-local` loses work.
3. Anything that writes to a **shared** store (the RAG index, the workspace,
   the settings file) is at least `write-local` even if trivially reversible.
4. A tool that both mutates and reaches the network takes the strictest of the
   two. There is no "net-write" class; do not invent one.

---

## 4. Approval derivation

The AI SDK (v7.0.114) accepts `toolApproval` returning one of
`'not-applicable' | 'approved' | 'denied' | 'user-approval'`, or `undefined`
(treated as `not-applicable`). Confirmed against `node_modules/ai/docs/03-agents/06-tool-approvals.mdx`.

### Default derivation

| Capability | Derived status |
| --- | --- |
| `read` | `not-applicable` |
| `write-local` | `not-applicable` |
| `network` | `not-applicable` |
| `destructive` | **`user-approval`** |
| `cost` | **`user-approval`** |

`read`/`write-local`/`network` run freely because an agent that cannot act is
not an agent; `destructive` and `cost` gate because their failure modes are
irreversible and billable respectively.

### Overrides

An agent **MAY** override any derived status, in either direction, with an
explicit `approval` field and a comment saying why.

Overrides are required today, to preserve current behaviour exactly:

- The chat agent already forces `writeFile`, `runShell`, and `writeClipboard` to
  `user-approval` (`toolApprovalPolicy` in `tools/index.ts`). Under the default
  table `writeFile` and `writeClipboard` would derive to `not-applicable`, so
  **both must carry explicit `user-approval` overrides** or the chat agent
  silently loses a guardrail.
- The copilot's `RISKY_TASK_TOOLS` set (6 names: `updateTask`, `completeTask`,
  `deleteTask`, `assignTaskToProject`, `moveBlock`, `deleteBlock`) already
  matches the `destructive` derivation exactly. It is replaced by the table,
  not overridden.

### The `dynamic` guard

The copilot's policy short-circuits on `!toolCall.dynamic`
(`task-copilot-agent.ts:152`). **Keep this.** A dynamic tool call is not covered
by a name-keyed approval table, so an unclassified dynamic call must not be
allowed to execute.

---

## 5. Per-agent declarations

Chosen model: **each agent declares its own tool set with the capability
attached.** Rejected alternatives and why:

- A typed `defineTool()` wrapper would make classification compile-time
  enforced. Rejected in favour of simplicity, at the cost of the guarantee —
  which is why §5.2 is mandatory rather than optional.
- A central `Record<toolName, Capability>` is smaller but still a runtime
  side-table, and it cannot express that the same tool deserves different trust
  in two surfaces. Per-agent declarations can.

### 5.1 Shape

Each agent module owns one declaration object, next to its factory:

```ts
const copilotToolPolicy = {
  createTask:  { capability: 'write-local' },
  updateTask:  { capability: 'destructive' },
  indexFile:   { capability: 'cost' },
  gitStatus:   { capability: 'read' },
  // …
} as const satisfies Record<string, ToolPolicy>;
```

The agent passes the *selected subset* of `copilotTools` to `ToolLoopAgent` and
derives `toolApproval` from the same declaration, so the exposed set and the
policy can never drift apart.

### 5.2 Exhaustiveness is mandatory

Nothing at the type level forces a tool to be classified. Therefore:

> Every agent **MUST** have a test that walks its exposed tool set and asserts
> every tool has a declared capability.

This is the repo's existing idiom, not a new invention:
`copilot-agent.test.ts:69` already asserts *"flags exactly the risky tools for
approval"*, and `copilot-tools.test.ts:194` asserts *"classifies exactly the
destructive tools as risky"*. Extend those; do not replace them.

A new tool added to an agent without a class **MUST** fail the suite.

---

## 6. New capabilities

### 6.1 Read-only git and grep tools

New group `tools/repo.ts`, four tools, all `read`, all `not-applicable`:

| Tool | Returns |
| --- | --- |
| `gitStatus` | branch, HEAD sha, clean/dirty, ahead/behind counts |
| `gitLog` | recent commits (count, path filter) |
| `gitDiffStat` | changed-file summary vs. a ref |
| `grepSearch` | matches for a pattern across a tree |

Rules:

- **Every tool takes an explicit, required, absolute path.** No defaults, no
  ambient reach, no inference from the active project. The model must already
  know the repo location from `ai/project-context.ts` (projects carry
  `repo_path`).
- The path **MUST** be resolved and confirmed inside the given root before any
  filesystem access, including for symlinks. Reject traversal outside the root.
- Output **MUST** be bounded: cap matches per tool, truncate long lines, and
  report what was truncated. An unbounded `grep` on a large repo will blow the
  context window mid-turn.
- `runShell` **MUST NOT** be added to the copilot. The copilot already has
  `handToTerminal` (`tools/tasks.ts:362`) as the delegation path to the
  agentic terminal, which is the right place for arbitrary commands.
- These do **not** widen filesystem reach: the copilot already holds ungated
  `readFile` and `listDir` over arbitrary paths. They widen *derived* reach
  (grep can read content the agent never explicitly fetched), which is why the
  output caps above are normative rather than advisory.

### 6.2 RAG indexing for the copilot

Add `indexFile` and `indexPage` to the copilot, both classed `cost`, therefore
both `user-approval` (§4). Rationale: embedding calls are billable and mutate a
store shared with the chat agent; the copilot has been read-only over the index
until now, and that asymmetry is intentional to preserve.

Also add `listIndexed` (class `read`) so the agent can answer "what is already
indexed?" without guessing. **Do not** add `removeFromIndex` — that is
`destructive` and gives the copilot a delete capability over shared state with
no corresponding user-facing affordance.

The copilot's instructions **MUST** tell it that indexing prompts the user, so
it proposes rather than fires.

---

## 7. The terminal agent

The terminal agent is a hand-rolled goal loop, not a `ToolLoopAgent`. It has no
tool registry, and its approval is a genuine IPC round-trip
(`terminal:block-proposed` → user clicks → `terminal:approve` /
`terminal:reject` → `resolveApproval`).

**MUST NOT** be migrated onto `ToolLoopAgent` as part of this work. It is a
working feature and a rewrite risks it for no stated gain.

**MUST** use the §3 vocabulary when its operations are described in code, docs,
or UI, so that "destructive" means one thing across the app. Its command
execution is `destructive` by the §3.1 rules (arbitrary shell), and its current
per-block approval is correct — do not weaken it.

---

## 8. Budgets

Tool definitions are sent on **every** turn. The copilot is rebuilt per turn
(`task-copilot-agent.ts:82` carries the current local time into the prompt), so
its tool set is paid for repeatedly.

| Agent | Today | After §6 | Ceiling |
| --- | --- | --- | --- |
| Focus copilot | 27 | 34 | **36** |
| Chat | 49 | 53 | **56** |

The chat agent's increase is not a choice: `allTools` (`tools/index.ts`) spreads
every registered group, so adding `tools/repo.ts` (§6.1) reaches it implicitly.
That is the right default — the chat agent is the general surface — but it means
the chat agent's tool set changes whenever *any* new group is registered, and
the ceiling is what catches that.

Ceilings are guardrails with headroom above the post-§6 count, not targets. A
change that pushes an agent past its ceiling **MUST** either drop tools or raise
the ceiling in this document in the same review; silently exceeding it is not
acceptable.

Step budgets are **not** governed here beyond recording them (§2). The copilot's
25 and the chat agent's 40 are both deliberate.

---

## 9. Context injection

Chat and copilot both inject context that is not a tool. Rules:

- **Project context** is rendered by `ai/project-context.ts` into the system
  prompt. An agent scoped to a project **MUST** receive it; the copilot adds a
  filing instruction on top.
- **Local time** is injected because the model cannot otherwise schedule
  realistically. It is a function of the current turn, which is why the copilot
  is rebuilt per turn rather than cached.
- **Agent caching** is keyed on `(provider, model, mode, page, notebook, project)`
  in `ipc/agent-runtime.ts`. Any new context input **MUST** be added to
  `cacheKey`, or scoped conversations will share an agent whose prompt omits it.
  This is an existing footgun; `cacheKey` has a comment saying so.

---

## 10. Verification bar

There is no CI and no pre-commit hook; `npm test` requires `npm run build`
first. The bar for a change to this domain is therefore explicit rather than
assumed.

Any change to tools, capabilities, or agent composition **MUST** ship with:

1. **A tool-level test** exercising `execute` against an in-memory or temp
   fixture — precedent `__tests__/copilot-tools.test.ts`.
2. **An agent-definition test** asserting the exposed tool set and the derived
   approval flags — precedent `__tests__/copilot-agent.test.ts`.
3. **The §5.2 exhaustiveness assertion**, updated to cover the new tool.
4. **A negative case** for anything gated: assert the tool is *not* executed
   when approval is denied, and that the agent does not retry the denied call
   (the copilot instructions already require this behaviour).

AI SDK DevTools is available for local inspection of tool calls; it is a
development aid, not a substitute for the above.

---

## 11. Non-goals

- Migrating the terminal agent onto `ToolLoopAgent` (§7).
- A plugin/tool registry, DI container, or dynamic tool discovery.
- Per-handler file granularity. 49 tools is a normal number.
- Changing provider selection, the fallback chain, or the model catalogue.
- Prompt/UX redesign of the copilot beyond the §6.2 note about indexing.
