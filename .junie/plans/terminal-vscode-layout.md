---
sessionId: session-261026-170221-y6fe
---

# Requirements

### Overview
Transform the Terminal page into a **Warp-inspired, multi-panel agentic terminal** with split panes, tabbed sessions, and a unified block-based command stream. The design draws from [Warp Terminal](https://www.warp.dev)'s core innovations — command blocks as first-class units, AI agent working in the same scroll stream as manual commands, rich block interactions — while adding Qeda's unique approval gates and plan protocol.

### Warp Terminal Inspirations
Warp's key differentiators that we'll adopt:
- **Block model**: Every command and its output are a discrete, selectable block — not raw text. Blocks can be copied (output only or command only), filtered, searched, and shared.
- **Unified stream**: Agent commands and user-typed commands appear in the same scroll stream, indistinguishable in format. The agent's reasoning appears as collapsible thoughts above its blocks.
- **Workflow mode**: Natural language input that the AI translates to commands, with inline review before execution.
- **Split panes**: Multiple terminal sessions side-by-side with resizable dividers.
- **Rich interactions**: Right-click or toolbar actions on blocks (copy output, copy command, re-run, explain, fix).

### Goals
- Users can open **multiple terminal sessions** (Agent Mode and/or Shell Mode) in separate tabs
- Panes can be **split horizontally or vertically** for side-by-side work
- Each tab hosts a unified block stream where agent and manual commands coexist
- The block UI is refined to match Warp's aesthetic: compact headers, clean output, inline actions
- Layout is **session-scoped** (resets on app restart, persisted in localStorage via `react-resizable-panels`)

### User Stories
- As a developer, I want to run two agent goals in parallel (e.g., one for frontend, one for backend) in split panes
- As a developer, I want to have a shell terminal on the left and an agent chat on the right
- As a developer, I want to open multiple shell terminals and split them to monitor different services
- As a developer, I want to copy just the output of a command (not the command itself) with one click
- As a developer, I want to filter output lines within a block without leaving the terminal
- As a developer, I want to close tabs I no longer need and rearrange my workspace

### Scope

**In Scope:**
- Tab bar component for the Terminal page (closeable tabs, new tab button)
- Split pane support (split right / split down via keyboard shortcuts and toolbar)
- Each tab hosts a Terminal session (Agent or Shell mode) with unified block stream
- Refined `CommandBlock` styling: Warp-inspired compact header, cleaner output area, better action buttons
- `TerminalGoalInput` refinements: context-rich prompt showing CWD + git branch (already partially implemented)
- Nested `react-resizable-panels` groups for recursive splitting
- localStorage-based layout persistence via `useDefaultLayout`
- Keyboard shortcuts: `Cmd+T` (new tab), `Cmd+W` (close tab), `Cmd+\` (split right), `Cmd+Shift+\` (split down)

**Out of Scope:**
- Drag-and-drop tab reordering
- Block sharing via web links (Warp feature, requires backend)
- Warp Drive / workflow library (Warp feature, separate module)
- Session sharing / multiplayer (Warp feature, requires real-time sync)
- Persisting layout across app restarts beyond localStorage
- Changes to other pages (Chat, Builder, etc.)

# Technical Design

### Current Implementation
The Terminal page (`Terminal.tsx`, 646 lines) is a single-session view:
- Route: `/terminal` or `/terminal/:sessionId`
- Two modes (Agent/Shell) toggled in the header
- State managed by `useTerminalSession(sessionId)` hook
- Shell mode uses `XtermPane` component with xterm.js
- Agent mode renders `CommandBlock` stream + `TerminalGoalInput`
- `CommandBlock` (`CommandBlock.tsx`, 1075 lines) is already a compound component with header, thought, approval, filter bar, output, explanation, fix, and footer
- Block output already supports: ANSI rendering, git diff detection, localhost URL extraction, in-block search/filter, fold/collapse for long output

The project already has `react-resizable-panels` infrastructure:
- `src/components/ui/resizable.tsx` — shadcn wrapper (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`)
- `Builder.tsx` and `Studio.tsx` use `useDefaultLayout` for localStorage persistence
- Mocked in Jest (`.erb/mocks/`), no test changes needed

### Key Decisions

1. **Terminal-as-a-component**: Extract the current Terminal page body into a `TerminalTab` component that accepts a `sessionId` prop and manages its own mode/state. This allows multiple instances in tabs.

2. **Unified block stream (Warp model)**: Agent commands and direct commands (`!`/`$` prefix) already render as the same `CommandBlock` type. No architectural change needed — the block model is already Warp-compatible. The refinement is purely visual: making the block header more compact, actions more discoverable.

3. **Panel tree model**: Each split creates a nested `ResizablePanelGroup`. The root is a panel group; each panel can either contain a tab (leaf) or be split into a child group. Managed by a `useTerminalLayout` hook.

4. **Tab types**: Each tab is either `agent` (AI goal-driven) or `shell` (raw PTY). The mode toggle moves from the page header into the tab itself.

5. **Session management**: Each tab owns its own `sessionId` (or creates one on first input). Multiple sessions run independently — the existing `useTerminalSession` hook already supports this per-session pattern.

6. **CommandBlock refinements**: Rather than rewriting `CommandBlock`, apply targeted styling changes:
   - More compact header (smaller status icon, tighter padding)
   - Action buttons move to a hover-revealed toolbar on the right edge (Warp-style)
   - Output area uses semantic tokens consistently (already mostly done)
   - Position badge (#1, #2) stays but is smaller

### Proposed Changes

#### 1. `TerminalTab` component (`src/components/terminal/TerminalTab.tsx`)
Extract the current Terminal page body into a reusable tab component:
- Props: `sessionId`, `mode`, `onModeChange`, `onClose`, `onTitleChange`
- Contains: `useTerminalSession(sessionId)`, mode toggle, agent blocks or XtermPane, goal input
- Reports its title back to the parent via `onTitleChange`
- No `PageHeader` — chrome is provided by the tab bar

#### 2. `TerminalTabBar` component (`src/components/terminal/TerminalTabBar.tsx`)
Tab bar with close buttons and new-tab button:
- Props: `tabs`, `activeTabId`, `onTabSelect`, `onTabClose`, `onNewTab`
- Each tab shows: session title, mode icon (Bot/Terminal), status dot, close button
- Inspired by Warp: compact tab strip with active tab highlighted by a bottom border accent
- New tab button with dropdown for Agent/Shell mode

#### 3. `useTerminalLayout` hook (`src/hooks/use-terminal-layout.ts`)
Manages the panel tree and tab state:
- `tabs: Map<tabId, { sessionId, mode, title }>` — all open tabs
- `activeTabId` — currently focused tab
- `panelTree` — nested structure of panels and splits
- Actions: `addTab()`, `closeTab()`, `splitRight()`, `splitDown()`, `selectTab()`
- Layout persistence via `useDefaultLayout({ id: 'qeda-terminal-layout-v1' })`

#### 4. `TerminalPanel` component (`src/components/terminal/TerminalPanel.tsx`)
Recursive panel renderer:
- Renders a `ResizablePanelGroup` with child panels
- Each leaf panel contains a `TerminalTab` for the active tab
- Non-active tabs in the same panel are kept in state but not rendered
- Supports nested splits (recursive rendering)

#### 5. `CommandBlock` refinements (`src/components/terminal/CommandBlock.tsx`)
Warp-inspired visual polish to the existing compound component:
- **Compact header**: Reduce padding from `px-4 py-2.5` to `px-3 py-2`, status icon from `size-4` to `size-3.5`
- **Hover action bar**: Add a right-edge action bar (copy output, copy command, re-run) that appears on block hover — Warp-style
- **Cleaner output**: Output area keeps current functionality but with tighter margins
- **Footer actions**: Keep explain/fix in footer, but make them smaller (`h-5` instead of `h-6`)
- **Block border**: Thinner border on idle blocks (`border-border/40`), only accent-colored border on active states

#### 6. Updated `Terminal.tsx` page
Replaces the current single-session layout with:
- `PageHeader` (Terminal breadcrumb + project scope) — minimal, no mode switcher here
- `TerminalTabBar` (tab strip)
- `TerminalPanel` (resizable panel tree)
- Global keyboard shortcuts for tab/split operations
- On first load, create a default Agent tab so the page is not empty
- Closing the last tab shows `TerminalWelcome` with a prompt to open a new tab

### Architecture Diagram

``` mermaid
graph LR
  A[Terminal.tsx page] --> B[PageHeader]
  A --> C[TerminalTabBar]
  A --> D[TerminalPanel root]
  D --> E[Panel1: TerminalTab agent]
  D --> F[ResizableHandle]
  D --> G[Panel2: TerminalTab shell]
  E --> H[useTerminalSession s1]
  G --> I[useTerminalSession s2]
  H --> J[CommandBlock stream + GoalInput]
  I --> K[XtermPane]
  C --> L[useTerminalLayout hook]
  L --> M[localStorage via useDefaultLayout]
```

### File Structure

| File | Action | Purpose |
|------|--------|---------|  
| `src/components/terminal/TerminalTab.tsx` | **New** | Reusable terminal tab (agent or shell mode) |
| `src/components/terminal/TerminalTabBar.tsx` | **New** | Tab bar with close/new tab buttons |
| `src/components/terminal/TerminalPanel.tsx` | **New** | Recursive resizable panel renderer |
| `src/hooks/use-terminal-layout.ts` | **New** | Layout state, tab management, split logic |
| `src/renderer/pages/Terminal.tsx` | **Modified** | Replaces single-session layout with multi-panel workspace |
| `src/components/terminal/CommandBlock.tsx` | **Modified** | Warp-inspired visual refinements (compact header, hover actions) |

### Risks
- **XtermPane lifecycle**: Each `XtermPane` spawns a PTY. Closing a tab must properly kill the PTY. The existing `XtermPane` already handles cleanup on unmount for ephemeral sessions, but saved sessions keep PTYs alive — need to ensure closing a tab signals the correct cleanup.
- **Nested resizable panels**: `react-resizable-panels` supports nesting, but the state management for which tab is in which panel is complex. Starting with a flat split (two panels max) and supporting recursive splits in a follow-up.
- **Performance**: Multiple agent sessions running concurrently means multiple AI tool loops. The main process already supports this (each session is independent), but CPU/billing costs scale with concurrent agents.
- **CommandBlock modifications**: The `CommandBlock` is 1075 lines. Refinements should be surgical — only visual/styling changes, not structural. Risk of breaking existing block behavior if changes are too broad.

# Delivery Steps

### ✓ Step 1: Extract TerminalTab component
Extract the current Terminal page body into a reusable `TerminalTab` component that accepts a `sessionId` and manages its own mode, blocks, and input.
- Create `src/components/terminal/TerminalTab.tsx` with props: `sessionId`, `mode`, `onModeChange`, `onClose`, `onTitleChange`.
- Move the agent mode UI (CommandBlocks, PlanPanel, goal input) and shell mode UI (XtermPane) into this component.
- Remove the `PageHeader` from the tab — chrome is provided by the parent.
- Wire `useTerminalSession(sessionId)` inside the tab so each instance is independent.
- Report session title changes to parent via `onTitleChange` callback.

### ✓ Step 2: Add TerminalTabBar and useTerminalLayout hook
Build the tab bar and layout state management.
- Create `src/hooks/use-terminal-layout.ts`: manages `tabs` map, `activeTabId`, and layout persistence via `useDefaultLayout({ id: 'qeda-terminal-layout-v1' })`.
- Actions: `addTab(mode)` creates a new tab with optional sessionId, `closeTab(id)` removes it, `selectTab(id)` switches focus.
- Create `src/components/terminal/TerminalTabBar.tsx`: renders tab items with session title, mode icon, status dot, and close button. New tab button with dropdown for Agent/Shell mode.
- Register keyboard shortcuts: `Cmd+T` (new tab), `Cmd+W` (close active tab).

### ✓ Step 3: Add split pane support and update Terminal page
Replace the Terminal page layout with the multi-panel workspace.
- Create `src/components/terminal/TerminalPanel.tsx`: renders a `ResizablePanelGroup` with `ResizablePanel` children and `ResizableHandle` between them. Each panel hosts a `TerminalTab`.
- Extend `useTerminalLayout` with `splitRight()` and `splitDown()` actions that create nested `ResizablePanelGroup` structures.
- Rewrite `Terminal.tsx` to render: `PageHeader` + `TerminalTabBar` + `TerminalPanel` tree.
- On first load, create a default Agent tab so the page is not empty.
- Register keyboard shortcuts: `Cmd+\` (split right), `Cmd+Shift+\` (split down).
- Ensure closing the last tab shows a welcome/empty state with a prompt to open a new tab.

### ✓ Step 4: Warp-inspired CommandBlock refinements
Apply visual polish to `CommandBlock.tsx` to match Warp Terminal's compact, action-rich block aesthetic.
- Make the block header more compact: reduce padding, smaller status icon (`size-3.5`), tighter command text.
- Add a hover-revealed right-edge action bar with copy output, copy command, and re-run buttons (Warp-style).
- Thin the border on idle/done blocks to `border-border/40`; keep accent-colored borders only on active states (pending, running, error).
- Shrink footer action buttons to `h-5` with `text-[10px]` for a less prominent, more refined look.
- Keep all existing functionality intact (filter bar, explanation, fix suggestion, approval, etc.) — only visual changes.