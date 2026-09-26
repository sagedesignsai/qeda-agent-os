Right now the Terminal system functionality is basic, Almost bare-bones. The Reason I Building this system instead of using my console is because i wanted something thats inspired by Warp Terminal. particulaly its Terminal Features.
Do Web Research
▶ Thinking: ...ty to delineate commands, execution, and finishes, even within standard interactive shells.
*web_search({"query":"warp terminal core features block based archite...)
⎿ {
  "results": [
    {
      "title": "Terminal Blocks overview | Warp",
      "url": "https://docs.warp.dev/terminal/blocks/"
... 39 more lines
*fetch_web_content(https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment, https://www.warp.dev/blog/how-warp-works)
⎿ URL: https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment
Content-Type: text/html; charset=utf-8
Size: 396873 bytes

--- Content ---
... 13 more lines
*web_search({"query":"\"warp terminal\" features documentation block ...)
⎿ {
  "results": [
    {
      "title": "All Features | Warp",
      "url": "https://www.warp.dev/all-features"
... 39 more lines
*fetch_web_content(https://docs.warp.dev/_llms-txt/terminal.txt)
⎿ URL: https://docs.warp.dev/_llms-txt/terminal.txt
Content-Type: text/plain; charset=utf-8
Size: 339563 bytes

--- Content ---
... 306 more lines
*fetch_web_content(https://docs.warp.dev/_llms-txt/features.txt)
*web_search({"query":"\"warp terminal\" site:docs.warp.dev \"workflow...)
⎿ {
  "results": [
    {
      "title": "YAML Workflows - Warp docs",
      "url": "https://docs.warp.dev/terminal/entry/yaml-workflows/"
... 39 more lines
*fetch_web_content(https://docs.warp.dev/terminal/entry/yaml-workflows/)
⎿ URL: https://docs.warp.dev/terminal/entry/yaml-workflows/
Content-Type: text/html; charset=utf-8
Size: 170575 bytes

--- Content ---
... 4 more lines
*Based on in-depth research into Warp’s architecture and terminal feature set, here is a comprehensive breakdown of what makes Warp compelling, where our current implementation falls short, and a concrete roadmap to turn Vellum Terminal into a truly modern terminal.
1. What Makes Warp Truly Different: The 6 Pillars
Warp didn't just wrap xterm in electron — it dismantled the 50-year-old terminal model where the terminal is an amorphous 80x24 grid of characters and rebuilt it as an IDE-grade workspace:
Traditional Terminal (VT100 / xterm)
┌────────────────────────────────────────────────────────┐
│ $ echo "hello"                                         │
│ hello                                                  │
│ $ git status                                           │
│ On branch main                                         │
│ (One giant continuous text stream without boundaries)  │
└────────────────────────────────────────────────────────┘

Warp Model
┌────────────────────────────────────────────────────────┐
│ ┌─ Block 1 ──────────────────────────────────────────┐ │  ← Metadata: exit code, duration, cwd
│ │ $ echo "hello"              [Copy] [Share] [Filter]│ │  ← Re-run, bookmark, fold output
│ │ hello                                              │ │  ← Searchable, collapsible
│ └────────────────────────────────────────────────────┘ │
│ ┌─ Block 2 ──────────────────────────────────────────┐ │
│ │ $ git status                     exit 0   120ms    │ │
│ │ On branch main...                                  │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ [~/projects/vellum] git:(main)                         │  ← Rich Prompt
│ > git checkout -b feature/                             │  ← Full text editor (multiline, cursor,
│   └── Auto-suggest / completions dropdown (Tab/Ctrl+R) │     vim mode, syntax highlight, ghost text)
└────────────────────────────────────────────────────────┘
Pillar 1: The First-Class Block Model
- Atomic Unit: Every command and its output are encapsulated into a Block.
- Block Actions:
- Copy Command, Copy Output, Copy Both (with clean markdown formatting).
- Re-run command directly from the block header.
- Share block (creates a web permalink or export).
- Bookmark / Pin block for quick recall.
- Block Filtering: Filter massive stdout (e.g., docker logs or build traces) right inside the block using text or regex without re-running grep.
- Sticky Command Header: When output is 5,000 lines long, scrolling down keeps the command pinned at the top so you never lose context of what command generated that output. Clicking the sticky header scrolls back to the top of the block.
- Fold / Collapse Output: Toggle huge outputs down to a 1-line summary.
Pillar 2: Modern Input Editor (Not a Dumb TTY Line)
- In standard terminals, the input line is owned by bash/zsh line-discipline (readline/zle). You can't click to position the cursor, selections are clunky, and multiline commands are painful.
- Warp decouples the input: it's a full modern text editor pinned at the bottom.
- Click to position cursor, drag to select, multi-cursor, Cmd+A, Cmd+C/Cmd+V.
- Proper multi-line editing with auto-indent.
- Vim keybindings option.
- Syntax highlighting & error highlighting before you press Enter (e.g. unknown commands in red).
Pillar 3: Rich Autocompletions & History
- Autosuggestions: Fish-like ghost text showing the most probable completion (accept with right arrow).
- Command Completions Menu: Triggered on Tab, showing flags, descriptions, and file paths with icons.
- Visual History (Ctrl+R): A rich fuzzy-search palette over command history, filterable by directory or exit code (find all failed curl commands).
Pillar 4: Parameterized Workflows (Runbooks)
- Replaces bash aliases and forgotten snippets with structured templates:
name: Docker Clean Up
command: docker rmi $(docker images -f "dangling=true" -q)
description: Remove all dangling images
- Supports parameters with interactive fill-in: git checkout -b {{branch_name}} origin/{{base_branch}}. Pressing Enter on a workflow pops a quick input bar to fill {{branch_name}} and runs it.
Pillar 5: Deep In-Terminal AI (Warp AI)
- Natural Language to Shell: Type # or Ctrl+Space → "find all files modified today bigger than 10MB" → outputs the exact command into your editor for review before execution.
- Explain Error / Suggest Fix: When exit code ≠ 0, an inline badge offers "Ask AI to fix". The AI reads the failed command + stderr and writes the fix directly into the input editor.
- Agentic Execution (Agent Mode): The AI autonomously loops through diagnostic and fix commands.
Pillar 6: Tabs, Panes & Session Restoration
- Split panes (horizontal / vertical).
- Tabs with custom titles and cwd memory.
- Session restoration: if the app quits or restarts, your terminal blocks, history, and scrollback are preserved.
2. Gap Analysis: Where Vellum Terminal Is Today vs. Warp
Feature
Modes
User direct commands
Input Editor
Block Actions
Exit Code & Timing
Output Filtering
Output Folding
Sticky Command Header
Parameterized Workflows
Inline AI on Failure
Tabs & Panes
Interactive Shell in Blocks
3. Concrete Feature Roadmap for Vellum Terminal
To bridge the gap between our current prototype and a Warp-inspired terminal, here is the structured evolution plan:
Phase 1: High-Impact Block Upgrades (Immediate UI/UX Wins)
1. Direct Shell Execution in Block Stream:
- Allow users to type either a natural language goal (agent: ... or switch toggle) OR a direct shell command (e.g. pnpm test, git status) that executes and creates a completed block immediately without agent planning overhead.
2. Block Superpowers:
- Re-run action: Click a circular refresh icon on any block header to re-execute that command.
- Execution Duration & Timestamp: Track start_time and end_time (e.g. 2.4s • 10:42 AM).
- Fold / Collapse: Allow collapsing massive command outputs to save vertical space.
- Copy Command vs Copy Output: Separate quick buttons for copying the exact command or stdout.
- In-Block Line Search/Filter: A search icon on the block header that highlights or filters output lines matching a query.
3. AI Error Fixer ("Fix Command"):
- When exit_code !== 0, display a prominent "Fix with AI" button next to the error badge. Clicking it calls the model to diagnose the failure and auto-fill a proposed fix command ready to run.
Phase 2: Workflows & Runbooks (Parameterized Commands)
1. Vellum Workflows (.vellum/workflows or SQLite store):
- Store reusable multi-step or single-step parameterized commands:
name: "Kill Port"
command: "lsof -ti:{{port}} | xargs kill -9"
description: "Kill whatever process is running on a given port"
2. Interactive Parameter Insertion:
- Selecting a workflow displays a pill form or inline slot editor to provide the {{port}} argument before insertion into the input box.
Phase 3: The Unified Hybrid Shell (Warp's Core Secret)
- In standard terminals, people either have an interactive terminal (xterm) OR an agent chat. Warp merged them using Shell Integration (OSC 133 sequences):
- When your shell (zsh/bash) prints prompt, runs command, and finishes command, it emits escape sequences (\033]133;A\007, B, C, D).
- We can ingest these hooks from our node-pty manager to slice real shell sessions into Blocks dynamically, providing the best of both worlds: full interactive shell support (zsh plugins, git aliases, fzf) with Warp-style block isolation!
Which area of Warp's feature set would you like to build first?
1. Block Upgrades (Re-run command, execution duration/timestamps, output collapsing, dual copy buttons, and "Fix with AI" on error)?
2. Direct Command Execution (Allow the input bar to run direct commands immediately into blocks alongside agent goals)?
3. Parameterized Workflows / Runbooks (Saved templates with interactive argument placeholders)?
4. Shell Integration Hooks (OSC 133 stream slicing to turn real PTY output into blocks)?
❯1
▶ Thinking: ...o provide both diagnosis and a runnable, fixed command for immediate execution by the user.
*search_codebase(CREATE_TERMINAL_BLOCKS, runCommand, explainBlock, CommandBlockFooter)
⎿ Found 1 result for pattern: CREATE_TERMINAL_BLOCKS

src/main/db/schema.ts:231:14
  232: CREATE TABLE IF NOT EXISTS terminal_blocks (

... 47 more lines
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=220, end_line=260; .../docugent-desktop/src/main/db/terminal.ts, start_line=20, end_line=180; .../docugent-desktop/src/main/ipc/channels.ts, start_line=180, end_line=250)
⎿ 266 lines | typescript
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=200, end_line=260; .../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=340, end_line=400; .../src/components/terminal/CommandBlock.tsx, start_line=160, end_line=200; .../src/components/terminal/CommandBlock.tsx, start_line=300, end_line=390)
⎿ 249 lines | typescript
*read_files(.../src/components/terminal/CommandBlock.tsx, start_line=undefined, end_line=undefined)
⎿ 463 lines | tsx
*read_files(.../docugent-desktop/src/main/db/terminal.ts, start_line=1, end_line=170)
⎿ 170 lines | typescript
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=100, end_line=160; .../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=350, end_line=400)
⎿ 107 lines | typescript
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=180, end_line=240; .../src/hooks/use-terminal-session.ts, start_line=115, end_line=170)
⎿ 117 lines | typescript
*read_files(.../docugent-desktop/src/main/ipc/handlers.ts, start_line=600, end_line=655)
⎿ 56 lines | typescript
*read_files(.../src/renderer/pages/Terminal.tsx, start_line=90, end_line=150; .../src/renderer/pages/Terminal.tsx, start_line=215, end_line=285)
⎿ 132 lines | tsx
*search_codebase(terminal:session-status, deleteTerminalSession)
⎿ Found 2 results for pattern: terminal:session-status

src/components/sidebar/TerminalMenu.tsx:130:16
  131:     const { sessionId, status } = args[0] as { sessionId: string; status: TerminalSession['status'] };

... 31 more lines
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=70, end_line=110)
⎿ 41 lines | typescript
*search_codebase(suggestFix, terminal:suggest-fix)
  No results found for pattern: suggestFix
Searched 393 files.
No results found for pattern: terminal:suggest-fix
Searched 393 files.
*search_codebase(rerun, runCommandDirect)
  No results found for pattern: rerun
Searched 393 files.
No results found for pattern: runCommandDirect
Searched 393 files.
*read_files(.../docugent-desktop/src/main/ipc/handlers.ts, start_line=550, end_line=570)
⎿ 21 lines | typescript
*search_codebase(terminal_blocks.*duration, CREATE TABLE IF NOT EXISTS terminal_blocks)
⎿ No results found for pattern: terminal_blocks.*duration
Searched 393 files.
Found 1 result for pattern: CREATE TABLE IF NOT EXISTS terminal_blocks

src/main/db/schema.ts:232:1
... 5 more lines
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=230, end_line=248)
⎿ 19 lines | typescript
*search_codebase(PRAGMA table_info\(terminal_blocks\), duration_ms)
  No results found for pattern: PRAGMA table_info\(terminal_blocks\)
Searched 393 files.
No results found for pattern: duration_ms
Searched 393 files.
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=310, end_line=340)
⎿ 31 lines | typescript
*search_codebase(applyMigrations)
⎿ Found 4 results for pattern: applyMigrations

src/__tests__/notebook-tools.test.ts:12:10
  13: import { useTestDatabase } from '../main/db/client';

... 33 more lines
*read_files(.../src/components/terminal/CommandBlock.tsx, start_line=110, end_line=160; .../src/components/terminal/CommandBlock.tsx, start_line=160, end_line=240)
⎿ 132 lines | tsx
*read_files(.../src/components/terminal/CommandBlock.tsx, start_line=240, end_line=380)
⎿ 141 lines | tsx
*search_codebase(terminal:execute-command, execute-command)
  No results found for pattern: terminal:execute-command
Searched 393 files.
No results found for pattern: execute-command
Searched 393 files.
*search_codebase(terminal:suggest-fix, suggestFix)
  No results found for pattern: terminal:suggest-fix
Searched 393 files.
No results found for pattern: suggestFix
Searched 393 files.
*search_codebase(terminal:block-proposed, terminal:session-delete)
⎿ Found 4 results for pattern: terminal:block-proposed

src/hooks/use-terminal-session.ts:11:11
  12:  *      - terminal:block-update-event → patch existing block in place

... 71 more lines
*search_codebase(terminal:session-status, terminal:session-renamed)
⎿ Found 2 results for pattern: terminal:session-status

src/main/ipc/handlers.ts:589:38
  590:           sessionId,

... 31 more lines
*search_codebase(runCommand\(, export function runCommand)
⎿ Found 1 result for pattern: runCommand\(

src/main/ai/terminal-agent.ts:109:10
  110:   command: string,

... 5 more lines
*search_codebase(cleanApprovalGates, cancelSessionApprovalGates)
  No results found for pattern: cleanApprovalGates
Searched 393 files.
No results found for pattern: cancelSessionApprovalGates
Searched 393 files.
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=70, end_line=110)
⎿ 41 lines | typescript
*search_codebase(explainBlock)
⎿ Found 2 results for pattern: explainBlock

src/main/ai/terminal-agent.ts:360:23
  361:   const settings = getSettings();

... 13 more lines
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=355, end_line=400)
⎿ 41 lines | typescript
*search_codebase(terminal:explain, terminal:rerun, terminal:suggest-fix)
⎿ Found 4 results for pattern: terminal:explain

docs/Implementation Plan.md:156:19
  157: - Test: Unit test the explanation handler returns a non-empty string for sample output

... 37 more lines
*search_codebase(executeDirectCommand, appendBlock)
⎿ No results found for pattern: executeDirectCommand
Searched 393 files.
Found 3 results for pattern: appendBlock

docs/Implementation Plan.md:94:1
... 25 more lines
*search_codebase(CommandBlockFilter, CommandBlockHeader)
⎿ No results found for pattern: CommandBlockFilter
Searched 393 files.
Found 2 results for pattern: CommandBlockHeader

src/renderer/pages/Terminal.tsx:36:3
... 15 more lines
*search_codebase(interface TerminalBlock {, const block = appendBlock)
⎿ Found 1 result for pattern: interface TerminalBlock {
Searched 393 files.

src/main/db/terminal.ts:31:8
  29:   | 'skipped';
... 13 more lines
*search_codebase(CREATE_TERMINAL_BLOCKS)
⎿ Found 1 result for pattern: CREATE_TERMINAL_BLOCKS

src/main/db/schema.ts:231:14
  232: CREATE TABLE IF NOT EXISTS terminal_blocks (

... 3 more lines
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=305, end_line=335)
⎿ 31 lines | typescript
*search_codebase(ADD COLUMN)
  No results found for pattern: ADD COLUMN
Searched 393 files.
*run_commands(node -e "
const Database = require('./release/app/node_modules/better-sqlite3/lib/index.js');
const db = new Database(':memory:');
db.exec('CREATE TABLE foo (id TEXT PRIMARY KEY);');
function addCol(table, col, def) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all().map(c => c.name);
  if (!cols.includes(col)) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + def);
  }
}
addCol('foo', 'duration_ms', 'INTEGER');
addCol('foo', 'duration_ms', 'INTEGER');
console.log(db.prepare('PRAGMA table_info(foo)').all());
")
⎿ [   ... 17 more lines
*search_codebase(applyMigrations\()
⎿ Found 4 results for pattern: applyMigrations\(

src/__tests__/notebook-tools.test.ts:21:3
  22:   useTestDatabase(db);

... 33 more lines
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=335, end_line=370)
⎿ 27 lines | typescript
*search_codebase(appendBlock\(, updateBlock\()
⎿ Found 2 results for pattern: appendBlock\(

src/main/db/terminal.ts:115:17
  116:   sessionId: string;

... 71 more lines
*search_codebase(maxBytes, maxOutput, MAX_OUTPUT)
⎿ Found 1 result for pattern: maxBytes

src/main/ai/terminal-agent.ts:247:7
  248:         .number()

... 7 more lines
*search_codebase(runCommand)
⎿ Found 1 result for pattern: runCommand

src/main/ai/terminal-agent.ts:109:10
  110:   command: string,

... 3 more lines
*search_codebase(resolveModel\(, getSettings\()
⎿ Found 5 results for pattern: resolveModel\(

src/main/tools/rag.ts:64:10
  65: }

... 121 more lines
*search_codebase(terminal:block-proposed, terminal:block-update-event)
⎿ Found 4 results for pattern: terminal:block-proposed

src/hooks/use-terminal-session.ts:11:11
  12:  *      - terminal:block-update-event → patch existing block in place

... 61 more lines
*search_codebase(useTerminalSession)
⎿ Found 2 results for pattern: useTerminalSession

src/hooks/use-terminal-session.ts:29:18
  30:   blocks: TerminalBlock[];

... 13 more lines
*read_files(.../src/hooks/use-terminal-session.ts, start_line=115, end_line=174)
⎿ 60 lines | typescript
*search_codebase(setFixInInput, TerminalGoalInput)
⎿ No results found for pattern: setFixInInput
Searched 393 files.
Found 4 results for pattern: TerminalGoalInput

scripts/tokenize-terminal.mjs:50:28
... 33 more lines
*read_files(.../src/components/terminal/TerminalGoalInput.tsx, start_line=50, end_line=110)
⎿ 61 lines | tsx
*search_codebase(formatDuration, formatRelativeTime)
⎿ Found 1 result for pattern: formatDuration

src/components/ai-elements/test-results.tsx:36:7
  37:   if (ms < 1000) {

... 5 more lines
*read_files(.../src/components/ai-elements/test-results.tsx, start_line=30, end_line=55)
⎿ 26 lines | tsx
*search_codebase(lucide-react.*ChevronDown, lucide-react.*Search, lucide-react.*Refresh)
⎿ No results found for pattern: lucide-react.*ChevronDown
Searched 393 files.
No results found for pattern: lucide-react.*Search
Searched 393 files.
No results found for pattern: lucide-react.*Refresh
... 1 more lines
*search_codebase(RotateCcwIcon, RotateCwIcon, SparklesIcon, ChevronRightIcon)
⎿ Found 1 result for pattern: RotateCcwIcon

src/components/workspace/PageInfoPanel.tsx:20:3
  21:   LoaderIcon,

... 191 more lines
*search_codebase(terminal.*test, test.*terminal)
⎿ No results found for pattern: terminal.*test
Searched 393 files.
Found 1 result for pattern: test.*terminal

docs/Implementation Plan.md:82:3
... 5 more lines
*search_codebase(src/__tests__)
  No results found for pattern: src/__tests__
Searched 393 files.
*run_commands(ls -la src/__tests__/)
⎿ total 96   ... 14 more lines
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=230, end_line=248; .../docugent-desktop/src/main/db/terminal.ts, start_line=25, end_line=45)
⎿ 40 lines | typescript
*editor(.../docugent-desktop/src/main/db/schema.ts)
⎿ +18 -17 lines | typescript
                CHECK(status IN ('pending','running','done','error','skipped')),
  agent_thought TEXT NOT NULL DEFAULT '',
  explanation   TEXT NOT NULL DEFAULT '',
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
*read_files(.../docugent-desktop/src/main/db/schema.ts, start_line=325, end_line=375)
⎿ 38 lines | typescript
*editor(.../docugent-desktop/src/main/db/schema.ts)
⎿ +24 -11 lines | typescript
export function applyMigrations(db: {
  exec: (sql: string) => unknown;
  prepare?: (sql: string) => { all: () => Array<{ name: string }> };
}): void {
  db.exec(CREATE_MIGRATIONS);
  for (const statement of MIGRATION_STATEMENTS) {
  }
  for (const statement of DATA_MIGRATIONS) {
    db.exec(statement);
  }

  // Ensure optional columns exist if migrating an existing database
  if (typeof db.prepare === 'function') {
    try {
      const cols = db.prepare('PRAGMA table_info(terminal_blocks)').all().map((c) => c.name);
      if (!cols.includes('duration_ms')) {
        db.exec('ALTER TABLE terminal_blocks ADD COLUMN duration_ms INTEGER');
      }
    } catch {
      // Table might not exist yet or running in raw exec mock
    }
  }
}
*read_files(.../docugent-desktop/src/main/db/terminal.ts, start_line=25, end_line=60; .../docugent-desktop/src/main/db/terminal.ts, start_line=140, end_line=180)
⎿ 70 lines | typescript
*editor(.../docugent-desktop/src/main/db/terminal.ts)
⎿ +14 -13 lines | typescript
  status: TerminalBlockStatus;
  agent_thought: string;
  explanation: string;
  duration_ms?: number | null;
  created_at: number;
  updated_at: number;
}
*editor(.../docugent-desktop/src/main/db/terminal.ts)
⎿ +44 -22 lines | typescript
/** Patch a block's status, output, exit_code and/or explanation. */
/** Patch a block's status, output, exit_code, explanation, command, and/or duration. */
export function updateBlock(
  id: string,
  patch: Partial<
    Pick<TerminalBlock, 'status' | 'output' | 'exit_code' | 'explanation' | 'command'>
    Pick<
      TerminalBlock,
      'status' | 'output' | 'exit_code' | 'explanation' | 'command' | 'duration_ms'
    >
  >,
): void {
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (patch.status      !== undefined) { sets.push('status = ?');      values.push(patch.status); }
  if (patch.output      !== undefined) { sets.push('output = ?');      values.push(patch.output); }
  if (patch.exit_code   !== undefined) { sets.push('exit_code = ?');   values.push(patch.exit_code); }
  if (patch.explanation !== undefined) { sets.push('explanation = ?'); values.push(patch.explanation); }
  if (patch.command     !== undefined) { sets.push('command = ?');     values.push(patch.command); }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.output !== undefined) {
    sets.push('output = ?');
    values.push(patch.output);
  }
  if (patch.exit_code !== undefined) {
    sets.push('exit_code = ?');
    values.push(patch.exit_code);
  }
  if (patch.explanation !== undefined) {
    sets.push('explanation = ?');
    values.push(patch.explanation);
  }
  if (patch.command !== undefined) {
    sets.push('command = ?');
    values.push(patch.command);
  }
  if (patch.duration_ms !== undefined) {
    sets.push('duration_ms = ?');
    values.push(patch.duration_ms);
  }

  values.push(id);
  getDb()
* 
Daily free model limit reachedYou've reached today's free usage limit for this model.
Try again in 23h 50m"}} or select another model.
open the model selector with /model. or select another model.
Open the model selector with /model.
❯continue
▶ Thinking: ...hases and verify as I go.  Let me read the key parts of terminal-agent.ts I need to modify.
*Let me read the agent's command execution path to add timing.
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=100, end_line=250)
⎿ 151 lines | typescript
▶ Thinking: ...` returns `durationMs` 2. execute() passes duration to updateBlock + emitter  Let me do it.
*Now adding duration tracking to the execution path:
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +52 -34 lines | typescript
  command: string,
  cwd?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
): Promise<{
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    let timedOut = false;
    // Wall-clock timing starts before spawn so the number reflects what the
    // user actually waited, matching how Warp reports block duration.
    const startedAt = Date.now();

    const child = spawn('sh', ['-c', command], {
      cwd,

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ output: chunks.join(''), exitCode: code, timedOut });
      resolve({
        output: chunks.join(''),
        exitCode: code,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ output: err.message, exitCode: null, timedOut: false });
      resolve({
        output: err.message,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +34 -31 lines | typescript
      // 5. Execute
      const { output, exitCode, timedOut } = await runCommand(
      const { output, exitCode, timedOut, durationMs } = await runCommand(
        command,
        cwd,
        timeoutMs ?? DEFAULT_TIMEOUT_MS,
        status: finalStatus,
        output: finalOutput,
        exit_code: exitCode,
        duration_ms: durationMs,
      });
      emitter.onBlockUpdated({
        id: block.id,
        status: finalStatus,
        output: finalOutput,
        exit_code: exitCode,
        duration_ms: durationMs,
      });

      return {
        exitCode,
        output: finalOutput,
        success: exitCode === 0,
        durationMs,
      };
▶ Thinking: ...k`, `appendBlock`. Good.  Let me add the function after the TerminalAgentEmitter interface.
*Now the key Warp-inspired capability — direct execution (user types a command, it runs immediately without agent planning). Let me add that plus the AI fixer.
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +58 -1 lines | typescript
// ─── Direct execution (Warp-style) ───────────────────────────────────────────

/**
 * Run a command the *user* typed and turn it into a completed block.
 *
 * This is deliberately not routed through the agent or the approval gate: the
 * user authored the command, so consent is already given — exactly how Warp
 * treats commands you type yourself. Approval exists only for commands the
 * *agent* proposes, which the user has not seen yet.
 *
 * Used by both "run this command now" and "re-run this block", so a re-run
 * creates a fresh block with its own timing rather than mutating history.
 */
export async function executeDirectCommand({
  sessionId,
  command,
  emitter,
  cwd,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  sessionId: string;
  command: string;
  emitter: TerminalAgentEmitter;
  cwd?: string;
  timeoutMs?: number;
}): Promise<void> {
  const block = appendBlock({ sessionId, command, agentThought: '' });
  emitter.onBlockProposed(block);

  updateBlock(block.id, { status: 'running' });
  emitter.onBlockUpdated({ id: block.id, status: 'running' });

  const { output, exitCode, timedOut, durationMs } = await runCommand(
    command,
    cwd,
    timeoutMs,
  );

  const finalStatus: TerminalBlock['status'] =
    timedOut ? 'error' : exitCode === 0 ? 'done' : 'error';
  const finalOutput = timedOut ? `${output}\n[Command timed out]` : output;

  updateBlock(block.id, {
    status: finalStatus,
    output: finalOutput,
    exit_code: exitCode,
    duration_ms: durationMs,
  });
  emitter.onBlockUpdated({
    id: block.id,
    status: finalStatus,
    output: finalOutput,
    exit_code: exitCode,
    duration_ms: durationMs,
  });
}

// ─── Agent tool set ───────────────────────────────────────────────────────────
*Now the AI fixer, extending the existing explainBlock pattern:
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=405, end_line=470)
⎿ 66 lines | typescript
▶ Thinking: ... add `getBlock(id)` to db/terminal.ts.  Then in terminal-agent.ts, use it.  Let me do that.
*I spotted a real bug while reading: explainBlock uses .slice(-5), which takes the last 5 blocks rather than the 5 preceding the target — so explaining an early block sends unrelated later context. Let me add a proper getBlock helper and fix it while adding the fixer.
*editor(.../docugent-desktop/src/main/db/terminal.ts)
⎿ +10 -1 lines | typescript
/** Fetch a single block by id, or null when not found. */
export function getBlock(id: string): TerminalBlock | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM terminal_blocks WHERE id = ?`)
      .get(id) as TerminalBlock | undefined) ?? null
  );
}

/** Return all blocks for a session in position order. */
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +123 -39 lines | typescript
// ─── Block explanation ────────────────────────────────────────────────────────
// ─── Block explanation & fixing ───────────────────────────────────────────────

/**
 * Build transcript context for a block: the commands that ran *before* it.
 *
 * Ordering matters. An earlier implementation took `.slice(-5)` of every block
 * in the session, so explaining block 1 of 10 would hand the model blocks 6–10 —
 * later events it should not be reasoning from. Context must walk backwards
 * from the target.
 */
function precedingContext(block: TerminalBlock, limit = 5): string {
  return getSessionBlocks(block.session_id)
    .filter((b) => b.position < block.position)
    .slice(-limit)
    .map((b) => `$ ${b.command}\n${b.output}`)
    .join('\n---\n');
}

/**
 * Ask the model to explain the output of a finished terminal block in plain
export async function explainBlock(blockId: string): Promise<string> {
  const settings = getSettings();
  const model = resolveModel(settings.activeProvider, settings.activeModel);

  // Get all blocks for context, find the target
  // We need to find the session to get all blocks for context
  // For now, we'll just explain the single block
  const { getDb } = await import('../db/client.js');
  const block = getDb()
    .prepare('SELECT * FROM terminal_blocks WHERE id = ?')
    .get(blockId) as TerminalBlock | undefined;

  const block = getBlock(blockId);
  if (!block) return 'Block not found.';

  // Get neighbouring blocks for context
  const siblings = getSessionBlocks(block.session_id)
    .slice(-5) // last 5 blocks for context
    .map((b) => `$ ${b.command}\n${b.output}`)
    .join('\n---\n');
  const context = precedingContext(block);
  const promptSections = [
    context ? `Recent terminal context:\n${context}` : '',
    `Explain this output:\n$ ${block.command}\n${block.output}`,
  ].filter(Boolean);

  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system:
      'You are a terminal expert. Explain shell command output in plain language. Be concise (2–4 sentences). Focus on what the output means, not the command syntax.',
    prompt: `Recent terminal context:\n${siblings}\n\nExplain this output:\n$ ${block.command}\n${block.output}`,
    prompt: promptSections.join('\n\n'),
    stopWhen: isStepCount(1),
  });


  // Persist the explanation
  updateBlock(blockId, { explanation });

  return explanation;
}

/**
 * Ask the model to diagnose a failed command and propose a replacement.
 *
 * Returns `{ diagnosis, command }` where `command` is a single runnable line —
 * or empty when the failure is not something a command can fix (a permissions
 * problem, a missing tool, a typo in the user's intent). The renderer puts that
 * command into the input bar rather than running it, so the user still reviews
 * it before anything executes. Warp does the same, and it keeps the "nothing
 * runs unseen" invariant intact.
 */
export async function suggestFix(
  blockId: string,
): Promise<{ diagnosis: string; command: string }> {
  const settings = getSettings();
  const model = resolveModel(settings.activeProvider, settings.activeModel);

  const block = getBlock(blockId);
  if (!block) return { diagnosis: 'Block not found.', command: '' };

  const context = precedingContext(block);

  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system: [
      'You are a shell debugging expert. A command failed; diagnose why and propose a fix.',
      '',
      'Respond with ONLY a JSON object, no prose and no code fences:',
      '{"diagnosis": "<one or two sentences on the cause>", "command": "<a single replacement shell command>"}',
      '',
      'Rules for "command":',
      '- It must be a single line, runnable as-is via sh -c.',
      '- Do not include a leading $, nor any commentary inside the string.',
      '- If the failure cannot be fixed by running a command (for example the',
      '  cause is a permission the user lacks, a missing system package, or the',
      '  original command simply did the wrong thing), return an empty string.',
    ].join('\n'),
    prompt: [
      context ? `Earlier commands in this session:\n${context}` : '',
      'The failed command:',
      `$ ${block.command}`,
      '',
      `Exit code: ${block.exit_code ?? 'unknown'}`,
      'Output:',
      block.output || '(no output)',
    ]
      .filter(Boolean)
      .join('\n'),
    stopWhen: isStepCount(1),
  });

  const raw = result.text?.trim() ?? '';

  // The model may still wrap the JSON in fences despite instructions.
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  try {
    const parsed = JSON.parse(unfenced) as {
      diagnosis?: string;
      command?: string;
    };
    return {
      diagnosis: parsed.diagnosis?.trim() || 'No diagnosis available.',
      command: (parsed.command ?? '').trim(),
    };
  } catch {
    // Unparseable output is still useful as an explanation, but there is no
    // safe command to offer — never guess at something that will be executed.
    return { diagnosis: raw || 'Could not analyse this failure.', command: '' };
  }
}
*Now fix the imports and add the IPC channels:
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +8 -7 lines | typescript
import {
  appendBlock,
  getBlock,
  updateBlock,
  updateTerminalSession,
  getSessionBlocks,
*editor(.../docugent-desktop/src/main/ipc/channels.ts)
⎿ +28 -5 lines | typescript
  'terminal:explain': {
    req: { blockId: string };
    res: { explanation: string };
  };
  /**
   * Run a command the user typed (or a re-run) directly, bypassing the agent
   * planner. Consent is implicit because the user authored the command, so no
   * approval gate is involved. Emits terminal:block-proposed + block-update-event
   * exactly like an agent command so the UI path is identical.
   */
  'terminal:execute-command': {
    req: { sessionId: string; command: string; cwd?: string };
    res: void;
  };
  /** Re-run a previously completed block as a new block. */
  'terminal:rerun-block': {
    req: { sessionId: string; blockId: string };
    res: void;
  };
  /**
   * Ask the model to diagnose a failed block and propose a replacement command.
   * The command is returned for review — it is never executed by this handler.
   */
  'terminal:suggest-fix': {
    req: { blockId: string };
    res: { diagnosis: string; command: string };
  };
*Now the handlers. I need to extract the shared emitter so direct commands emit the same events:
*read_files(.../docugent-desktop/src/main/ipc/handlers.ts, start_line=70, end_line=84)
⎿ 15 lines | typescript
*editor(.../docugent-desktop/src/main/ipc/handlers.ts)
⎿ +17 -13 lines | typescript
  deleteTerminalSession,
  updateTerminalSession,
  getSessionBlocks,
  getBlock,
  updateBlock,
} from '../db/terminal';
import {
  runGoal,
  resolveApproval,
  explainBlock,
  suggestFix,
  executeDirectCommand,
  type TerminalAgentEmitter,
} from '../ai/terminal-agent';
*Now refactor the emitter into a shared factory so direct commands reuse the exact same IPC event path:
*editor(.../docugent-desktop/src/main/ipc/handlers.ts)
⎿ +41 -3 lines | typescript
  // ── Agentic terminal ──────────────────────────────────────────────────────

  /**
   * Bridge agent/direct-execution events onto IPC. Built once per call site so
   * `terminal:execute-command`, `terminal:rerun-block` and `terminal:run-goal`
   * all emit through an identical channel set — the renderer needs one code path.
   */
  const makeTerminalEmitter = (currentGoal?: string): TerminalAgentEmitter => ({
    onBlockProposed(block) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-proposed', block);
      }
    },
    onBlockUpdated(patch) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-update-event', patch);
      }
    },
    onDone(sid, summary) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-done', { sessionId: sid, summary });
      }
      // Auto-rename: truncate goal to a clean title and notify sidebar
      if (!currentGoal) return;
      const autoTitle = currentGoal.length > 48 ? `${currentGoal.slice(0, 45)}…` : currentGoal;
      updateTerminalSession(sid, { title: autoTitle });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-renamed', {
          sessionId: sid,
          title: autoTitle,
        });
      }
    },
    onError(sid, error) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-error', { sessionId: sid, error });
      }
    },
  });

  ipcMain.handle('terminal:sessions-list', () => listTerminalSessions());
*Now replace the inline emitter in terminal:run-goal with the factory:
*editor(.../docugent-desktop/src/main/ipc/handlers.ts)
⎿ +47 -37 lines | typescript
      // Build the emitter — bridges agent events to IPC events
      const emitter = {
        onBlockProposed(block: import('../db/terminal').TerminalBlock) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:block-proposed', block);
          }
        },
        onBlockUpdated(patch: Partial<import('../db/terminal').TerminalBlock> & { id: string }) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:block-update-event', patch);
          }
        },
        onDone(sid: string, summary: string) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:agent-done', { sessionId: sid, summary });
          }
          // Auto-rename: truncate goal to a clean title and notify sidebar
          const autoTitle = goal.length > 48 ? `${goal.slice(0, 45)}…` : goal;
          updateTerminalSession(sid, { title: autoTitle });
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:session-renamed', {
              sessionId: sid,
              title: autoTitle,
            });
          }
        },
        onError(sid: string, error: string) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:agent-error', { sessionId: sid, error });
          }
        },
      };
      const emitter = makeTerminalEmitter(goal);

      // Fire-and-forget — agent runs async, IPC events carry progress
      void runGoal({ sessionId, goal, emitter });
    },
  );

  ipcMain.handle(
    'terminal:execute-command',
    (
      _e,
      { sessionId, command, cwd }: { sessionId: string; command: string; cwd?: string },
    ) => {
      // Fire-and-forget: the block moves pending → running → done over IPC.
      void executeDirectCommand({
        sessionId,
        command,
        cwd,
        emitter: makeTerminalEmitter(),
      });
    },
  );

  ipcMain.handle(
    'terminal:rerun-block',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      const block = getBlock(blockId);
      if (!block || !block.command) return;

      // A re-run is a *new* block rather than a mutation, so the original
      // result and its duration stay in the transcript as history.
      void executeDirectCommand({
        sessionId,
        command: block.command,
        emitter: makeTerminalEmitter(),
      });
    },
  );

  ipcMain.handle(
    'terminal:suggest-fix',
    async (_e, { blockId }: { blockId: string }) => {
      // Returns a proposal only; the renderer puts it in the input bar.
      return suggestFix(blockId);
    },
  );
▶ Thinking: ...  Then typecheck.  Let me also handle the UI. Let me first typecheck to catch errors early.
*editor(.../docugent-desktop/src/main/ipc/channels.ts)
⎿ +12 -9 lines | typescript
    req: {
      id: string;
      patch: Partial<
        Pick<TerminalBlock, 'status' | 'output' | 'exit_code' | 'explanation' | 'command'>
        Pick<
          TerminalBlock,
          'status' | 'output' | 'exit_code' | 'explanation' | 'command' | 'duration_ms'
        >
      >;
    };
    res: void;
*run_commands(cd /data/projects/docugent/docugent-desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "npm notice" | head -20; echo "exit=${PIPESTATUS[0]}")
⎿ src/main/ai/terminal-agent.ts(558,1): error TS1128: Declaration or statement expected.   ... 1 more lines
▶ Thinking: ... my explainBlock replacement (the old function's tail). Let me look at the end of the file.
*Leftover from the explainBlock replacement. Let me look at the tail:
*read_files(.../docugent-desktop/src/main/ai/terminal-agent.ts, start_line=540, end_line=575)
⎿ 19 lines | typescript
*The old explainBlock tail (return explanation; }) was orphaned. Removing it:
*editor(.../docugent-desktop/src/main/ai/terminal-agent.ts)
⎿ +3 -6 lines | typescript
    return { diagnosis: raw || 'Could not analyse this failure.', command: '' };
  }
}

  return explanation;
}
*run_commands(cd /data/projects/docugent/docugent-desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "npm notice" | head -20; echo "exit=${PIPESTATUS[0]}")
⎿ exit=0
▶ Thinking: ...ix: (blockId: string) => void; runCommand: (command: string) => void; ```  Let me write it.
*Typecheck clean. Now the hook — adding re-run, fix, and direct-command actions:
*editor(.../src/hooks/use-terminal-session.ts)
⎿ +26 -13 lines | typescript
export type SessionStatus = 'idle' | 'running' | 'done' | 'error';

/** A model-proposed repair for a failed block. Never auto-executed. */
export interface FixSuggestion {
  diagnosis: string;
  command: string;
}

export interface UseTerminalSessionReturn {
  blocks: TerminalBlock[];
  summary: string;
  error: string | undefined;
  isExplainingId: string | undefined;
  /** Repair proposals keyed by block id. */
  fixes: Record<string, FixSuggestion>;
  /** Block id currently being diagnosed, if any. */
  isFixingId: string | undefined;
  runGoal: (goal: string) => void;
  runCommand: (command: string) => void;
  rerun: (blockId: string) => void;
  approve: (blockId: string) => void;
  reject: (blockId: string) => void;
  explain: (blockId: string) => void;
  fix: (blockId: string) => void;
}
*editor(.../src/hooks/use-terminal-session.ts)
⎿ +3 -1 lines | typescript
  const [isExplainingId, setIsExplainingId] = useState<string | undefined>();
  const [fixes, setFixes] = useState<Record<string, FixSuggestion>>({});
  const [isFixingId, setIsFixingId] = useState<string | undefined>();
*editor(.../src/hooks/use-terminal-session.ts)
⎿ +20 -1 lines | typescript
  const runCommand = useCallback(
    (command: string) => {
      if (!sessionId || !command.trim()) return;
      void window.electron.ipc.invoke('terminal:execute-command', {
        sessionId,
        command,
      });
    },
    [sessionId],
  );

  const rerun = useCallback(
    (blockId: string) => {
      if (!sessionId) return;
      void window.electron.ipc.invoke('terminal:rerun-block', { sessionId, blockId });
    },
    [sessionId],
  );

  const approve = useCallback(
*editor(.../src/hooks/use-terminal-session.ts)
⎿ +27 -12 lines | typescript
  const fix = useCallback((blockId: string) => {
    setIsFixingId(blockId);
    void window.electron.ipc
      .invoke<FixSuggestion>('terminal:suggest-fix', { blockId })
      .then((suggestion) => {
        setFixes((prev) => ({ ...prev, [blockId]: suggestion }));
      })
      .finally(() => setIsFixingId(undefined));
  }, []);

  return {
    blocks,
    status,
    summary,
    error,
    isExplainingId,
    fixes,
    isFixingId,
    runGoal,
    runCommand,
    rerun,
    approve,
    reject,
    explain,
    fix,
  };
}
*Now the CommandBlock UI — duration, re-run, copy command, output folding, and the fix card. Let me read the middle section I haven't seen:
*read_files(.../src/components/terminal/CommandBlock.tsx, start_line=112, end_line=200)
⎿ 89 lines | tsx
*read_files(.../src/components/terminal/CommandBlock.tsx, start_line=200, end_line=355)
⎿ 156 lines | tsx
▶ Thinking: ...osis + Use fix button  Let me be efficient and make focused edits.  First: context + props.
*Now the CommandBlock upgrades. First the context to carry the new actions:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +13 -7 lines | tsx
  onReject?: () => void;
  onExplain?: () => void;
  isExplaining?: boolean;
  onRerun?: () => void;
  onFix?: () => void;
  fix?: FixSuggestion;
  isFixing?: boolean;
  /** Send a proposed repair to the input bar for review (never auto-runs). */
  onUseFix?: (command: string) => void;
}
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +54 -22 lines | tsx
  onReject?: () => void;
  onExplain?: () => void;
  isExplaining?: boolean;
  onRerun?: () => void;
  onFix?: () => void;
  fix?: FixSuggestion;
  isFixing?: boolean;
  onUseFix?: (command: string) => void;
}

export function CommandBlock({
  onReject,
  onExplain,
  isExplaining,
  onRerun,
  onFix,
  fix,
  isFixing,
  onUseFix,
  children,
  className,
  ...props
}: CommandBlockProps) {
  const ctx = useMemo(
    () => ({ block, onApprove, onReject, onExplain, isExplaining }),
    [block, onApprove, onReject, onExplain, isExplaining],
    () => ({
      block,
      onApprove,
      onReject,
      onExplain,
      isExplaining,
      onRerun,
      onFix,
      fix,
      isFixing,
      onUseFix,
    }),
    [
      block,
      onApprove,
      onReject,
      onExplain,
      isExplaining,
      onRerun,
      onFix,
      fix,
      isFixing,
      onUseFix,
    ],
  );
*Now the header (re-run action), output (folding), and footer (duration, copy command, fix):
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +49 -34 lines | tsx
export function CommandBlockHeader({ className }: { className?: string }) {
  const { block } = useBlock();
  const { block, onRerun } = useBlock();
  const meta = STATUS_META[block.status];
  const StatusIcon = meta.icon;
  const canRerun = Boolean(onRerun) && block.status !== 'pending' && block.status !== 'running';

  return (
    <div
        <span className="shrink-0 text-muted-foreground/75">$</span>
        <span className="truncate text-foreground">{block.command || '…'}</span>
      </div>

      {/* Re-run — a fresh block, so history is preserved */}
      {canRerun && (
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 text-muted-foreground/75 hover:text-muted-foreground"
          onClick={onRerun}
          title="Re-run command"
          aria-label={`Re-run ${block.command}`}
        >
          <RotateCwIcon className="size-3" />
        </Button>
      )}

      {/* Position badge */}
      <span className="shrink-0 font-sans text-[10px] tabular-nums text-muted-foreground/60">
*Now output folding — the key feature for long build logs:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +63 -36 lines | tsx
export function CommandBlockOutput({ className }: { className?: string }) {
  const { block } = useBlock();
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-scroll when output updates
  const output = block.output;
  const hasOutput = output && output.length > 0;
  const isVisible = block.status === 'running' || block.status === 'done' || block.status === 'error';

  // Long output is folded by default. Counting lines up-front is cheap next to
  // rendering thousands of ANSI spans, and it mirrors Warp's collapsed blocks —
  // a build log should not bury the next command.
  const lineCount = hasOutput ? output.split('\n').length : 0;
  const canFold = block.status !== 'running' && lineCount > FOLD_THRESHOLD;
  const collapsed = canFold && !expanded;

  if (!isVisible && !hasOutput) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'max-h-72 overflow-auto px-4 py-3 text-[12px] leading-relaxed',
        !hasOutput && 'flex items-center gap-2 text-muted-foreground/75',
        className,
      )}
    >
      {hasOutput ? (
        <pre className="whitespace-pre-wrap break-words">
          <Ansi>{output}</Ansi>
          {block.status === 'running' && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-sky-400" />
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        className={cn(
          'overflow-auto px-4 py-3 text-[12px] leading-relaxed',
          collapsed ? 'max-h-32' : 'max-h-72',
          !hasOutput && 'flex items-center gap-2 text-muted-foreground/75',
        )}
      >
        {hasOutput ? (
          <pre className="whitespace-pre-wrap break-words">
            <Ansi>{output}</Ansi>
            {block.status === 'running' && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-sky-400" />
            )}
          </pre>
        ) : block.status === 'running' ? (
          <>
            <Loader2Icon className="size-3 animate-spin" />
            <span className="font-sans text-xs">Executing…</span>
          </>
        ) : null}
      </div>

      {/* Fold control — only for output long enough to be worth hiding */}
      {canFold && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 border-t border-border/40',
            'bg-card/60 py-1 font-sans text-[10px] text-muted-foreground/75',
            'transition-colors hover:bg-card hover:text-muted-foreground',
          )}
        </pre>
      ) : block.status === 'running' ? (
        <>
          <Loader2Icon className="size-3 animate-spin" />
          <span className="font-sans text-xs">Executing…</span>
        </>
      ) : null}
        >
          <ChevronDownIcon
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          />
          {collapsed ? `Show all ${lineCount} lines` : 'Collapse output'}
        </button>
      )}
    </div>
  );
}
*Now the footer — duration, copy command, and the "Fix with AI" action:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +34 -12 lines | tsx
// ─── Footer ───────────────────────────────────────────────────────────────────

/** Output longer than this is folded by default. */
const FOLD_THRESHOLD = 15;

/** Compact, human duration — "412ms", "2.4s", "1m 12s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${mins}m ${rem}s`;
}

export function CommandBlockFooter({ className }: { className?: string }) {
  const { block, onExplain, isExplaining } = useBlock();
  const [copied, setCopied] = useState(false);
  const { block, onExplain, isExplaining, onFix, fix, isFixing } = useBlock();
  const [copied, setCopied] = useState<'output' | 'command' | null>(null);

  const copyOutput = useCallback(() => {
    void navigator.clipboard.writeText(block.output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
  const copy = useCallback((text: string, which: 'output' | 'command') => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }, [block.output]);
  }, []);

  const copyOutput = useCallback(
    () => copy(block.output, 'output'),
    [copy, block.output],
  );
  const copyCommand = useCallback(
    () => copy(block.command, 'command'),
    [copy, block.command],
  );
*Now the footer body — duration display, copy-command, and the Fix button:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +159 -59 lines | tsx
  if (!isFinished) return null;

  const exitOk = block.exit_code === 0;
  // A fix is only offered where a repair could plausibly help.
  const canFix = Boolean(onFix) && block.status === 'error';

  return (
    <div
        className,
      )}
    >
      {/* Exit code badge */}
      <Badge
        variant={exitOk ? 'default' : 'destructive'}
        className={cn(
          'h-5 font-mono text-[10px]',
          exitOk
            ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40'
            : 'bg-rose-900/60 text-rose-300 border-rose-700/40',
      {/* Exit code + duration */}
      <div className="flex items-center gap-2">
        <Badge
          variant={exitOk ? 'default' : 'destructive'}
          className={cn(
            'h-5 font-mono text-[10px]',
            exitOk
              ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40'
              : 'bg-rose-900/60 text-rose-300 border-rose-700/40',
          )}
        >
          exit {block.exit_code ?? '?'}
        </Badge>

        {typeof block.duration_ms === 'number' && (
          <span className="font-sans text-[10px] tabular-nums text-muted-foreground/75">
            {formatDuration(block.duration_ms)}
          </span>
        )}
      >
        exit {block.exit_code ?? '?'}
      </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {block.command && (
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground/75 hover:text-muted-foreground"
            onClick={copyCommand}
            title="Copy command"
            aria-label="Copy command"
          >
            {copied === 'command' ? (
              <CheckCircle2Icon className="size-3 text-emerald-400" />
            ) : (
              <TerminalSquareIcon className="size-3" />
            )}
          </Button>
        )}
        {block.output && (
          <Button
            size="icon"
            className="size-6 text-muted-foreground/75 hover:text-muted-foreground"
            onClick={copyOutput}
            title="Copy output"
            aria-label="Copy output"
          >
            <CopyIcon className="size-3" />
            {copied === 'output' ? (
              <CheckCircle2Icon className="size-3 text-emerald-400" />
            ) : (
              <CopyIcon className="size-3" />
            )}
          </Button>
        )}
        {canFix && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-6 gap-1 px-2 text-[10px] font-sans',
              fix
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-muted-foreground/75 hover:text-muted-foreground',
            )}
            onClick={onFix}
            disabled={isFixing}
          >
            <WrenchIcon className={cn('size-3', isFixing && 'animate-pulse')} />
            {isFixing ? 'Diagnosing…' : fix ? 'Re-diagnose' : 'Fix with AI'}
          </Button>
        )}
        {onExplain && (
        )}
      </div>
    </div>
  );
}

// ─── Fix suggestion ───────────────────────────────────────────────────────────

/**
 * Renders the model's diagnosis of a failed command.
 *
 * The proposed command is offered, never run: clicking it writes the command
 * into the input bar so the user still reviews and submits it. Auto-executing
 * model output is the one thing this whole design refuses to do.
 */
export function CommandBlockFix({ className }: { className?: string }) {
  const { fix, onUseFix } = useBlock();
  if (!fix) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border-t border-border/40 bg-amber-950/20 px-4 py-2.5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <WrenchIcon className="mt-0.5 size-3 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[11px] leading-relaxed text-amber-200/80">
            {fix.diagnosis}
          </p>

          {fix.command && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-amber-700/40 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
                {fix.command}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-6 shrink-0 gap-1 border-amber-700/40 px-2 text-[10px] font-sans text-amber-300 hover:bg-amber-950/40"
                onClick={() => onUseFix?.(fix.command)}
                title="Put this in the input bar for review"
              >
                <PlayIcon className="size-3" />
                Use
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
*Now the imports for the new icons and FixSuggestion:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +14 -13 lines | tsx
  Loader2Icon,
  LightbulbIcon,
  PlayIcon,
  RotateCwIcon,
  TerminalSquareIcon,
  WrenchIcon,
  XCircleIcon,
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +3 -2 lines | tsx
import { cn } from '@/lib/utils';
import type { FixSuggestion } from '@/hooks/use-terminal-session';
import type { TerminalBlock } from '@/main/ipc/channels';
*Now wire it all into Terminal.tsx:
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +12 -11 lines | tsx
  CommandBlockApproval,
  CommandBlockOutput,
  CommandBlockExplanation,
  CommandBlockFix,
  CommandBlockFooter,
  CommandBlockSkipped,
  AgentSummary,
*read_files(.../src/renderer/pages/Terminal.tsx, start_line=120, end_line=240)
⎿ 121 lines | tsx
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +23 -11 lines | tsx
    summary,
    error,
    isExplainingId,
    fixes,
    isFixingId,
    runGoal,
    runCommand,
    rerun,
    approve,
    reject,
    explain,
    fix,
  } = useTerminalSession(sessionId);

  // When a fix is accepted, it goes into the composer rather than straight to
  // the shell — the user still presses Enter. See CommandBlockFix.
  const [draftCommand, setDraftCommand] = useState<string | undefined>();
  const handleUseFix = useCallback((command: string) => {
    setDraftCommand(command);
  }, []);
▶ Thinking: ...e.  Let me implement with a `useEffect` syncing `prefill` → internal `text`.  Let me do it.
*Now the composer needs to accept a prefill and support direct commands. Let me update TerminalGoalInput:
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +33 -22 lines | tsx
  isRunning?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Text pushed in from outside (e.g. "Use" on a proposed fix). Changing this
   * replaces the composer contents; the user still presses Enter to run it.
   */
  prefill?: string;
}

export function TerminalGoalInput({
  isRunning = false,
  disabled = false,
  className,
  prefill,
}: TerminalGoalInputProps) {
  const [text, setText] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Adopt an external prefill whenever it changes identity.
  useEffect(() => {
    if (prefill !== undefined) setText(prefill);
  }, [prefill]);

  const handleSubmit = (message: PromptInputMessage) => {
    const goal = message.text.trim();
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +1 -1 lines | tsx
import { useState } from 'react';
import { useEffect, useState } from 'react';
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +29 -13 lines | tsx
        {/* Terminal-flavored prefix */}
        {/* Terminal-flavored prefix — switches to a run affordance for
            direct commands, so the composer says what Enter will do. */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <TerminalIcon className="size-3.5 shrink-0 text-emerald-400" />
          <span className="text-xs text-muted-foreground/75">goal</span>
          <TerminalIcon
            className={cn(
              'size-3.5 shrink-0',
              isCommand ? 'text-sky-400' : 'text-emerald-400',
            )}
          />
          <span className="text-xs text-muted-foreground/75">
            {isCommand ? 'command' : 'goal'}
          </span>
          <span className="text-muted-foreground/45">›</span>
          {isCommand && (
            <Badge
              variant="outline"
              className="h-4 border-sky-700/40 bg-sky-900/60 px-1.5 text-[9px] font-mono uppercase tracking-wide text-sky-300"
            >
              runs directly
            </Badge>
          )}
        </div>
        <PromptInputTextarea
          placeholder="Describe what you want to accomplish… (e.g. &quot;what is this folder?&quot;)"
          placeholder="Describe a goal, or start with ! to run a command… (e.g. &quot;what is this folder?&quot;)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={(disabled || isRunning)}
*read_files(.../src/components/terminal/TerminalGoalInput.tsx, start_line=92, end_line=115)
⎿ 24 lines | tsx
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +29 -13 lines | tsx
        {/* Terminal-flavored prefix */}
        {/* Terminal-flavored prefix — switches to a command affordance when the
            text will run directly, so Enter's behaviour is never ambiguous. */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <TerminalIcon className="size-3.5 shrink-0 text-emerald-400" />
          <span className="text-xs text-muted-foreground/75">goal</span>
          <TerminalIcon
            className={cn(
              'size-3.5 shrink-0',
              isCommand ? 'text-sky-400' : 'text-emerald-400',
            )}
          />
          <span className="text-xs text-muted-foreground/75">
            {isCommand ? 'command' : 'goal'}
          </span>
          <span className="text-muted-foreground/45">›</span>
          {isCommand && (
            <Badge
              variant="outline"
              className="h-4 border-sky-700/40 bg-sky-900/60 px-1.5 font-mono text-[9px] uppercase tracking-wide text-sky-300"
            >
              runs directly
            </Badge>
          )}
        </div>
        <PromptInputTextarea
          placeholder="Describe what you want to accomplish… (e.g. &quot;what is this folder?&quot;)"
          placeholder="Describe a goal, or start with ! to run a command…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={(disabled || isRunning)}
▶ Thinking: ...display needs `isCommand`. Let me compute it locally.  Let me add the import and the const.
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +8 -4 lines | tsx
  useEffect(() => {
    if (prefill !== undefined) setText(prefill);
  }, [prefill]);

  // A leading ! or $ means "run this directly", mirroring Warp's convention of
  // letting the shell handle what you type instead of routing it to the agent.
  const isCommand = /^[!$]\s?/.test(text.trim());
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +3 -2 lines | tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TerminalIcon, ZapIcon } from 'lucide-react';
*Now the page: route direct commands vs goals, and pass the new block props:
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +39 -27 lines | tsx
  const handleGoalSubmit = useCallback(
    async (goal: string) => {
    async (input: string) => {
      // A leading ! or $ runs the text as a shell command instead of handing it
      // to the agent. The prefix is stripped before execution.
      const direct = /^[!$]\s?/.exec(input);
      const command = direct ? input.slice(direct[0].length).trim() : '';
      const isDirect = direct !== null && command.length > 0;

      if (sessionId) {
        runGoal(goal);
        if (isDirect) runCommand(command);
        else runGoal(input);
        return;
      }

      try {
        const session = await window.electron.ipc.invoke<{ id: string }>(
          'terminal:session-create',
          { title: goal.length > 50 ? `${goal.slice(0, 47)}…` : goal },
          { title: input.length > 50 ? `${input.slice(0, 47)}…` : input },
        );
        navigate(`/terminal/${session.id}`, { replace: true });
        pendingGoalRef.current = goal;
        // Replay through this same handler once the session id exists.
        pendingGoalRef.current = input;
      } catch {
        toast.error('Could not create terminal session');
      }
    },
    [sessionId, navigate, runGoal],
    [sessionId, navigate, runGoal, runCommand],
  );

  useEffect(() => {
    if (sessionId && pendingGoalRef.current) {
      const goal = pendingGoalRef.current;
      const queued = pendingGoalRef.current;
      pendingGoalRef.current = null;
      runGoal(goal);
      const direct = /^[!$]\s?/.exec(queued);
      const command = direct ? queued.slice(direct[0].length).trim() : '';
      if (direct && command) runCommand(command);
      else runGoal(queued);
    }
  }, [sessionId, runGoal]);
  }, [sessionId, runGoal, runCommand]);
*Now pass the new props to each CommandBlock and the composer:
*read_files(.../src/renderer/pages/Terminal.tsx, start_line=262, end_line=305)
⎿ 44 lines | tsx
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +28 -22 lines | tsx
                        onReject={() => reject(block.id)}
                        onExplain={() => explain(block.id)}
                        isExplaining={isExplainingId === block.id}
                        onRerun={() => rerun(block.id)}
                        onFix={() => fix(block.id)}
                        fix={fixes[block.id]}
                        isFixing={isFixingId === block.id}
                        onUseFix={handleUseFix}
                      >
                        {block.status === 'skipped' ? (
                          <>
                            <CommandBlockThought />
                            <CommandBlockApproval />
                            <CommandBlockOutput />
                            <CommandBlockFix />
                            <CommandBlockExplanation />
                            <CommandBlockFooter />
                          </>
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +6 -5 lines | tsx
                onSubmit={handleGoalSubmit}
                isRunning={isRunning}
                disabled={isRunning}
                prefill={draftCommand}
              />
*run_commands(cd /data/projects/docugent/docugent-desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "npm notice" | head -20; echo "exit=${PIPESTATUS[0]}")
⎿ src/components/terminal/TerminalGoalInput.tsx(27,10): error TS2300: Duplicate identifier 'Badge'.   ... 2 more lines
*read_files(.../src/components/terminal/TerminalGoalInput.tsx, start_line=20, end_line=31)
⎿ 12 lines | tsx
*Badge was already imported. Removing the duplicate:
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +3 -4 lines | tsx
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
*run_commands(cd /data/projects/docugent/docugent-desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "npm notice" | head -20; echo "exit=${PIPESTATUS[0]}" && cd /data/projects/docugent/docugent-desktop && npx jest --silent 2>&1 | tail -8)
⎿ exit=0   ... 9 more lines
▶ Thinking: ... composer parsing, and export `formatDuration` from CommandBlock.  Let me write the helper.
*Typecheck and tests pass. But I've now duplicated the !/$ parsing logic in two places — let me extract it so it's single-sourced and testable:
*editor(.../docugent-desktop/src/lib/terminal-input.ts)
⎿ +64 lines (new) | typescript
/**
 * lib/terminal-input.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parsing for the terminal composer.
 *
 * The composer accepts two kinds of input and has to decide which is which
 * before anything runs:
 *
 *   "find all files over 10MB"   → a goal for the agent to plan
 *   "!find . -size +10M"         → a command to run directly
 *
 * Both the page (to dispatch) and the input component (to label the composer)
 * need this answer, so it lives here rather than being re-implemented at each
 * call site — duplicated prefix logic is exactly how the two drift apart.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ComposerIntent =
  | { kind: 'goal'; text: string }
  | { kind: 'command'; command: string };

/** Prefixes that switch the composer from "ask the agent" to "run this now". */
const DIRECT_PREFIX = /^[!$]\s?/;

/**
 * Classify composer text.
 *
 * A bare prefix (`!`, `$`, or `! `) carries no command, so it degrades to a
 * goal rather than dispatching an empty command to the shell.
 */
export function parseComposerInput(input: string): ComposerIntent {
  const trimmed = input.trim();
  const match = DIRECT_PREFIX.exec(trimmed);

  if (match) {
    const command = trimmed.slice(match[0].length).trim();
    if (command.length > 0) return { kind: 'command', command };
  }

  return { kind: 'goal', text: trimmed };
}

/** True when the composer will run the text directly rather than plan it. */
export function isDirectCommandInput(input: string): boolean {
  return parseComposerInput(input).kind === 'command';
}

/**
 * Compact human duration for a command block: "412ms", "2.4s", "1m 12s".
 * Sub-minute values keep one decimal because the difference between 1.2s and
 * 1.9s is meaningful when you are comparing runs.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

*Now refactor both call sites to use it:
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +34 -39 lines | tsx
  const handleGoalSubmit = useCallback(
    async (input: string) => {
      // A leading ! or $ runs the text as a shell command instead of handing it
      // to the agent. The prefix is stripped before execution.
      const direct = /^[!$]\s?/.exec(input);
      const command = direct ? input.slice(direct[0].length).trim() : '';
      const isDirect = direct !== null && command.length > 0;
      const intent = parseComposerInput(input);

      if (sessionId) {
        if (isDirect) runCommand(command);
        else runGoal(input);
        if (intent.kind === 'command') runCommand(intent.command);
        else runGoal(intent.text);
        return;
      }

    if (sessionId && pendingGoalRef.current) {
      const queued = pendingGoalRef.current;
      pendingGoalRef.current = null;
      const direct = /^[!$]\s?/.exec(queued);
      const command = direct ? queued.slice(direct[0].length).trim() : '';
      if (direct && command) runCommand(command);
      else runGoal(queued);
      const intent = parseComposerInput(queued);
      if (intent.kind === 'command') runCommand(intent.command);
      else runGoal(intent.text);
    }
  }, [sessionId, runGoal, runCommand]);
*editor(.../src/renderer/pages/Terminal.tsx)
⎿ +3 -2 lines | tsx
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { parseComposerInput } from '@/lib/terminal-input';
import { cn } from '@/lib/utils';
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +3 -3 lines | tsx
  // A leading ! or $ means "run this directly", mirroring Warp's convention of
  // letting the shell handle what you type instead of routing it to the agent.
  const isCommand = /^[!$]\s?/.test(text.trim());
  const isCommand = isDirectCommandInput(text);
*editor(.../src/components/terminal/TerminalGoalInput.tsx)
⎿ +4 -3 lines | tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isDirectCommandInput } from '@/lib/terminal-input';
import { TerminalIcon, ZapIcon } from 'lucide-react';
*Now use the shared formatDuration in CommandBlock instead of the local copy:
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +4 -14 lines | tsx
/** Output longer than this is folded by default. */
const FOLD_THRESHOLD = 15;

/** Compact, human duration — "412ms", "2.4s", "1m 12s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${mins}m ${rem}s`;
}

export function CommandBlockFooter({ className }: { className?: string }) {
*editor(.../src/components/terminal/CommandBlock.tsx)
⎿ +3 -2 lines | tsx
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/terminal-input';
import type { FixSuggestion } from '@/hooks/use-terminal-session';
*Now the tests for the new logic:
*editor(.../src/__tests__/terminal-input.test.ts)
⎿ +140 lines (new) | typescript
/**
 * Tests for the terminal composer parser and duration formatter.
 *
 * The prefix rule decides whether text is planned by the agent or executed
 * directly against the shell, so getting it wrong is a safety-relevant bug:
 * a misclassified goal runs as a command, and a misclassified command silently
 * becomes something the model rewrites.
 */
import {
  parseComposerInput,
  isDirectCommandInput,
  formatDuration,
} from '../lib/terminal-input';

describe('parseComposerInput', () => {
  describe('goals (agent-planned)', () => {
    it.each([
      'what is this folder?',
      'find all files larger than 10MB',
      '   leading whitespace is fine   ',
      'show me disk usage',
    ])('treats %j as a goal', (input) => {
      expect(parseComposerInput(input)).toEqual({
        kind: 'goal',
        text: input.trim(),
      });
    });
  });

  describe('direct commands', () => {
    it('accepts the ! prefix', () => {
      expect(parseComposerInput('!git status')).toEqual({
        kind: 'command',
        command: 'git status',
      });
    });

    it('accepts the $ prefix', () => {
      expect(parseComposerInput('$ls -la')).toEqual({
        kind: 'command',
        command: 'ls -la',
      });
    });

    it('accepts a prefix followed by a space', () => {
      expect(parseComposerInput('! pnpm test')).toEqual({
        kind: 'command',
        command: 'pnpm test',
      });
    });

    it('strips the prefix rather than passing it to the shell', () => {
      const result = parseComposerInput('!echo hello');
      expect(result.kind).toBe('command');
      // The leading "!" must not survive into the executed command.
      expect(result.kind === 'command' && result.command).toBe('echo hello');
      expect(result.kind === 'command' && result.command).not.toContain('!');
    });

    it('keeps interior and trailing shell metacharacters intact', () => {
      const cmd = 'grep -rn "TODO" . | head -20 && echo done';
      expect(parseComposerInput(`!${cmd}`)).toEqual({
        kind: 'command',
        command: cmd,
      });
    });

    it('handles a prefix with extra whitespace', () => {
      expect(parseComposerInput('  !   ls -la  ')).toEqual({
        kind: 'command',
        command: 'ls -la',
      });
    });
  });

  describe('degenerate prefixes', () => {
    // A bare prefix carries no command. Dispatching an empty string to the
    // shell would create a meaningless block, so it must fall back to a goal.
    it.each(['!', '$', '! ', '$   ', '  !  '])(
      'treats bare prefix %j as a goal, not an empty command',
      (input) => {
        const result = parseComposerInput(input);
        expect(result.kind).toBe('goal');
        expect(result.kind === 'goal' && result.text).toBe(input.trim());
      },
    );
  });

  describe('prefix must be leading', () => {
    // "!" is valid shell syntax (history expansion / negation), so only a
    // *leading* marker may switch modes.
    it('does not treat an interior ! as a command marker', () => {
      expect(parseComposerInput('echo hi!')).toEqual({
        kind: 'goal',
        text: 'echo hi!',
      });
    });

    it('does not treat a trailing ! as a command marker', () => {
      expect(parseComposerInput('fix this please!')).toEqual({
        kind: 'goal',
        text: 'fix this please!',
      });
    });
  });

  it('agrees with isDirectCommandInput', () => {
    expect(isDirectCommandInput('!ls')).toBe(true);
    expect(isDirectCommandInput('$ls')).toBe(true);
    expect(isDirectCommandInput('ls')).toBe(false);
    expect(isDirectCommandInput('!')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('renders sub-second durations in ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(412)).toBe('412ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('keeps one decimal for sub-minute durations', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(2400)).toBe('2.4s');
    expect(formatDuration(59_400)).toBe('59.4s');
  });

  it('rolls over to minutes plus seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(72_000)).toBe('1m 12s');
    expect(formatDuration(3_600_000)).toBe('60m 0s');
  });

  it('never renders a misleading negative or non-finite value', () => {
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

*run_commands(cd /data/projects/docugent/docugent-desktop && npx jest terminal-input 2>&1 | tail -30)
⎿       ✓ treats "find all files larger than 10MB" as a goal   ... 29 more lines
▶ Thinking: ...etter-sqlite3`, `useTestDatabase`, `applyMigrations`.  Let me look at that pattern briefly.
*22 tests pass. Now a DB test for the new duration_ms migration — that's the risky part (ALTER on existing databases):
*read_files(.../src/__tests__/workspace-store.test.ts, start_line=1, end_line=60)
⎿ 60 lines | typescript
*editor(.../src/__tests__/terminal-blocks.test.ts)
⎿ +233 lines (new) | typescript
/**
 * __tests__/terminal-blocks.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminal block persistence: CRUD, the `duration_ms` column, and the upgrade
 * path for databases created before that column existed.
 *
 * The upgrade path is the interesting one. `CREATE TABLE IF NOT EXISTS` is a
 * no-op against an existing table, so a database created by an older build
 * would silently lack `duration_ms` and every insert naming it would throw.
 * `applyMigrations` therefore ALTERs it in — and this suite proves that against
 * a table built from the *old* DDL rather than the current one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  createTerminalSession,
  getTerminalSession,
  listTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
  appendBlock,
  getBlock,
  getSessionBlocks,
  updateBlock,
} from '../main/db/terminal';

/** The pre-`duration_ms` shape of terminal_blocks. */
const LEGACY_BLOCKS_DDL = `
CREATE TABLE IF NOT EXISTS terminal_blocks (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  command       TEXT NOT NULL DEFAULT '',
  output        TEXT NOT NULL DEFAULT '',
  exit_code     INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','running','done','error','skipped')),
  agent_thought TEXT NOT NULL DEFAULT '',
  explanation   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

function columnsOf(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => (c as { name: string }).name);
}

describe('terminal block store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => db.close());

  describe('session CRUD', () => {
    it('creates, reads and lists sessions', () => {
      const created = createTerminalSession({ title: 'Deploy check' });
      expect(created.id).toBeTruthy();
      expect(created.title).toBe('Deploy check');
      expect(created.status).toBe('idle');

      expect(getTerminalSession(created.id)?.title).toBe('Deploy check');
      expect(listTerminalSessions().map((s) => s.id)).toContain(created.id);
    });

    it('returns null for an unknown session', () => {
      expect(getTerminalSession('nope')).toBeNull();
    });

    it('patches only the fields provided', () => {
      const s = createTerminalSession({ title: 'Before', goal: 'keep me' });
      updateTerminalSession(s.id, { title: 'After' });

      const after = getTerminalSession(s.id);
      expect(after?.title).toBe('After');
      expect(after?.goal).toBe('keep me');
      expect(after?.status).toBe('idle');
    });
  });

  describe('block CRUD', () => {
    it('appends blocks with increasing positions', () => {
      const s = createTerminalSession({ title: 'S' });
      const a = appendBlock({ sessionId: s.id, command: 'ls' });
      const b = appendBlock({ sessionId: s.id, command: 'pwd' });

      expect(a.position).toBe(0);
      expect(b.position).toBe(1);
      expect(a.status).toBe('pending');
      expect(getSessionBlocks(s.id).map((x) => x.command)).toEqual(['ls', 'pwd']);
    });

    it('getBlock returns one block or null', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'whoami' });

      expect(getBlock(block.id)?.command).toBe('whoami');
      expect(getBlock('missing')).toBeNull();
    });

    it('persists duration_ms on update', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'sleep 1' });

      updateBlock(block.id, {
        status: 'done',
        output: 'ok',
        exit_code: 0,
        duration_ms: 1234,
      });

      const stored = getBlock(block.id);
      expect(stored?.duration_ms).toBe(1234);
      expect(stored?.status).toBe('done');
      expect(stored?.exit_code).toBe(0);
    });

    it('leaves duration_ms untouched when not patched', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'x' });
      updateBlock(block.id, { duration_ms: 500 });
      updateBlock(block.id, { output: 'later' });

      expect(getBlock(block.id)?.duration_ms).toBe(500);
    });

    it('cascade-deletes blocks with their session', () => {
      const s = createTerminalSession({ title: 'S' });
      appendBlock({ sessionId: s.id, command: 'ls' });

      deleteTerminalSession(s.id);
      expect(getSessionBlocks(s.id)).toEqual([]);
    });
  });

  describe('duration_ms upgrade on a legacy database', () => {
    let legacy: Database.Database;

    beforeEach(() => {
      legacy = new Database(':memory:');
      legacy.pragma('foreign_keys = ON');
      // Minimal prerequisites, then the OLD blocks table with no duration_ms.
      legacy.exec(`
        CREATE TABLE IF NOT EXISTS terminal_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT 'New Session',
          goal TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'idle',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      legacy.exec(LEGACY_BLOCKS_DDL);
    });

    afterEach(() => legacy.close());

    it('starts without the column — the premise of this test', () => {
      expect(columnsOf(legacy, 'terminal_blocks')).not.toContain('duration_ms');
    });

    it('adds duration_ms when migrations run', () => {
      applyMigrations(legacy);
      expect(columnsOf(legacy, 'terminal_blocks')).toContain('duration_ms');
    });

    it('is idempotent across repeated runs', () => {
      applyMigrations(legacy);
      applyMigrations(legacy);
      applyMigrations(legacy);

      const cols = columnsOf(legacy, 'terminal_blocks');
      // A non-guarded ALTER would either throw or duplicate the column.
      expect(cols.filter((c) => c === 'duration_ms')).toHaveLength(1);
    });

    it('preserves existing rows and backfills duration_ms as null', () => {
      legacy
        .prepare(
          `INSERT INTO terminal_sessions (id, title) VALUES ('s1', 'Legacy')
           ;`,
        )
        .run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, output, status)
           VALUES ('b1', 's1', 0, 'echo hi', 'hi', 'done')`,
        )
        .run();

      applyMigrations(legacy);

      const row = legacy
        .prepare('SELECT id, command, output, duration_ms FROM terminal_blocks WHERE id = ?')
        .get('b1') as { id: string; command: string; output: string; duration_ms: number | null };

      expect(row.command).toBe('echo hi');
      expect(row.output).toBe('hi');
      expect(row.duration_ms).toBeNull();
    });

    it('accepts a duration write after the upgrade', () => {
      applyMigrations(legacy);
      legacy
        .prepare(`INSERT INTO terminal_sessions (id, title) VALUES ('s2', 'S')`)
        .run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, status, duration_ms)
           VALUES ('b2', 's2', 0, 'ls', 'done', 42)`,
        )
        .run();

      const row = legacy
        .prepare('SELECT duration_ms FROM terminal_blocks WHERE id = ?')
        .get('b2') as { duration_ms: number };
      expect(row.duration_ms).toBe(42);
    });
  });
});

*editor(.../src/__tests__/terminal-blocks.test.ts)
⎿ +148 lines (new) | typescript
/**
 * __tests__/terminal-blocks.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminal block persistence: CRUD, the `duration_ms` column, and the upgrade
 * path for databases created before that column existed.
 *
 * The upgrade path is the interesting one. `CREATE TABLE IF NOT EXISTS` is a
 * no-op against an existing table, so a database created by an older build
 * would silently lack `duration_ms` and every insert naming it would throw.
 * `applyMigrations` therefore ALTERs it in — and this suite proves that against
 * a table built from the *old* DDL rather than the current one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  createTerminalSession,
  getTerminalSession,
  listTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
  appendBlock,
  getBlock,
  getSessionBlocks,
  updateBlock,
} from '../main/db/terminal';

/** The pre-`duration_ms` shape of terminal_blocks. */
const LEGACY_BLOCKS_DDL = `
CREATE TABLE IF NOT EXISTS terminal_blocks (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  command       TEXT NOT NULL DEFAULT '',
  output        TEXT NOT NULL DEFAULT '',
  exit_code     INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','running','done','error','skipped')),
  agent_thought TEXT NOT NULL DEFAULT '',
  explanation   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

function columnsOf(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => (c as { name: string }).name);
}

describe('terminal block store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => db.close());

  describe('session CRUD', () => {
    it('creates, reads and lists sessions', () => {
      const created = createTerminalSession({ title: 'Deploy check' });
      expect(created.id).toBeTruthy();
      expect(created.title).toBe('Deploy check');
      expect(created.status).toBe('idle');

      expect(getTerminalSession(created.id)?.title).toBe('Deploy check');
      expect(listTerminalSessions().map((s) => s.id)).toContain(created.id);
    });

    it('returns null for an unknown session', () => {
      expect(getTerminalSession('nope')).toBeNull();
    });

    it('patches only the fields provided', () => {
      const s = createTerminalSession({ title: 'Before', goal: 'keep me' });
      updateTerminalSession(s.id, { title: 'After' });

      const after = getTerminalSession(s.id);
      expect(after?.title).toBe('After');
      expect(after?.goal).toBe('keep me');
      expect(after?.status).toBe('idle');
    });
  });

  describe('block CRUD', () => {
    it('appends blocks with increasing positions', () => {
      const s = createTerminalSession({ title: 'S' });
      const a = appendBlock({ sessionId: s.id, command: 'ls' });
      const b = appendBlock({ sessionId: s.id, command: 'pwd' });

      expect(a.position).toBe(0);
      expect(b.position).toBe(1);
      expect(a.status).toBe('pending');
      expect(getSessionBlocks(s.id).map((x) => x.command)).toEqual(['ls', 'pwd']);
    });

    it('getBlock returns one block or null', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'whoami' });

      expect(getBlock(block.id)?.command).toBe('whoami');
      expect(getBlock('missing')).toBeNull();
    });

    it('persists duration_ms on update', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'sleep 1' });

      updateBlock(block.id, {
        status: 'done',
        output: 'ok',
        exit_code: 0,
        duration_ms: 1234,
      });

      const stored = getBlock(block.id);
      expect(stored?.duration_ms).toBe(1234);
      expect(stored?.status).toBe('done');
      expect(stored?.exit_code).toBe(0);
    });

    it('leaves duration_ms untouched when not patched', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'x' });
      updateBlock(block.id, { duration_ms: 500 });
      updateBlock(block.id, { output: 'later' });

      expect(getBlock(block.id)?.duration_ms).toBe(500);
    });

    it('cascade-deletes blocks with their session', () => {
      const s = createTerminalSession({ title: 'S' });
      appendBlock({ sessionId: s.id, command: 'ls' });

      deleteTerminalSession(s.id);
      expect(getSessionBlocks(s.id)).toEqual([]);
    });
  });
});

*editor(.../src/__tests__/terminal-blocks.test.ts)
⎿ +87 -9 lines | typescript

      deleteTerminalSession(s.id);
      expect(getSessionBlocks(s.id)).toEqual([]);
    });
  });

  describe('duration_ms upgrade on a legacy database', () => {
    let legacy: Database.Database;

    beforeEach(() => {
      legacy = new Database(':memory:');
      legacy.pragma('foreign_keys = ON');
      // Minimal prerequisite, then the OLD blocks table with no duration_ms.
      legacy.exec(`
        CREATE TABLE IF NOT EXISTS terminal_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT 'New Session',
          goal TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'idle',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      legacy.exec(LEGACY_BLOCKS_DDL);
    });

    afterEach(() => legacy.close());

    it('starts without the column — the premise of this test', () => {
      expect(columnsOf(legacy, 'terminal_blocks')).not.toContain('duration_ms');
    });

    it('adds duration_ms when migrations run', () => {
      applyMigrations(legacy);
      expect(columnsOf(legacy, 'terminal_blocks')).toContain('duration_ms');
    });

    it('is idempotent across repeated runs', () => {
      applyMigrations(legacy);
      applyMigrations(legacy);
      applyMigrations(legacy);

      const cols = columnsOf(legacy, 'terminal_blocks');
      // A non-guarded ALTER would either throw or duplicate the column.
      expect(cols.filter((c) => c === 'duration_ms')).toHaveLength(1);
    });

    it('preserves existing rows and backfills duration_ms as null', () => {
      legacy.prepare(`INSERT INTO terminal_sessions (id, title) VALUES ('s1', 'Legacy')`).run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, output, status)
           VALUES ('b1', 's1', 0, 'echo hi', 'hi', 'done')`,
        )
        .run();

      applyMigrations(legacy);

      const row = legacy
        .prepare('SELECT command, output, duration_ms FROM terminal_blocks WHERE id = ?')
        .get('b1') as { command: string; output: string; duration_ms: number | null };

      expect(row.command).toBe('echo hi');
      expect(row.output).toBe('hi');
      expect(row.duration_ms).toBeNull();
    });

    it('accepts a duration write after the upgrade', () => {
      applyMigrations(legacy);
      legacy.prepare(`INSERT INTO terminal_sessions (id, title) VALUES ('s2', 'S')`).run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, status, duration_ms)
           VALUES ('b2', 's2', 0, 'ls', 'done', 42)`,
        )
        .run();

      const row = legacy
        .prepare('SELECT duration_ms FROM terminal_blocks WHERE id = ?')
        .get('b2') as { duration_ms: number };
      expect(row.duration_ms).toBe(42);
    });
  });
});