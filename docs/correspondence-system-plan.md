# Correspondence — Development Plan

A ninth system for Qeda: external communication with people and institutions, tracked
per recipient. Working label was "Relay"; the system is **Correspondence** and the route
is `/correspondence`. "Relay" survives only as the internal shorthand.

Status: in progress. Phase 0 shipped; Phases 1–6 are the build order. This document is
also the decision record.

---

## 1. Decision record

Five decisions closed before any code. Each one is a scope door that stays shut for v1.

**D1 — Flagship system, not a standalone product.** Correspondence ships as the ninth
system inside Qeda. Consequences: no jurisdiction-content treadmill (no statutory form
library, no deemed-service rules, no weekly upkeep against a government site), no billing,
no accounts. The commercial version is deferred, not designed out — see §9.

**D2 — Own the intent, not the delivery.** v1 never sends anything. It records what was
sent, to whom, when, with what attachments, and what happened next. The state machine is
the product; transport is a replaceable edge. Rationale: two of the seven channels in the
founding use case (phone, postal) are manual anyway, so the manual path is load-bearing
rather than a fallback — and it means the system is fully useful before any credential,
OAuth flow, or deliverability concern exists.

**D3 — Per-recipient state is the centre of the interface.** One message fanned to N
bodies, each with an independent clock. This is the thing no CRM does and the reason the
kanban metaphor was rejected. Every screen is arranged around it.

**D4 — AI proposes; deterministic code moves state and sends.** No agent mutates a clock,
approves a dispatch, or catches up a stalled sequence. Agents fill gaps the user reviews
(Harvest), classify inbound (which the user confirms), and draft into templates. The
runner is fixed and replayable — the same shape `research_runs` already uses.

**D5 — Deadline class exists in v1; deadline content does not.** A missed 14-day statutory
notice and a missed "call them back Tuesday" are not the same event and must not share a
visual treatment. The field (`statutory | contractual | tactical`) costs one column. The
jurisdiction packs that would populate it automatically are deferred.

Explicit non-goals for v1: real outbound sending, inbound mail ingestion, multi-user or
shared teams, the marketing/broadcast flavour, background execution that survives an app
restart, and jurisdiction content.

---

## 2. What exists that this composes

Verified against the tree, not assumed.

| Need | Already present |
| --- | --- |
| Content to send | `documents` table + `db/documents.ts` + `handlers/documents.ts` (project-scoped) |
| Content extraction source | `blocks` / `pages` / `notebooks` via `db/workspace.ts` |
| Task creation for escalations | `tools/tasks.ts` → `createTask` / `createSteps` in `db/tasks.ts`, `db/task-steps.ts` |
| Read-cache pattern | `hooks/use-db-resource.ts` (channel + invalidation event, no writer) |
| Credentials & transport (v2) | `services/registry.ts` + `keys.ts` + `http.ts`, `ServiceCategory` union |
| Agent loop | `ai/agent.ts` `ToolLoopAgent`, `tools/index.ts` `allTools`, `ai/document-drafter-agent.ts` |
| Tool approval | `tools/capability.ts` + `tools/policies/*.ts` |
| Structured extraction | `generateObject` + `zod`, the pattern in `handlers/documents.ts` |
| Route + nav shell | `renderer/routes.tsx`, `NAV_ITEMS` in `components/AppSidebar.tsx` |
| DB tests | in-memory recipe in `__tests__/projects-db.test.ts` |

One gap, and it is a prerequisite rather than a nice-to-have: **the notebook layer is not
project-scoped.** `pages`, `blocks`, `notebooks` and `research_runs` have no `project_id`.
Harvest's primary input is a notebook page, so the adoption path reads from the one part of
the app that a project cannot see. This is live today — in the founding project,
`projects.notebook_id` is NULL while the research output exists in a notebook nobody linked.

---

## 3. Data model

New tables go in `src/main/db/schema.ts` as data — exported `CREATE_*` constants appended to
`MIGRATION_STATEMENTS` — so tests can apply them to an in-memory database. Ids are `nanoid`
(`TEXT`). Timestamps are `INTEGER` unix seconds with `unixepoch()` defaults, matching every
other table.

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'organisation'
              CHECK(kind IN ('organisation','person')),
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',   -- 'HR Manager', 'Trustee'
  parent_id   TEXT REFERENCES contacts(id) ON DELETE SET NULL,  -- person → organisation
  notes       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contacts_project ON contacts(project_id);

CREATE TABLE IF NOT EXISTS contact_channels (
  id           TEXT PRIMARY KEY,
  contact_id   TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL
               CHECK(kind IN ('email','phone','portal','postal','social','manual')),
  value        TEXT NOT NULL,          -- address, number, URL, or a postal line
  label        TEXT NOT NULL DEFAULT '',
  verified     TEXT NOT NULL DEFAULT 'unverified'
               CHECK(verified IN ('unverified','verified','bounced')),
  verified_at  INTEGER,
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK(source IN ('manual','harvest','import')),
  confidence   REAL,                   -- harvest only; NULL for typed values
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contact_channels_contact ON contact_channels(contact_id);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, updated_at);

CREATE TABLE IF NOT EXISTS message_attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK(kind IN ('document','file')),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  path        TEXT,                    -- repo-relative file, for kind='file'
  label       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);

-- The per-recipient state machine. This table is the system.
CREATE TABLE IF NOT EXISTS message_recipients (
  id                  TEXT PRIMARY KEY,
  message_id          TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  contact_id          TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id          TEXT REFERENCES contact_channels(id) ON DELETE SET NULL,
  channel_kind        TEXT NOT NULL DEFAULT 'manual'
                      CHECK(channel_kind IN ('email','phone','portal','postal','social','manual')),
  dispatch_state      TEXT NOT NULL DEFAULT 'queued'
                      CHECK(dispatch_state IN ('queued','sent','failed','withdrawn')),
  reply_state         TEXT NOT NULL DEFAULT 'awaiting'
                      CHECK(reply_state IN ('awaiting','replied','no_response','not_expected')),
  sent_at             INTEGER,
  replied_at          INTEGER,
  response_due_at     INTEGER,          -- absolute unix seconds; NULL = no clock
  deadline_class      TEXT NOT NULL DEFAULT 'tactical'
                      CHECK(deadline_class IN ('statutory','contractual','tactical')),
  external_ref        TEXT NOT NULL DEFAULT '',   -- reference / tracking number
  notes               TEXT NOT NULL DEFAULT '',
  escalation_task_id  TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_recipients_message ON message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_contact ON message_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_recipients_due     ON message_recipients(response_due_at)
  WHERE response_due_at IS NOT NULL AND reply_state = 'awaiting';

CREATE TABLE IF NOT EXISTS correspondence_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  recipient_id TEXT REFERENCES message_recipients(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,   -- dispatched | replied | no_response | escalated | note
  detail       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_correspondence_events_target
  ON correspondence_events(recipient_id, created_at);
```

Two design notes. `correspondence_events` is append-only from day one and is what a v2
hash-chain would run over (§9) — adding the chain later then does not require backfilling
history, only adding columns. `dispatch_state` deliberately has no `delivered`: v1 cannot
observe delivery, and a state the system cannot verify is a lie in the UI.

### Prerequisite migrations (Phase 0)

1. **`pages.project_id`, `notebooks.project_id`, `research_runs.project_id`** — nullable,
   `REFERENCES projects(id) ON DELETE SET NULL`, plus `ALTER TABLE … ADD COLUMN` guards in
   `applyMigrations` for existing databases. Nullable project as an optional lens, exactly as
   the rest of the schema does it. This is worth doing independently of this system.
2. **Backfill for orphaned research** — a `DATA_MIGRATIONS` entry that sets
   `pages.project_id` from `projects.notebook_id` where they disagree, converging to a no-op.
   This is what reconnects the founding project to its 109-block notebook.
3. No change to `tasks`. The escalation back-reference lives on
   `message_recipients.escalation_task_id`, so the link sits where it is read.

---

## 4. IPC surface

New channel prefix `correspondence:`. Entries are added to the `IpcChannels` map in
`src/main/ipc/channels.ts` with a doc comment each, and the domain types are re-exported
with `export type { … }` so the renderer never imports from `db/*` (and so
`isolatedModules` does not elide them).

Handlers live in **one** new module, `src/main/ipc/handlers/correspondence.ts`, registered
from `src/main/ipc/index.ts`. It takes `{ mainWindow }` because it broadcasts.

| Channel | req | res |
| --- | --- | --- |
| `correspondence:contacts-list` | `{ projectId?: string \| null }` | `ContactWithChannels[]` |
| `correspondence:contact-save` | `{ id?, projectId?, kind, name, role?, parentId?, notes? }` | `ContactWithChannels` |
| `correspondence:contact-delete` | `{ id }` | `boolean` |
| `correspondence:channel-save` | `{ id?, contactId, kind, value, label? }` | `ContactChannel` |
| `correspondence:channel-delete` | `{ id }` | `boolean` |
| `correspondence:channel-set-verified` | `{ id, verified }` | `ContactChannel` |
| `correspondence:harvest-scan` | `{ source }` — a page id, document id, repo file path, or pasted text | `HarvestProposal` (read-only, writes nothing) |
| `correspondence:harvest-import` | `{ projectId, rows: HarvestRow[] }` (the user-edited grid) | `{ created: number; contacts: ContactWithChannels[] }` |
| `correspondence:messages-list` | `{ projectId?: string \| null }` | `MessageSummary[]` |
| `correspondence:message-get` | `{ id }` | `MessageDetail \| null` |
| `correspondence:message-save` | `{ id?, projectId?, subject?, body?, attachments? }` | `MessageDetail` |
| `correspondence:message-dispatch` | `{ messageId, recipientIds, sentAt?, dueAt?, deadlineClass? }` | `MessageDetail` |
| `correspondence:recipient-update` | `{ id, patch }` — log a reply, record a reference, mark no-response | `MessageRecipient` |
| `correspondence:recipient-escalate` | `{ recipientIds }` | `{ taskIds: string[] }` |
| `correspondence:attention-list` | `{ projectId?: string \| null }` | `AttentionItem[]` |
| `correspondence:rollup` | `{ projectId }` | `CorrespondenceRollup` |
| `correspondence:changed` | *(event, no req/res)* | — |

`message-dispatch` is the whole "send" verb in v1: it stamps `sent_at`, computes
`response_due_at` from an explicitly chosen deadline class, writes `queued → sent`, appends
a `dispatched` event per recipient, and broadcasts. It does not perform transport.

Renderer access is unchanged — `window.electron.ipc.invoke` is generic, so **no preload
edit is needed**. That is worth stating because it is the one place people assume work is
required.

---

## 5. File manifest

New files

```
src/lib/correspondence.ts            pure: clock math, deadline classes, attention ranking, dedup keys
src/lib/harvest.ts                   pure: deterministic extraction (orgs, emails, phones) + scoring
src/main/db/correspondence.ts        storage: contacts, channels, messages, recipients, events
src/main/ipc/handlers/correspondence.ts
src/main/tools/correspondence.ts     agent verbs (propose-only; no dispatch tool)
src/main/tools/policies/correspondence.ts
src/hooks/use-correspondence.ts      reads via use-db-resource; writes via invoke
src/components/correspondence/       CorrespondencePage, AttentionBoard, DeadlineRail,
                                     RecipientLane, HarvestReviewGrid, MessageComposer,
                                     ContactList, ContactDetail
src/renderer/pages/Correspondence.tsx
src/__tests__/correspondence-db.test.ts
src/__tests__/correspondence-lib.test.ts
src/__tests__/harvest.test.ts
src/__tests__/correspondence-attention.test.tsx
```

Edited files

```
src/main/db/schema.ts                new tables in MIGRATION_STATEMENTS; Phase 0 column guards
src/main/ipc/channels.ts             channels + type re-exports
src/main/ipc/index.ts                register the new handler module
src/main/tools/index.ts              export correspondenceTools
src/main/tools/policies/*.ts         add the correspondence verbs to the agents that get them
src/renderer/routes.tsx              /correspondence, /correspondence/contacts/:contactId,
                                     /correspondence/messages/:messageId
src/components/AppSidebar.tsx        NAV_ITEMS entry after Tasks
src/main/db/projects.ts + channels.ts   correspondence counts in the project rollup/overview
src/renderer/index.css               only if a new top-level dir under src/ is ever added
```

`src/lib`, `src/hooks`, `src/components` are all already registered as Tailwind sources, so
no `@source` line changes — provided nothing new is created directly under `src/`.

---

## 6. Build order

Phases are ordered so each one is independently useful and each one de-risks the next.

### Phase 0 — Foundations (0.5 day)

Project-scope the notebook layer, fix the founding project's broken link, add the nav entry
and an empty route.

Deliverable: `pages`/`notebooks`/`research_runs` carry a nullable `project_id`; migration
backfills from `projects.notebook_id`; `/correspondence` renders a real empty state from the
sidebar.

Accept: `correspondence-db.test.ts` (or the existing projects test) proves on an in-memory DB
that a page written before the change acquires its project; the founding project's notebook is
reachable from the project page.

### Phase 1 — Contacts and Harvest (3–4 days)

The adoption cliff, closed. `correspondence:harvest-scan` returns proposals without writing;
`HarvestReviewGrid` shows an editable grid where low-confidence rows tint, inferred values
wear a NEW chip, duplicates offer one-click merge, and nothing is written until
`harvest-import`.

Two-stage extraction, both grounded: deterministic scanning in `src/lib/harvest.ts` (emails,
phone numbers, postal lines, organisation shaping) as the baseline that always runs, then an
optional `generateObject` + `zod` pass in the handler for organisation naming and
classification, the same pattern `handlers/documents.ts` already uses. Every row carries
`confidence`; the agent never sets `verified`.

Accept: pointing at the founding project's stakeholder notebook page yields the seven
organisations with their emails and phones as *proposals*; editing a cell then importing
writes exactly the edited values; a second import of the same page does not duplicate the
contacts.

### Phase 2 — Messages, recipients, and the Attention view (4–5 days)

The system becomes legible. Compose a message from a Document (attachment via
`message_attachments`), pick N recipients, dispatch, and watch N lanes diverge. `AttentionBoard`
is the landing screen and is built entirely around what is stuck; `DeadlineRail` is the time
axis with "now" as a vertical rule, one tick per live clock, and overdue ticks overshooting
into a band above the calendar. Deadline class drives the visual weight — statutory clocks
read differently from tactical ones.

Empty state is a single hero pointing at Harvest, never an "Add contact" form.

Accept: the founding project's Letter of Demand is attached to one message, dispatched to
seven contacts, and the board shows seven independent clocks ranked by overshoot; a statutory
deadline is visually distinguishable from a tactical one in a component test.

### Phase 3 — Reply capture and escalation (1.5–2 days)

The inbound half, human-confirmed. Logging a reply stops that recipient's clock and records
the event. Two attention sources over time: `awaiting` past `response_due_at`, and `awaiting`
with no clock at all (which is its own defect the board surfaces rather than hides).
`recipient-escalate` creates tasks through the existing task store and writes
`escalation_task_id` back per recipient.

Accept: marking one of seven as replied stops only that clock; escalating the non-responders
creates exactly one task per recipient, linked back, with no duplicates on re-run.

### Phase 4 — Sequences, session-scoped (3–4 days)

Ordered steps with waits and branches: send → wait 14d → branch replied/no reply → escalate.
`sequence_runs` mirrors `research_runs`: a fixed protocol the agent drives with tool calls,
executed while the user is present.

Deliberately **not** in this phase: surviving an app restart. Store `not_before` as an absolute
timestamp, never a duration, so the model is already restart-correct; the runner refuses to
auto-fire a step whose window has passed and raises a single "Stalled — N steps missed their
window" item with preview-before-catch-up. Every fired step records its lateness. This is the
one place where the honest scope line matters most, so it is a Phase 6 decision, not a hidden
assumption.

Accept: a three-step sequence runs to completion in one session; a step whose window passed
while the app was closed produces a stall item and does not fire.

### Phase 5 — Project integration (1 day)

Correspondence counts into `ProjectRollup` / `ProjectOverview`; the project page shows
open threads and the nearest statutory deadline; the Documents screen gains a "Send this…"
action that creates a message with that document attached — the entry point most people will
actually use. `PageHeader` has one action row and an overflowing screen is expected to
collapse surplus commands into `components/OverflowMenu`, so this is a header action rather
than a per-row menu. Only Chat, Tasks, Projects and Studio use `OverflowMenu` today;
Documents renders its header actions inline, so it will want one here.

Accept: the founding project's detail view shows its outstanding correspondence without
hardcoding.

### Phase 6 — Transport (5–8 days, gated on real use)

Only after Phases 1–5 have been used. A new `ServiceCategory` member plus entries in
`services/registry.ts` (SMTP/Resend for email, an OAuth provider, later a social adapter), an
outbox with per-recipient `dispatch_state` fan-out, and an explicit per-sequence send opt-in
— because a scheduled 3am dispatch is not an `ipcMain.handle` with the user sitting in front
of it. Deliverability work (SPF/DKIM/DMARC, bounce handling) is the real cost, not the plumbing.

v1 through Phase 5 is the deliverable that matters: roughly 12–16 focused days.

---

## 7. AI integration, made concrete

Fixed split, from D4.

| Surface | Autonomy | Where |
| --- | --- | --- |
| Harvest extraction | Proposes rows into a grid the user edits | `harvest-scan` + `HarvestReviewGrid` |
| Reply classification (substantive / acknowledgement / rejection / wrong-department) | Proposes a state into Attention; never applies it | `classifyReply` tool + Phase 3 |
| Deadline extraction from an inbound letter | Proposes a date and a class; user confirms | Phase 3 |
| Escalation drafting | Proposes the branch and the draft | Phase 4 |
| Task creation from a sequence step | Auto-fires | existing `createTask` |
| Dispatch | **Never** agent-initiated, in any phase | no dispatch tool exists |

The correspondence tool set is therefore `listContacts`, `harvestContacts` (read),
`createContact`, `draftMessage`, `logOutreach` (write-local, additive) and `classifyReply`
(network, cost). Because the verbs are additive, they take no approval override; because no
dispatch verb exists, an agent physically cannot send. That is a stronger guarantee than a
policy flag, and it is the reason the surface is defined as verbs and not as a permission.

Where AI is actively harmful and the plan forbids it: mutating a clock, applying a
classification on its own, catching up a stalled sequence, generating procedural content
with no source, and making the runner agentic. `research_runs` shows the right shape — the
agent calls a fixed protocol, it does not invent one.

---

## 8. Verification

Per phase, in order:

```bash
npx tsc --noEmit -p tsconfig.json          # there is no typecheck script
python3 scripts/verify-ipc-split.py        # after any channels.ts / handlers change
npm run build                              # REQUIRED before npm test (build-exists guard)
npm test
npm run lint
```

- Pure logic is tested without Electron: `src/lib/correspondence.ts` and
  `src/lib/harvest.ts` take plain data in and return plain data, so clock math, ranking and
  extraction are unit-testable directly.
- Storage is tested with the in-memory recipe from `__tests__/projects-db.test.ts`
  (`new Database(':memory:')` → `foreign_keys = ON` → `applyMigrations` → `useTestDatabase`).
- Component tests use `fireEvent` (not `userEvent`) and import
  `'@testing-library/jest-dom'` at the top.
- Manual acceptance for each phase is stated in §6 and is checked through the real UI, not
  through the IPC handler alone.

---

## 9. Deferred, and what would reverse each decision

| Deferred | Reverse when | Cost to add |
| --- | --- | --- |
| Real transport (§6 Phase 6) | A channel is used daily and typing "sent" is the bottleneck | New service entries + outbox; plumbing small, deliverability large |
| Jurisdiction packs (D5, D1) | Correspondence is monetised as its own product | Content + a `jurisdiction_id` on sequences and a form-template table |
| Broadcast/marketing flavour | Audience outreach is the actual job, not a side use | Second sequence flavour sharing the tables; needs its own publishing surface and analytics |
| Hash-chained evidence log | An exported bundle must be *provable* rather than asserted | Add columns to `correspondence_events` and chain on append; no backfill |
| Multi-user / teams | Never cheaply | Sync is a different project; local single-user SQLite cannot be retrofitted by degrees |

The hash-chain row is the one worth doing early if any use of this system is legal — which,
given the founding project, it is.

---

## 10. Build log

### Phase 0 — shipped

Project-scoped the knowledge layer, and the migration that repairs databases which
already contain disconnected knowledge.

Shipped: `project_id` on `notebooks`, `pages` and `research_runs`; `ALTER TABLE` guards
for existing databases; `MIGRATE_PROJECT_SCOPE_KNOWLEDGE` (fills NULLs only, converges);
`/correspondence` route, rail entry and first-run empty state.

Three things the implementation settled that this document had left open:

1. **`pages.project_id` and `research_runs.project_id` are derived, never passed in.**
   `createPage` inherits its notebook's owner and `createResearchRun` resolves it through
   `resolveKnowledgeProjectId`, so a page cannot be filed into a project its notebook does
   not belong to. The only writers of the copies are `syncNotebookScope` (notebook side)
   and `linkNotebookToProject` (project side).
2. **An index on a back-filled column cannot live in the `CREATE TABLE` statement.**
   `CREATE TABLE IF NOT EXISTS` is a no-op on an existing database, so
   `CREATE INDEX ... (project_id)` there throws `no such column`, which aborts
   `applyMigrations` before the `ALTER TABLE` guards can run — every existing install
   fails to launch. The index is created after the guards instead. This applies to any
   column added after a table first ships, and it is why the plan's "two edits" rule has a
   third: DDL, column guard, and index placement.
3. **Linking a notebook adopts what is already inside it.** `createProject`/`updateProject`
   move the copies in both directions, so picking a notebook in the project dialog is the
   repair path for an already-written notebook whose project link was never set.

Still open, deliberately: `notebooks:create` has no `projectId`, so a notebook created from
Knowledge lands unscoped and is scoped later by linking it to a project. Phase 1 adds the
argument where Harvest creates a notebook on a project's behalf.

### Phase 1 — shipped

The registry and Harvest.

Shipped: `contacts` + `contact_channels`; `src/lib/correspondence.ts` (channel
vocabulary, canonicalisation, dedup keys); `src/lib/harvest.ts` (deterministic scanner
plus `mergeAgentRows`); `db/correspondence.ts` (CRUD, per-channel verification, one
transactional import); the `correspondence:*` IPC contract and handler module; the
Harvest sheet, review grid and contact list.

Three decisions the implementation made that this document had not:

1. **Harvest is deterministic first, model second — and the model may only add.**
   The scanner reads lines with no model involved, so its output can only contain text
   that is present; `mergeAgentRows` refuses to overwrite a value the text contained and
   marks everything it adds `inferred` (the NEW chip). A failed model pass returns the
   deterministic scan with `agentError` set, so an unconfigured provider degrades the
   feature to "less thorough" rather than to "invented".
2. **Confidence is shown as dashed, not as a colour.** The design system has no warning
   token and using `destructive` for "probably fine, just check it" would overstate the
   risk. Dashed borders already mean "attached but not confirmed" in this codebase
   (`DocumentDrafterSheet`), so low-confidence rows and cells use that.
3. **The harvest flow is three steps with no shortcut.** Scan (writes nothing) → review
   (local state) → import (the only write). `harvest-import` takes the *edited* rows, so
   there is no code path where extractor output reaches the database unreviewed.

Not built, and labelled as such in the UI rather than shown as a dead button: spreadsheet
import. `notebooks:create` still has no `projectId`, so a notebook created from Knowledge
lands unscoped.

### Phase 2 — shipped

The system became usable end to end: harvest a registry, compose one item, send it to
N bodies, watch N clocks diverge.

Shipped: `messages` / `message_attachments` / `message_recipients` /
`correspondence_events`; the clock model in `lib/correspondence.ts` (`clockStateFor`,
`attentionQueue`, deadline classes and windows); `db/messages.ts`; the message, clock and
attention IPC reads; the Deadline Rail, recipient lanes, attention board and composer.

Four decisions the implementation added:

1. **"Send" is called "Record as sent" in the UI.** Same verb, honest label: the app
   stamps the date and starts the clocks, and the footer says plainly that Qeda does not
   deliver. Also present: `reply_state = 'not_expected'`, so a filing (an IRP5 correction
   to SARS) is not modelled as an unanswered letter waiting to go overdue.
2. **A sent item with no deadline is its own state, not a missing field.** `no-clock`
   surfaces at the top of the board as a defect — "sent with no deadline set" — because
   silently having no reminder is precisely the failure this system exists to prevent.
3. **Three of four lanes' verbs are always visible,** not in an overflow menu. The working
   vocabulary is small (replied, no response, move the date, stop watching) and hiding it
   behind a menu in a list of lanes turns the point of the product into a scavenger hunt.
4. **Two surfaces, not a kanban.** Board (rail → stall notice → needs you → sent log) and
   Contacts. A card board would say the user's job is moving cards; their job is waiting,
   watching, and acting on exactly the parties that need it.

Deferred within this phase, deliberately: escalation into tasks (Phase 3) and any
notification when a clock closes while the app is closed (Phase 4's stall handling).

---

## 11. First commit

Phase 0 only, all of it small and independently reviewable:

1. Add `project_id` to `CREATE_PAGES`, `CREATE_NOTEBOOKS`, `CREATE_RESEARCH_RUNS` in
   `schema.ts` plus the three `ALTER TABLE … ADD COLUMN` guards in `applyMigrations`.
2. Add the backfill `DATA_MIGRATION` that adopts orphaned pages into their project via
   `projects.notebook_id`.
3. Extend the DB test to prove a pre-existing page acquires its project.
4. Add the `/correspondence` route and the `NAV_ITEMS` entry, rendering the empty state.
