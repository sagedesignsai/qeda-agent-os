---
sessionId: session-261106-104228-afq7
---

# Requirements

### Overview
Extend the project context system so every agent receives visibility into **all** workspace resources belonging to the active project — not just tasks, repo, and RAG memories. This enables cross-workspace awareness: the Studio Copilot can reference existing takes, the Focus Copilot can create tasks grounded in actual documents, and the chat agent can answer "what have I done on this project?" by surfacing terminal sessions, research runs, and more.

### Current State
- `renderProjectContext()` renders: project name, description, deadline, repo path, task counts, and recent RAG memories
- `ProjectLinkedCounts` in `projectOverview()` counts: documents, studio takes, terminal sessions, chat sessions, contacts, awaiting replies
- **Missing from both**: research runs, soundlab sessions, code projects, knowledge pages scoped to the project
- **No agent tools** exist to list these resources — agents are blind to 80% of the user's work

### Goals
1. **Enrich the `## Active project` prompt block** with a `### Project resources` subsection listing all workspace resources (studio takes, documents, research runs, terminal sessions, soundlab sessions, knowledge pages, code projects)
2. **Add read-only agent tools** for cross-workspace discovery: `listStudioTakes`, `listDocuments`, `listResearchRuns`, `listTerminalSessions`, `listSoundLabSessions`, `listKnowledgePages`
3. **Inject the resources block into all agents**: chat agent, focus copilot, studio copilot, model builder, motion copilot, document drafter, correspondence copilot

### Scope

**In Scope:**
- New `projectResources()` DB function that queries all resource tables by project ID
- New `renderProjectResources()` function in `project-context.ts`
- New read-only tools in `tools/workspace-resources.ts`
- Updated `renderProjectContext()` to include the resources block
- Updated `ProjectLinkedCounts` to include missing resource types

**Out of Scope:**
- Writing new IPC channels (existing `renderProjectContext()` is already called by all IPC handlers)
- UI changes to the project detail page
- SoundLab CRUD tools (only listing for context)
- Builder session history (not project-scoped)

# Technical Design

### Current Implementation

**Context flow:** All IPC handlers call `renderProjectContext({ projectId })` to generate the `activeProject` string passed to agents. The function reads from `getProject()` and `projectRollup()`, and appends recent RAG memories. No resource data is queried.

**Existing DB functions that support project-scoped listing:**
- `listStudioTakes(projectId)` — `src/main/db/studio-store.ts:127`
- `listDocuments(projectId)` — `src/main/db/documents.ts:49`
- `listTerminalSessions({projectId})` — `src/main/db/terminal.ts:49`
- `listSessions({projectId})` — `src/main/db/sessions.ts:48`
- `listResearchRuns({notebookId})` — `src/main/db/research.ts:127` (no project filter!)
- `listCodeProjects(projectId)` — `src/main/db/code-projects.ts:31`
- No `listSoundLabSessions(projectId)` exists — raw SQL needed
- No `listKnowledgePages(projectId)` exists — raw SQL needed

**Agent injection points:**
- Chat agent: `renderContextBlock()` in `agent.ts:162` calls `renderProjectContext()`
- Focus copilot: `buildInstructions()` in `task-copilot-agent.ts:111` receives `activeProject` string
- Studio copilot: `buildStudioInstructions()` in `studio-copilot-agent.ts:40` receives `activeProject` string
- Motion copilot: `buildMotionInstructions()` receives `activeProject` string
- Document drafter: `buildInstructions()` receives `activeProject` string
- Correspondence copilot: `createCorrespondenceCopilotAgent()` receives `activeProject` string
- Model builder: no project context at all

### Key Decisions

1. **Extend `renderProjectContext()` rather than create a separate block** — the resources belong logically under the active project, and all agents already receive this block. Adding a `### Project resources` subsection keeps the change contained to one function.

2. **New DB function `projectResources()` in `src/main/db/projects.ts`** — a single function that returns all resource summaries for a project. This avoids N+1 queries in the context renderer and keeps the DB layer as the single source of truth.

3. **New tools module `tools/workspace-resources.ts`** — read-only tools for agents to discover resources on demand. These are separate from the context block (which is passive) and enable active discovery.

4. **Compact rendering** — the resources block lists up to 5 items per category with a count, keeping the prompt under token budget. Agents can call tools for full lists.

### Proposed Changes

#### 1. New DB function: `projectResources()` in `src/main/db/projects.ts`

Returns a `ProjectResources` object with summaries of all workspace resources:

```typescript
interface ProjectResources {
  studioTakes: StudioTakeSummary[];      // up to 5, most recent
  documents: PdfDocumentSummary[];        // up to 5, most recent
  researchRuns: ResearchRun[];            // up to 5, completed, most recent
  terminalSessions: TerminalSession[];    // up to 5, most recent
  soundLabSessions: SoundLabSession[];    // up to 5, most recent
  knowledgePages: PageSummary[];          // up to 5, most recent
  codeProjects: CodeProject[];            // all (usually 0-3)
  chatSessions: Session[];                // up to 5, most recent
}
```

This function calls existing DB helpers where available and raw SQL for soundlab/knowledge pages.

#### 2. New context renderer: `renderProjectResources()` in `src/main/ai/project-context.ts`

Formats the `ProjectResources` into a markdown block:

```
### Project resources
**Studio takes (3)**: "Product Demo v2" (45s), "Feature Walkthrough" (120s), "Bug Fix Demo" (30s)
**Documents (2)**: "Marketing Brief" (brief), "API Spec Draft" (spec)
**Research runs (1)**: "Competitor Analysis" (completed)
**Terminal sessions (2)**: "Setup CI pipeline" (done), "Debug auth flow" (running)
**SoundLab sessions (1)**: "Focus Mix Alpha" (120 BPM, C major)
**Knowledge pages (8)**: "Architecture Decisions", "User Research Notes", ...
**Code projects (1)**: "frontend" (ready, 142 files)
**Chat sessions (3)**: "API Design Discussion", ...
```

#### 3. Updated `renderProjectContext()` in `src/main/ai/project-context.ts`

After the existing task counts and RAG memories, append the resources block. Best-effort: returns '' on failure.

#### 4. New tools: `tools/workspace-resources.ts`

Read-only tools for agent discovery:
- `listStudioTakes(projectId?)` — list video takes
- `listDocuments(projectId?)` — list drafted documents
- `listResearchRuns(projectId?)` — list completed research
- `listTerminalSessions(projectId?)` — list past terminal work
- `listSoundLabSessions(projectId?)` — list music sessions
- `listKnowledgePages(projectId?)` — list knowledge pages
- `listCodeProjects(projectId?)` — list linked repos

These tools default to the active project if no ID is provided.

#### 5. Register tools in `tools/index.ts`

Add to `allTools` so the chat agent has access. The copilot gets a subset via `contextTools`.

#### 6. Update `ProjectLinkedCounts` in `src/main/db/projects.ts`

Add missing counts: `researchRuns`, `soundLabSessions`, `codeProjects`, `knowledgePages`.

### Architecture Diagram

``` mermaid
graph LR
  A[IPC Handler] -->|calls| B[renderProjectContext]
  B -->|reads| C[getProject]
  B -->|reads| D[projectRollup]
  B -->|reads| E[getRecentProjectMemories]
  B -->|NEW| F[projectResources]
  F -->|queries| G[studio-store]
  F -->|queries| H[documents]
  F -->|queries| I[research]
  F -->|queries| J[terminal]
  F -->|queries| K[soundlab SQL]
  F -->|queries| L[knowledge SQL]
  F -->|queries| M[code-projects]
  F -->|queries| N[sessions]
  B -->|renders| O[## Active project + ### Project resources]
  O -->|passed as activeProject| P[All Agents]
```

### Risks
- **Token budget**: The resources block could be large for projects with many resources. Mitigation: cap at 5 items per category, show only title + one metadata field.
- **Performance**: 8 DB queries per context render. Mitigation: the queries are simple COUNT/LIMIT operations on indexed columns; total cost is <5ms.
- **Backward compatibility**: `ProjectLinkedCounts` gains new fields. Mitigation: all new fields are additive; existing consumers only read the fields they know about.

# Delivery Steps

### ✓ Step 1: Add projectResources() DB function
Create `projectResources()` in `src/main/db/projects.ts` that queries all workspace resource tables by project ID.
- Add `listResearchRunsByProject(projectId)` to `src/main/db/research.ts` (missing project filter)
- Add raw SQL queries for `soundlab_sessions` and knowledge `pages` scoped by `project_id`
- Return capped summaries (up to 5 per category) from: studio takes, documents, research runs, terminal sessions, soundlab sessions, knowledge pages, code projects, chat sessions
- Add missing counts to `ProjectLinkedCounts`: researchRuns, soundLabSessions, codeProjects, knowledgePages

### ✓ Step 2: Add renderProjectResources() and update renderProjectContext()
Create `renderProjectResources()` in `src/main/ai/project-context.ts` and integrate it into the active project block.
- New function formats `ProjectResources` into a compact markdown subsection
- Cap at 5 items per category with title + one metadata field (e.g. duration for takes, template for documents)
- Append the `### Project resources` subsection to `renderProjectContext()` after RAG memories
- Best-effort: returns '' on any failure, never breaks a turn

### ✓ Step 3: Create workspace-resources tools module
Create `src/main/tools/workspace-resources.ts` with read-only agent tools for cross-workspace discovery.
- `listStudioTakes(projectId?)` — lists video takes with duration, source type, zoom/caption counts
- `listDocuments(projectId?)` — lists drafted documents with title, template, block count
- `listResearchRuns(projectId?)` — lists completed research with question, source count
- `listTerminalSessions(projectId?)` — lists past terminal work with goal, status
- `listSoundLabSessions(projectId?)` — lists music sessions with BPM, key, track count
- `listKnowledgePages(projectId?)` — lists knowledge pages with title, notebook
- `listCodeProjects(projectId?)` — lists linked repos with directory, index status
- All tools default to the active project if no ID provided, return empty array if no project

### ✓ Step 4: Register tools and wire into all agents
Register the new tools in `tools/index.ts` and ensure all agents receive the enriched context.
- Export `workspaceResourceTools` from `tools/index.ts` and merge into `allTools`
- Add workspace resource tools to the copilot's `contextTools` in `task-copilot-agent.ts`
- Update agent base instructions in `agent.ts` BASE_INSTRUCTIONS to mention the new tools
- Verify the studio copilot, motion copilot, document drafter, and correspondence copilot all receive the enriched `activeProject` string automatically (they already call `renderProjectContext()` via IPC handlers)