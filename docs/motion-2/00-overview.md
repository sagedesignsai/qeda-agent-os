# Motion 2.0 — Implementation Document Index

This folder breaks the master spec (`docs/motion-2-spec.md`) into self-contained
implementation briefs. Each document is scoped to one feature or workstream and
is written so a single coding agent can take it, implement it, and verify it
without reading the whole master spec.

## How to use these documents

1. Read **this file** first.
2. Read the document for the feature you are implementing.
3. The master spec remains the **source of truth** for any ambiguity. When a brief
   and the spec disagree, the spec wins and the brief is a bug — fix the brief.
4. Each brief lists its **dependencies** (other briefs that must land first) and
   its **exit criteria**. Do not start a brief whose dependencies are unmet.
5. Each brief includes the **concrete types, invariants, and file paths** it
   needs. Do not invent new shapes; if a type is missing, add it to the brief
   and the spec together.

## Shared conventions (apply to every brief)

- **Bun is the only package manager.** `bun install`, `bun run build`,
  `bun test`, `bun run lint`.
- **`bun run build` must succeed before `bun test`** — `check-build-exists.ts`
  is a hard guard.
- **No `typecheck` script.** Use `bunx tsc --noEmit -p tsconfig.json`.
- **IPC channels live in `src/main/ipc/channels.ts`** only. Run
  `python3 scripts/verify-ipc-split.py` after touching IPC.
- **Database changes** need both a `CREATE TABLE` and an `ALTER TABLE … ADD
  COLUMN` guard in `applyMigrations` (see `AGENTS.md`).
- **Native modules** go in `release/app/package.json`, not the root manifest.
- **New top-level `src/` directories** need a `@source` line in
  `src/renderer/index.css`.
- **ESM-only packages** need a mock in `.erb/mocks/` and a `moduleNameMapper`
  entry in `jest.config.js`.
- **Renderer never imports Node or Electron** — everything goes through the
  `contextBridge` surface in `src/main/preload.ts`.
- **Import renderer-facing domain types from `@/main/ipc/channels`**, not
  `db/*`.
- **Every document change goes through an op.** No UI path mutates the document
  directly.
- **Time is stored in seconds everywhere.** `fps` is applied only at
  UI/render boundaries.
- **Use semantic design tokens**, not raw palette ramps.
- **No type-only imports without `import type` / `export type`** — `isolatedModules`
  is on.
- **Commit messages follow conventional commits** (`feat:`, `fix:`, …).

## Reading order for a full implementation

```
00-overview.md
  → phase-0-foundation.md
  → document-model-v4.md
  → persistence.md
  → assets.md
  → scenes-and-nodes.md
  → inspector-and-hierarchy.md
  → timeline.md
  → op-contract-v2.md
  → templates-and-browser.md
  → export-pipeline.md
  → color-and-text.md
  → gltf-and-environments.md
  → audio-and-sequence.md
  → copilot-tools.md
  → copilot-ui.md
  → runtime-state-machines.md
  → testing-and-qa.md
```

## Document list

| # | File | Phase | Feature |
| --- | --- | --- | --- |
| 00 | `00-overview.md` | — | This index and shared conventions |
| 01 | `phase-0-foundation.md` | 0 | Fix the 10 blocking defects before any feature work |
| 02 | `document-model-v4.md` | 0/1 | v4 types, schema, invariants, migration |
| 03 | `persistence.md` | 1 | Bundle layout, index, write protocol, recovery |
| 04 | `assets.md` | 1 | Import, resolution, relink, GC |
| 05 | `scenes-and-nodes.md` | 1 | Multi-scene, node registry v2, new node types |
| 06 | `inspector-and-hierarchy.md` | 1 | Generated inspector, dnd, viewport gizmos |
| 07 | `timeline.md` | 1 | Trim, split, snapping, work area, keys |
| 08 | `op-contract-v2.md` | 1.5 | Ops v2, plan/apply, diff, guards, manifest |
| 09 | `templates-and-browser.md` | 1 | Routes, browser, templates, first-run UX |
| 10 | `export-pipeline.md` | 1/2 | Hidden render window, Mediabunny, preflight |
| 11 | `color-and-text.md` | 1/2 | troika text, color management |
| 12 | `gltf-and-environments.md` | 2 | glTF import, animations, HDR/EXR |
| 13 | `audio-and-sequence.md` | 2 | Audio placements, master sequence |
| 14 | `copilot-tools.md` | 1.5 | Tool contract, context, lint, recipes |
| 15 | `copilot-ui.md` | 3 | Drawer, plan cards, streaming |
| 16 | `runtime-state-machines.md` | 4 | State machines, interactive runtime |
| 17 | `testing-and-qa.md` | all | Test strategy, golden, export smoke, matrix |

## Cross-cutting invariants (every implementation must respect)

- A Motion project is a deterministic, versioned document. The editor is a view
  over it. The copilot is a client of the same op registry. The renderer is a
  pure function of `(document, time)`.
- Every persistent edit is an op. There is no UI path that mutates the document
  directly.
- A copilot plan is previewable, diffable, and rejectable. “Apply” is always a
  user action.
- A project survives a crash, a schema upgrade, and a missing asset without
  silent data loss.
- The document is renderer-independent: `src/lib/motion` stays free of React,
  Electron, DOM, and WebGL.

## Where things live (paths that will mislead you)

See `AGENTS.md` “Layout — the paths will mislead you.” In particular:

- `src/renderer/components/` contains only `AppLayout.tsx`. Everything else is
  `src/components/*`.
- `src/components/ui/**` is vendored shadcn — do not hand-edit.
- `src/main/pty/` and `src/main/db/` are where their handlers live, not
  `src/main/ipc/handlers/`.
- The renderer's Vite root is `src/renderer`, but the `@/*` alias points at
  `src/*`.

## Master spec section map

| Brief | Master spec sections |
| --- | --- |
| `phase-0-foundation.md` | §3.2, §3.4 |
| `document-model-v4.md` | §6.1–§6.12 |
| `persistence.md` | §11.1, §15 |
| `assets.md` | §6.7, §11.2–§11.9 |
| `scenes-and-nodes.md` | §6.6, §8.1–§8.4 |
| `inspector-and-hierarchy.md` | §8.5, §10.4–§10.5 |
| `timeline.md` | §6.5, §9 |
| `op-contract-v2.md` | §14 |
| `templates-and-browser.md` | §5, §10.1–§10.3, §10.7–§10.14 |
| `export-pipeline.md` | §7.5–§7.9, §12 |
| `color-and-text.md` | §8.4 (text), §7.7, §11.3 |
| `gltf-and-environments.md` | §8.4 (model), §6.7 (model/environment), §11.2 |
| `audio-and-sequence.md` | §6.9, §9.7, §12.7–§12.8 |
| `copilot-tools.md` | §13.1–§13.6, §13.8–§13.10 |
| `copilot-ui.md` | §5.3, §13.7 |
| `runtime-state-machines.md` | §6.10, §7.4 |
| `testing-and-qa.md` | §18 |

## Status

All documents are derived from `docs/motion-2-spec.md` (last updated 2026-10-30).
When the spec changes, update the affected briefs in the same commit.
