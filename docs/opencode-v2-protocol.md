# opencode v2 protocol — verified findings

**Status:** probe complete. Everything here was observed against the locally
installed binary on 2026-10-01, not read from documentation. Where the public
docs and the running server disagree, the server wins and the disagreement is
called out.

**Supersedes the API assumptions** in `docs/opencode-engine.md` and
`docs/vibe-coding-surface.md`. Both were written from `opencode.ai/docs/sdk`,
which documents the **v1** API.

---

## 0. Headline: the docs describe v1; the installed server is v2, and they do not match

| Fact | Value |
| --- | --- |
| Installed binary | `~/.opencode/bin/opencode`, **`v2.0.18`** |
| Server self-report (`GET /api/info`) | `{"version":"2.0.18","pid":…,"urls":[…],"paths":{"tmp":"/tmp/opencode"}}` |
| npm `@opencode-ai/sdk` latest | **`1.18.34`** — the v1 line; **no 2.x published, no `v2` dist-tag** |
| npm `opencode-ai` (CLI package) latest | `1.18.34` |
| `opencode.ai/docs/sdk` | documents v1 (`/session/:id/message`, `/find`, `/file`, `/tui`, `/global/health`) |
| `opencode.ai/v2/docs/sdk` | **404** |

**Conclusion: `@opencode-ai/sdk@1.18.34` must not be used against this server.**
The SDK is generated from the v1 OpenAPI spec; the v2 server exposes a different
API. This is the version-skew risk (R1) in both plans, confirmed as real.

The v2 spec is published **at runtime** by the server itself (`/openapi.json`),
which is the better source of truth anyway — see §7 for the recommended client.

---

## 1. Server topology — the API is under `/api`, and the root is a web app

- The CLI describes `opencode serve` as *"Start the v2 API and **web server**"*.
  The same port serves the JSON API **and** the desktop web app.
- **Consequence:** the root and bare paths return the SPA — `HTTP 200`,
  `text/html`, 5986 bytes. Probing paths naively gives false positives.
  `/global/health`, `/v2/global/health`, `/event`, `/session`, `/config`,
  `/project`, `/path`, `/agent` all returned `200 text/html` (the app),
  and content negotiation made **no difference** — `Accept: application/json`
  produced the same HTML.
- **The JSON API is prefixed `/api`**: `/api/session`, `/api/config`,
  `/api/event`, `/api/model`, `/api/provider`, …
- **Spec:** `GET /openapi.json` → OpenAPI **3.1.0**, `info.title`
  `"opencode HttpApi"`, `info.version` `"0.0.1"` (≠ the server version).
  **115 paths.**
- **Envelope:** responses are wrapped — `{ "data": … }`.
- **Identity/health:** `GET /api/info`. There is **no** `/global/health` and no
  `healthy` field.

### Auth

`opencode serve` auto-generated a basic-auth password and printed it to stdout:

```
server listening on http://127.0.0.1:4097
server password <generated>
```

Username defaults to `opencode`. The docs present `OPENCODE_SERVER_PASSWORD` as
opt-in; in v2 a managed server prints one regardless. A client therefore must
either capture stdout or set the env var itself. The unauthenticated `200` on
bare paths is just the static SPA — the `/api/*` routes are the protected ones.

---

## 2. Two client topologies — and ports are dynamic

opencode runs a **persistent background service** by default:

```
$ opencode service status
http://127.0.0.1:49374
```

- The service port is **dynamic**, not the documented `4096`. Never assume a port.
- CLI behaviour: commands target the background service by default;
  `--standalone` runs a private server; `--server <url>` targets a specific one.
- `opencode service start|restart|status|stop|get|set|unset` manages it.

**So a client should discover and attach to the ambient service**, not spawn a
fixed-port server. This directly corrects §7 of `opencode-engine.md` and §4 of
`vibe-coding-surface.md`, which both assumed spawning on a chosen port.

---

## 3. Sessions are multi-directory — "one server per repo" was wrong

`Session.Info` includes a **`location.directory`**. A live `GET /api/session`
returned sessions whose location was `/data/projects/docugent/docugent-desktop` —
a different directory from the server's cwd.

Supporting endpoints: `POST /api/session/{id}/move`,
`PUT /api/session/{id}/environment`.

**Consequences:**

- A single server serves sessions across directories. The `vibe-coding-surface.md`
  design — one server keyed per `repo_path`, restarted on project switch — is
  **unnecessary**.
- The server still has a cwd (`/api/location`, `/api/location/reload` exist), so
  the cwd is a *default*, not a hard scope.
- **[verify]** how the location is set at creation — `POST /api/session`'s body
  was not inspected.

---

## 4. Streaming

- `GET /api/event` → `text/event-stream`.
- **Wire format is JSON per `data:` line, and the event name is the JSON `type`
  field — not an SSE `event:` line:**

```
data: {"id":"evt_0f7b2c087001…","type":"server.connected","data":{}}

: heartbeat
```

- The spec exposes only `V2EventEncoded` = `{ type: "string", contentMediaType: … }`
  — **an encoded string with no enum of event names**. The schema is therefore
  not a usable taxonomy.
- **The full event list is still the main open item.** Idle, only
  `server.connected` (+ `: heartbeat`) was observed. Enumerate by running a real
  session against a throwaway repo and capturing the stream.

---

## 5. Prompting, revert, permissions, diff

### Prompt

`POST /api/session/{sessionID}/prompt`, body:

```
{ id?, text (required), files[], agents[], skills[], metadata,
  delivery?: Session.Inbox.Delivery, resume?: boolean }
```

Response: `{ data: Session.Inbox.User }`.

- v2 takes a **`text`** field, not v1's `parts[]`.
- There is an **inbox** concept (`Session.Inbox.*` — User, Synthetic, Compaction,
  Move). Submission appears to go into an inbox with `delivery`/`resume`
  semantics rather than a blocking call.
- There is **no `prompt_async`** path. Async-ness comes from `delivery`/`resume` +
  the inbox + `/api/event`.
- Related: `/api/session/{id}/generate`, `/api/experimental/session/{id}/wait`,
  and **`POST /api/session/{id}/interrupt`** (the v2 equivalent of v1's `abort`).

### Diff — the review surface

`GET /api/session/{sessionID}/diff` → `FileDiff.Info[]`, where:

```
FileDiff.Info = { file: string, patch: string,
                  additions: int, deletions: int,
                  status: "added" | "deleted" | "modified" }
```

**`patch` is a unified-diff string.** So the viewer renders patch text (parse the
hunks; colour with `shiki`, already a dependency) rather than mapping structured
hunks. This resolves R5 in `vibe-coding-surface.md`: a viewer, not a differ.

Repo-level state is also available: `/api/vcs/diff`, `/api/vcs/status`,
`/api/vcs/branch`, `/api/vcs/base`.

### Revert is **staged** in v2, not a single call

| Endpoint | Body | Description (from spec) |
| --- | --- | --- |
| `POST /api/session/{id}/revert/stage` | `{ messageID, files?: boolean }` | *"Stage or move a reversible session boundary and optionally apply its file changes."* |
| `POST /api/session/{id}/revert/commit` | — | Commit the staged boundary |
| `DELETE /api/session/{id}/revert` | — | Discard the staged revert |

`Session.Revert` = `{ messageID, partID?, snapshot?, files?: FileDiff.Info[] }`.

Two things matter here:

- The **"review after"** loop is actually **stage → inspect `files` → commit or
  delete**, which maps more cleanly onto a Keep/Revert UI than a one-shot revert.
- There is a **`snapshot`** field. **[verify]** whether it is a restorable
  checkpoint — if so, it supersedes the git-checkpoint scheme proposed in
  `vibe-coding-surface.md` §2 and simplifies it considerably.

### Permissions

```
Permission.Request = { id: "per…", sessionID, action, resources[],
                       save[], metadata, source, message }
Permission.Reply   = "once" | "always" | "reject"
```

- Reply: `POST /api/session/{sessionID}/permission/{requestID}/reply` — note the
  body is a bare **enum string**, not v1's `{ response, remember }`.
- Pending: `GET /api/permission/request`; remembered: `GET /api/permission/saved`.
- **CLI `--auto`** *"auto-approve permissions that are not explicitly denied"* —
  the sanctioned switch for autonomous operation, and the natural fit for the
  Code page's "autonomous, review after" model.

---

## 6. Other surface worth knowing

- **`/api/pty`, `/api/shell`** — v2 has native PTY and shell management. This
  parallels Qeda's own `pty/manager.ts`; decide deliberately whether to use
  opencode's PTY or keep Qeda's.
- **`/api/worktree`** (+ refresh) — git worktrees; relevant to isolated runs.
- **`/api/model`, `/api/model/default`, `/api/provider`** — model discovery, the
  replacement for v1's `config.providers`.
- **`/api/session/{id}/fork`** — session forking (matters if one Qeda session
  should map to many opencode sessions).
- `/api/agent`, `/api/command`, `/api/skill`, `/api/plugin`, `/api/mcp`,
  `/api/integration`, `/api/credential` (note: `/api/credential`, not `auth.set`).
- **`opencode acp`** — *"Start an Agent Client Protocol server"* (stdio JSON-RPC).
  This is a **purpose-built agent-client protocol** and a genuine architectural
  alternative to the HTTP API for this project. See §8.
- `opencode api <operation | method path>` — CLI that hits the running server
  using **OpenAPI operation IDs**. Handy for spikes and smoke tests.
- Observed session field: `model: { id: "space-bunny-free", providerID: "opencode",
  variant: "max" }`, `outcome: "succeeded"` — evidence that the `opencode`
  provider's free models **do work through the server**, consistent with the Zen
  free-tier finding in `docs/services-audit.md` §F4.

---

## 7. What this changes — do not use the npm SDK

Because no v2 SDK is published, the recommended client is a **thin typed client
over `/api/*`, with types generated from the runtime `/openapi.json`**.

That is strictly better here than depending on `@opencode-ai/sdk`:

- no version skew — the types come from the exact server we are talking to;
- **removes R6** (ESM-only SDK breaking the Jest load) and **R10** (ESM SDK
  bundled into the CJS main bundle) from both plans entirely;
- the spec is small enough to vendor a subset of types, or generate at build time;
- `opencode api` remains available for smoke tests without any client at all.

If SDK ergonomics are wanted later, revisit only once a v2 SDK ships.

---

## 8. Open items (the probe could not settle these)

1. **The event taxonomy.** Still the biggest gap — only `server.connected` was
   observed. Needs a real session in a throwaway repo.
2. **`Session.Revert.snapshot`** — is it a restorable checkpoint?
3. **Prompt async semantics** — how `delivery` / `resume` / the inbox interact,
   and which event signals completion.
4. **`POST /api/session` body** — in particular how `location.directory` is set.
5. **ACP vs HTTP API.** Whether to build on `opencode acp` instead of `/api/*`.
   ACP is purpose-built for agent clients (editors, IDEs); the HTTP API offers
   more surface (vcs, worktree, diff, pty). This is now a real architectural fork
   and deserves its own decision.

## Appendix — probe commands

```bash
# env: opencode v2.0.18, Node v26.8.2
opencode --version                       # v2.0.18
opencode service status                  # → http://127.0.0.1:49374
opencode serve --port 4097 --hostname 127.0.0.1   # prints "server password <pw>"
curl -u opencode:<pw> http://127.0.0.1:4097/api/info
curl -u opencode:<pw> http://127.0.0.1:4097/openapi.json -o openapi.json
curl -N -u opencode:<pw> -H 'Accept: text/event-stream' \
     http://127.0.0.1:4097/api/event | head
opencode api --help                      # OpenAPI operation IDs, --param, --data
```

The retrieved spec (~252 KB) lives at `/tmp/opencode-probe/openapi.json`. It is
not committed — regenerate it from a running server rather than checking in a
snapshot that will drift.
