# E2B Remote Builder (opencode in sandbox)

## Goal

Run an OpenCode Builder session inside an E2B sandbox instead of the user's
machine. On session start, clone the selected repository (GitHub PAT or generic
HTTPS/SSH) into the sandbox; on session stop, capture the sandbox's working-tree
diff and apply it as a patch to the local codebase. Sandbox is ephemeral per
session. Selected via a per-session toggle in Builder setup.

## Decisions (resolved with user)

- Use case: **remote workspace for Builder** (not async task delegation).
- Git providers v1: **GitHub (PAT) + generic HTTPS/SSH**.
- GitHub auth: **Personal access token**, stored encrypted in Settings.
- Sandbox lifecycle: **ephemeral per session** (killed on stop; no pause/resume).
- Sync back: **apply patch locally** (no push/PR in v1).
- Selection: **per-session toggle** in Builder setup.

## Non-goals (v1)

GitLab-native flows, PR creation, pause/resume, local engine in sandbox,
code indexing inside the sandbox, Jules-style async handoff, Daytona provider.

## Architecture

### New module: `src/main/sandbox/e2b.ts`

Wraps the `e2b` JS SDK behind an injectable surface (mirrors `services/http.ts`
convention). Responsibilities:

- `resolveE2bKey()` — Settings `serviceKeys.e2b` then `E2B_API_KEY`.
- `createSandbox(input)`:
  1. Validate key present.
  2. `Sandbox.create('opencode', { envs, timeoutMs })` with provider keys + git token.
  3. Clone repo into `/home/user/repo` via `sandbox.commands.run('git clone ...')`
     (token injected through env, not the URL where avoidable).
  4. Start `opencode serve --hostname 0.0.0.0 --port 4096` in background.
  5. Poll `https://<host>/global/health` until ready (timeout ~30s).
  6. Return `{ sandbox, sandboxId, baseUrl, repoDir }`.
- `destroySandbox(sandbox)` — kill, never throw.
- `capturePatch(sandbox, repoDir)` — `git add -A && git diff --cached` then reset;
  returns unified diff string (empty when no changes).
- `applyPatchLocally(repoDir, patch)` — write patch to temp file, `git apply`;
  on failure persist patch under `userData/builder-patches/` and return error.

### Remote runtime connection

Refactor `connectBuilderRuntime()` in `src/main/builder/client.ts` to accept an
optional `{ baseUrl, headers }`. When provided, build the `OpenCode` client
directly against that URL (no `Service.discover()`), reusing the same preflight
(`client.server.info()`). Local path unchanged.

### Builder handler changes (`src/main/ipc/handlers/builder.ts`)

- Add state: `activeSandbox`, `activeSandboxRepoDir`, `activeSandboxed: boolean`.
- Widen `activeEngine` typing to `'local' | 'opencode' | 'opencode-sandbox'`
  (or keep `'opencode'` + `activeSandboxed` flag; recommend separate engine value
  for restore clarity). Use `'opencode-sandbox'`.
- `builder:session-create` req becomes
  `{ directory: string; runInSandbox?: boolean; remoteUrl?: string }`.
  - When `runInSandbox`:
    - Resolve source: `remoteUrl` if given else CodeProject's `remoteUrl` /
      origin of `directory`.
    - Create sandbox, clone, connect remote runtime.
    - `activeEngine = 'opencode-sandbox'`; sandbox object stored.
    - `activeWorkspace.directory` = sandbox repoDir (so opencode server's
      `x-opencode-directory` resolves inside the sandbox).
    - Persist with `engine: 'opencode-sandbox'`.
  - Otherwise existing paths unchanged.
- `stopActive()`:
  - If sandboxed: capture patch; attempt local apply to the linked CodeProject
    directory (or `projects.repo_path`); on failure save patch + broadcast error;
    then destroy sandbox.
- `detachActive()` (window close): for sandboxed sessions, destroy sandbox
  (changes already? ephemeral — warn that un-pushed changes are lost unless synced).
  Recommend: on detach, attempt patch capture + apply before destroy.

### Restore

Ephemeral sandbox cannot survive app restart. In `builder:session-state`, for
`engine === 'opencode-sandbox'`, delete the persisted row and return null
(no reconnect). Optionally surface a "session lost" notice.

### IPC channels (`src/main/ipc/channels.ts`)

- Update `builder:session-create` req type.
- Add `builder:sandbox:status` event? Optional; reuse status broadcasts.

### Settings (`src/main/ai/settings.ts`, IPC settings handler, channels)

- Add to `AppSettings`: `e2bApiKey?`, `githubPat?`, `e2bSandboxTimeoutMs?`.
- Encrypt/decrypt both keys in `getSettings`/`saveSettings` (same pattern as
  service keys; recommend storing under `serviceKeys`? Better dedicated fields to
  keep UI simple. Follow serviceKeys merge rule in settings handler).
- `.env` fallback: `E2B_API_KEY`, `GITHUB_TOKEN`/`GITHUB_PAT`.

### Service registry

Add `e2b` to `services/registry.ts`? It's not a search/scrape service. Instead
treat as a "sandbox provider" in settings UI. Could add a new `ServiceCategory`
value `'sandbox'` or keep separate. Recommend: add category `'sandbox'` and an
`e2b` entry so Settings renders it uniformly and `keys.ts` resolves it. GitHub PAT
is not a service; add a dedicated Settings field.

### UI

- Builder page setup: checkbox "Run in E2B sandbox" + remote URL input (or pick
  from CodeProject's remoteUrl). Show creation progress and sandbox id.
- Settings dialog: E2B API key, GitHub PAT, sandbox timeout (default 3600000).
- On sync-back failure, show a dialog with saved patch path.

### Dependencies

- Add `e2b` to root `package.json` dependencies. If ESM-only, add a mock in
  `.erb/mocks/` and `moduleNameMapper` entry in `jest.config.js` (only needed if
  imported by tested modules; keep sandbox module main-only to avoid).
- Optionally externalize via `release/app/package.json` to reduce bundle.

## Files to create/modify

Create:
- `src/main/sandbox/e2b.ts`
- `src/main/sandbox/index.ts` (optional barrel)
- `src/components/builder/RemoteSandboxSetup.tsx` (optional; or inline in Builder page)

Modify:
- `src/main/builder/client.ts` — optional baseUrl.
- `src/main/ipc/handlers/builder.ts` — sandbox state + session-create + stopActive + restore.
- `src/main/ipc/channels.ts` — session-create req type.
- `src/main/ai/settings.ts` — new fields + crypto.
- `src/main/ipc/handlers/settings.ts` — merge fields.
- `src/main/services/registry.ts` — sandbox category + e2b entry (or separate).
- `src/main/services/keys.ts` — resolve e2b key (if registry entry).
- `.env.example` — move E2B out of held list; add GITHUB_PAT.
- `src/renderer/pages/Builder.tsx` — toggle + progress.

## Failure modes

- Missing E2B key → session-create throws actionable error.
- Clone failure → sandbox killed, no session, no DB row.
- opencode server not ready → timeout, sandbox killed.
- Patch apply conflict → patch saved to `userData/builder-patches/<id>.patch`,
  broadcast error with path; sandbox destroyed.
- Inactivity timeout → sandbox destroyed by E2B; session marked failed on next op.
- App restart mid-session → persisted row deleted on restore; user must restart.

## Validation

- `npx tsc --noEmit` (baseline 12 errors; no new).
- `python3 scripts/verify-ipc-split.py`.
- `npm run lint` on touched files.
- Manual: create session with toggle, send prompt, stop, verify patch applied.

## Open questions

- Should the sandbox mirror the host project path (like E2B workspace plugin) or
  use `/home/user/repo`? Recommend `/home/user/repo` for simplicity; opencode
  server path is sandbox-local anyway. (No impact on user.)
- Should provider keys be forwarded into the sandbox env for opencode's own model
  calls, or does Qeda's bridge supply models? The opencode server in the sandbox
  calls providers directly; forward all configured provider keys + E2B? At minimum
  forward `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/etc from settings. Plan: forward
  the full set of provider keys present in settings.
- Whether to register `e2b` in `services/registry.ts` (affects Settings UI and
  agent-capabilities exhaustiveness tests). Recommend yes, new category.
