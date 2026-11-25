import { CanvasError } from "@github/copilot-sdk/extension";

export const implementations = [
  {
    id: "app-and-surfaces",
    area: "App entry points and surfaces",
    summary:
      "Connects the /builder route and sidebar to the workspace welcome state, supervised chat, preview/code/changes canvas, codebase picker, and session switcher.",
    flow:
      "A chosen project is only a suggested starting folder; the user confirms the workspace, then the page composes the active session and its read-only/review surfaces.",
    files: [
      ["src/renderer/routes.tsx", "Registers the Builder route."],
      ["src/components/AppSidebar.tsx", "Adds the Builder navigation entry."],
      ["src/renderer/pages/Builder.tsx", "Composition root for project scope, session, model, codebase, preview, and review hooks."],
      ["src/components/builder/BuilderWelcome.tsx", "Empty state, starter prompts, recent sessions, and workspace entry points."],
      ["src/components/builder/BuilderChatPanel.tsx", "Prompt composer, model and sandbox controls, activity feed, and supervised replies."],
      ["src/components/builder/BuilderCanvas.tsx", "Preview, Code, and Changes surfaces with workspace/runtime identity."],
      ["src/components/builder/BuilderActivityFeed.tsx", "Builds a readable conversation timeline from normalized session events."],
      ["src/components/builder/BuilderSessionSwitcher.tsx", "Lists and focuses concurrently active Builder sessions."],
      ["src/components/builder/BuilderCodebasePicker.tsx", "Links, creates, or clones project codebases and exposes indexing."],
      ["src/components/builder/BuilderCodeWorkspace.tsx", "Searchable git file tree and on-demand read-only file viewer."],
      ["src/components/builder/BuilderChangesWorkspace.tsx", "Filters changes and presents unified diffs plus Keep/Discard controls."],
      ["src/components/builder/tools/BuilderToolCall.tsx", "Expandable display for pending, streaming, and failed tool calls."],
      ["src/components/builder/tools/BuilderFormCard.tsx", "Renders OpenCode forms and submits answers or cancellation."],
      ["src/components/builder/tools/BuilderPermissionCard.tsx", "Presents explicit once/always/reject permission decisions."],
      ["src/components/builder/tools/index.ts", "Exports Builder tool-card components."],
    ],
  },
  {
    id: "renderer-state-and-ipc",
    area: "Renderer state and typed IPC",
    summary:
      "Renderer hooks request state and operations from main; the channel contract carries requests, results, and normalized events without exposing engine clients to UI code.",
    flow:
      "The session hook attaches to buffered events, while focused hooks refresh files, diffs, models, preview state, and codebase records as their owning session changes.",
    files: [
      ["src/hooks/use-builder-session.ts", "Workspace selection, session lifecycle, event re-attach, prompt, abort, and approvals."],
      ["src/hooks/use-builder-runtime.ts", "Connection preflight and refresh state."],
      ["src/hooks/use-builder-workspace.ts", "Local UI preferences for surface, viewport, preview command, and sandbox choice."],
      ["src/hooks/use-builder-files.ts", "Loads and refreshes the active workspace's git file tree."],
      ["src/hooks/use-builder-changes.ts", "Loads diffs and orchestrates Keep/Discard refreshes."],
      ["src/hooks/use-builder-preview.ts", "Subscribes to main-owned preview state and exposes start/stop/open."],
      ["src/hooks/use-builder-models.ts", "Loads available models and selects the model for subsequent turns."],
      ["src/hooks/use-builder-session-history.ts", "Loads session history/worktrees and restores, focuses, deletes, or cleans up."],
      ["src/hooks/use-builder-code-projects.ts", "Loads and mutates Project-linked codebase records and index state."],
      ["src/hooks/use-builder-sandbox-patch-failure.ts", "Surfaces when a completed sandbox patch could not be applied locally."],
      ["src/main/ipc/channels.ts", "Typed Builder IPC request/event contracts, shared renderer-safe domain types."],
      ["src/main/ipc/index.ts", "Registers Builder IPC handlers with the other feature handler modules."],
      ["src/main/ipc/handlers/builder.ts", "Main-process orchestration for Builder operations and events."],
    ],
  },
  {
    id: "session-engines",
    area: "Coding engines and turn lifecycle",
    summary:
      "Creates sessions on the Local ToolLoopAgent, the OpenCode v2 service, or the OpenCode-backed E2B sandbox, then normalizes output into a common Builder event stream.",
    flow:
      "Session creation validates a git workspace; the chosen engine runs a prompt, streams status/text/tool/approval events, and supports abort, detach, restore, and discard.",
    files: [
      ["src/main/builder/local-engine.ts", "Native ToolLoopAgent session, model resolution, workspace tools, MCP tools, plan limits, messages, and local approvals."],
      ["src/main/builder/client.ts", "Discovers a local OpenCode service or connects to a supplied remote URL; checks OpenCode 2.x."],
      ["src/main/builder/session-manager.ts", "Owns per-session engine state, bounded event buffer, preview, plan manager, and context persistence."],
      ["src/main/builder/session-events.ts", "Translates OpenCode events into the renderer-safe Builder event contract."],
      ["src/main/ipc/handlers/builder.ts", "Dispatches session create/restore/prompt/model/permission/form/abort/detach/stop operations."],
      ["src/lib/builder/session.ts", "Session summaries, snapshots, history records, and normalized event union."],
      ["src/lib/builder/engine.ts", "Engine settings, step-budget normalization, E2B template, and MCP presets/contracts."],
      ["src/lib/builder/types.ts", "Renderer-safe connection status and supported OpenCode version check."],
      ["src/main/ai/provider.ts", "Resolves configured language/embedding providers used by local Builder tools."],
      ["src/main/ai/settings.ts", "Reads persisted engine/model/MCP/sandbox Builder settings."],
    ],
  },
  {
    id: "workspace-review-and-safety",
    area: "Workspace safety, worktrees, and review",
    summary:
      "Validates the chosen git repository, creates isolated worktrees, serves bounded file/diff data, prevents file reads escaping the workspace, and applies or discards reviewed changes.",
    flow:
      "New sessions run in a worktree outside the source tree. Keep applies the reviewed patch to the source repository and advances the worktree baseline; Discard resets unkept edits.",
    files: [
      ["src/main/builder/workspace.ts", "Git validation, optional git initialization, worktree lifecycle, bounded file tree, file reads, diffs, Keep/Discard, and cleanup scans."],
      ["src/lib/builder/workspace.ts", "Renderer-safe workspace, file tree, and diff model types."],
      ["src/main/builder/code-projects.ts", "Creates or clones Git-backed project folders with validated names and remote URLs."],
      ["src/main/ipc/handlers/builder.ts", "Routes workspace validation, file reads, diff review, Keep/Discard, and worktree cleanup."],
      ["src/components/builder/BuilderCodeWorkspace.tsx", "Displays files and reads selected content through IPC."],
      ["src/components/builder/BuilderChangesWorkspace.tsx", "Review UI for added/modified/deleted files and aggregate actions."],
      ["src/__tests__/builder-workspace.test.ts", "Workspace validation, tree, diff, and file-boundary behavior."],
      ["src/__tests__/builder-review-loop.test.ts", "Real-git worktree review, Keep baseline, Discard, and path escape regression coverage."],
    ],
  },
  {
    id: "session-persistence-and-history",
    area: "Session persistence and history",
    summary:
      "Persists the active Builder session context and archived session history, restores detached sessions, and maintains a focused-session registry for concurrent sessions.",
    flow:
      "Main buffers recent events and Local model messages; UI route changes reattach to that state. History rows preserve engine, workspace, worktree, and lifecycle status.",
    files: [
      ["src/main/db/builder-sessions.ts", "Active-session row, message/event context, history CRUD, and archive helpers."],
      ["src/main/db/schema.ts", "Builder session/history and related database schema."],
      ["src/main/ipc/handlers/builder.ts", "Restore, focus, active-list, delete, detach, and lifecycle transitions."],
      ["src/main/builder/session-manager.ts", "Debounced bounded event/message persistence and session teardown semantics."],
      ["src/hooks/use-builder-session.ts", "Renderer reattach and state refresh on session changes."],
      ["src/hooks/use-builder-session-history.ts", "Recent sessions and orphaned-worktree controls."],
      ["src/components/builder/BuilderWelcome.tsx", "Recent session and recovery presentation."],
      ["src/components/builder/BuilderSessionSwitcher.tsx", "Focused session selection UI."],
      ["src/__tests__/builder-sessions-db.test.ts", "Persistence and history contract tests."],
      ["src/__tests__/builder-session-events.test.ts", "Normalized event behavior and event-tail expectations."],
    ],
  },
  {
    id: "preview",
    area: "Live preview lifecycle",
    summary:
      "Separates a Qeda-owned dev-server process from a URL detected in agent output, reports readiness and logs, and shows device-width previews with an honest stop control.",
    flow:
      "Qeda chooses a project script/package manager or accepts a user command, scans output for localhost URLs, broadcasts status, and kills only the process it owns.",
    files: [
      ["src/main/builder/preview.ts", "Owns the spawned preview process, readiness/log state, and process-tree cleanup."],
      ["src/lib/builder/preview.ts", "Pure script/package-manager selection, URL detection, status types, and log bounds."],
      ["src/hooks/use-builder-preview.ts", "Reattaches to main-owned preview status and exposes preview controls."],
      ["src/components/builder/BuilderCanvas.tsx", "Renders preview URL, viewport presets, status, logs, and ownership-aware controls."],
      ["src/renderer/pages/Builder.tsx", "Combines Qeda-owned preview URL with a detected URL only when appropriate."],
      ["src/main/ipc/channels.ts", "Preview start/stop/status/open and status-change event definitions."],
      ["src/main/ipc/handlers/builder.ts", "Starts/stops preview in the active workspace and opens external URLs."],
      ["src/__tests__/builder-preview.test.ts", "Script selection, output URL extraction, and preview ownership/status behavior."],
    ],
  },
  {
    id: "opencode-plugin-and-bridge",
    area: "OpenCode plugin and authenticated bridge",
    summary:
      "Installs a bundled OpenCode v2 plugin, registers the qeda-builder agent/tools/commands, mirrors enabled Qeda MCP servers, and calls Qeda-owned capabilities through a per-session authenticated localhost bridge.",
    flow:
      "Qeda creates the bridge for an active OpenCode session; plugin requests bind the OpenCode session ID, and Qeda authorizes only the currently active Builder session/worktree.",
    files: [
      ["plugins/qeda-builder/src/index.ts", "Registers the qeda-builder agent, ten Qeda tools, three commands, prompt binding, and MCP mirroring."],
      ["plugins/qeda-builder/src/opencode-plugin-api.d.ts", "Narrow local TypeScript contract for the OpenCode v2 plugin API."],
      ["plugins/qeda-builder/package.json", "Plugin package metadata and compile script."],
      ["plugins/qeda-builder/tsconfig.json", "Plugin build TypeScript configuration."],
      ["plugins/qeda-builder/dist/index.js", "Compiled self-contained plugin bundled by the desktop app."],
      ["src/main/opencode/bridge.ts", "Loopback HTTP bridge with per-run token and route dispatch."],
      ["src/main/opencode/session-binding.ts", "Rejects calls not bound to the active OpenCode Builder session."],
      ["src/main/opencode/registration.ts", "Safely registers the bundled plugin in OpenCode v2 config and writes runtime settings."],
      ["src/main/opencode/runtime-config.ts", "Writes the plugin's step budget and enabled MCP server snapshot."],
      ["src/main/opencode/detection.ts", "Detects OpenCode installation and registration status."],
      ["src/main/ipc/handlers/opencode-setup.ts", "IPC for plugin registration and OpenCode setup UI."],
      ["src/components/settings/views/OpencodeSetupCard.tsx", "Settings controls for OpenCode installation and plugin setup."],
      ["docs/opencode-builder-plugin.md", "Plugin/bridge contract, routes, lifecycle, constraints, and verification guide."],
      ["src/__tests__/opencode-plugin.test.ts", "Plugin registration, tools, agent, MCP, binding, and cleanup contract coverage."],
      ["src/__tests__/opencode-registration.test.ts", "Config merge, backup, malformed-config safety, and idempotent install tests."],
      ["src/__tests__/opencode-session-binding.test.ts", "Rejects unrelated OpenCode session calls."],
    ],
  },
  {
    id: "sandbox",
    area: "E2B sandbox execution",
    summary:
      "Runs an OpenCode v2 server in an ephemeral E2B environment and captures its resulting patch for explicit application to the local repository.",
    flow:
      "The session requires a resolvable GitHub remote and configured E2B service, starts a protected sandbox, then reports patch-apply failures with a recovery path.",
    files: [
      ["src/main/sandbox/e2b.ts", "Creates/probes/destroys E2B sandboxes, configures OpenCode authentication, and captures/applies patches."],
      ["src/main/ipc/handlers/builder.ts", "Creates sandbox sessions, destroys them on lifecycle transitions, and publishes patch-apply failures."],
      ["src/lib/builder/engine.ts", "Default OpenCode v2 sandbox template and related engine settings."],
      ["src/hooks/use-builder-sandbox-patch-failure.ts", "Shows recovery notification when a sandbox patch cannot be applied."],
      ["src/components/builder/BuilderChatPanel.tsx", "Exposes the run-in-sandbox choice for the next session."],
      ["src/__tests__/builder-sandbox-ui.test.tsx", "Sandbox control presentation and disabled/active behavior."],
      ["src/__tests__/builder-sandbox-patch-failure.test.tsx", "Patch failure recovery notification behavior."],
      ["src/__tests__/sandbox-e2b.test.ts", "Sandbox URL/auth/template and lifecycle helper coverage."],
    ],
  },
  {
    id: "project-codebases-and-indexing",
    area: "Project codebases and semantic indexing",
    summary:
      "Attaches multiple Git codebases to an outcome Project, provisions or clones repositories, and explicitly indexes safe source files into the project-scoped semantic search store.",
    flow:
      "Codebase records are separate from the legacy single repo_path. Indexing reports state and counts; deleting a record removes its vector/chunk index, not its source files.",
    files: [
      ["src/main/db/code-projects.ts", "Project-scoped codebase persistence and index status lifecycle."],
      ["src/main/tools/rag.ts", "Ignore-aware Git file selection, safe file filtering, chunking, embeddings, and vector index writes."],
      ["src/main/ipc/handlers/builder.ts", "Lists/registers/provisions/indexes/deletes codebases through Builder IPC."],
      ["src/main/ipc/channels.ts", "Typed code-project list/register/provision/index/delete channels."],
      ["src/hooks/use-builder-code-projects.ts", "Renderer codebase CRUD/index state."],
      ["src/components/builder/BuilderCodebasePicker.tsx", "UI for selecting, linking, creating, cloning, and indexing codebases."],
      ["src/renderer/pages/Builder.tsx", "Binds codebases to the active project scope."],
      ["src/__tests__/builder-code-projects.test.ts", "Codebase provisioning and persistence behavior."],
    ],
  },
  {
    id: "plans-approvals-and-settings",
    area: "Plans, approvals, and Builder settings",
    summary:
      "Shares in-run plan state and typed interaction contracts across Builder engines, while settings select engine, model, step budget, MCP servers, and sandbox configuration.",
    flow:
      "The local agent can plan and stop after all tasks resolve; OpenCode plan/preview/index operations are exposed through the plugin bridge. Tool permissions and forms remain explicit UI events.",
    files: [
      ["src/main/ai/plan-manager.ts", "Creates/updates plan items, emits events, and supplies the local agent stop condition."],
      ["src/main/tools/plan.ts", "Agent-facing create/update plan tools."],
      ["src/lib/agent-plan.ts", "Shared plan/event types."],
      ["src/components/plan/PlanPanel.tsx", "Plan progress surface used by Builder chat."],
      ["src/lib/builder/interactions.ts", "Renderer-safe permission/form contracts and form visibility/default helpers."],
      ["src/components/builder/tools/BuilderPermissionCard.tsx", "Explicit permission decision UI."],
      ["src/components/builder/tools/BuilderFormCard.tsx", "Structured agent-requested form UI."],
      ["src/components/settings/views/BuilderMcpView.tsx", "Builder engine, MCP server, and runtime settings UI."],
      ["src/main/ai/settings.ts", "Persists and resolves Builder settings."],
      ["src/lib/builder/engine.ts", "Step budget bounds, engine choices, and MCP presets."],
      ["src/__tests__/builder-interactions.test.tsx", "Form/permission interaction behavior."],
      ["src/__tests__/builder-local-tools.test.ts", "Local coding tool and approval behavior."],
      ["src/__tests__/builder-types.test.ts", "Connection/engine contract checks."],
    ],
  },
  {
    id: "regression-suite-and-status-docs",
    area: "Regression tests and implementation notes",
    summary:
      "Focused tests cover core UI, workspace safety, review semantics, local tools, OpenCode, session history, project scope, preview, and sandbox flows.",
    flow:
      "Use source and current tests as implementation ground truth. The Builder v0 status document is a dated historical snapshot and predates current worktree, session history, file read, and review implementations.",
    files: [
      ["src/__tests__/builder-changes-hook.test.tsx", "Review hook refresh and action behavior."],
      ["src/__tests__/builder-chat-panel.test.tsx", "Chat composer and supervised interaction UI."],
      ["src/__tests__/builder-project-scope.test.tsx", "Project scope and workspace suggestion behavior."],
      ["src/__tests__/builder-welcome.test.tsx", "Welcome, recent session, and workspace entry state."],
      ["src/__tests__/builder-workspace-surfaces.test.tsx", "Code/Changes surface UI behavior."],
      ["src/__tests__/builder-workspace.test.ts", "Workspace validation, file tree, diff, and content behavior."],
      ["src/__tests__/builder-review-loop.test.ts", "Real Git review and worktree regression tests."],
      ["src/__tests__/builder-session-events.test.ts", "Event normalization and stream contracts."],
      ["src/__tests__/builder-sessions-db.test.ts", "Active session and history persistence."],
      ["src/__tests__/builder-preview.test.ts", "Preview script, URL, and lifecycle behavior."],
      ["src/__tests__/builder-sandbox-ui.test.tsx", "Sandbox UI controls."],
      ["src/__tests__/builder-sandbox-patch-failure.test.tsx", "Sandbox patch error recovery."],
      ["src/__tests__/builder-code-projects.test.ts", "Project codebase registration/provisioning."],
      ["src/__tests__/builder-interactions.test.tsx", "Permission/form affordances and state."],
      ["src/__tests__/builder-local-tools.test.ts", "Local agent tools and shell permission behavior."],
      ["src/__tests__/builder-types.test.ts", "Builder connection and type-level helpers."],
      ["src/__tests__/opencode-plugin.test.ts", "OpenCode plugin contract."],
      ["src/__tests__/opencode-registration.test.ts", "OpenCode config registration safety."],
      ["src/__tests__/opencode-session-binding.test.ts", "OpenCode session binding security."],
      ["src/__tests__/sandbox-e2b.test.ts", "E2B sandbox lifecycle helpers."],
      ["docs/builder-v0-status.md", "Historical Builder v0 status snapshot; check timestamps before relying on gap lists."],
      ["docs/opencode-builder-plugin.md", "Current OpenCode integration design and operational notes."],
    ],
  },
];

const normalized = (value) => value.toLocaleLowerCase();

export function getBuilderSystemOverview() {
  const fileCount = implementations.reduce(
    (total, item) => total + item.files.length,
    0,
  );
  return {
    system: "Qeda Builder System",
    summary:
      "A supervised coding workspace with Local ToolLoopAgent, OpenCode v2, and optional E2B sandbox execution.",
    workflow: [
      "Select and validate a Git-backed workspace.",
      "Create an isolated worktree or remote sandbox session.",
      "Run a coding turn and stream normalized events and explicit approvals.",
      "Inspect preview, files, and diffs; Keep, Discard, detach, or restore.",
    ],
    engines: [
      { id: "local", runtime: "Native AI SDK ToolLoopAgent with workspace tools and active MCP tools." },
      { id: "opencode", runtime: "Attach-only OpenCode v2 service with Qeda's plugin bridge." },
      { id: "opencode-sandbox", runtime: "OpenCode v2 inside an E2B sandbox; changes return as a patch." },
    ],
    areas: implementations.map(({ id, area, summary, files }) => ({
      id,
      area,
      summary,
      files: files.length,
    })),
    areaCount: implementations.length,
    fileCount,
    scopeNote:
      "This map covers Qeda's coding Builder, not the separate Model Builder or the Motion pipeline builder.",
  };
}

export function searchBuilderImplementations(input) {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
    throw new TypeError("Search input must be an object.");
  }
  const query = input?.query ?? "";
  const area = input?.area;
  if (typeof query !== "string" || query.length > 200) {
    throw new TypeError("query must be a string of at most 200 characters.");
  }
  if (area !== undefined && (typeof area !== "string" || area.length > 80)) {
    throw new TypeError("area must be an area ID string of at most 80 characters.");
  }

  const terms = normalized(query.trim()).split(/\s+/).filter(Boolean);
  const matches = implementations.filter((item) => {
    if (area && item.id !== area) return false;
    const haystack = normalized([
      item.id,
      item.area,
      item.summary,
      item.flow,
      ...item.files.flatMap(([file, description]) => [file, description]),
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });

  return {
    query: query.trim(),
    area: area ?? null,
    resultCount: matches.length,
    results: matches,
  };
}

export function getBuilderImplementation(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new CanvasError("invalid_input", "Implementation input must be an object.");
  }
  if (typeof input.id !== "string" || input.id.length > 80) {
    throw new CanvasError("invalid_input", "Provide a valid implementation area ID.");
  }
  const result = implementations.find((item) => item.id === input.id);
  if (!result) {
    throw new CanvasError("not_found", `No Builder implementation area has ID "${input.id}".`);
  }
  return result;
}
