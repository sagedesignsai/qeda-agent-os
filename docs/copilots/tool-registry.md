# Tool Registry

Complete inventory of 28 tool files and 47+ tools. Shows which agents can access each tool.

## Tool Files by Domain

### Core System Tools (3 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `filesystem.ts` | `readFile`, `listDir`, `writeFile` (a), `deleteFile` (a) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `shell.ts` | `runShell` (a) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `clipboard.ts` | `readClipboard`, `writeClipboard` (a) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Web & Knowledge (4 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `web.ts` | `webSearch`, `fetchUrl`, `advancedSearch`, `scrapePage` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `services.ts` | `libraryDocs`, `findImages`, `textToSpeech`, `transcribeAudio`, `downloadResource`, `searchImages`, `searchScholar`, `searchPatents` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `rag.ts` | `searchDocs`, `indexFile` (a), `indexPage` (a), `removeFromIndex` (a), `listIndexed`, `storeProjectMemory`, `searchProjectMemory`, `listProjectMemories` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `workspace-rag.ts` | `indexPageTool` (a) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Workspace (2 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `workspace.ts` | `listPages`, `getPage`, `findPages`, `relatedPages`, `createNotebook`, `writePage`, `appendToPage`, `startResearchRun`, `recordSource`, `recordEvidence`, `completeResearchRun` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `workspace-resources.ts` | `listStudioTakes`, `listDocuments`, `listResearchRuns`, `listTerminalSessions`, `listSoundLabSessions`, `listKnowledgePages`, `listCodeProjects`, `listChatSessions` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Repository (1 file)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `repo.ts` | `gitStatus`, `gitLog`, `gitDiffStat`, `grepSearch` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Productivity (2 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `tasks.ts` | `listTasks`, `getTask`, `createTask`, `createTasks`, `addSteps`, `scheduleBlock`, `listBlocks`, `getFocusStats`, `updateTask` (a), `completeTask` (a), `deleteTask` (a), `deleteBlock` (a), `moveBlock` (a), `assignTaskToProject` (a) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `plan.ts` | `createPlan`, `updatePlanItem` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Creative Domains (4 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `studio.ts` | `createZoom`, `createCut`, `createCaption`, `moveCut`, `deleteCut`, `moveCaption`, `updateStudioStyling`, `createMarketing` | ✓ (subset) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `motion.ts` | `sceneDirector`, `keyframe`, `nodeBuilder`, `proceduralModeling` | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `music.ts` | `getMusicLibrarySummary`, `searchMusic`, `createPlaylist`, `updatePlaylist`, `playMusic`, `controlPlayback`, `setAmbience`, `setLevels`, `listMusicFolders`, `listFocusTasks`, `startFocusSession` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `correspondence.ts` | `listMessages`, `getMessageDetail`, `listRecipients`, `listContacts`, `draftMessage`, `suggestRecipients`, `dispatchMessage`, `setMessageRecipients`, `recordReplyClassification`, `raiseChaseTask` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |

### Document & Project Operations (3 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `documents-drafter.ts` | `createDocument`, `appendBlocks`, `insertBlocksAt`, `replaceBlock` (a), `getDocumentOutline`, `readDocument` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `project-files.ts` | `listProjectFiles`, `readProjectFile` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `resources.ts` | (helper; no user-facing tools) | — | — | — | — | — | — | — | — | — |

### System Integration (4 files)

| File | Tools | Chat | Terminal | Task | Studio | Motion | Music | Correspondence | Drafter | ModelBuilder |
|------|-------|------|----------|------|--------|--------|-------|-----------------|---------|--------------|
| `computer-use.ts` | `listWindows`, `listCaptureTargets`, `captureScreenshot`, `getActiveWindow`, `getCursorPosition`, `moveMouse`, `click`, `doubleClick`, `typeText`, `pressKey`, `scroll`, `wait`, `startDemoRecording`, `markHighlight`, `stopDemoRecording` | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `browser-use.ts` | `openBrowser`, `navigateBrowser`, `clickSelector`, `typeSelector`, `evaluateBrowser`, `screenshotBrowser`, `closeBrowser` | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `studio-project-preview.ts` | `getProjectRunOptions`, `startProjectPreview` (a), `prepareProjectDemo` (a), `getProjectPreviewStatus`, `stopProjectPreview` (a) | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `studio-sign-in.ts` | `requestUserSignIn` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `capability.ts` | (policy derivation; no tools) | — | — | — | — | — | — | — | — | — |

### Policies (4 files)

| File | Purpose | Used By |
|------|---------|---------|
| `policies/chat.ts` | Chat agent approval map (4 overrides) | Chat agent + Tools page |
| `policies/copilot.ts` | Task copilot approval map (no overrides; derived) | Task copilot agent |
| `policies/drafter.ts` | Drafter approval map (no overrides; only `replaceBlock` gated) | Document drafter agent |
| `policies/correspondence.ts` | Correspondence copilot approval map | Correspondence copilot agent |

## Legend

- **(a)** = Requires approval (see agent-specific approval policy)
- **✓** = Agent has access to this tool
- **✗** = Agent does not have access
- **—** = Not applicable (helper file, not a tool)

## Tool Access Summary by Agent

### Chat Agent
- **28 tool groups**, 70+ tools
- Widest access (general-purpose surface)
- Four overrides in approval policy

### Terminal Agent
- **3 tools**: `runShell` (every call needs approval), `readFile`, `listDir`
- **Plus planning**: `createPlan`, `updatePlanItem`
- Deliberately stripped down (no network, workspace, clipboard)

### Task Copilot
- **28 tools** (same as chat, minus shell/clipboard/computer-use/browser-use)
- Focused: task verbs + grounding (web, workspace, repo, filesystem, resources)
- No shell (uses `handToTerminal` instead)
- Strict approval on cost tools (`indexFile`, `indexPage`)

### Studio Copilot
- **Studio editing (10)**: take/telemetry inspection, zooms, cuts, captions, effects, styling, social kit
- **Plus**: `getStudioCapability`, git/file context for caption accuracy, planning, computer-use, and browser-use
- Project-scoped preview discovery and managed server start/stop; executing or stopping a project script requires approval
- The only copilot with computer-use and browser-use: it can record a demo (`startDemoRecording` → drive → `markHighlight` → `stopDemoRecording`) and then edit the resulting take
- Authentication handoff pauses for the user to sign in directly in the browser; it never asks for credentials in chat
- Read-only filesystem access (orientation, not mutation)

### Motion Copilot
- **4 tools**: `sceneDirector`, `keyframe`, `nodeBuilder`, `proceduralModeling` + planning
- All auto-approved (domain-safe operations)

### Music Copilot
- **11 tools**: Library reading, playlist management, playback control + planning
- All auto-approved (DJ domain is safe)

### Correspondence Copilot
- **10 tools**: Read board/registry, draft/propose, record/escalate + planning
- Records sends in app (does not send mail)

### Document Drafter
- **9 tools**: Document creation/editing + project file read (scoped) + planning
- Only `replaceBlock` requires approval
- Safety in tool set: no send, export, delete, or write outside project

### Model Builder
- **4 tools**: `sceneDirector`, `nodeBuilder`, `proceduralModeling`, `createPlan`
- Same motion tools, no `keyframe` (no animation—pure geometry)

## Tool Policy Capabilities Taxonomy

Used by `createApprovalPolicy` to classify approval needs:

| Capability | Derives To | Example Tools |
|-----------|-----------|----------------|
| `read` | No approval | `readFile`, `listDir`, `getPage`, `gitStatus` |
| `write-local` | No approval | `writePage`, `createTask`, `appendBlocks` |
| `network` | No approval (chat) / Case-by-case | `webSearch`, `fetchUrl`, `findImages` |
| `cost` | Approval (copilot) / No approval (chat) | `indexFile`, `indexPage`, `findImages`, `textToSpeech` |
| `destructive` | Approval required | `deleteFile`, `runShell`, `removeFromIndex`, `completeTask` |

Note: Overrides in the policy map (`chatToolPolicies`, etc.) can change derivation on a per-tool basis.
