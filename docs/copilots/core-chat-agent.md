# Core Chat Agent

**Location**: `src/main/ai/agent.ts`
**Factory**: `createDesktopAgent(options)`
**Type**: General-purpose desktop agent for the `/chat` surface

## Overview

The chat agent is Qeda's primary conversational AI. It runs in the main process with full access to the user's filesystem, shell, knowledge workspace, and external services. It is **cached per provider/model/mode/context** and reused across turns.

## Modes & Step Budgets

The agent operates in three modes, each with different system prompts and step budgets:

| Mode | Steps | Use Case | System Prompt Focus |
|------|-------|----------|-------------------|
| **chat** | 40 | Conversational assistance | Desktop agent capabilities (filesystem, shell, workspace, web) |
| **research** | 60 | Deep research investigations | Research protocol (discover → read → evidence → synthesize with citations) |
| **notebook** | 120 | Multi-page guide/tutorial generation | Notebook framing → structure planning → section research → imagery gathering |

## System Prompt Structure

All modes inherit `BASE_INSTRUCTIONS`, which cover:

### Capabilities Sections
- **Knowledge workspace**: list, search, read, create pages/notebooks
- **Task management**: read, create, complete, schedule tasks
- **Projects**: create, list projects
- **Web research**: search, fetch URLs, scrape pages, library docs
- **Assets**: images, text-to-speech, transcribe audio
- **Deep research**: `startResearchRun`, `recordSource`, `recordEvidence`, `completeResearchRun`
- **Document drafting**: create/edit block documents
- **File System**: read, list, write (approval), delete (approval)
- **Shell/Terminal**: execute commands (approval), or hand to terminal
- **Clipboard**: read/write
- **Semantic search**: search indexed documents, put pages into vector index
- **Workspace resources**: discover existing work (studio takes, documents, research runs, etc.)

### Research Protocol (research mode only)
1. Call `startResearchRun` with precise question
2. Discover sources with `webSearch` or `advancedSearch`
3. Record each source with `recordSource`
4. Read promising sources with `fetchUrl`/`scrapePage`; record quotes with `recordEvidence`
5. Synthesize findings, trace to recorded evidence
6. Call `completeResearchRun`; offer to write into page

### Notebook Generation (notebook mode only)
1. Frame: rewrite request as title + scope
2. Plan structure before writing (call `createPlan`)
3. Research each section (webSearch → fetchUrl → recordSource/recordEvidence)
4. Gather imagery with `findImages`
5. Build pages with proper structure

### Planning Protocol (all modes)
Before using other tools:
1. Call `createPlan` with ordered list of tasks
2. For each task: call `updatePlanItem` with `in-progress`, do work, call `updatePlanItem` with `done`
3. Revise plan if scope changes

## Caching Strategy

**Cache Key**: `{providerId}::{modelId}::{mode}::{context parts}`

Context parts (all optional, all included in key):
- `p:{pageId}` – scoped to a page
- `n:{notebookId}` – scoped to a notebook
- `pr:{projectId}` – scoped to a project
- `t:{taskId}` – scoped to a task

**Located in**: `src/main/ipc/agent-runtime.ts`

### Cache Lifecycle
- Built on first turn in a given mode + context
- Reused for all subsequent turns in same configuration
- **Invalidated** when:
  - User changes provider or model (via `resetAgents()`)
  - User switches modes
  - User changes context scope

### Project Resolution
- If no explicit project in context, resolves to persisted default (`resolveActiveProjectId`)
- Resolution happens **before** cache key computation, so fallback and explicit scopes hit same cache entry when resolving to same project
- System prompt always names the project (from `renderProjectContext`)

## Tool Set (27 Groups)

### Filesystem (4 tools)
```
readFile, listDir, writeFile (approval), deleteFile (approval)
```
Source: `src/main/tools/filesystem.ts`

### Shell (1 tool)
```
runShell (approval)
```
Source: `src/main/tools/shell.ts`

### Clipboard (2 tools)
```
readClipboard, writeClipboard (approval)
```
Source: `src/main/tools/clipboard.ts`

### Web & Services (9 tools)
```
webSearch, fetchUrl, advancedSearch, scrapePage, libraryDocs,
findImages, textToSpeech, transcribeAudio, downloadResource
```
Source: `src/main/tools/web.ts`, `src/main/tools/services.ts`

### RAG/Semantic Search (7 tools)
```
searchDocs, listIndexed, indexFile, indexPage, removeFromIndex,
storeProjectMemory, searchProjectMemory, listProjectMemories
```
Source: `src/main/tools/rag.ts`, `src/main/tools/workspace-rag.ts`

### Workspace (8 tools)
```
listPages, getPage, findPages, relatedPages,
createNotebook, writePage, appendToPage,
startResearchRun, recordSource, recordEvidence, completeResearchRun
```
Source: `src/main/tools/workspace.ts`

### Repository (4 tools)
```
gitStatus, gitLog, gitDiffStat, grepSearch
```
Source: `src/main/tools/repo.ts`

### Task Management (5 tools)
```
listTasks, getTask, createTask, completeTask, listProjects
```
Source: `src/main/tools/tasks.ts` (subset)

### Document Drafting (4 tools)
```
createDocument, appendBlocks, readDocument, getDocumentOutline
```
Source: `src/main/tools/documents-drafter.ts`

### Studio (subset of editing tools)
```
createZoom, createCut, createCaption, createMarketing
(+ git/file context tools; no deep recording telemetry)
```
Source: `src/main/tools/studio.ts` (chat variant has `defaultToLatestTake: true`, `includeContextTools: false`)

### Computer Use (6 tools)
```
screenshot, click, type, doubleClick, moveMouse, scroll
```
Source: `src/main/tools/computer-use.ts`

### Browser Use (6 tools)
```
navigate, clickSelector, typeSelector, evaluate, listBrowsers, openBrowser
```
Source: `src/main/tools/browser-use.ts`

### Resource Discovery (8 tools)
```
listStudioTakes, listDocuments, listResearchRuns, listTerminalSessions,
listSoundLabSessions, listKnowledgePages, listCodeProjects, listChatSessions
```
Source: `src/main/tools/workspace-resources.ts`

### Planning (2 tools)
```
createPlan, updatePlanItem
```
Source: `src/main/tools/plan.ts`

## Approval Policy

**Policy Map**: `src/main/tools/policies/chat.ts`
**Derivation Function**: `createApprovalPolicy(chatToolPolicies)` in `src/main/tools/capability.ts`

### Approval Decisions

**`user-approval` (requires approval):**
- `writeFile` – pre-existing guardrail (writing to disk is not silently reversible)
- `deleteFile` – destructive
- `runShell` – destructive
- `writeClipboard` – pre-existing guardrail (visible, disruptive)
- `removeFromIndex` – destructive

**`not-applicable` (auto-approved):**
- `indexFile`, `indexPage` – cost tools, but user is present in direct chat
- `findImages`, `textToSpeech`, `transcribeAudio` – cost tools; same rationale
- `downloadResource` – auto-approved when downloading media/assets into project

**Everything else:** Auto-approved

### Why Overrides Exist

The chat policy has **4 overrides** in `chatToolPolicies`:

1. **`writeFile` / `writeClipboard` stricter than default** ("write-local" → "user-approval")
   - Reason: Pre-existing guardrails from earlier versions; reaching user's disk or clipboard is disruptive
   - Not changing: Preserves UX expectations

2. **`indexFile` / `indexPage` looser than default** ("cost" → "not-applicable")
   - Reason: Chat is a direct, user-initiated surface; user has already opted in by configuring providers
   - Gating every embedding call would be noise, not safety
   - Task copilot keeps the strict default (more autonomous, runs on background intent)

## Guidelines (from System Prompt)

- Always describe what you are about to do before calling a tool
- For destructive operations, explain exact impact before requesting approval
- Prefer `findPages` over re-deriving knowledge the workspace already contains
- Prefer `listTasks` before creating new tasks (avoid duplicates)
- Cite sources with URLs when stating non-obvious facts learned from web
- Be concise; use markdown formatting

## Context Integration

When scoped to workspace context (page, notebook, project, task):

- **Page context**: Rendered into system prompt via `renderPageForPrompt(page)` (first 10KB of markdown)
- **Notebook context**: Full notebook listed via `renderContextBlock` (all pages)
- **Project context**: Active project details rendered via `renderProjectContext(projectId)` (outcome, deadline, repo path, task progress)
- **Task context**: Task details (title, description, steps) rendered via `renderContextBlock`

This allows "chat with this page/notebook/project/task" without duplicating content into message list.

## Fallback & Provider Chain

When a turn fails on the active provider:
1. Try next configured provider in registry order (free tiers first)
2. Retry only on retryable failures (408, 409, 425, 429, 5xx, transient network)
3. Stop if any content reaches the renderer
4. UI shows notice naming the fallback provider

Fallback can be disabled in Settings.

## Key Differences from Copilots

| Aspect | Chat Agent | Copilots |
|--------|-----------|----------|
| **Caching** | Yes (across turns) | No (rebuilt per turn) |
| **Rebuild** | Only on provider/model change | Every turn (carries current time) |
| **Autonomy** | Direct user intent ("ask a question") | Background intent ("plan my day") |
| **Cost Approval** | Looser (auto-approved) | Stricter (requires approval) |
| **Shell Access** | Direct `runShell` | Via `handToTerminal` (delegated) |
| **Step Budget** | 40–120 depending on mode | 20–25 fixed per copilot |
| **Tool Set** | 27 groups (general-purpose) | 3–8 groups (domain-specific) |

