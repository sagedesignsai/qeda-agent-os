# System Architecture & IPC Orchestration

How Qeda's agents are built, cached, rebuilt, and dispatched through the IPC layer.

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────┐
│              Renderer (React/Electron)              │
│  Chat, Terminal, Tasks, Studio, Motion, Music, etc. │
└────────┬──────────────────────────────────────────┬─┘
         │ IPC Events (renderer → main)             │
         │ agent:chat, terminal:*, copilot:*, etc   │
         │                                          │ IPC Events (main → renderer)
         │                                          │ agent:stream-chunk, blocks, etc.
         │                                          │
┌────────▼──────────────────────────────────────────▼─┐
│         IPC Handlers (src/main/ipc/handlers/)        │
│                                                      │
│  agent-chat.ts        ──→  Chat Agent               │
│  terminal.ts          ──→  Terminal Agent           │
│  copilot.ts           ──→  Task Copilot             │
│  studio-copilot.ts    ──→  Studio Copilot           │
│  motion-copilot.ts    ──→  Motion Copilot           │
│  music-copilot.ts     ──→  Music Copilot            │
│  correspondence-*.ts  ──→  Correspondence Copilot   │
│  document-drafter.ts  ──→  Document Drafter         │
│                                                      │
└────────┬──────────────────────────────────────────┬─┘
         │                                          │
         │ Agent Factory & Caching                 │ Tool Execution
         │                                          │
┌────────▼──────────────────────────────────────────▼─┐
│           Agent Runtime (src/main/ai/)              │
│                                                      │
│  agent.ts                  Core chat agent factory  │
│  agent-runtime.ts          Chat agent cache         │
│  terminal-agent.ts         Terminal agent (stateful)│
│  task-copilot-agent.ts     Task copilot factory     │
│  studio-copilot-agent.ts   Studio copilot factory   │
│  motion-copilot-agent.ts   Motion copilot factory   │
│  music-copilot-agent.ts    Music copilot factory    │
│  correspondence-*.ts       Correspondence factory   │
│  document-drafter-agent.ts Drafter factory          │
│  model-builder-agent.ts    Model builder factory    │
│                                                      │
│  + provider.ts             Model resolution         │
│  + settings.ts             User settings + keys     │
│  + project-context.ts      Project prompt rendering │
│  + fallback.ts             Provider chain retry     │
│                                                      │
└────────┬──────────────────────────────────────────┬─┘
         │                                          │
         │ All Tools                               │ Database Queries
         │                                          │
┌────────▼──────────────────────────────────────────▼─┐
│            Tools (src/main/tools/)                   │
│       + Database (src/main/db/)                      │
│                                                      │
│  28 tool files        ──→  47+ total tools          │
│  4 policy files       ──→  Approval derivation      │
│  Database client      ──→  SQLite queries           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Agent Caching Strategy

### Chat Agent (Only Cached Agent)

**Cache Location**: `src/main/ipc/agent-runtime.ts`

**Cache Key Structure**:
```
{providerId}::{modelId}::{mode}::{contextParts}
```

Where `contextParts` are all optional and combined:
- `p:{pageId}` – page scope
- `n:{notebookId}` – notebook scope
- `pr:{projectId}` – project scope
- `t:{taskId}` – task scope

**Example Cache Keys**:
```
openai::gpt-4o::chat::pr:my-project
openai::gpt-4o::research::pr:my-project|p:page-123
groq::llama::notebook::-
```

**Cache Lifecycle**:

1. **Build** (first turn in configuration)
   ```typescript
   // src/main/ipc/agent-runtime.ts :: getAgent()
   const key = cacheKey(target, mode, context);
   if (!agentCache.has(key)) {
     agent = createDesktopAgent({
       target, researchMode: mode !== 'chat', 
       notebookMode: mode === 'notebook',
       context
     });
     agentCache.set(key, agent);
   }
   ```

2. **Reuse** (subsequent turns in same configuration)
   ```typescript
   // Same key hit: return cached agent
   return agentCache.get(key);
   ```

3. **Invalidate** (user changes provider/model)
   ```typescript
   // src/main/ai/settings.ts :: setActiveModel()
   resetAgents();  // Clears entire cache
   ```

### Project Resolution in Cache Key

**Key insight**: Project resolution happens **before** cache key computation.

```typescript
// If no explicit project in context:
const resolved = context?.projectId
  ? context
  : {
      ...context,
      projectId: resolveActiveProjectId(null)  // Resolve to persisted default
    };

const key = cacheKey(target, mode, resolved);  // Include resolved project
```

**Why this matters**:
- Unscoped turn + explicit scope both resolve to same project → same cache entry (correct)
- If resolution happened after key, they'd have different keys (wrong; wouldn't share agent)

## Copilot Rebuild Strategy

**All non-chat agents rebuild per turn.**

### Why Rebuild Every Turn?

**System prompt must carry current local time** for:
- Task scheduling (copilot needs "right now" to book-keep realistic deadlines)
- Document dating (drafter needs "today's date")
- Message drafting (correspondence needs timestamp context)
- Music/studio decisions (timing-aware recommendations)

Caching a copilot would freeze these in the first turn's system prompt.

### Per-Turn Rebuild Flow

```typescript
// Example: task copilot in copilot.ts IPC handler
export async function handleCopilotChat(req: CopilotChatRequest) {
  const agent = createTaskCopilotAgent({
    activeProject: renderProjectContext(...),
    target: userSelectedModelTarget,
    planManager: new PlanManager(),
  });
  
  // Freshly built with current time in system prompt
  const { text, steps } = await agent.generateText(...);
  
  // Emit results to renderer
  emit('copilot:result', { text, steps });
}
```

### Rebuild Frequency Table

| Agent | Rebuild | Reason |
|-------|---------|--------|
| **Chat** | Only on provider/model change | Stateless; scales well; current time not essential |
| **Terminal** | Per goal | Stateful loop; one session per goal |
| **Task Copilot** | Per turn | Must carry current time for scheduling |
| **Studio Copilot** | Per turn | Must carry playhead time, active take context |
| **Motion Copilot** | Per turn | Must carry current scene state |
| **Music Copilot** | Per turn | Must carry current playback state |
| **Correspondence Copilot** | Per turn | Must carry current board state, time context |
| **Document Drafter** | Per turn | Must carry current date for documents |
| **Model Builder** | Per turn | Must carry current scene state |

## IPC Handler Architecture

### Agent-Chat Handler (`src/main/ipc/handlers/agent-chat.ts`)

**Flow**:
```
1. Receive: { messages: UIMessage[], context?: ChatContext, mode?: 'chat'|'research'|'notebook' }
2. Resolve project (if unscoped)
3. Get/build chat agent from cache (key = {provider, model, mode, context})
4. convertToModelMessages(messages)
5. Stream: agent.generateTextStream()
   - Emit 'agent:stream-chunk' per chunk
   - Renderer accumulates into UI parts
6. On completion: sessions:save-messages (renderer stores message state)
```

**Caching**: Yes (across turns in same config)

### Terminal Handler (`src/main/ipc/handlers/terminal.ts`)

**Flow**:
```
1. Receive: { goal: string, sessionId: string }
2. Create (don't cache) terminal agent with {runShell, readFile, listDir, plan}
3. Emit 'terminal:plan-created' with initial plan
4. Listen: terminal:approve / terminal:reject per block
5. On approve:
   - Execute runShell → real process
   - Stream output: terminal:block-output
   - Update block status: terminal:block-done
6. Loop until step budget exhausted or goal achieved
```

**Caching**: No (stateful; one session per goal)

**Approval Model**: Every `runShell` blocks until user approves via IPC

### Copilot Handlers (All Others)

**Generic pattern**:
```
1. Receive: { messages: UIMessage[], context?: CopilotContext }
2. Build fresh agent (rebuilt every turn)
   - System prompt carries: current time, active context (take/doc/scene/etc.)
   - Specific tool set for domain
   - Approval policy from domain's `toolPolicies`
3. Stream: agent.generateTextStream()
   - Emit 'copilot:stream-chunk' per chunk
   - Emit 'copilot:approval-request' if tool needs approval
4. On approval: Execute tool, stream results, continue loop
```

**Specific Handlers**:

| Handler | Agent | Tools | Approval |
|---------|-------|-------|----------|
| `studio-copilot.ts` | Studio | Timeline edits + git/file context | Auto (domain-safe) |
| `motion-copilot.ts` | Motion | Scene ops + animation | Auto (domain-safe) |
| `music-copilot.ts` | Music | Library + playback | Auto (domain-safe) |
| `correspondence-copilot.ts` | Correspondence | Read + draft + record | Destructive ops gated |
| `document-drafter.ts` | Drafter | Doc creation/edit | `replaceBlock` gated |
| `copilot.ts` | Task | Tasks + grounding | Cost/destructive gated |

## Tool Execution & Approval Gate

### Non-Approval Path (Auto-Approved)

```
1. Agent calls tool (via ToolLoopAgent)
2. Tool executes immediately
3. Result returned to agent
4. Agent continues loop
```

### Approval Path

```
1. Agent calls tool (via ToolLoopAgent)
2. toolApproval policy function returns 'user-approval'
3. Tool execution **pauses**
4. Main process emits: {surface}:approval-request
   - Contains: tool name, parameters, explanation
5. UI renders approval card (Approve / Deny buttons)
6. User clicks Approve / Deny
7. Renderer sends: {surface}:approve / {surface}:reject IPC
8. Main process:
   - If approve: Execute tool → continue loop
   - If reject: Return "DENIED" to agent → continue loop
```

### Approval Policy Bridge

**Three places call approval policy:**

1. **Agent runtime** (when tool is about to execute)
   ```typescript
   agent.toolApproval = createApprovalPolicy(policyMap);
   ```

2. **IPC approval card emission** (UI needs to know which tools to gate)
   ```typescript
   if (toolApprovalPolicy({ toolCall: { toolName, dynamic: false } }) === 'user-approval') {
     emit('copilot:approval-request', ...);
   }
   ```

3. **Tools page** (manual tool execution from settings)
   ```typescript
   // src/main/ipc/handlers/tools.ts
   if (requiresApproval(toolName)) {
     // Show approval card
   }
   ```

**Single source of truth**: All three call `createApprovalPolicy(policyMap)` so they always agree.

## Step Budgets & Loop Termination

Each agent has a step budget (tool call ceiling):

```typescript
agent = new ToolLoopAgent({
  // ... tools, instructions ...
  stopWhen: isStepCount(40),  // For chat; other agents have 20-120
});
```

**What is a "step"?**
- One tool invocation (not one tool call in instructions; one actual execution)

**When step budget is hit:**
- ToolLoopAgent stops generating
- Returns `finish_reason: 'length'`
- Stream completes
- Renderer shows message

**Recovery**: Next turn, user can send a follow-up message; agent rebuilds/continues in new turn.

## Provider & Model Resolution

### Model Chain (Fallback)

When a turn fails on the active provider:

```typescript
// src/main/ai/fallback.ts :: buildModelChain()
const chain = [
  { providerId: 'openai', modelId: 'gpt-4o' },     // User selected
  { providerId: 'groq', modelId: 'llama' },         // Fallback 1 (free first)
  { providerId: 'openrouter', modelId: 'qwen' },    // Fallback 2
]

// Try each in order until one succeeds
// Retry only on retryable errors (429, 5xx, network)
// Stop as soon as ANY content reaches renderer
```

**Controlled by**: "Automatic provider fallback" toggle in Settings

### Model Selection

```typescript
// src/main/ai/provider.ts :: resolveModel()
const model = model(providerId, modelId);
// Returns: LanguageModel from @ai-sdk/{provider}
```

Resolves provider key from:
1. Settings (encrypted via `safeStorage`)
2. Environment variables (plain text, for dev)

## Project Context Integration

System prompts optionally include "Active project" block:

```typescript
// src/main/ai/project-context.ts :: renderProjectContext()
function renderProjectContext(projectId?: string): string {
  if (!projectId) return '';
  const project = getProject(projectId);
  return `
## Active Project
- Outcome: ${project.outcome}
- Deadline: ${project.deadline}
- Repository: ${project.repo_path}
- Tasks: ${project.task_count} (${project.due_today} due today)
...
  `;
}
```

Included in:
- Chat agent (if scoped to project)
- All copilots (if launched from project context)

Enables: Agents ground decisions in project scope without duplicating message list.

## Database & Tool Integration

### SQLite Client

Single SQLite database at `userData/qeda.db` holds:
- Sessions & messages
- Tasks, blocks, projects
- Research runs, evidence
- RAG vectors (via `sqlite-vec` plugin)
- Studio takes, music library, etc.

### Tool Execution Model

Tools are **synchronous or async functions** that:
1. Validate parameters (Zod schema)
2. Query database (or filesystem, or network)
3. Return structured result
4. Errors are caught and returned as `{ error: '...' }`

Example:
```typescript
// src/main/tools/tasks.ts
export const taskTools = {
  listTasks: tool({
    description: 'List all tasks, optionally filtered',
    parameters: z.object({ ... }),
    execute: async (params) => {
      const tasks = listTasks();  // SQL query via db/tasks.ts
      return { tasks };
    }
  })
}
```

## Error Handling & Logging

### Agent Stream Errors

```typescript
// IPC handler catches stream errors
agent.generateTextStream()
  .on('error', (err) => {
    emit('agent:error', { message: err.message });
  })
```

### Tool Execution Errors

```typescript
// ToolLoopAgent catches tool errors
try {
  result = await toolCall.tool.execute(params);
} catch (err) {
  result = { error: err.message };  // Returned to model, not thrown
}
```

### Fallback on Provider Error

```typescript
// src/main/ai/fallback.ts :: isRetryableProviderError()
if (error.status === 429 || error.status >= 500 || isNetworkError(error)) {
  // Try next provider in chain
} else {
  // Return error to user (400, 401, malformed tool call, etc.)
}
```

## Key Design Principles

1. **One approval source**: `createApprovalPolicy` used everywhere
2. **Fail closed**: Unknown tools denied, not passed
3. **Chat cached, copilots rebuilt**: Balances performance (chat) vs. context freshness (copilots)
4. **Project resolution first**: Ensures cache hits when they should
5. **IPC is the boundary**: Renderer never directly calls agents or tools
6. **Stateful separation**: Terminal agent is stateful (one loop); chat is stateless (per-turn)
7. **Provider chain**: Graceful degradation on failures

