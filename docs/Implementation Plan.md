Implementation Plan — Vellum Agent Suite

Problem Statement

Transform Vellum from an AI chat/workspace app into a personal productivity and creator suite. The first
major new module is an agentic terminal — not a simple shell emulator, but a goal-driven terminal where you
describe what you want and the agent runs the necessary commands, shows its work in structured blocks, and
reports back. Additional modules (ADHD focus system, social media posting, content generation) follow as
subsequent suite offerings.

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Requirements

- Terminal module: Agentic shell — give it a goal, it plans and executes commands in sequence. Every command
requires user approval before running. Output is organized in Warp-style command blocks (command + output
paired together). Inline AI — ask about output, get explanations inline.
- Suite architecture: Separate pages per module, unified navigation via the existing sidebar. Can be unified
into a dashboard later.
- ADHD task manager: Focus mode (one task at a time, Pomodoro), low-friction capture, agent-assisted
prioritization AND execution (agent can be handed a dev task to work on).
- Social/Content modules: Agent generates content from a brief and posts/schedules it.

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Background

Architecture fit:
- The existing runShell tool and approval policy are a foundation but aren't suitable for the terminal
module — they're for the chat agent. The terminal needs its own agent loop with PTY-level I/O for a real
interactive feel.
- The existing Terminal component in ai-elements/terminal.tsx is a display-only component for rendering
shell output in chat — it can be reused/extended for block rendering.
- node-pty (Microsoft's pseudoterminal library) is the standard for real PTY sessions in Electron — the same
stack VS Code uses. It needs to live in release/app/package.json alongside better-sqlite3 as a native
module.
- xterm.js with @xterm/addon-fit can provide a real terminal emulator surface for raw PTY mode, but for the
agentic block model we primarily need the agent loop, not a full xterm emulator.
- The existing IPC channel contract (channels.ts) is the clean extension point for terminal IPC.
- The agent loop architecture (goal → plan → tool calls → streaming results) maps directly to the existing
ToolLoopAgent pattern — we create a TerminalAgent variant focused on shell tools.

Key technical decisions:
- Two terminal modes: Agent Mode (goal-driven, command blocks, the primary UX) and Shell Mode (raw PTY via
node-pty + xterm.js, for when you need a real interactive shell). Start with Agent Mode only.
- Command blocks: Each agent step produces a CommandBlock — { id, command, output, exitCode, status,
agentThought }. These are stored in the terminal session in SQLite and rendered in the UI.
- Approval flow: Reuse the existing tool-approval-request / tool-approval-response IPC pattern — the
terminal agent emits an approval request per command, the UI renders an approve/deny card inline in the
block stream.

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Proposed Solution

A new /terminal route backed by a TerminalAgent (a focused variant of the existing agent), with its own IPC
namespace (terminal:*), its own DB table (terminal_sessions, terminal_blocks), and a block-based UI that
renders each command + output as a paired unit. The suite navigation adds Terminal, Tasks, and (later)
Content to the sidebar.

graph TD
A[User types goal] --> B[TerminalAgent receives goal]
B --> C{Plan commands}
C --> D[Emit approval-request for cmd 1]
D --> E{User approves?}
E -- Yes --> F[Run command via runShell]
F --> G[Stream output back as CommandBlock]
G --> H{More commands?}
H -- Yes --> D
H -- No --> I[Agent synthesizes result]
E -- No --> J[Skip / abort]

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task Breakdown

Task 1: Add terminal module navigation + empty page
- Add terminal and tasks entries to the sidebar (AppSidebar.tsx) with appropriate icons
- Add /terminal and /tasks routes in routes.tsx
- Create stub Terminal.tsx and Tasks.tsx page components that render a placeholder
- Update AppSidebar section logic to handle the new sections
- Test: Navigate to /terminal and /tasks — both render without errors, sidebar highlights correctly
- Demo: The app has two new sidebar sections and navigable pages

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 2: Terminal DB schema + IPC channels
- Add terminal_sessions and terminal_blocks tables to src/main/db/schema.ts
- terminal_sessions: id, title, created_at, updated_at
- terminal_blocks: id, session_id, command, output, exit_code, status
(pending/running/done/error/skipped), agent_thought, position, created_at

- Create src/main/db/terminal.ts with CRUD functions: createTerminalSession, listTerminalSessions,
appendBlock, updateBlock, getSessionBlocks
- Add terminal channel types to channels.ts: terminal:sessions-list, terminal:session-create,
terminal:session-delete, terminal:blocks-get, terminal:block-update
- Test: Unit tests for the DB CRUD functions
- Demo: Can create a terminal session and read it back via IPC

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 3: TerminalAgent — goal-driven shell agent
- Create src/main/ai/terminal-agent.ts — a focused ToolLoopAgent whose tool set is restricted to runShell,
readFile, listDirectory, and readClipboard (no workspace/RAG tools)
- System prompt is terminal-specific: "You are a terminal agent. Given a goal, break it into shell commands.
Explain your plan. Run each command and report the result."
- Wire the agent to emit terminal:approval-request (reusing the existing approval IPC pattern) and
terminal:stream-chunk / terminal:stream-done
- Add IPC handlers in handlers.ts: terminal:run-goal triggers the agent, terminal:approve-command /
terminal:reject-command resolves pending approvals
- Test: Unit test that the agent correctly builds its tool call sequence for a simple goal ("list files in
current dir")
- Demo: Call terminal:run-goal via the IPC layer and see command approval requests emitted

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 4: CommandBlock UI components
- Create src/components/terminal/CommandBlock.tsx — a styled block showing:
- Agent thought (collapsible, italicized)
- The proposed command (monospace, highlighted)
- Approve / Reject buttons when status is pending
- Running indicator (spinner) when running
- Output (ANSI-rendered using the existing ansi-to-react dependency) when done
- Exit code badge (green 0 / red non-zero)

- Create src/components/terminal/TerminalGoalInput.tsx — a prompt bar (styled like ChatInput) where you type
your goal and hit Enter
- Create src/components/terminal/AgentSummary.tsx — the final agent synthesis message after all blocks
complete
- Test: Render CommandBlock in all states (pending/running/done/error/skipped) in Jest/jsdom
- Demo: Storybook-style: a page with hardcoded blocks in each state renders correctly

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 5: Wire terminal page end-to-end
- Build out Terminal.tsx page:
- Sidebar showing terminal sessions (create new, select existing)
- Main area: scrollable block list using the existing use-stick-to-bottom pattern
- TerminalGoalInput at the bottom

- Implement use-terminal-session.ts hook (mirrors use-agent-chat.ts): manages block state, subscribes to
terminal:stream-chunk / terminal:approval-request, sends terminal:approve-command / terminal:reject-command
- Persist completed blocks to DB via terminal:block-update when each block finishes
- Test: Integration test — submit a goal, approve a command, verify the block renders with output
- Demo: Full end-to-end: type "what shell am I running", approve the echo $SHELL command, see the output
block appear

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 6: Inline AI on blocks (explain + fix)
- Add a context menu / hover action to each completed CommandBlock with "Explain output" and (on non-zero
exit) "Suggest fix"
- These trigger a lightweight follow-up agent call (not a new session — just a single generateText call)
that returns an inline explanation or fix suggestion
- Render the explanation as a collapsible <AgentNote> sub-component beneath the block output
- Add IPC channel terminal:explain-block → { thought: string }
- Test: Unit test the explanation handler returns a non-empty string for sample output
- Demo: Run a failing command, click "Suggest fix", see the inline suggestion appear under the output block

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 7: Tasks DB schema, IPC + focus mode UI
- Add tasks table: id, title, description, status (backlog/active/done), priority, due_at, pomodoro_count,
created_at
- Create src/main/db/tasks.ts CRUD + IPC channels: tasks:list, tasks:create, tasks:update, tasks:delete
- Build Tasks.tsx page with three columns: Backlog / Active / Done (simple, no drag-drop yet)
- Build FocusMode.tsx — an overlay/modal that takes the active task fullscreen:
- Task title + description
- Pomodoro timer (25 min work / 5 min break, configurable)
- "Hand to agent" button that opens a new terminal session pre-seeded with the task as the goal

- Test: Pomodoro timer unit tests (state transitions: idle → running → break → done)
- Demo: Create a task, click Focus, timer counts down, "Hand to agent" opens a terminal session with the
task title as the goal

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 8: Agent-assisted task prioritization
- Add tasks:prioritize IPC channel — calls a lightweight agent with the task list and returns a suggested
order with reasoning
- Render a "Prioritize with AI" button in the Tasks page header
- Display the agent's ranked list as a suggestion overlay (accept all / accept one / dismiss)
- Test: Mock the agent call and verify the UI renders the suggestion overlay correctly
- Demo: Click "Prioritize with AI" with a few tasks — see the ranked list with the agent's reasoning

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 9: Content generation module — scaffold + brief-to-post pipeline
- Add /content route and sidebar entry
- Create Content.tsx page with a "New Post" flow: platform picker (Twitter/X, LinkedIn, Instagram
placeholder), brief input, tone picker
- Add content_posts table: id, platform, brief, generated_text, status (draft/scheduled/posted),
scheduled_at, created_at
- Create src/main/ai/content-agent.ts — generateText call with a content-generation system prompt
parameterized by platform and tone
- IPC channels: content:generate → { text: string }, content:posts-list, content:save-post
- Test: Unit test the content agent prompt construction for each platform
- Demo: Enter a brief "I just shipped a terminal module in my desktop app", pick Twitter, click Generate —
see a draft tweet

────────────────────────────────────────────────────────────────────────────────────────────────────────────

Task 10: Content posting pipeline + scheduling
- Integrate Twitter/X API (OAuth2) and LinkedIn API for actual posting — abstract behind a SocialPlatform
interface so adding platforms later is mechanical
- Add credentials:social to the Settings dialog (alongside existing API key management using safeStorage)
- Implement content:post-now and content:schedule IPC handlers
- Scheduled posts use setInterval / setTimeout in main with persistence in SQLite (re-queued on app start)
- Test: Mock the platform interface and verify scheduling logic re-queues on startup
- Demo: Save a post as scheduled for +1 minute, restart app, verify it posts (to a test account)
