# Presence — Professional Social Presence Coach

A new system (route `/presence`) that completes the Correspondence family: a manual, feedback-driven coach for professional social presence on LinkedIn and X/Twitter. It proposes post drafts, groups/pages to join, connection prompts, and engagement prompts; the user acts manually (copy to clipboard, open platform in the system browser) and reports back; the coach adapts from accumulated feedback. No autonomous posting — aligned with D2 (own the intent, not the delivery).

## Goal & scope

- Project-scoped coach. Suggestions generated per project from project context (outcome, contacts registry, documents, workspace pages, prior feedback).
- Four suggestion kinds: `post_draft`, `group_suggestion`, `connection_suggestion`, `engagement_prompt`.
- Manual posting: copy draft → open platform in system browser. No embedded browser, no OAuth, no API keys.
- Feedback capture: per item, status `pending | posted | skipped | edited` plus free-text feedback/outcome. Coach reads history on next generate.
- Persistent history across sessions (SQLite).
- Platforms v1: LinkedIn, X/Twitter (labels only; posting stays manual).

Out of scope v1: autonomous posting, embedded in-app browser, auto metric fetch, connection messaging via Correspondence (suggestions only), chat-agent tool exposure, engagement prompts requiring live platform data.

## Data model (src/main/db/schema.ts)

Add three tables and register in `MIGRATION_STATEMENTS`:

```sql
CREATE TABLE IF NOT EXISTS presence_batches (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  focus        TEXT NOT NULL DEFAULT '',
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_presence_batches_project
  ON presence_batches(project_id, created_at);

CREATE TABLE IF NOT EXISTS presence_items (
  id           TEXT PRIMARY KEY,
  batch_id     TEXT NOT NULL REFERENCES presence_batches(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK(kind IN ('post_draft','group_suggestion','connection_suggestion','engagement_prompt')),
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  platform     TEXT NOT NULL DEFAULT 'any' CHECK(platform IN ('linkedin','x','any')),
  source_kind  TEXT,
  source_id    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','skipped','edited')),
  feedback     TEXT NOT NULL DEFAULT '',
  outcome      TEXT NOT NULL DEFAULT '',
  posted_at    INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_presence_items_batch ON presence_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_presence_items_status ON presence_items(status);

CREATE TABLE IF NOT EXISTS presence_posts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  platform    TEXT NOT NULL CHECK(platform IN ('linkedin','x','any')),
  content     TEXT NOT NULL DEFAULT '',
  posted_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  metrics     TEXT NOT NULL DEFAULT '',
  item_id     TEXT REFERENCES presence_items(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_presence_posts_project ON presence_posts(project_id, posted_at);
```

No data migration needed (new tables only).

## IPC (src/main/ipc/channels.ts)

Add channels; broadcast `presence:changed` after every mutation:

- `presence:batches-list` req `{ projectId?: string | null } | void` res `PresenceBatch[]`
- `presence:batch-get` req `{ id }` res `PresenceBatchDetail | null`
- `presence:generate` req `{ projectId: string; focus?: string }` res `PresenceBatchDetail`
- `presence:item-update` req `{ id; patch: PresenceItemPatch }` res `PresenceItem | null`
- `presence:item-delete` req `{ id }` res `boolean`
- `presence:post-log` req `{ projectId; platform; content; metrics?; itemId? }` res `PresencePost`
- `presence:posts-list` req `{ projectId?: string | null } | void` res `PresencePost[]`
- `presence:counts` req `{ projectId?: string | null } | void` res `{ batches; pending; posted; skipped }`
- `presence:open-external` req `{ url: string }` res `boolean`

Type re-exports from `src/main/db/presence.ts`: `PresenceBatch`, `PresenceBatchDetail`, `PresenceItem`, `PresenceItemPatch`, `PresencePost`.

## Storage (src/main/db/presence.ts)

New module mirroring `db/correspondence.ts`: sync better-sqlite3, `getDb()`. Functions: `listBatches`, `getBatch` (batch + items), `createBatch`, `deleteBatch`; `listItems`, `getItem`, `updateItem`, `deleteItem`; `logPost`, `listPosts`; `counts`.

## AI (src/main/ai/presence-coach.ts)

Single `generateObject` call mirroring `task-copilot.ts`. Export `generatePresenceBatch(input: { projectId; focus?; context }) → { summary; items }`.

Schema:
```ts
z.object({
  summary: z.string(),
  items: z.array(z.object({
    kind: z.enum(['post_draft','group_suggestion','connection_suggestion','engagement_prompt']),
    title: z.string(),
    body: z.string(),
    platform: z.enum(['linkedin','x','any']),
    sourceKind: z.enum(['document','page','contact']).nullable(),
    sourceId: z.string().nullable(),
  })).min(3).max(8),
})
```

System prompt: professional presence coach; proposes, never posts; uses only provided context; mixes suggestion kinds; action-first. Context gathered in handler: project name/outcome/deadline, contacts (names+roles, top 20), document titles (top 20), page titles for project (top 20), last 10 presence items with status/feedback.

Model resolution via `resolveModel(settings.activeProvider, settings.activeModel)`; surface clear error if none.

## IPC handler (src/main/ipc/handlers/presence.ts)

`registerPresenceHandlers({ mainWindow })` implementing all channels above; `generate` gathers context, calls coach, persists batch + items, broadcasts, returns detail; `open-external` calls `shell.openExternal`. Register in `src/main/ipc/index.ts`.

## Hooks (src/hooks/use-presence.ts)

Mirror `use-correspondence.ts`: `usePresenceBatches(projectId)`, `usePresenceBatchDetail(id)`, `usePresenceCounts(projectId)`, `usePresencePosts(projectId)`, `usePresenceActions()` (generate, updateItem, deleteItem, logPost). Reads via `useDbResource` with `presence:changed`.

## UI

- `src/renderer/pages/Presence.tsx` — route `/presence`, project scope via `useProjectScope`. Header: "Generate suggestions" button (optional focus text), counts subtitle. Body: batches newest-first, each expands to cards. Empty state prompts generation (and harvest/docs if project empty).
- `src/components/presence/SuggestionCard.tsx` — kind badge, platform badge, title, editable body, source chip, actions: Copy (clipboard), Open platform (open-external), Mark posted/skipped/edited, feedback textarea, log outcome.
- Nav entry in `src/components/AppSidebar.tsx` (after Correspondence), route in `src/renderer/routes.tsx`.

## Verification

1. `bunx tsc --noEmit -p tsconfig.json`
2. `python3 scripts/verify-ipc-split.py`
3. `bun run build`
4. `bun test` (add `src/__tests__/presence-db.test.ts` using in-memory recipe; coach covered by manual smoke)
5. `bun run lint`

## Files touched

New: `src/lib/presence.ts` (optional labels), `src/main/db/presence.ts`, `src/main/ipc/handlers/presence.ts`, `src/main/ai/presence-coach.ts`, `src/hooks/use-presence.ts`, `src/components/presence/SuggestionCard.tsx`, `src/renderer/pages/Presence.tsx`, `src/__tests__/presence-db.test.ts`.
Edited: `src/main/db/schema.ts`, `src/main/ipc/channels.ts`, `src/main/ipc/index.ts`, `src/renderer/routes.tsx`, `src/components/AppSidebar.tsx`.

## Open questions

- Whether to expose `presence:generate` as a chat-agent tool (deferred; add in a follow-up if users want conversational triggering).
- Whether engagement prompts should be gated behind "posted item older than N days" logic in the coach prompt (v1 relies on prompt + history; no hard gate).
