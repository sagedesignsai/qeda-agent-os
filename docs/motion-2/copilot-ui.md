# Copilot UI

**Phase:** 3
**Dependencies:** `copilot-tools.md`, `templates-and-browser.md`
**Master spec:** §5.3, §13.7
**Goal:** give the agent contract a face — a drawer with plan cards, streaming,
and one-click apply with undo.

## Layout

Right-side drawer, 360–420px, overlaying the inspector. Not permanent; can be
pinned. Does not cover the inspector permanently.

```
┌──────────────────────────────────────────────┐
│ Copilot                             [×] [⋮]  │
├──────────────────────────────────────────────┤
│ You: Make the intro feel more premium.       │
│                                              │
│ Copilot: I'll slow the camera push, soften   │
│ the key light, and add a beat before the     │
│ title.                                       │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Plan · Changes · 7 edits                 │ │
│ │ • Camera push: 4.5s → 5.2s               │ │
│ │ • Key light: 2.2 → 1.8                   │ │
│ │ • Title: fade starts 0.2s later          │ │
│ │ ⚠ 1 warning: title overlaps safe area    │ │
│ │ [ Show me ]  [ Why? ]  [ Cancel ] [Apply]│ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [ Ask about this scene…             ] [Send] │
└──────────────────────────────────────────────┘
```

## Plan cards

Persistent in the conversation until applied/cancelled. Contents:
- One-sentence summary in plain language.
- "What will change" list grouped by scene/node.
- Diff counts.
- Risk badge.
- Warnings.
- Optional preview: still frame or short low-res loop (Phase 3 may render a
  preview; Phase 1.5 returns the preview document only).
- Buttons: Apply, Cancel, "Show me" (focus), "Why?" (explanation).

"Show me" focuses affected nodes and seeks the playhead to the first changed key.
Does not mutate. "Why?" expands reasoning and the op list. After Apply, the card
becomes "Applied · Undo" with a link to the undo action.

Errors shown in the card, not as a generic toast. The copilot streams text, then
a complete plan — never partial ops into the document.

## Streaming

- `motion:copilot-stream-text` — text deltas.
- `motion:copilot-stream-tool` — tool status (name, status, summary).
- `motion:copilot-stream-error` — errors.

## Settings

Provider/model selection, token budget, "send project context" disclosure. If no
provider is configured, the copilot is hidden with a "Set up a provider" link.

## Acceptance criteria

- Plan cards render diff counts, risk, warnings.
- Destructive plans require a second confirm.
- Revision conflicts are explained in the card.
- "Show me" focuses without mutating.
- Apply creates one undo entry; "Applied · Undo" works.
- The drawer overlays without permanently shrinking the viewport.

## Files to touch

- `src/components/motion/copilot/CopilotDrawer.tsx`
- `src/components/motion/copilot/PlanCard.tsx`
- `src/hooks/use-motion-copilot.ts`

## Tests

- Component tests for plan card rendering and apply/cancel flows.
- Streaming integration test.
