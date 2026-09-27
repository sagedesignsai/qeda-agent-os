/**
 * ipc/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The IPC composition root: the single place that knows every handler module
 * exists. `main.ts` calls `registerIpcHandlers` and nothing else.
 *
 * WHY THIS SHAPE
 * ──────────────
 * The channel contract itself stays whole in `ipc/channels.ts`. A contract
 * should be one readable file — and 36 renderer files already import it for
 * domain types, not just channel names, so splitting it would buy indirection
 * and cost churn everywhere. What gets split is the *implementation*, which is
 * what actually grew unwieldy.
 *
 * Each module owns one user-facing concern and exposes a single
 * `register<Domain>Handlers` function. A module that needs to broadcast to the
 * window takes it as a parameter; one that does not, takes nothing. That keeps
 * the dependency visible in the signature instead of hiding it in a module-level
 * global.
 *
 * The old file was one 1,300-line `registerIpcHandlers` with 18
 * comment-delimited sections. Those sections were split by *technical* axis, so
 * one feature was scattered across several (four "Focus system" sections, two
 * copilot sections). The modules below are grouped by *feature* instead — 18
 * sections became 10 modules.
 *
 * | Module          | Channels | Concern                                    |
 * | --------------- | -------- | ------------------------------------------ |
 * | sessions.ts     | 7        | Chat sessions and message persistence      |
 * | settings.ts     | 5 + 1 ev | Provider/model, fallback, encrypted keys   |
 * | tools.ts        | 2        | Tool listing + approval-gated execution    |
 * | workspace.ts    | 14       | Notebooks, pages, block editor             |
 * | research.ts     | 2        | Deep-research traces                       |
 * | agent-chat.ts   | 1 + 4 ev | The streaming chat turn                    |
 * | terminal.ts     | 17 + 7 ev| Agentic terminal: goals, blocks, approvals |
 * | projects.ts     | 7 + 1 ev | The productivity spine                     |
 * | tasks.ts        | 18       | Focus manager: tasks, steps, blocks, stats |
 * | copilot.ts      | 4 + 5 ev | Focus copilot, both of its forms           |
 *
 * The PTY handlers are NOT here: they live in `pty/manager.ts` next to the
 * `PtyManager` class they expose, and `main.ts` registers them separately. That
 * split predates this refactor and was left alone deliberately — folding them in
 * would mix a stateful process manager into a bag of request handlers.
 *
 * KNOWN GAP: `ipcMain.handle` is not typed against `IpcChannels`, so a
 * misspelled channel name still compiles and silently never fires. Wiring the
 * handlers through a typed `handle<C extends ChannelName>()` helper is the
 * intended follow-up; it is deliberately not bundled with this move so that any
 * type errors it surfaces can be triaged on their own.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BrowserWindow } from 'electron';

import { registerSessionsHandlers } from './handlers/sessions';
import { registerSettingsHandlers } from './handlers/settings';
import { registerToolsHandlers } from './handlers/tools';
import { registerWorkspaceHandlers } from './handlers/workspace';
import { registerResearchHandlers } from './handlers/research';
import { registerAgentChatHandlers } from './handlers/agent-chat';
import { registerTerminalHandlers } from './handlers/terminal';
import { registerProjectsHandlers } from './handlers/projects';
import { registerTasksHandlers } from './handlers/tasks';
import { registerCopilotHandlers } from './handlers/copilot';
import { registerGamificationHandlers } from './handlers/gamification';
import { registerNotificationsHandlers } from './handlers/notifications';

/**
 * Register every request/response handler.
 *
 * Order is irrelevant to correctness — Electron dispatches by channel name, not
 * by registration order — but it is kept in the same sequence the handlers
 * appeared in the original file so a future bisect reads sensibly.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerSessionsHandlers();
  registerSettingsHandlers({ mainWindow });
  registerToolsHandlers({ mainWindow });
  registerWorkspaceHandlers();
  registerResearchHandlers();
  registerAgentChatHandlers({ mainWindow });
  registerTerminalHandlers({ mainWindow });
  registerProjectsHandlers({ mainWindow });
  registerTasksHandlers();
  registerCopilotHandlers({ mainWindow });
  registerGamificationHandlers({ mainWindow });
  registerNotificationsHandlers();
}
