---
sessionId: session-261116-203634-uhny
---

# Current State & Gaps

### What is already solid (completed in prior phases)

The following gaps from the original inspection have been fixed:

- **Streak display** — `displayStreak()` derives current streak from `last_active_date`; `getStreak()` returns derived count; `usePresenceStreak` uses `displayStreak`; `StreakBadge` hides on 0. ✅
- **`edited_at` column** — schema has `edited_at INTEGER`; `updateItem` sets it on body change; status stays stable. ✅
- **Activity ledger** — `presence_activity` table with `UNIQUE(project_id, date)`, `recordActivity()` called from `updateItem`/`logPost`. ✅
- **Ownership guards** — `assertItemInProject`/`assertBatchInProject` in DB; tools and IPC handlers call them. ✅
- **Abort** — `presenceAbortControllers` map, `presence:abort` IPC, `AbortController` passed to `agent.stream`, `agent:stream-cancelled` event. ✅
- **Contacts tools** — `listContacts` and `getContact` in the tool registry, scoped to project, classified as `read`. ✅
- **Step budget** — raised from 25 to 50 (`isStepCount(50)`). ✅
- **Log post UI** — `SuggestionCard` has a "Log post" form with platform, content, metrics, and confirm button. ✅
- **Platform validation** — `presence:post-log` validates platform against `PRESENCE_PLATFORMS`. ✅
- **`nextMilestoneTarget`** — `lib/presence.ts` returns dynamic 30-day boundaries. ✅
- **`getGreetingMessage`** — uses `displayStreak` internally. ✅
- **Browser state events** — `presence-browser.ts` sends `did-navigate`, `page-title-updated`, `did-start-loading` as `presence:browser-state` IPC events. ✅
- **Browser forward** — `goForwardPresenceView()` exists in `presence-browser.ts`; `presence:browser-forward` handler registered. ✅
- **Browser open external** — `presence:browser-open-external` handler registered. ✅

### What remains

| # | Gap | Status | Impact |
|---|-----|--------|--------|
| 1 | **Legacy `generatePresenceBatch` tool** still in registry | ❌ Not started | Second generation path, bypasses agentic instructions, adds token surface |
| 2 | **`presence:open-browser`** IPC handler still exists | ❌ Not started | Opens a separate browser window with a different session partition; `openBrowser` hook unused |
| 3 | **Browser forward button** missing from UI | ⚠️ Partial | Handler and `goForwardPresenceView` exist, but no forward button in `PresenceBrowserPane` |
| 4 | **Browser URL/title/loading/error UI** missing | ⚠️ Partial | Events sent from main, but renderer doesn't display URL pill, loading bar, or error surface |
| 5 | **Collapsed batches still fetch items** (N+1) | ❌ Not started | `BatchSection` calls `usePresenceBatchDetail` unconditionally; no `enabled` parameter |
| 6 | **No batch delete/archive** | ❌ Not started | Queue grows forever; `deleteBatch` DB function exists but no IPC handler or UI |
| 7 | **No "Edit setup" after onboarding** | ❌ Not started | No way to update platforms/goal once onboarding is complete |
| 8 | **No real activity calendar** | ❌ Not started | `PresenceActivityView` still has "no fake grid" comment; ledger exists but unused |
| 9 | **Milestone progress bar broken after 30** | ❌ Not started | `PresenceActivityView.nextMilestone()` uses static fallback (30); `nextMilestoneTarget` in lib unused |
| 10 | **Agent has no platform constraints** | ❌ Not started | No character limits (X ≤280), no platform tone guidance, no deduplication |
| 11 | **Missing tests** | ❌ Not started | No handler-level tests, no URL policy tests, no activity ledger idempotency tests |

# Technical Design

### Phase 1 — Dead code cleanup

**Legacy `generatePresenceBatch`**: The tool is marked deprecated but still registered. It calls `generatePresenceBatch` from `presence-coach.ts` which uses `generateObject` (non-agentic), bypassing the copilot's plan protocol, approval policy, and tool-based generation. The copilot should only use `createPresenceBatch` + `createPresenceItem`.

Remove:
- `generatePresenceBatchTool` from `src/main/tools/presence.ts`
- `generatePresenceBatch` policy entry from `src/main/tools/policies/presence-copilot.ts`
- `src/main/ai/presence-coach.ts` entirely (only imported by the removed tool)
- The `generatePresenceBatch` import from `src/main/tools/presence.ts`

**Legacy `presence:open-browser`**: Opens a standalone `BrowserWindow` with partition `'presence'` (not `persist:`), creating a separate session store. No component calls `openBrowser`. The `openBrowser` action exists in `usePresenceActions` but is never used.

Remove:
- `presence:open-browser` handler from `src/main/ipc/handlers/presence.ts`
- `openBrowser` import from `src/main/browser-use.js`
- `openBrowser` from `PresenceActions` interface and `usePresenceActions` in `src/hooks/use-presence.ts`

### Phase 2 — Browser UI chrome (renderer side)

**Current state**: Main process already sends `presence:browser-state` events with URL, title, loading, error. `goForwardPresenceView()` and `presence:browser-forward` handler exist. `presence:browser-open-external` handler exists. But the renderer doesn't display any of this.

**What's missing** (renderer only):

1. `src/hooks/use-presence-browser.ts`:
   - Add `forward(id)` method that invokes `presence:browser-forward`
   - Add `openExternal(id)` method that invokes `presence:browser-open-external`
   - Subscribe to `presence:browser-state` events via `useIpcEvent`
   - Expose `browserState` map: `{ [tabId]: { url, title, loading, error } }`

2. `src/components/presence/PresenceBrowserPane.tsx`:
   - Add forward button (`ArrowRightIcon`) next to back button, wired to `browser.forward()`
   - Render a URL pill (current URL hostname or page title) below the tab strip when a web tab is active
   - Show loading indicator (animated bar) when `loading` is true
   - Show error message when `error` is set
   - Add "Open in browser" button that calls `browser.openExternal()`

### Phase 3 — Queue performance and lifecycle

**N+1 batch detail**: `BatchSection` calls `usePresenceBatchDetail(batch.id)` unconditionally. The hook uses `useDbResource` which supports an `enabled` option. Pass `enabled={isOpen}` so collapsed batches don't fetch.

**Batch delete**: `deleteBatch` exists in `src/main/db/presence.ts` but has no IPC handler or UI. Add:
- `presence:batch-delete` IPC handler with `assertBatchInProject` check
- `deleteBatch` action in `usePresenceActions`
- Trash icon button in `BatchSection` header with a confirmation (or undo toast)

### Phase 4 — Activity calendar and milestone fix

**Activity calendar**: The `presence_activity` ledger exists with `UNIQUE(project_id, date)`. A real calendar can be built from it.

- Add `getActivityDays(projectId, startDate, endDate)` in `src/main/db/presence.ts` returning `{ date, source }[]`
- Add `presence:activity-days` IPC handler
- Add `usePresenceActivityDays` hook
- In `PresenceActivityView`, render a compact 7-column calendar grid (current month) with active days highlighted in amber

**Milestone fix**: `PresenceActivityView.nextMilestone()` falls back to `MILESTONES[MILESTONES.length - 1]` (30) when streak > 30. Replace with `nextMilestoneTarget` from `lib/presence.ts` (already dynamic).

### Phase 5 — Edit setup

No way to re-run onboarding or edit platforms/goal after completion. Refactor `PresenceOnboardingPanel` to accept an `editMode` prop:
- Skip the intro step
- Pre-fill current platforms and goal
- Label CTA as "Save" instead of "Start my streak"
- On save, call `updateProfile` (already available)

Add a settings gear icon in `PresenceCoachPanel` header that toggles edit mode.

### Phase 6 — Agent constraints

Add to `buildInstructions` in `presence-copilot-agent.ts`:
- Platform character limits (X ≤280, LinkedIn 1300–2000, etc.)
- "Do not repeat a title or body from recent items"
- "Include source_kind/source_id when based on a page or contact"

### Phase 7 — Tests

- `presence-browser.test.ts`: `isPresenceUrlAllowed` unit tests
- `presence-db.test.ts`: activity ledger idempotency
- `presence-agent.test.ts`: listContacts/getContact policy classification
- `presence-handlers.test.ts`: cross-project refusal, post-log validation

```mermaid
graph LR
  A[PresenceBrowserPane] -->|show/hide/forward/navigate| B[usePresenceBrowser]
  B -->|IPC invoke| C[presence-browser-* handlers]
  C -->|API calls| D[presence-browser.ts]
  D -->|WebContentsView| E[Native site tab]
  E -->|did-navigate etc.| D
  D -->|presence:browser-state| B
  B -->|url/title/loading/error| A
  
  F[PresenceQueue] -->|batch-get (enabled)| G[usePresenceBatchDetail]
  G -->|IPC| H[presence:batch-get]
  H -->|assertBatchInProject| I[DB]
  
  F -->|delete| J[deleteBatch action]
  J -->|IPC| K[presence:batch-delete]
  K -->|assertBatchInProject| I
```

# Delivery Steps

### ✓ Step 1: Remove legacy generation path and dead code
Remove the deprecated generatePresenceBatch tool, the presence-coach.ts AI module, and the presence:open-browser IPC handler — all three are dead code paths that add token surface area and a second browser session store.

Files:
- src/main/tools/presence.ts: remove generatePresenceBatchTool, remove from registry, remove generatePresenceBatch import
- src/main/tools/policies/presence-copilot.ts: remove generatePresenceBatch policy entry
- src/main/ipc/handlers/presence.ts: remove presence:open-browser handler, remove openBrowser import
- src/hooks/use-presence.ts: remove openBrowser from PresenceActions interface and usePresenceActions
- src/main/ai/presence-coach.ts: delete file (only used by the removed tool)
- Update presence-agent.test.ts policy drift test (it will catch any stale entries automatically)

### ✓ Step 2: Add browser UI chrome (forward button, URL pill, loading bar, error surface)
Complete the browser renderer side: main process already sends state events and has forward/open-external handlers, but the UI doesn't display them. Add forward button, URL pill, loading indicator, and error surface.

Files:
- src/hooks/use-presence-browser.ts: add forward(id) and openExternal(id) methods; subscribe to presence:browser-state events via useIpcEvent; expose browserState map with url, title, loading, error
- src/components/presence/PresenceBrowserPane.tsx: add forward button (ArrowRightIcon) next to back; render URL pill (hostname or title) below tab strip; show loading bar when loading; show error message on failure; add "Open in browser" button

### ✓ Step 3: Lazy-load collapsed batch detail and add batch delete
Fix the N+1 IPC problem: collapsed batches should not fetch their items. Add a batch delete action so the queue doesn't grow forever.

Files:
- src/hooks/use-presence.ts: add enabled parameter to usePresenceBatchDetail (pass isOpen from BatchSection)
- src/components/presence/PresenceQueue.tsx: BatchSection passes enabled={isOpen} to usePresenceBatchDetail; add a batch delete button (trash icon) in the batch header with confirmation; wire to a new deleteBatch action
- src/hooks/use-presence.ts: add deleteBatch to PresenceActions (invoke presence:batch-delete)
- src/main/ipc/handlers/presence.ts: add presence:batch-delete handler with project ownership check (assertBatchInProject) and broadcastChanged
- src/main/db/presence.ts: deleteBatch already exists; no change needed

### ✓ Step 4: Add real activity calendar and fix milestone progress bar
Build a truthful activity calendar from the presence_activity ledger. Fix the milestone >30 bug: `nextMilestoneTarget` exists in `lib/presence.ts` but `PresenceActivityView` uses its own static `nextMilestone()` that returns 30 forever.

Files:
- src/main/db/presence.ts: add getActivityDays(projectId, startDate, endDate) returning { date, source }[] from presence_activity
- src/main/ipc/handlers/presence.ts: add presence:activity-days handler
- src/hooks/use-presence.ts: add usePresenceActivityDays hook
- src/components/presence/PresenceActivityView.tsx: replace the "no fake calendar" comment with a real compact calendar grid (7 columns, current month) using activity days; replace local nextMilestone() with nextMilestoneTarget from lib/presence.ts; fix progress bar for streak > 30

### ✓ Step 5: Add edit setup (re-run onboarding) and profile edit
Allow users to edit their platforms and goal after onboarding. Currently there's no way to update the profile once onboarding is complete.

Files:
- src/components/presence/PresenceCoachPanel.tsx: add a "Settings" gear icon button in the header that opens an edit profile panel
- src/components/presence/PresenceOnboardingPanel.tsx: refactor to accept an "edit mode" prop (skip the intro step, pre-fill current values, label CTA as "Save" instead of "Start my streak")
- src/renderer/pages/Presence.tsx: add state for edit mode, wire the settings button to toggle it
- src/components/presence/PresenceBrowserPane.tsx: when platforms change via edit, add/remove tabs accordingly (already handles platform additions; ensure removal works for closed tabs only)

### ✓ Step 6: Add platform-aware agent constraints and deduplication
Make the agent's generation prompt platform-aware (character limits, tone) and add deduplication against recent items.

Files:
- src/main/ai/presence-copilot-agent.ts: update buildInstructions to add explicit platform constraints:
  - X: ≤280 characters per draft
  - LinkedIn: 1,300–2,000 char sweet spot, hook first line
  - Instagram: caption + hashtags
  - Discord: conversational, no hashtags
  - Facebook: link-friendly
  Add: "Do not repeat a title or body from recent items returned by listRecentPresenceItems"
  Add: "Include source_kind/source_id when a suggestion is based on a page or contact"
- src/main/tools/presence.ts: no change needed (listContacts, listRecentPresenceItems already available)

### ✓ Step 7: Add handler-level tests and URL policy tests
Add tests for the rules that matter: streak day boundaries, cross-project refusal in handlers, URL allowlisting, and abort behavior.

Files:
- src/__tests__/presence-db.test.ts: add tests for edited_at preserving done status (already covered), add test for activity ledger idempotency (same day, multiple actions = one row)
- src/__tests__/presence-agent.test.ts: add test for listContacts and getContact policy classification
- src/__tests__/presence-browser.test.ts (new): unit tests for isPresenceUrlAllowed — https only, suffix matching, auth hosts, javascript: rejection, non-https rejection
- src/__tests__/presence-handlers.test.ts (new): test assertItemInProject and assertBatchInProject cross-project refusal, test presence:post-log platform validation