# Other Copilots Quick Reference

Brief profiles of Terminal, Studio, Motion, Music, Correspondence, Drafter, and Model Builder agents.

## Terminal Agent

**Location**: `src/main/ai/terminal-agent.ts`
**Factory**: `createTerminalAgent(options)`
**Budget**: 20 steps
**Cached**: No (stateful)

### Purpose
Goal-driven shell command executor. User says "goal", agent plans steps, proposes each command for approval, executes, streams output.

### Tools
- `runShell` – every call needs approval
- `readFile`, `listDir` – unattended reads
- `createPlan`, `updatePlanItem` – structured planning

### Approval Model
**Every `runShell` pauses for approval.** No "chain and run" execution.

### Architecture
Stateful loop in main process:
1. Agent calls `runShell` with command
2. Main intercepts → creates `TerminalBlock` with status `pending`
3. Emits `terminal:block-proposed` to renderer
4. Wait for `terminal:approve` or `terminal:reject` IPC
5. If approve: execute real process → stream output → mark `done`
6. If reject: mark `skipped` → tell agent "DENIED"
7. Loop continues until goal achieved or budget exhausted

### Key Differences
- Deliberately stripped: no network, workspace, clipboard access
- Every command visible to user (approval discipline)
- One session per goal (not reused across turns)
- Result is structured `TerminalBlock` records (command + output + exit code)

---

## Studio Copilot

**Location**: `src/main/ai/studio-copilot-agent.ts`
**Factory**: `createStudioCopilotAgent(options)`
**Budget**: 25 steps
**Cached**: No (rebuilt per turn)

### Purpose
Autonomous video director. Edits screen recordings: cuts dead air, adds zooms, generates captions, creates marketing assets (tweets, changelogs).

### Tools
From `createStudioTools`:
- **Timeline**: `createZoom`, `createCut`, `createCaption`, `moveCut`, `deleteCut`, `moveCaption`
- **Styling**: `updateStudioStyling`
- **Marketing**: `createMarketing` (generates tweets, LinkedIn, release notes)
- **Context**: `gitStatus`, `gitLog`, `grepSearch` (for caption accuracy & release note grounding)
- **Planning**: `createPlan`, `updatePlanItem`

### Grounding
- Active take metadata (duration, aspect, styling)
- Mouse telemetry from recording
- Playhead position
- Active project context (for accurate captions)

### Real-Time Sync
60fps canvas update on every mutation. No batch operations.

### Approval Model
All auto-approved (domain-safe operations; UI shows what happened).

---

## Motion Copilot

**Location**: `src/main/ai/motion-copilot-agent.ts`
**Factory**: `createMotionCopilotAgent(options)`
**Budget**: 25 steps
**Cached**: No (rebuilt per turn)

### Purpose
3D motion design assistant. Builds scenes, adds nodes, animates with keyframes, generates procedural geometry.

### Tools
From `createMotionTools`:
- **Scene**: `sceneDirector` – add nodes (cameras, lights, models, geometry, surfaces, stages), update props, reparent
- **Animation**: `keyframe` – add keyframes with cubic/linear/step easing
- **Procedural**: `nodeBuilder` (pre-configured objects), `proceduralModeling` (arrays, grids, scatter, curves)
- **Planning**: `createPlan`, `updatePlanItem`

### Grounding
- Current Motion document state via `getDocument()`
- Scene info (duration, node count)
- Engine capabilities (what nodes are available)

### Capabilities
- Add 3D models, lights, cameras, geometry, surfaces, stages
- Keyframe animation with easing
- Procedural geometry generation (arrays up to 5000 instances)

### Approval Model
All auto-approved (scene operations are reversible; model suggests iterative improvements).

---

## Music Copilot

**Location**: `src/main/ai/music-copilot-agent.ts`
**Factory**: `createMusicCopilotAgent(options)`
**Budget**: 20 steps
**Cached**: No (rebuilt per turn)

### Purpose
In-house DJ. Reads local library, builds playlists, queues music, applies soundscape ambience, integrates with focus sessions.

### Tools
From `createMusicTools`:
- **Library**: `getMusicLibrarySummary`, `searchMusic`, `listMusicFolders`
- **Playlists**: `createPlaylist`, `updatePlaylist`
- **Playback**: `playMusic`, `controlPlayback` (pause/skip/stop), `setAmbience` (scenes), `setLevels` (volume)
- **Integration**: `listFocusTasks`, `startFocusSession` (pair music with task focus)
- **Planning**: `createPlan`, `updatePlanItem`

### Key Principle
**Never invents tracks.** Reads *actual* local library. If search returns nothing, widens query or says library doesn't have that sound.

### Output Model
Commands emit `MusicCopilotCommand` events (not direct playback). Renderer applies commands to app-wide stores.

### Grounding
- Current playback state (track, artist, playing/paused)
- Queue length
- Active ambience scene
- User's actual local library

### Approval Model
All auto-approved (DJ domain is safe; commands just emit playback instructions).

---

## Correspondence Copilot

**Location**: `src/main/ai/correspondence-copilot-agent.ts`
**Factory**: `createCorrespondenceCopilotAgent(options)`
**Budget**: 25 steps
**Cached**: No (rebuilt per turn)

### Purpose
Deliberative message helper. Reads correspondence board, proposes recipients, drafts message intent, suggests escalation paths. **Does not send mail.**

### Key Principle
**"Qeda does not send anything."** The app records what was sent and starts reply clocks. "Record as sent" is the honest verb, not "send".

### Tools
From `createCorrespondenceCopilotTools`:
- **Read**: `listMessages`, `getMessageDetail`, `listRecipients`, `listContacts`, `getMessageTrail`
- **Draft**: `draftMessage`, `suggestRecipients`
- **Record**: `dispatchMessage` (marks sent in app), `setMessageRecipients`
- **Escalate**: `recordReplyClassification`, `raiseChaseTask`
- **Planning**: `createPlan`, `updatePlanItem`

### Grounding
- Current board (attention items, live clocks)
- Registry (contacts, channels, external refs)
- Message recipients & trails
- Time context (for deadline suggestions)

### Deliberately Absent
- No `sendEmail` / `sendSms` / `sendPostal`
- No network capability to reach mail system
- No export/filing tools

### Approval Model
- Reads and drafts: auto-approved
- State mutations (`setMessageRecipients`, `dispatchMessage`): approval-gated (approval-request card)

---

## Document Drafter

**Location**: `src/main/ai/document-drafter-agent.ts`
**Factory**: `createDocumentDrafterAgent(options)`
**Budget**: 20 steps (lower; documents are large)
**Cached**: No (rebuilt per turn)

### Purpose
Professional document writing. Drafts agreements, memos, letters, policies, reports—all for human review in Document Studio.

### Tools
From `documentDrafterTools`:
- **Create/Append**: `createDocument`, `appendBlocks`, `insertBlocksAt` (auto-approved)
- **Edit**: `replaceBlock` (approval-gated; overwrites user's work)
- **Read**: `getDocumentOutline` (cheap), `readDocument` (full text)
- **Source Material**: `listProjectFiles`, `readProjectFile` (scoped to project folder)
- **Planning**: `createPlan`, `updatePlanItem`

### Key Safety Principle
**Safety is in the tool set, not the prompt.**

Deliberately absent:
- No `deleteDocument` / `deleteBlocks` (no unrecoverable delete)
- No `writeFile` / `deleteFile` (only document store)
- No network tools (no send/export)
- No shell (no command execution)
- No task tools (taskId is prompt context only)

Result: A prompt injection in a source document cannot escalate past the absent tools.

### Approval Model
- Additive (`createDocument`, `appendBlocks`, `insertBlocksAt`): auto-approved
- Destructive (`replaceBlock`): requires approval (approval card shows which block will be overwritten)

### Grounding
- Current date (for documents that need dating)
- Project folder (via `listProjectFiles`, `readProjectFile`)
- Active project (context for tone & scope)

---

## Model Builder

**Location**: `src/main/ai/model-builder-agent.ts`
**Factory**: `createModelBuilderAgent(options)`
**Budget**: 25 steps
**Cached**: No (rebuilt per turn)

### Purpose
3D geometry and scene composition. Like Motion Copilot but without animation—pure static models and scenes for rendering or video overlays.

### Tools
From `createMotionTools` (minus `keyframe`):
- **Scene**: `sceneDirector` – add nodes, update props, reparent
- **Procedural**: `nodeBuilder`, `proceduralModeling`
- **Planning**: `createPlan`, `updatePlanItem`

### Key Difference from Motion Copilot
**No animation.** Motion copilot has `keyframe` tool; model builder does not. Focus is on static geometry, layout, materials, lighting.

### Grounding
- Current scene state
- Node types available
- Output dimensions & frame rate

### Approval Model
All auto-approved (scene composition is safe; suggestions are iterative).

---

## Summary: Rebuild Pattern

All copilots **rebuild per turn** so system prompts carry:

| Copilot | Current Context |
|---------|-----------------|
| **Terminal** | Shell environment, active directory |
| **Studio** | Playhead time, take metadata, styling |
| **Motion** | Scene state, active scene, node count |
| **Music** | Playback state, queue, current track |
| **Correspondence** | Board state, time context, recipient trails |
| **Drafter** | Current date (for document dating) |
| **Model Builder** | Scene state, node types, output format |

This ensures every turn sees fresh context and can make time-aware decisions.

