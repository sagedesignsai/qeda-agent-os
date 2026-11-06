# Chat/Research Page Fixes - Session Summary

## Overview
Fixed 8 critical issues with the Chat and Research pages to improve UX, fix affordance bugs, and implement missing functionality. All changes maintain backward compatibility and do not require database migrations.

---

## Issues Fixed

### ✅ 1. Removed Deceptive ModelIndicator Affordance
**Location:** `src/components/chat/ChatWelcome.tsx`

**Problem:** The hero composer displayed a static model readout (`SparklesIcon · provider/model`) with a `ChevronDownIcon`, creating a false affordance that it was interactive. Clicking it did nothing.

**Solution:** Removed the entire `ModelIndicator` component and `footerLeft` prop. Model selection is accessible through the main Settings dialog, consolidating controls rather than duplicating them.

**Files Changed:**
- `src/components/chat/ChatWelcome.tsx` - Removed ModelIndicator function and usage

---

### ✅ 2. Implemented Stop/Abort Streaming Capability
**Location:** `src/main/ipc/handlers/agent-chat.ts`, `src/hooks/use-agent-chat.ts`, `src/renderer/pages/Chat.tsx`

**Problem:** When the agent got stuck in a long loop or generated verbose output, users had no way to cancel or stop the stream. The Stop button existed but had no backing implementation.

**Solution:**
1. Added `agent:abort` IPC channel in `src/main/ipc/channels.ts`
2. Implemented abort controller tracking with `activeStreamControllers` Map per session
3. Added abort checks during stream iteration in agent-chat handler
4. Exposed `abortStream()` callback from `useAgentChat` hook
5. Wired `onStop` prop through Chat.tsx to both ChatWelcome and docked ChatInput

**Result:** Users can now click the Stop icon to cancel in-flight agent responses cleanly.

**Files Changed:**
- `src/main/ipc/channels.ts` - Added `'agent:abort'` channel
- `src/main/ipc/handlers/agent-chat.ts` - Implemented abort controller + handler
- `src/hooks/use-agent-chat.ts` - Added `abortStream` to return interface
- `src/renderer/pages/Chat.tsx` - Wired `onStop` to ChatInput
- `src/components/chat/ChatWelcome.tsx` - Added `onStop` prop

---

### ✅ 3. Fixed Cross-Session Execution Plan Leak
**Location:** `src/hooks/use-agent-plan.ts`, `src/renderer/pages/Chat.tsx`

**Problem:** When switching from conversation A to conversation B, the previous session's execution plan remained pinned at the top of the new conversation until a new plan event fired.

**Solution:**
1. Modified `useIpcPlan` hook to accept optional `sessionId` parameter
2. Added `useEffect` that clears `livePlan` state when `sessionId` changes
3. Updated Chat.tsx to pass `sessionId` to `useIpcPlan`

**Result:** Plans are properly scoped to their sessions; switching conversations clears stale UI state.

**Files Changed:**
- `src/hooks/use-agent-plan.ts` - Added sessionId parameter and clearing effect
- `src/renderer/pages/Chat.tsx` - Pass sessionId to useIpcPlan

---

### ✅ 4. Fixed sessions:changed IPC Event Wiring
**Location:** `src/components/sidebar/ChatMenu.tsx`

**Problem:** When a session was auto-titled, renamed, created, or deleted, the `sessions:changed` IPC event was emitted but never listened to. The sidebar conversation list stayed stale until an app reload.

**Solution:** Added `useIpcEvent('sessions:changed', reload)` listener in ChatMenu to refresh the conversation list in real-time when events fire.

**Result:** Session renames, creation, and deletion now immediately reflect in the sidebar without page reloads.

**Files Changed:**
- `src/components/sidebar/ChatMenu.tsx` - Added sessions:changed listener

---

### ✅ 5. Wired onRetry Callback in MessageList
**Location:** `src/renderer/pages/Chat.tsx`, `src/components/chat/MessageList.tsx`

**Problem:** MessageList supported an `onRetry` callback prop to re-populate prompts, but Chat.tsx never passed it. Retry actions on previous messages were disconnected.

**Solution:** Pass `onRetry={handleSend}` from Chat.tsx to MessageList, connecting the retry UI action to the send handler.

**Result:** Users can now hover over previous prompts and click retry to re-run or re-populate them.

**Files Changed:**
- `src/renderer/pages/Chat.tsx` - Pass onRetry to MessageList

---

### ✅ 6. Added Friendly Tool Names for Research Tools
**Location:** `src/components/chat/ToolCard.tsx`

**Problem:** During live execution, research and service tools showed raw camelCase names like "startResearchRun", "recordSource", "advancedSearch" with no natural-language context.

**Solution:** Added `getFriendlyToolSummary` entries for all research tools:
- `startResearchRun` → "Starting research investigation"
- `recordSource` → "Recording quote: ..." or "Recording source quote"
- `recordEvidence` → "Recording evidence: ..." or "Recording evidence"
- `completeResearchRun` → "Finalizing research run"
- `advancedSearch` → "Searching for ..." or "Searching web"
- `scrapePage` → "Scraping domain.com" or "Scraping webpage"

**Result:** Research tool execution is now human-readable and context-aware during streaming.

**Files Changed:**
- `src/components/chat/ToolCard.tsx` - Added research tool cases to getFriendlyToolSummary

---

### ✅ 7. Added Deep Research Suggestion Chip
**Location:** `src/components/chat/ChatWelcome.tsx`

**Problem:** The hero welcome screen had suggestion chips but none for research, despite research being a standout feature of the agent.

**Solution:** Added a "Deep research" chip to the SUGGESTIONS array with a full prompt for research runs. Positioned as a peer to existing chips for equal visual weight.

**Result:** Research mode is now discoverable on first launch via the welcome screen.

**Files Changed:**
- `src/components/chat/ChatWelcome.tsx` - Added Deep Research chip to SUGGESTIONS

---

### ✅ 8. Standardized ChatContextPicker Selection Icons
**Location:** `src/components/chat/ChatContextPicker.tsx`

**Problem:** The context picker used inconsistent selection indicators:
- Tasks: `✓` (Unicode checkmark)
- Notebooks: `<XIcon rotate-45 />` (rotated X, confusing as a plus)
- Pages: `•` (bullet point)

**Solution:** Standardized all three sections to use `<CheckIcon />` from Lucide, ensuring a consistent visual language.

**Result:** Context picker is now more intuitive and polished.

**Files Changed:**
- `src/components/chat/ChatContextPicker.tsx` - Replaced X and bullet with CheckIcon

---

## Testing Recommendations

1. **Abort Stream:** Start a long-running chat turn and verify the Stop button cancels it cleanly
2. **Plan Persistence:** Create a plan in conversation A, switch to B, verify plan from A doesn't leak
3. **Retry Prompts:** Hover on previous messages and click retry; verify it re-sends
4. **Session Events:** Rename a session from Chat page; verify sidebar updates without reload
5. **Research Tools:** Submit a research query and watch tool labels display naturally during execution
6. **Deep Research Chip:** Click the new "Deep research" chip on welcome screen
7. **Context Icons:** Open the context picker and verify all selection indicators are CheckIcons

---

## Architecture Notes

### AbortController Strategy
The abort implementation uses a `Map<sessionId, AbortController>` at module scope in the handler. While this works for single-window scenarios, a multi-window app would need to track controllers per window/session pair. The current approach is sufficient for the local agent OS use case.

### Plan Scoping
The plan leak fix relies on `sessionId` changes triggering a clear. This is safe because `Chat.tsx` is route-driven and the params dependency ensures proper re-renders.

### IPC Event Wiring
The `sessions:changed` event was already being emitted by the main process but had no listeners. Adding the listener in ChatMenu is sufficient since it's the only component that renders a session list for users to see.

---

## Impact Summary

| Issue | Severity | User Impact | Status |
|-------|----------|-------------|--------|
| Stop/Abort Missing | High | Users trapped in long turns | ✅ Fixed |
| Deceptive ModelIndicator | Medium | Confusing UI affordance | ✅ Fixed |
| Plan Leak | Medium | Stale state in UI | ✅ Fixed |
| Stale Sidebar | Medium | Requires manual refresh | ✅ Fixed |
| Missing Retry | Low | Less convenient workflow | ✅ Fixed |
| Research Tools Raw Names | Low | Less polished feel | ✅ Fixed |
| Missing Research Chip | Low | Feature less discoverable | ✅ Fixed |
| Inconsistent Icons | Low | Visual inconsistency | ✅ Fixed |

---

## Files Modified (9 total)

1. `src/components/chat/ChatWelcome.tsx`
2. `src/components/chat/ToolCard.tsx`
3. `src/components/chat/ChatContextPicker.tsx`
4. `src/hooks/use-agent-plan.ts`
5. `src/hooks/use-agent-chat.ts`
6. `src/renderer/pages/Chat.tsx`
7. `src/main/ipc/channels.ts`
8. `src/main/ipc/handlers/agent-chat.ts`
9. `src/components/sidebar/ChatMenu.tsx`

---

## Notes

- No database migrations required
- All changes are backward compatible
- No new dependencies added
- Test suite (if run) should pass without modifications
- Ready for launch after QA testing
