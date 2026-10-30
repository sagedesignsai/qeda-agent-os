# Runtime and state machines

**Phase:** 4
**Dependencies:** `document-model-v4.md`, `export-pipeline.md`, `scenes-and-nodes.md`
**Master spec:** §6.10, §7.4
**Goal:** the same document that exports video can also run interactively, via a
state-machine runtime layered on top of the timeline.

## Reserved schema (already in v4)

`MotionScene.stateMachines?: MotionStateMachineDefinition[]` is reserved now so
Phase 4 needs no schema migration. It is parsed, validated, round-tripped, and
ignored by the runtime in Phase 1–3.

Shape is a serializable subset of XState v5 configs:
- States are named.
- Transitions reference targets by name.
- Actions and guards are **names**, not functions.
- Context is JSON.
- No inline `assign`, no promises, no invocations.

## XState integration

Compile with `setup({ actions, guards }).createMachine(config)`. Named actions
map to Motion operations (play clip, set visibility, set property, emit event).
Named guards map to pure predicates. XState is not used for video timeline
evaluation — the timeline is deterministic and time-driven; XState is
event-driven.

## Runtime interface

```ts
export interface MotionInteractiveRuntime extends MotionRuntime {
  send(event: { type: string; [key: string]: unknown }): void;
}
```

`StateMachineRuntime` implements `MotionInteractiveRuntime`. It compiles
`scene.stateMachines`, evaluates the active state's timeline/animation layer in
`sample(time)`, and transitions on `send(event)`.

## Actions (named)

- Play clip.
- Set node visibility.
- Set a property.
- Emit an event.

A state cannot execute arbitrary code. Inputs (pointer/keyboard) are document
data, not code.

## Present mode

Full-screen runtime preview in the editor with no editing chrome. Full-screen
player runs the interactive runtime from the same document that exports video.

## Acceptance criteria

- A two-state button interaction runs in Present mode from the same document
  that exports video.
- Machine configs are serializable (no functions in the document).
- `sample(time)` stays pure and deterministic.
- The video timeline remains the source of truth for authored animation; state
  machines compose on top.

## Files to touch

- `src/lib/motion/runtime.ts` — `MotionInteractiveRuntime`,
  `StateMachineRuntime`.
- `src/lib/motion/node-registry.ts` — state machine validation.
- `src/components/motion/present/*` — present mode player.

## Tests

- Unit tests for machine compilation and transitions (mocked XState or real,
  depending on ESM handling).
- Integration test: two-state interaction in Present mode.
- Determinism test: `sample(time)` twice → deep-equal.
