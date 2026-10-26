---
sessionId: session-261026-170221-y6fe
---

# Requirements

### Overview
Redesign the Terminal page as a **VSCode-inspired multi-pane workspace** where each pane has its own tab bar, and each tab hosts a terminal session. Panes are split-able (horizontally/vertically) and resizable. The layout is session-scoped.

### VSCode Layout Model
The key difference from the previous implementation:
- **Each pane has its own tab bar** — not a global tab bar at the top
- **A pane always has at least 1 tab** — closing the last tab in a pane also closes the pane (and the pane's sibling takes its space)
- **Splitting a pane creates a new pane** with a new default tab (new terminal session)
- **Different tab types**: Shell (raw PTY), AI Terminal (agent goal-driven)

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader (Terminal breadcrumb + project)             │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────┬──────────────────────────────┐ │
│ │ [Tab1 ●] [Tab2 ●] [+] │ [Tab3 ●] [+]               │ │
│ ├──────────────────────┤  (pane 2 tab bar)            │ │
│ │                      ├──────────────────────────────┤ │
│ │   TerminalTab        │ ┌──────────────────────────┐ │ │
│ │   (active: Tab1)     │ │ [Tab4 ●] [+]             │ │ │
│ │                      │ ├──────────────────────────┤ │ │
│ │                      │ │ TerminalTab              │ │ │
│ │                      │ │ (active: Tab4)           │ │ │
│ │                      │ │                          │ │ │
│ │                      │ └──────────────────────────┘ │ │
│ └──────────────────────┴──────────────────────────────┘ │
│         ↑ pane 1                          ↑ pane 3     │
└─────────────────────────────────────────────────────────┘
```

### Goals
- Each pane has its own tab bar with closeable tabs and a "+" button
- Splitting a pane creates a new pane with a new terminal tab
- Closing the last tab in a pane closes the pane
- Tabs can be of different types: Shell, AI Terminal
- Panes are resizable via draggable split handles
- Layout is session-scoped (localStorage for panel sizes)

### User Stories
- As a developer, I want to split my terminal into two panes, each with its own session
- As a developer, I want to open multiple tabs within a single pane
- As a developer, I want to close a tab and have the next tab in that pane become active
- As a developer, I want to close the last tab in a pane and have that pane disappear
- As a developer, I want to choose between Shell and AI Terminal when creating a new tab

### Scope

**In Scope:**
- Per-pane tab bar (each pane renders its own tab strip)
- Panel tree where each leaf is a "pane" containing multiple tabs
- Split pane support (split right / split down)
- Tab types: Shell (raw PTY via xterm.js), AI Terminal (agent goal-driven)
- New tab button ("+") with dropdown for tab type selection
- Close tab: if last tab in pane, close the pane too
- Resizable split handles via `react-resizable-panels`
- localStorage persistence for panel sizes via `useDefaultLayout`
- Keyboard shortcuts: `Cmd+T` (new tab in active pane), `Cmd+W` (close active tab), `Cmd+\` (split right), `Cmd+Shift+\` (split down)

**Out of Scope:**
- Drag-and-drop tab reordering
- Drag tab to new pane
- Tab groups
- Persisting layout across app restarts beyond localStorage
- Changes to other pages

# Technical Design

### Current Implementation
The current implementation (from the previous attempt) has a global tab bar at the top and a 1:1 mapping between tabs and panel tree leaves. This does not match the VSCode model where each pane can have multiple tabs.

Files from the previous implementation:
- `src/renderer/pages/Terminal.tsx` (191 lines) — page with global tab bar + panel tree
- `src/hooks/use-terminal-layout.ts` (335 lines) — manages tabs map + panel tree
- `src/components/terminal/TerminalTabBar.tsx` (138 lines) — global tab bar
- `src/components/terminal/TerminalPanel.tsx` (119 lines) — recursive panel renderer
- `src/components/terminal/TerminalTab.tsx` (637 lines) — terminal session component

The `TerminalTab` component is well-built and can be reused. The layout model needs to be redone.

### Key Decisions

1. **Pane = leaf in panel tree, each pane holds multiple tabs**: Instead of a 1:1 mapping between tabs and leaves, each leaf node holds an array of tabs and an active tab index. This matches VSCode's model.

2. **Tab types as an enum**: `shell` (raw PTY) and `agent` (AI goal-driven). The "+" button shows a dropdown to choose the type.

3. **Closing last tab closes the pane**: When the user closes the last tab in a pane, the pane itself is removed from the panel tree, and its sibling pane takes the space.

4. **Split creates a new pane with a new tab**: Splitting the active pane creates a sibling pane with a new default tab (agent mode by default).

5. **Per-pane tab bar**: Each pane renders its own `TerminalTabBar` above its content area.

### Proposed Changes

#### 1. Redesign `useTerminalLayout` hook (`src/hooks/use-terminal-layout.ts`)
Rewrite the panel tree model:
- `PanelLeaf` now holds `tabs: TerminalTabInfo[]` and `activeTabIndex: number` instead of a single `tabId`
- Tabs are owned by their pane, not in a global flat map
- Actions: `addTab(paneId, type)`, `closeTab(paneId, tabId)`, `selectTab(paneId, tabId)`, `splitRight(paneId)`, `splitDown(paneId)`
- When closing the last tab in a pane, the pane is removed from the tree
- Track `activePaneId` to know which pane is currently focused

#### 2. Redesign `TerminalPanel` component (`src/components/terminal/TerminalPanel.tsx`)
Each leaf pane now renders:
- Its own `TerminalTabBar` (with the pane's tabs)
- A single `TerminalTab` for the active tab
- Non-active tabs in the same pane are kept in state but not rendered

#### 3. Redesign `TerminalTabBar` component (`src/components/terminal/TerminalTabBar.tsx`)
- Props: `tabs` (array for this pane), `activeTabId`, `onTabSelect`, `onTabClose`, `onNewTab`
- "+" button shows a dropdown with tab types (Shell, AI Terminal)
- Compact, VSCode-style tab strip

#### 4. Adjust `TerminalTab` component (`src/components/terminal/TerminalTab.tsx`)
Remove the internal mode switcher since the tab type is fixed at creation. The tab always renders in its designated mode (agent or shell).

#### 5. Update `Terminal.tsx` page
- Render `PageHeader` + `TerminalPanel` tree
- Pass callbacks down through the tree
- On first load, create a single pane with one agent tab

### Architecture Diagram

``` mermaid
graph LR
  A[Terminal.tsx page] --> B[PageHeader]
  A --> C[TerminalPanel root]
  C --> D[Pane 1: PanelLeaf]
  C --> E[ResizableHandle]
  C --> F[Pane 2: PanelLeaf]
  D --> G[TerminalTabBar for pane 1]
  D --> H[TerminalTab for active tab in pane 1]
  F --> I[TerminalTabBar for pane 2]
  F --> J[TerminalTab for active tab in pane 2]
  H --> K[useTerminalSession s1]
  J --> L[useTerminalSession s2]
  C --> M[useTerminalLayout hook]
  M --> N[localStorage via useDefaultLayout]
```

### File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/use-terminal-layout.ts` | **Rewritten** | New panel tree model: each leaf holds multiple tabs |
| `src/components/terminal/TerminalPanel.tsx` | **Rewritten** | Each leaf renders its own tab bar + active tab |
| `src/components/terminal/TerminalTabBar.tsx` | **Rewritten** | Per-pane tab bar with "+" dropdown for tab types |
| `src/components/terminal/TerminalTab.tsx` | **Modified** | Remove internal mode switcher (type is fixed) |
| `src/renderer/pages/Terminal.tsx` | **Rewritten** | Page header + panel tree, no global tab bar |

### Risks
- **XtermPane lifecycle**: Closing a tab must properly kill the PTY. The existing `XtermPane` handles cleanup on unmount for ephemeral sessions.
- **Nested resizable panels**: `react-resizable-panels` supports nesting, but state management for tabs-per-pane is more complex than 1:1.
- **Performance**: Multiple agent sessions running concurrently means multiple AI tool loops. The main process already supports this.

# Delivery Steps

### ✓ done Step 1: Rewrite useTerminalLayout with per-pane tabs model
Rewrite the layout hook so each panel tree leaf holds an array of tabs instead of a single tab ID.
- Change `PanelLeaf` to hold `tabs: TerminalTabInfo[]` and `activeTabIndex: number`.
- Remove the global `tabs` Map — tabs are now owned by their pane.
- Add `activePaneId` to track which pane is focused.
- Actions: `addTab(paneId, type)`, `closeTab(paneId, tabId)`, `selectTab(paneId, tabId)`, `splitRight(paneId)`, `splitDown(paneId)`.
- When closing the last tab in a pane, remove the pane from the tree and activate a sibling.
- On first load, create a single leaf pane with one agent tab.
- Keep `useDefaultLayout` for panel size persistence.

### ✓ done Step 2: Redesign TerminalPanel and TerminalTabBar for per-pane tabs
Rewrite the panel renderer and tab bar so each pane has its own tab strip.
- Rewrite `TerminalPanel.tsx`: each leaf renders a `TerminalTabBar` (with the pane's tabs) above a single `TerminalTab` for the active tab. Split nodes render `ResizablePanelGroup` with children recursively.
- Rewrite `TerminalTabBar.tsx`: accept `tabs` array (for this pane only), `activeTabId`, `onTabSelect`, `onTabClose`, `onNewTab`. The "+" button shows a dropdown with tab types (Shell, AI Terminal).
- Remove the global tab bar from `Terminal.tsx` — only the page header and panel tree remain.

### ✓ done Step 3: Adjust TerminalTab and update Terminal page
Remove the mode switcher from TerminalTab and update the page to use the new layout.
- Remove the `ModeSwitcher` from `TerminalTab.tsx` — the tab type (agent/shell) is fixed at creation. The tab always renders in its designated mode.
- Rewrite `Terminal.tsx`: render `PageHeader` + `TerminalPanel` tree. Pass callbacks down through the tree. No global tab bar.
- On first load, the `useTerminalLayout` hook creates a single pane with one agent tab.
- Register keyboard shortcuts: `Cmd+T` (new tab in active pane), `Cmd+W` (close active tab), `Cmd+\` (split right), `Cmd+Shift+\` (split down).
- Verify TypeScript compiles and ESLint passes.