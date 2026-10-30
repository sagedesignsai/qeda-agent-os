# Templates and browser

**Phase:** 1
**Dependencies:** `persistence.md`, `assets.md`, `scenes-and-nodes.md`
**Master spec:** §5, §10.1–§10.3, §10.7–§10.14
**Goal:** the front door of Motion — a project browser, a template gallery, and
the first-run experience that gets a no-code user to a finished video.

## Routes

`MemoryRouter` (router never changes `window.location`). Read params with
`useSearchParams`.

| Route | Screen |
| --- | --- |
| `/motion` | Project browser |
| `/motion/templates` | Template gallery (or a tab inside `/motion`) |
| `/motion/settings` | Motion preferences |
| `/motion/:projectId` | Editor |
| `/motion/:projectId?scene=<id>` | Editor, specific scene |
| `/motion/:projectId?panel=copilot` | Editor, copilot open |

Route tree:
```tsx
{
  path: 'motion',
  children: [
    { index: true, element: <MotionBrowser /> },
    { path: 'templates', element: <MotionTemplates /> },
    { path: 'settings', element: <MotionSettings /> },
    { path: ':projectId', element: <MotionEditorPage /> },
  ],
}
```

Static routes before the dynamic `:projectId`.

## Project browser

Header: "Motion", project count, search, sort, view toggle (grid/list), "New
project." Hero row: "Start from a template" with 3–4 large cards. Project grid:
thumbnail (last rendered frame or scene poster), name, duration, resolution,
last edited, scene count.

Empty state: a single large "Create your first motion" card with a 20-second
silent loop showing what the tool does, plus "Start from template" and "Start
blank."

Footer/status: storage location, cache size, "Open project folder."

Project card actions: Open, Rename (inline), Duplicate, Duplicate with brand swap
(Phase 2), Export last render, Reveal in file manager, Delete (confirm; moves to
trash).

Sorting: last edited (default), name, created, duration. Filtering: all, drafts,
rendered, archived (Phase 2). Search by name and scene names, debounced, local.

New project flow: modal with Template and Blank tabs. Template tab: category
chips. Blank tab: name, aspect ratio (16:9, 9:16, 1:1, 4:5, 4:3, custom),
duration (4/6/10/15/30s/custom), fps (24/30/60), background. "Create" disabled
until name non-empty. Writes the bundle before navigating; on failure the dialog
stays open.

## Editor layout

Top bar (44px): back, project name (inline rename), scene switcher, "+ Scene",
undo/redo, preview quality, Copilot toggle, Export.

Left panel (260–320px, resizable, collapsible): Scene and Assets tabs.

Viewport: fills center; floating toolbar (camera view, grid, background, zoom);
bottom status strip (scene, fps, duration, selection).

Inspector (300–360px, resizable, collapsible): selection-driven.

Timeline (240–420px, resizable, collapsible): bottom (default) or right (Phase 2).

Copilot: right-side drawer, 360–420px, overlaying the inspector; pinnable in
Phase 3.

Minimum window 1100×720. Below that, inspector collapses to icons and timeline
becomes a compact strip.

## Editor modes (focus states, not document state)

Design (default), Animate (`T`), Sequence (Phase 2), Present (Phase 4), Render
(export dialog). Mode is derived from the active panel and stored in editor
state, not the document. Opening restores the last mode per user.

## Scene switcher

Dropdown in the top bar: scene name, duration, thumbnail, active check mark,
"+ New scene", "Duplicate scene", "Manage scenes…", "Master sequence" (Phase 2).

Switching preserves playhead time, clamped to the new scene's duration.

## Keyboard map

See master spec §5.6. Shortcuts must not fire while an input/textarea/
contenteditable is focused. Existing `Motion.tsx` handler already follows this.

## Deep links and restoration

- `/motion/:projectId` loads the project; missing → recoverable error with
  "Locate project folder" and "Remove from list."
- `?scene=` selects a scene; invalid falls back to first scene + toast.
- `?panel=copilot` opens the copilot drawer; no auto-send.
- Editor view state (camera orbit, zoom, timeline scroll, selected scene) lives
  in `editor-state.json`, not the document.
- If closed with unsaved changes, the recovery prompt appears before the
  editor mounts (see `persistence.md` §15.4).

## Loading/empty/error states

See master spec §5.8 (skeleton loading, missing asset, missing font,
unsupported node type, corrupt project, render failure, permission failure).

## Templates

Six templates (Phase 1): Product launch hero, Feature spotlight, App Store
preview, Social loop, Model reveal, Logo sting. Each is a project bundle with
`template.json` manifest, v4 `project.json`, placeholder assets marked "Replace
me", and a maintainer `README.md`.

Applying a template: copy bundle into a new project folder, replace project id
and timestamps, open a "Make it yours" panel with brand colors, logo, headline,
and product screen slots. Does not modify the template on disk.

Templates are data, not code. A template cannot execute scripts.

Blank project contains a camera, key/fill lights, ground, and a title node
saying "Your headline here", selected on open.

## Autosave, recovery, save status

- Autosave debounces 500ms after the last change, writes at most every 2s.
- Status chip: Saved / Saving… / Unsaved changes / Save failed.
- Atomic writes via `write-file-atomic`, previous version kept as
  `backups/project-<revision>.json` (last 10).
- Sidecar `project.autosave.json` written first, then canonical; on startup if
  sidecar is newer, offer recovery.
- Recovery dialog: "Motion closed unexpectedly. Recover N unsaved changes from
  HH:MM?" → Recover / Discard.
- Corrupt file: never overwrite; show error, backup list, "Open folder."
- Autosave does not pause during export; export reads a snapshot at start.
- "Save a copy" writes a new bundle with a new id.

## Undo/redo/copy/paste

- Undo is whole-document snapshots, 200 entries. One user gesture = one entry.
  Drags coalesce until pointer-up.
- Selection, playhead, camera orbit, panel sizes, scene switches are not
  undoable (view state).
- History is session-only.
- Copy/paste nodes: copy node + descendants + channels; paste creates new ids
  and offsets position slightly. "Paste in place" keeps transform.
- Copy/paste keys: relative times and values; paste at playhead.
- Duplicate (`Cmd/Ctrl+D`) = copy+paste in one batch.
- Deleting a node with children and animation shows counts in the confirmation.

## Error prevention and inline validation

- Disable invalid actions instead of erroring after the click; tooltip explains
  why.
- Validate on blur, not per keystroke; show error inline; keep last valid value.
- Never silently clamp; show a toast when clamped.
- Missing assets: persistent banner + per-node badge; export blocked with list.
- Unsupported node types: read-only placeholders, not deleted.
- Failed op leaves the document unchanged; store surfaces the error.
- Destructive confirmations name the object and consequence.

## Accessibility

- All panels keyboard reachable; hierarchy supports arrow keys.
- Timeline canvas has a keyboard mode: `Tab` focuses, arrows move playhead,
  `[`/`]` set work area, `K` adds a key.
- Focus rings use the app ring token.
- Color is never the only indicator.
- `prefers-reduced-motion` pauses decorative UI animation and template
  autoplay; does not change project playback.
- Screen-reader announcements for op results.
- Contrast: semantic tokens; canvas timeline ≥3:1 for essential lines, 4.5:1
  for text.
- "Scene summary" panel as a non-visual fallback.

## Command palette

`Cmd/Ctrl+K`: add node types, switch scene, import asset, apply template/recipe,
toggle panels/grid/safe area/quality, export, search assets and nodes, "Explain
this selection" (copilot context, no mutation). Backed by the same ops and UI
commands as the menus. No arbitrary JS/shell/URLs.

## Acceptance criteria

- A new user can apply a template, change the headline and brand color, and
  export without opening documentation.
- Every persistent edit through the UI produces an op and is undoable.
- Auto-key off by default and its state is visible.
- Trimming a clip never deletes keyframes.
- Multi-select edits apply in one undo step.
- A missing asset blocks export with an actionable list.
- Autosave survives a forced quit; recovery restores the last change.
- The editor is usable at 1100×720 with the inspector collapsed.
- No destructive action without a confirmation naming the consequence.

## Files to touch

- `src/renderer/pages/MotionBrowser.tsx`, `MotionEditorPage.tsx`
- `src/components/motion/browser/*`, `src/components/motion/editor/*`
- `src/renderer/routes.tsx` — add the route tree from §5.1.
- `src/hooks/use-motion-project.ts`, `use-motion-store.ts`.

## Tests

- Component tests for browser, new project dialog, template gallery, recovery
  dialog, export dialog.
- Route smoke test.
