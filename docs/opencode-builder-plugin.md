# Qeda Builder integration for OpenCode

Qeda talks to the OpenCode v2 server through `@opencode/client`. The bundled
plugin closes the loop in the other direction: it exposes Qeda-owned
capabilities inside OpenCode and registers a `qeda-builder` agent whose workflow
matches Qeda's Local engine. Qeda remains the authority for its database, preview
process, codebase index, plan UI, and project metadata. OpenCode remains
responsible for the model loop and its native read/write/edit/bash/glob/grep
tools.

## Plugin contract and installation

- Target contract: OpenCode v2's `{ id, setup(ctx) }` plugin object, verified
  against OpenCode `v2.0.18`. The v1 `@opencode-ai/plugin` function form does not
  run in v2.
- The plugin is compiled by `npm run build:opencode-plugin` (also part of
  `npm run build`) from `plugins/qeda-builder/src` to
  `plugins/qeda-builder/dist/index.js`. Electron Builder places that
  dependency-free entry in `resources/opencode-plugins/qeda-builder`.
- Setup copies the entry into the user's OpenCode config directory at
  `plugins/qeda-builder/`, writes a `package.json` with `"type": "module"` into
  that per-user directory, and registers the directory in the v2 `plugins`
  array as `{ package, options }`.
- The entry passes only file paths in `options`: Qeda's bridge config and the
  runtime snapshot. It does not run npm/bun/pnpm or download plugin code. The
  token is never copied into OpenCode's config or environment.
- Existing config values are preserved and backed up once to
  `<config>.qeda.bak`. Malformed JSONC, a non-array `plugins` value, or an
  unrecognized `plugins/qeda-builder` directory is rejected without overwriting
  user data. Legacy v1 `plugin: []` entries are migrated to `plugins: []`.
- OpenCode must reload/restart its service after registration. The Settings card
  is also the re-register action after changing the step budget or enabled MCP
  servers.

The plugin bundle uses only Node built-ins at runtime. Its narrow local
TypeScript contract is
`plugins/qeda-builder/src/opencode-plugin-api.d.ts`; keep it in sync with the
official v2 plugin API.

## What the plugin adds

At load time it reads `<userData>/opencode/runtime.json`, written mode `0600` by
registration:

- `maxSteps` becomes the `qeda-builder` agent's step budget.
- Enabled Qeda MCP servers are mirrored into OpenCode with a `qeda-` name
  prefix. An existing user-owned server with the same name is never replaced.
  Stdio `env` and HTTP `headers` can contain credentials, which is why the
  snapshot is owner-only.

It then registers:

- **Ten tools**, all in the `qeda` namespace with CodeMode disabled:
  `qeda_ping`, `qeda_preview_status`, `qeda_preview_start`, `qeda_preview_stop`,
  `qeda_index_codebase`, `qeda_codebase_status`, `qeda_project_info`,
  `qeda_plan_create`, `qeda_plan_update`, and `qeda_plan_status`.
- **A primary agent**, `qeda-builder`, with the Local engine's workflow prompt,
  Qeda tool permissions, and visibility in OpenCode's agent picker.
- **Three commands**: `/qeda-preview`, `/qeda-plan`, and `/qeda-index`. They
  forward an instruction prompt through OpenCode's own session API; they do not
  add custom RPC.
- **A prompt hook** that binds each prompt's OpenCode session to the active Qeda
  bridge session.

## Bridge and session binding

When an OpenCode Builder session starts, Qeda opens an HTTP server on
`127.0.0.1` with a random per-session token and writes
`<userData>/opencode/bridge.json` with owner-only permissions. The plugin reads
that file for each tool invocation, so it can connect to a bridge created after
the OpenCode process started and follows token rotation. Qeda deletes the file
when the session detaches or stops.

The plugin is installed globally, so OpenCode can show `qeda_*` tools in every
session. Every bridge call therefore carries the OpenCode session ID, and Qeda
rejects any call that does not come from the active Qeda-created session. Every
route, including `/health`, requires the bridge token.

Bridge routes:

| Route | Purpose |
| --- | --- |
| `/ping` | Reachability check for the active session |
| `/session/bind` | Confirm the OpenCode session and worktree |
| `/preview/status`, `/preview/start`, `/preview/stop` | Qeda-owned preview process |
| `/index`, `/index/status` | Start/read Qeda codebase indexing |
| `/project/info` | Qeda project and linked codebase metadata |
| `/plan/create`, `/plan/update`, `/plan/status` | Visible plan state and events |

Requests carry the tool's abort signal so OpenCode cancellation aborts bridge
fetches. Paths supplied by the model are accepted only when they resolve to the
active source repository or its worktree; the bridge always acts on the
worktree.

## Worktrees, restore, and events

- Session creation asks OpenCode to create a Qeda-owned worktree under
  `<userData>/builder-worktrees/` and falls back to OpenCode's default location
  if that request is rejected. It deliberately does **not** register a global
  custom worktree strategy, because the plugin loads for every project.
- The new session requests the `qeda-builder` agent and falls back to the
  default agent when the plugin is not installed. Restored sessions try the
  agent switch on the next prompt.
- Empty workspaces are auto-initialized through the same
  `inspectBuilderWorkspace(directory, { autoInit: true })` path used by Local.
- On restore, Qeda restarts the bridge, returns the persisted event buffer, and
  verifies that the worktree still exists before re-attaching.
- `session-stop` (Discard) interrupts the remote session, asks OpenCode to
  remove the worktree, then falls back to local `git worktree remove`.
  `session-detach` (Disconnect) and window close interrupt but preserve the
  worktree and persisted context for restore.
- OpenCode's global `filesystem.changed` events are mapped to Qeda's
  `file-changed` event, scoped to the active worktree and filtered for
  dependency/build noise. This is what refreshes Qeda's diff review after native
  edits and bash commands.

## Known limitations

- Registration is an explicit Settings action; it does not restart or take over
  the user's OpenCode server. Reload/restart OpenCode after setup, and
  re-register + restart after changing the step budget or MCP servers.
- OpenCode installation is detected, and the Settings card links to the official
  download page when absent. Qeda does not silently install an external binary.
- Native tool permissions (bash/edit/read/...) follow OpenCode's own permission
  configuration and UI, not the Local engine's permission prompts.
- Model selection and provider credentials remain OpenCode-native. Qeda exposes
  the available models but does not copy its own provider keys into OpenCode.
- The plugin does not register a global custom worktree strategy and does not
  add custom plugin RPC. Qeda → plugin control uses OpenCode's APIs; plugin →
  Qeda uses the authenticated bridge.
- The Local engine keeps its own `ToolLoopAgent`; it does not gain OpenCode-only
  surfaces such as native preview/index tools.
- The bundled plugin is pinned to Qeda's release. Validate compatibility before
  broadening support to untested OpenCode major/minor versions.

## Verification

The integration evidence path is:

1. Compile the plugin against the v2 contract (`npm run build:opencode-plugin`).
2. Jest contract tests fake the host transform boundary and assert tool
   namespace/CodeMode options, agent registration, MCP mirroring, prompt
   binding, and cleanup (`src/__tests__/opencode-plugin.test.ts`).
3. Registration tests install into a temporary config directory and verify
   config merging, backup, idempotence, malformed-config safety, legacy
   migration, and owner-only runtime files.
4. Bridge tests cover authentication and routing; session-binding tests reject
   calls from unrelated OpenCode sessions.
5. Build Qeda and confirm Electron Builder includes the `opencode-plugins`
   resource.
6. For host-level validation, run an isolated OpenCode v2 server with a
   temporary `HOME`, install the built plugin, and confirm `/api/plugin`,
   `/api/agent` (`qeda-builder`), and `/api/mcp` (`qeda-*`) contain the expected
   registrations.

Official references:

- [V2 plugin guide](https://opencode.ai/v2/docs/build/plugins)
- [V1 plugin migration guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [V2 config guide](https://opencode.ai/v2/docs/config)
