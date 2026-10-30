# Testing and QA

**Phase:** all
**Dependencies:** all briefs
**Master spec:** §18
**Goal:** a test suite that catches the regressions Motion 2.0 is most likely to
introduce, without becoming a second full-time job.

## Shape of the suite

| Layer | Tool | Runs in | Speed |
| --- | --- | --- | --- |
| Document, ops, sampling, migration | Jest + jsdom | `bun test` | ms |
| Serialization, preflight, diff | Jest + jsdom | `bun test` | ms |
| React components | Testing Library + jsdom | `bun test` | tens of ms |
| Node renderers | `@react-three/test-renderer` | `bun test` | tens of ms |
| Golden frames | Hidden render window | `bun run test:golden` (opt-in) | seconds |
| Export smoke | Hidden render window + Mediabunny `Input` | `bun run test:export` (opt-in) | seconds |
| Manual OS matrix | Human | Release checklist | minutes |

The first four run on every change. The last three are opt-in because they need a
GPU, a display server, or a codec that may not exist on the machine.

## Unit tests (`src/lib/motion`)

Schema and invariants: one fixture per rule in §6.4, each asserting the specific
error `code` and `path`. Round-trip `parse(serialize(doc))` deep-equals `doc`.
Strict parsing: unknown top-level key rejected, not dropped. Deterministic
serialization: byte-identical.

Ops: every op has happy path, not-found, invalid-reference, and no-op paths.
Batch atomicity: `[valid, invalid]` leaves the input reference unchanged. No-op
batch returns the same reference and does not bump `revision`. Risk classes
match the table in §14.5 (test asserts the full map). `scene.node.remove`
cascade. `placement.trim`/`placement.split` preserve keys. `keyframe.add`
bounds. `asset.remove` while referenced throws with the reference list.
`asset.replace` rewrites every reference and fails atomically on kind mismatch.

Sampling and evaluation: boundary behaviour (before first key, after last key,
exactly on a key, half-open placement end). Trim mapping both directions. Track
order (later wins, muted contributes nothing, locked still evaluates).
Determinism (deep-equal). Purity (deep-freeze the fixture, no throw). Missing
camera returns synthetic camera + warning.

Migration: v1→v4, v2→v4, v3→v4 fixtures. Idempotence. Invalid loop ranges
converge. Blob assets dropped + node marked missing. Never throws on a document
that passed its own schema.

Recipes and diff: every recipe expands to primitive ops stably.
`diffMotionDocuments` ordered, omits unchanged. Applying a plan then undoing
produces the inverse set (by entity and action).

## Component tests

- Inspector generated from the registry: each node type's declared props render a
  control of the hinted type; each animatable prop has a diamond.
- Editing a field emits exactly one op on blur/Enter, not per keystroke.
- Hierarchy renders nested nodes, respects `visible`/`locked`, shows warning
  badges.
- Timeline adapter maps trim windows and key ids (pure function tests).
- Export dialog disables Export on blocking issues and lists warnings.
- Recovery dialog appears only when the sidecar is newer.
- Copilot plan card renders diff counts, risk, warnings, double-confirm for
  destructive.

Use `fireEvent`, not `userEvent` (not installed). Import
`@testing-library/jest-dom` explicitly at the top of component test files.

## Renderer tests

`@react-three/test-renderer` mounts node renderers without WebGL:
- Each node type renders without throwing for default props.
- Transform composition matches the document for a parent/child pair.
- Opacity inheritance multiplies.
- A missing asset renders the placeholder + warning, not a crash.
- Disposal: unmounting disposes geometry/material (spy on `dispose`).

This catches the class of bug the current `MotionSceneCanvas` mock hides (P0-1)
without needing a GPU.

## Golden frames (opt-in)

`bun run test:golden`. Fixtures: starter scene at t=0, 1.0, 2.5; a model
scene; a text scene. Render at 320×180, read pixels, hash. Compare hashes on the
same machine; cross-machine uses a perceptual diff with a documented threshold
(advisory, not blocking). Store expected hashes in
`src/__tests__/fixtures/motion/golden.json` with a `renderer` field (GPU
vendor + driver) so a mismatch is explainable. A failed test prints the actual
PNG next to the expected one. Do not overwrite expectations automatically.

## Export smoke (opt-in)

`bun run test:export`:
1. Build a 12-frame, 320×180 fixture project.
2. Run the real render host + Mediabunny pipeline.
3. Open the output with Mediabunny `Input`.
4. Assert: one video track, expected width/height, duration within one frame,
   frame count, decodable first frame.
5. Assert the file is not a `.part` and the render window is destroyed.

The only test that proves the product can produce its primary output. Must run
before any release.

## Manual release matrix

| Axis | Values |
| --- | --- |
| OS | macOS (arm64), Windows 11, Ubuntu 24.04 |
| GPU | Apple, NVIDIA, Intel integrated |
| Codec | H.264 available / unavailable |
| Display | 100%, 150%, 200% scaling |
| Project | 1 scene / 10 scenes / 100 assets / 4K |
| Input | mouse, trackpad, keyboard-only |

Checklist: create from template → edit → autosave → kill → recover → export →
play the file in QuickTime/VLC/Chrome → verify duration, audio sync, no chrome
visible.

## Jest configuration additions

```
moduleNameMapper:
  '^mediabunny$'            → '<rootDir>/.erb/mocks/mediabunny.ts'
  '^troika-three-text$'     → '<rootDir>/.erb/mocks/troika-three-text.tsx'
  '^@react-three/drei$'     → '<rootDir>/.erb/mocks/react-three-drei.tsx'
  '^@dnd-kit/(.*)$'         → '<rootDir>/.erb/mocks/dnd-kit.ts'
```

Every mock exports the minimum surface the app imports and carries a comment
naming the real package and the reason. A mock that silently returns `undefined`
for a used export turns a real bug into a passing test.

Add two scripts to `package.json` that launch the built app with a test-only
entry point (a small `--motion-test=<suite>` flag read in `main.ts`):

```
test:golden   → build, then run the golden-frame suite in a real window
test:export   → build, then run the export smoke suite
```

They are deliberately **not** part of `bun test`. `bun test` stays jsdom-only so
it keeps working on a machine with no GPU and no display server. The flag opens a
test entry instead of the app shell; it adds no renderer API.

## What is deliberately not tested

- Pixel-identical output across GPU vendors (documented allowed difference).
- OS file dialogs and the trash (Electron/OS behaviour; test the handler
  boundary with a fake).
- Codec availability (probe at runtime; do not assert a machine has H.264).
- The LLM itself (test the tool contract, plan envelope, and guards, not the
  model's prose).

## Acceptance criteria

- Every op, node type, and invariant rule has at least one test.
- `bun test` stays under 60s on the target laptop.
- A deliberate bug in `evaluate.ts` (wrong trim offset) fails at least three
  tests.
- Golden and export tests are documented and run in the release checklist.
- No test depends on the wall clock, the network, or a real user directory.

## Files to touch

- `jest.config.js` — moduleNameMapper additions.
- `.erb/mocks/*` — new mocks.
- `package.json` — `test:golden`, `test:export` scripts.
- `src/__tests__/fixtures/motion/*` — fixtures and golden hashes.
