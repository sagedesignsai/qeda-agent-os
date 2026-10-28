---
name: qeda-computer-use
description: >-
  Use Qeda's computer-use tools to capture screenshots, inspect the focused
  window, and drive mouse/keyboard input. Gated by an allowlist; integrate with
  Showcase Studio to record and edit demo takes. Use when the user asks to
  automate UI interaction, capture the screen, or build a showcase demo.
---

# Qeda Computer Use

## Prerequisites
- Enable in Settings → Computer Use and add allowed window-title substrings.
- Actions are rejected unless the foreground window title matches the allowlist.

## Tools
- `listWindows` — enumerate screen/window sources.
- `captureScreenshot` — screenshot (data URL + dimensions).
- `getActiveWindow`, `getCursorPosition` — observe state.
- `moveMouse`, `click`, `doubleClick`, `typeText`, `pressKey`, `scroll` — input.
- `wait` — settle UI.

## Patterns
1. Observe: `listWindows` → `captureScreenshot` → reason about layout.
2. Interact: ensure target window focused; `moveMouse`/`click`/`typeText`; `wait` between steps.
3. Safety: never type into a window not in the allowlist; dangerous keys are blocked.

## Showcase Studio: record a demo autonomously

Computer Use **enabled** in Settings is the gate for recording as well as input.
Input additionally needs an allowed window; recording does not, because it sends
nothing to any other app.

1. `startDemoRecording({ projectId?, title?, sourceName?, fps? })` → `{ sessionId, takeId }`.
   Capture runs in the background and outlives the call, so the turn does not block.
   One recording at a time, with a 5-minute ceiling that stops and finalizes itself.
2. **Drive the demo.** Observe with `getActiveWindow` / `captureScreenshot`, act with
   `moveMouse` / `click` / `typeText` / `pressKey`, and `wait` for the UI to settle between
   steps. For a web product use `openBrowser` / `navigateBrowser` / `clickSelector` /
   `typeSelector` instead — it is steadier than coordinates on a page.
3. `markHighlight({ sessionId, label })` at **every** beat worth showing. The label is
   written for the viewer: it becomes a timed caption, and the mark's timestamp becomes a
   kinetic zoom aimed at where the cursor was. Marking is what separates a recording from
   a directed demo — unmarked beats get no camera and no subtitle.
4. `stopDemoRecording({ sessionId })` → `{ takeId, durationMs, captionCount, zoomCount }`.
   Video, cursor telemetry and your marks are saved as one take, composed and ready.
5. Refine with the Studio tools, all available in chat: `getTakeDetails` (reads back
   `highlights` so timing survives a later turn), `getMouseTelemetry`, `addKineticZoom`,
   `removeKineticZoom`, `cutSilenceOrRange`, `setCaptions`, `addCanvasEffect` /
   `removeCanvasEffect`, `updateStyling`. Called with no `takeId` they target the newest
   take, so "the demo we just recorded" needs no id threading.
6. **Stop here and hand back.** The user opens Showcase Studio and exports — the exported
   file is theirs to choose, so do not run an export yourself.

If step 4 reports zero highlights, the draft fell back to telemetry zooms: add the
narrative yourself with `setCaptions` and reframe with `addKineticZoom`.
