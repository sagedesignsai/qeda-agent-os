# Computer Use Agent & Skill

## Goal
Add a general computer-use capability to Qeda: agents can capture screenshots, move/click/type/scroll, and observe window state, gated by an allowlist safety model. It integrates with Showcase Studio so an agent can drive a demo and then edit the resulting take (zooms, cuts, captions, styling). Also ship a Skill documenting workflows.

## Decisions (resolved)
- Input injection: `@nut-tree-fork/nut-js` added to `release/app/package.json` (native), lazy-required at runtime.
- Safety: autonomous with allowlist. Settings store `computerUse: { enabled, allowedWindows[] }`; every action checks the active foreground window title against the allowlist and rejects otherwise. Dangerous keys (system shortcuts) are blocked.
- Screenshots: Electron `desktopCapturer` in main (reuse Studio source enumeration).
- Integration: new tool factory `createComputerUseTools`; exposed to chat agent via `allTools` + chat policy classification (`read` for observe, `write-local` for input).
- Studio editing: reuse existing `createStudioTools` / `studio-store`; no new DB schema.
- Autonomous full-screen recording: deferred to Phase 2 (use main-process ffmpeg screen capture or hidden recorder window); Phase 1 supports screenshots + driving an already active Studio recording.

## Architecture
- `src/main/computer-use.ts` — service wrapping nut-js + desktopCapturer; allowlist check; exports functions.
- `src/main/ipc/handlers/computer-use.ts` — IPC handlers `computer-use:*`.
- `src/main/tools/computer-use.ts` — AI tool factory.
- Settings: add `computerUse?` to `AppSettings` (merge semantics).
- Skill: `.agents/skills/qeda-computer-use/SKILL.md`.

## Tasks

### Phase 1 — Core capability
1. Add `@nut-tree-fork/nut-js` to `release/app/package.json`; run rebuild; add jest mock mapping + `.erb/mocks/nutJsMock.js`.
2. Extend `AppSettings` in `src/main/ai/settings.ts` with `computerUse?: { enabled?: boolean; allowedWindows?: string[] }`.
3. Implement `src/main/computer-use.ts` service:
   - lazy `require('@nut-tree-fork/nut-js')`; return actionable error if unavailable.
   - `getScreenSize`, `getCursorPosition`, `moveMouse`, `click`, `doubleClick`, `typeText`, `pressKey`, `scroll`.
   - `getActiveWindow` and `isAllowed()` (foreground title must be in allowlist or allowlist empty+enabled false? default deny).
   - `captureScreenshot(sourceId?)` using `desktopCapturer.getSources` → PNG data URL + dimensions.
   - block dangerous keys.
4. Add IPC channels in `src/main/ipc/channels.ts`: `computer-use:get-screen-size`, `get-cursor-position`, `move-mouse`, `click`, `type-text`, `press-key`, `scroll`, `capture-screenshot`, `get-active-window`, `is-allowed`.
5. Implement `src/main/ipc/handlers/computer-use.ts` and register in `src/main/ipc/index.ts`.
6. Implement `src/main/tools/computer-use.ts` with tools: `listWindows`, `captureScreenshot`, `getCursorPosition`, `moveMouse`, `click`, `doubleClick`, `typeText`, `pressKey`, `scroll`, `getActiveWindow`, `wait`.
   - each tool checks `settings.computerUse.enabled` and allowlist; returns `{ success:false, error }` if blocked.
7. Export `computerUseTools` from `src/main/tools/index.ts` and spread into `allTools`.
8. Add classification entries in `src/main/tools/policies/chat.ts` (observe=`read`, input=`write-local`). Keep copilot policy strict? Add to copilot policy if exposed.
9. Add Settings UI section (allowlist editor, enable toggle) in Settings page.
10. Add tests: service unit (mocked nut-js), tool factory, capability sync test still passes.

### Phase 2 — Studio demo recording (optional)
11. Add main-process screen recording via ffmpeg (`gdigrab`/`avfoundation`/`x11grab`) or hidden recorder window; create take via `saveStudioTake`.
12. Add tool `recordDemo({ sourceId, durationMs, projectId })` that records while agent drives input, then runs `studio:process-draft`.
13. Update Skill with recording workflow.

### Skill
14. Create `.agents/skills/qeda-computer-use/SKILL.md` documenting tool names, allowlist setup, observation vs interaction patterns, and Studio editing workflow.

## Risks
- Nut.js native rebuild/packaging; CI-less local rebuild. Mitigate lazy require + graceful errors.
- Cross-platform input APIs differ; start with nut-js abstraction.
- Safety: allowlist default deny; dangerous keys blocked; screenshot data may be large—return paths instead of base64 where possible.
- Policy sync test must be updated in same change.

## Validation
- `npm run build`, `npm test`, `npm run lint`.
- Run `python3 scripts/verify-ipc-split.py`.
- Manual: enable computer-use, allowlist a window, ask agent to screenshot and click; verify blocked when foreground not allowlisted.
