# Persistence and recovery

**Phase:** 1
**Dependencies:** `document-model-v4.md` (P0-10)
**Master spec:** §11.1, §15
**Goal:** make a Motion project a folder on disk that survives crashes, schema
upgrades, and missing assets without silent data loss.

## Scope

In scope: bundle layout, SQLite index, atomic write protocol, sidecar recovery,
backups, lock, relocate, delete, duplicate, retention. Out of scope: cloud sync,
multiplayer, global asset library (see OQ-3/OQ-5).

## Source of truth

The **project bundle folder is the source of truth**. SQLite is an index. If the
database is deleted, the project list rebuilds by scanning
`<userData>/motion/projects/*/project.json`.

## Bundle layout

```
<userData>/motion/
  projects/<projectId>/
    project.json                 # canonical v4 document
    project.autosave.json        # sidecar; newer than canonical only during recovery
    project.lock                 # advisory lock
    editor-state.json            # view state; not portable
    backups/project-<revision>.json   # last 10
    assets/<assetId>/source.<ext>     # imported bytes
    assets/<assetId>/thumbnail.webp
    assets/<assetId>/waveform.json    # audio only
    renders/<timestamp>-<slug>.mp4
    .staging/<importId>/         # in-flight imports; 24h retention
    .trash/                      # deleted assets; 7 days
  templates/                    # read-only, shipped
  cache/thumbnails/, cache/fonts/
```

`projectId` is a ULID-ish id (`prj_...`), not a slug. Renaming changes
`meta.name`, not the folder.

## Index schema

Add to `MIGRATION_STATEMENTS` in `src/main/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS motion_projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL,
  scene_count    INTEGER NOT NULL DEFAULT 1,
  duration       REAL NOT NULL DEFAULT 0,
  width          INTEGER NOT NULL DEFAULT 1920,
  height         INTEGER NOT NULL DEFAULT 1080,
  fps            INTEGER NOT NULL DEFAULT 30,
  thumbnail_path TEXT,
  last_opened_at TEXT,
  updated_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  missing        INTEGER NOT NULL DEFAULT 0
);
```

New table → no `ALTER TABLE` back-fill needed now, but every column added later
does. Index is written on create/open/save/rename/duplicate/delete/rescan. It is
never the only record of anything. `missing = 1` means the folder was not found;
show the card greyed with "Locate…" rather than hiding it.

## Write protocol (normative order)

1. Acquire the project lock (`proper-lockfile` on the bundle dir: `stale: 30000`,
   `update: 5000`, `retries: 0`). Failure → "This project is open in another
   window."
2. Serialize deterministically (`serializeMotionDocument`: fixed key order, 2-space
   indent, trailing newline).
3. Compute SHA-256 over the UTF-8 bytes.
4. Write sidecar `project.autosave.json` atomically:
   `{ format: 1, revision, savedAt, sha256, document }`.
5. Write canonical `project.json` atomically (`write-file-atomic`, same dir).
6. Verify by reading the file back and comparing the hash.
7. Delete the sidecar (absence = "canonical is newest known good").
8. Release the lock.

Backups: before step 5, copy the current canonical to
`backups/project-<revision>.json` when any of: >5 min since last backup; revision
advanced >20; save follows a migration; save follows a destructive batch. Keep
newest 10. Never back up a document that failed validation.

Write queue: main serializes saves per `projectId` with an in-memory promise
chain. Two autosaves 40ms apart must not interleave.

Failure: sidecar stays, status chip shows "Save failed", editor keeps working,
retry on next change or `Cmd/Ctrl+S` with backoff.

## Crash recovery

On open, before the editor mounts:
- no sidecar → open canonical.
- `sidecar.revision == canonical.revision` → delete sidecar, open canonical.
- `sidecar.revision > canonical.revision` → offer recovery.
- `sidecar.revision < canonical.revision` → delete sidecar, open canonical.
- canonical missing/unparseable but sidecar valid → recovery is the only
  preserving path.

Recovery dialog: "Motion closed unexpectedly. Recover N unsaved changes from
HH:MM?" → Recover / Discard. Recover writes the sidecar through the normal
protocol with `revision = max(sidecar, canonical) + 1`. Discard deletes the
sidecar. Recovery never happens silently. If the sidecar fails validation, offer
"Download for inspection" instead of deleting.

## Concurrent access

- Lock is advisory, same machine/user only.
- Two windows of the same app opening the same project: lock prevents it; UI
  offers "Focus existing window."
- Network share: detect `EXDEV`/`EPERM`, fall back to write-temp-in-same-dir +
  rename; if that fails, warn and offer "Save a copy locally."
- Read-only folder: open read-only, disable autosave and export to that folder,
  show a banner. Never fail to open because saving is impossible.

## Corrupt / unreadable

- JSON parse error → error page, do not overwrite. Offer backups, "Open folder",
  "Duplicate for repair."
- Zod/validation error → same, show first 5 issues with paths.
- `schemaVersion > 4` → "made with a newer version"; refuse, offer "Open folder."
- Missing `project.json` → "Locate…"
- Missing assets → open normally, placeholders, export blocked. Not corruption.
- `meta.id` mismatch with folder name → open with warning; do not rename silently.
- "Duplicate for repair" copies `assets/` by hash into a new bundle with a fresh
  blank document. Never touches the original.

## Migration on open

- `schemaVersion < 4` → migrate in memory, open dirty, write a backup of the
  original before first save. Migration itself is not a save.
- Migration failure → error page with the migration error and backup path.
- `schemaVersion == 4` → open directly.
- No downgrade path; older builds refuse newer files.

## Moving / relocating

- Move folder in OS, then "Locate project folder". Main validates `project.json`
  exists and `meta.id` matches (or folder name). Updates index path, not the
  document.
- Rescan (app start, ≤1/24h, on demand) marks old path missing and shows
  "Locate…". No auto-match by name (names can collide).
- Duplicate: copy bundle, rewrite `meta.id`/`createdAt`/`updatedAt`, clear
  `renders/`, keep asset hashes.
- Delete: move to OS trash (`shell.trashItem`), not `rm -rf`. Remove index row
  only after trash succeeds.
- Import an existing bundle (Phase 2): copy into `projects/`, new id on
  collision.

## Retention

| Item | Retention | Trigger |
| --- | --- | --- |
| `project.autosave.json` | Until next successful save or recovery | Write protocol |
| `backups/` | Newest 10 | After each save |
| `.staging/` | 24h | App start |
| `.trash/` | 7 days | App start |
| `renders/` | Forever | User-owned |
| `render-jobs/` | 24h after completion | App start |
| `cache/thumbnails/` | Rebuildable; delete on demand | Settings |

Cleanup never runs during an export and never deletes a referenced file. When in
doubt, keep the file and log it.

## Editor state

`editor-state.json` stores camera orbit, zoom, timeline scroll, panel sizes,
active panel, last selection. Per user, not portable. Loss is annoying, not
destructive. Written debounced; never blocks save.

## Files to touch

- `src/main/motion/project-store.ts` — bundle CRUD, write protocol, lock,
  recovery.
- `src/main/motion/project-index.ts` — SQLite index, rescan.
- `src/main/motion/serialize.ts` — deterministic JSON + hash (Electron-free).
- `src/main/ipc/handlers/motion-projects.ts` — IPC.
- `src/main/db/schema.ts` — `motion_projects` table.
- `src/hooks/use-motion-project.ts` — load/save/recovery lifecycle.

## IPC channels (see `ipc-surface` brief)

`motion:list-projects`, `motion:create-project`, `motion:open-project`,
`motion:save-project`, `motion:rename-project`, `motion:duplicate-project`,
`motion:delete-project`, `motion:locate-project`, `motion:reveal-project`,
`motion:recover-project`, `motion:list-templates`, `motion:read-editor-state`,
`motion:write-editor-state`, `motion:changed`.

## Acceptance criteria

- Killing the app mid-edit and reopening offers recovery with the last change.
- A failed save leaves the editor usable and the sidecar intact.
- A save interrupted between sidecar and canonical recovers cleanly.
- Two saves 40ms apart produce one coherent file.
- Serializing the same document twice is byte-identical.
- Opening a v3 fixture migrates, marks dirty, writes a backup before saving.
- Opening a `schemaVersion: 5` file refuses and does not modify it.
- A read-only project opens, warns, and does not attempt to write.
- Deleting a project uses the OS trash and removes the index row only on
  success.
- The project list rebuilds correctly from folders with the database deleted.

## Tests

- `motion-store.test.ts` — no-op history, pending lifecycle.
- `motion-serialize.test.ts` — byte-identical round trip.
- New: `motion-project-store.test.ts` — write protocol, sidecar, recovery,
  lock, relocate (Electron-free where possible).
