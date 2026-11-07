# Qeda Copilots Documentation Index

Complete architectural documentation of all 10 AI agents and their tool systems.

## Start Here

- **`README.md`** – Quick reference table + file guide (start here!)
- **`architecture.md`** – System design: IPC, caching, rebuild strategy, approval gating

## Core Systems

- **`approval-policies.md`** – How approval derivation works; all 4 policy maps; why overrides exist
- **`tool-registry.md`** – Complete inventory of 28 tool files; which agents use each tool

## Per-Agent Documentation

### Chat Agent (General Purpose)
- **`core-chat-agent.md`** – 27 tool groups, 3 modes (chat/research/notebook), caching strategy

### Command Execution
- **`other-copilots.md`** § Terminal Agent – Shell command executor with approval gates

### Creative Domains
- **`other-copilots.md`** § Studio Copilot – Video editor; timeline, captions, marketing
- **`other-copilots.md`** § Motion Copilot – 3D animator; scenes, keyframes, procedural geometry
- **`other-copilots.md`** § Music Copilot – DJ; playlists, ambience, focus integration

### Productivity & Authoring
- **`other-copilots.md`** § Terminal Agent – Goal-driven shell (also in document-drafter.md)
- **Task Copilot** (referenced in README, but covered in `core-chat-agent.md` differences section)
- **`other-copilots.md`** § Correspondence Copilot – Message drafting ("Qeda does not send")
- **`other-copilots.md`** § Document Drafter – Professional documents; safety via tool set omissions
- **`other-copilots.md`** § Model Builder – Static 3D geometry (motion without animation)

## Quick Navigation

### By Question

**"How does approval work?"**
→ `approval-policies.md` (derivation engine, policy maps, overrides)

**"What tools does each agent get?"**
→ `tool-registry.md` (complete matrix) + `architecture.md` (IPC routing)

**"How is the chat agent cached?"**
→ `core-chat-agent.md` § Caching Strategy + `architecture.md` § Agent Caching Strategy

**"Why do copilots rebuild every turn?"**
→ `architecture.md` § Copilot Rebuild Strategy (system prompt must carry current time)

**"Can the drafter export/send files?"**
→ `other-copilots.md` § Document Drafter (safety is in tool set omissions)

**"How does correspondence drafting work without sending mail?"**
→ `other-copilots.md` § Correspondence Copilot (records in app, does not send)

**"What's the difference between Motion Copilot and Model Builder?"**
→ `other-copilots.md` (Motion has keyframes; Model Builder doesn't)

**"How are tool calls approved?"**
→ `architecture.md` § Tool Execution & Approval Gate (approval path vs. non-approval path)

**"What happens when a provider fails?"**
→ `core-chat-agent.md` § Fallback & Provider Chain + `architecture.md` § Provider & Model Resolution

### By Domain

**System Architecture & IPC**
1. `architecture.md` – Full system diagram, IPC flow, caching, rebuilds
2. `approval-policies.md` – Approval derivation engine
3. `core-chat-agent.md` – Chat agent caching strategy (only cached agent)

**Tool Systems**
1. `tool-registry.md` – All 28 files, which agents use them
2. `approval-policies.md` – Capability classification & override reasons
3. Individual agent docs – Their specific tool sets

**Copilot Details**
1. `core-chat-agent.md` – Chat agent (modes, caching, tools, policy)
2. `other-copilots.md` – Terminal, Studio, Motion, Music, Correspondence, Drafter, Model Builder

---

## Files in This Directory

```
docs/copilots/
├── INDEX.md                    ← You are here
├── README.md                   ← Quick reference + navigation guide
├── core-chat-agent.md          ← Chat agent (caching, tools, policy)
├── architecture.md             ← IPC, caching, approval, provider chain
├── approval-policies.md        ← Derivation engine, all 4 policy maps
├── tool-registry.md            ← All 28 tool files, agent access matrix
└── other-copilots.md           ← Terminal, Studio, Motion, Music, Correspondence, Drafter, Model Builder
```

---

## Key Concepts Across All Documents

### One Approval Source
`createApprovalPolicy(policyMap)` in `src/main/tools/capability.ts` is the single source of truth. Used by:
- Agent `toolApproval` parameter
- IPC approval card emission
- Tools page (manual execution)

All three always agree.

### Fail Closed
Unknown tools are **denied**, not passed through. If a tool is added to an agent without a policy map entry, it's denied at runtime.

### Chat Cached, Copilots Rebuilt
- **Chat agent**: Cached across turns (key = provider/model/mode/context). Only invalidated on provider/model change.
- **All copilots**: Rebuilt every turn so system prompt carries current time (critical for scheduling, dating, context).

### Safety in Tool Sets
For sensitive domains (drafter, correspondence), the real safety boundary is **deliberately absent tools**, not the prompt:
- Drafter has no send/export/delete → cannot escalate
- Correspondence has no mail capability → cannot send real mail
- Terminal has no filesystem write → pure shell

### IPC is the Boundary
- Renderer never directly calls agents or tools
- All agent execution happens in main process
- Results stream back to renderer via IPC events
- Approval gates are at main-process level

### Grounding Before Generation
All agents prefer "read first":
- Search before deciding
- Fetch before citing
- Read existing work before creating
- This prevents hallucination and ensures grounding in reality

---

## Architecture Diagram

```
Renderer (React/Electron)
    │
    ├── agent:chat → IPC Handlers → Chat Agent → allTools + chatApprovalPolicy
    ├── terminal:* → IPC Handlers → Terminal Agent → {runShell, readFile, listDir, plan}
    ├── copilot:* → IPC Handlers → Various Copilots → Domain-specific tools + domain-specific policies
    │
    └── Stream events back ← Tools execution ← Database + Filesystem + Network + Services
```

---

## For Developers

### Adding a New Tool

1. **Define** in `src/main/tools/my-domain.ts`
2. **Classify** in `src/main/tools/policies/agent-type.ts` (add entry with capability, override if needed)
3. **Export** from `src/main/tools/index.ts` 
4. **Assign** to agents in agent factories or `allTools`
5. **Test**: `__tests__/agent-capabilities.test.ts` ensures all tools have policy entries

See `approval-policies.md` § Typical Workflow: Adding a New Tool

### Adding a New Copilot

1. **Create agent factory** in `src/main/ai/my-copilot-agent.ts`
   - Build system prompt with grounding context
   - Assemble tool set
   - Return `ToolLoopAgent` with `toolApproval` and `stopWhen`
2. **Create policy map** in `src/main/tools/policies/my-copilot.ts`
   - Classify all tools used
   - Add overrides with reasons if needed
3. **Create IPC handler** in `src/main/ipc/handlers/my-copilot.ts`
   - Receive message payload
   - Build fresh agent (per-turn rebuild)
   - Stream results
   - Emit approval requests if needed
4. **Register** in `src/main/ipc/index.ts` (if not already auto-discovered)

See `architecture.md` § IPC Handler Architecture for details.

### Understanding Approval Flow

```
Tool call happens
  ↓
Agent checks toolApproval policy
  ↓
Policy returns 'user-approval'?
  ├─ NO → Execute immediately
  └─ YES → Emit {surface}:approval-request
              ↓
          Renderer shows card
              ↓
          User clicks Approve/Deny
              ↓
          Send {surface}:approve / {surface}:reject
              ↓
          Main: Execute or return "DENIED" to agent
              ↓
          Agent continues loop
```

See `architecture.md` § Tool Execution & Approval Gate

---

## Document Conventions

- **Locations** use `src/main/...` prefix (main process code; Qeda is an Electron app)
- **Code examples** show actual patterns from codebase
- **Tool names** use monospace: `readFile`, `deleteFile`
- **Policy names** use monospace: `chatToolPolicies`, `copilotToolPolicies`
- **Capabilities** use monospace: `read`, `write-local`, `destructive`, `cost`, `network`
- **Approval levels** use monospace: `not-applicable`, `user-approval`, `dynamic-only`
- **IPC events** use monospace: `agent:chat`, `terminal:approve`, `copilot:approval-request`

---

## Related Documentation

Outside this directory:
- `docs/agent-tooling-spec.md` – Formal spec for capability taxonomy & approval derivation
- Agent system prompt text in `src/main/ai/agent.ts` (BASE_INSTRUCTIONS, NOTEBOOK_SUPPLEMENT)
- Capability derivation table in `src/main/tools/capability.ts` (default mappings)
- IPC channels in `src/main/ipc/channels.ts` (type definitions for all events)

