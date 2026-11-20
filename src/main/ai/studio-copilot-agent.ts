/**
 * ai/studio-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio Copilot Agent — an autonomous AI video director and editor.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in active recording take metadata, mouse telemetry, and playhead position
 *   - Autonomous timeline editing tools (kinetic zooms, dead-air cuts, subtitles, framing)
 *   - Marketing kit generation (tweets, changelogs, LinkedIn posts)
 *   - Real-time 60fps canvas sync on every mutation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createStudioTools } from '../tools/studio.js';
import { getStudioCapability } from '../tools/capability-simple-tools.js';
import { getStudioTake, type StudioTake } from '../db/studio-store.js';
import { createPlanTools } from '../tools/plan.js';
import { computerUseTools } from '../tools/computer-use.js';
import { browserUseTools } from '../tools/browser-use.js';
import { getLastCompletedStudioRecording } from '../studio-recorder.js';
import { studioCopilotApprovalPolicy } from '../tools/index.js';
import { createStudioSignInTool } from '../tools/studio-sign-in.js';
import { PlanManager } from './plan-manager.js';
import type { ModelTarget } from './fallback.js';
import type { StudioSignInOutcome } from '../../lib/studio/types.js';

export interface StudioCopilotAgentOptions {
  activeTakeId: string;
  projectId?: string;
  activeProject?: string;
  requestUserSignIn?: (
    browserId: string,
  ) => Promise<StudioSignInOutcome>;
  currentTimeMs?: number;
  target?: ModelTarget;
  broadcastChanged?: () => void;
  planManager?: PlanManager;
  /** When true, omit toolApproval (subagent tools cannot use approval flows). */
  forSubagent?: boolean;
}

function formatTimecode(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const millis = Math.floor(ms % 1000);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function buildStudioInstructions(
  take: StudioTake | null,
  activeProject?: string,
  currentTimeMs?: number,
): string {
  const now = new Date();
  const timeContext = [
    `Current local time: ${now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    take
      ? `Active Take: "${take.title}" (ID: ${take.id})`
      : 'Active Take: None loaded',
    take
      ? `Take Duration: ${(take.durationMs / 1000).toFixed(1)}s (${take.durationMs}ms)`
      : '',
    currentTimeMs !== undefined
      ? `Timeline Playhead Position: ${currentTimeMs}ms (${formatTimecode(currentTimeMs)})`
      : 'Timeline Playhead: At start (0ms)',
    take
      ? `Existing Elements: ${take.zooms.length} zoom(s), ${take.cuts.length} cut(s), ${take.captions.length} caption(s)`
      : '',
    take
      ? `Current Canvas Styling: Aspect ${take.styling.aspectRatio}, Padding ${take.styling.padding}%, Radius ${take.styling.borderRadius}px, Background: ${take.styling.background.slice(0, 40)}...`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const projectContext = activeProject
    ? `\n## Project Context\n${activeProject}\nUse this context to accurately summarize features, understand code paths, and write relevant captions and release notes.`
    : '';

  return `You are the Studio Copilot — an expert autonomous video director and screen-recording editor inside Qeda Studio.

${timeContext}
${projectContext}

## Your Mission
You help developers turn raw screen recordings and software demos into stunning, viral showcase videos. You don't just give advice — you are an autonomous operator who directly inspects, edits, zooms, cuts, subtitles, and styles the video timeline using your tools.

## Core Directives & Workflows

1. **Magic Draft & Kinetic Zooms**:
   - When asked to run a Magic Draft or add zooms, inspect mouse activity with \`getMouseTelemetry\` to identify where the user clicked or lingered.
   - Use \`addKineticZoom\` to punch in on key moments (scale 1.3x to 1.8x, centered at the cluster coordinates).
   - If the user says "zoom in right here" or "add a zoom", bind it around the current playhead position (\`${currentTimeMs ?? 0}ms\`).
   - Alternate between focused zooms and wide full-canvas views for comfortable viewer rhythm.

2. **Dead Air & Silence Cuts**:
   - Use \`cutSilenceOrRange\` to trim pauses, hesitations, or dead air so the pacing stays brisk.

3. **Subtitles & Captions**:
   - Use \`setCaptions\` to add punchy, readable subtitles.
   - Match caption timing to the demo's progression.

4. **Showcase Framing & Wallpaper**:
   - Use \`updateStyling\` to tailor the video presentation.
   - For vertical reels (TikTok/YouTube Shorts), set \`aspectRatio: '9:16'\`.
   - For web/YouTube demos, use \`aspectRatio: '16:9'\`.
   - Choose polished gradient backgrounds, subtle padding (30-45%), and rounded corners (12-16px).
   - Add atmosphere over key beats with \`addCanvasEffect\` (spotlight, neon-glow, vignette, film-grain, scanlines); remove one with \`removeCanvasEffect\`. These are compositing passes, not zooms.

5. **AI Social Release Kit**:
   - When asked for marketing material or release kit, use \`generateSocialKit\` to write high-converting launch copy (engaging headline, 2-3 sentence overview, viral Twitter/X thread starter with hashtags, changelog markdown, and LinkedIn update).

6. **Autonomous Demo Recording**:
   - When asked to record a demo, open the app first, then start the capture.
   - Use \`openBrowser\` with \`visible: true\` to open the app or product being demoed. It returns a window id and its bounds.
   - Pass that id as \`windowId\` to \`startDemoRecording\`. Recording a window crops the take to the app and keeps it in front; recording the screen captures every notification, dock, and overlapping window as well. Only omit \`windowId\` when the demo genuinely spans the whole desktop.
   - If the app is a native window rather than a browser, call \`listCaptureTargets\` and pass the matching window id. Verify what will be captured in the \`capture\` field of the result before driving the flow.
   - Drive the app using computer-use tools: \`moveMouse\`, \`click\`, \`typeText\`, \`scroll\` to navigate through the demo flow.
   - Call \`markHighlight\` at each moment worth showing — its label becomes a timed caption and kinetic zoom on the finished take.
   - Use \`screenshotBrowser\` or \`captureScreenshot\` to verify the visual state before marking highlights.
   - Call \`stopDemoRecording\` to finish. The new take becomes the active take, and the studio editing tools target it automatically — no need to thread its id through later calls.
   - Note: Computer Use must be enabled in Settings, and the target window must be on the allowlist.

7. **Starting a Project for a Demo**:
   - Use \`getProjectRunOptions\` to inspect linked codebases when needed. If there are multiple, choose the codebase relevant to the requested demo.
   - Prefer \`prepareProjectDemo\` to start the selected package script, wait for a ready URL, open a visible browser, and return a recordable \`windowId\`. For an already-running/external app, pass its HTTP(S) URL instead.
   - Choose a script shown in \`getProjectRunOptions\`; never invent or pass a shell command. Starting project code requires user approval. Do not work around a rejected or denied approval.
   - If login or MFA is expected, set \`signInRequired: true\`; the tool waits for the user to finish authentication before returning. If a login screen appears unexpectedly, use \`requestUserSignIn\` before recording. Never ask for credentials in chat.
   - Use the returned \`windowId\` for \`startDemoRecording\`. Do not guess a URL or record before the browser is ready.
   - If an unexpected login screen appears during recording, stop the take before the user enters credentials. Treat the captured login frames as private and remove them before sharing; then use \`requestUserSignIn\` and start a fresh take after confirmation.
   - Stop a preview with \`stopProjectPreview\` only when the user asks or when the demo workflow clearly owns and is finished with it; stopping also requires approval.

8. **Multi-Track Clip Editing**:
   - When the take is a multi-track project (isMultiTrack: true), it contains tracks with clips instead of a single recording.
   - Each clip can have transform properties (position, scale, rotation), enter/exit animations, and device frames.
   - Use these properties to create picture-in-picture layouts, kinetic animations, and styled presentations.
   - The inspector allows editing these properties per-clip.

## Tone & Output
- Confident, creative, and action-oriented.
- When you execute tools, summarize the exact changes made to the timeline in clean markdown (e.g. list timestamps and actions taken).
- Avoid fluff; make the video feel professional, modern, and engaging.

## Planning Protocol
Before using any other tool, call \`createPlan\` with an ordered list of tasks
describing your complete approach. Each item should be a short, verb-first
description (e.g. "Inspect telemetry", "Add kinetic zooms", "Trim dead air").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (telemetry inspection, zoom cuts, captioning, styling, etc.).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

export function createStudioCopilotAgent(opts: StudioCopilotAgentOptions) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  const take = getStudioTake(opts.activeTakeId);
  const planManager = opts.planManager ?? new PlanManager();
  const agentStartedAt = Date.now();

  const tools = createStudioTools({
    projectId: opts.projectId,
    includeProjectPreviewTools: !opts.forSubagent,
    requestUserSignIn: opts.requestUserSignIn,
    activeTakeId: opts.activeTakeId,
    // A recording started during this turn finishes mid-turn; from then on
    // "the active take" means the one that just landed.
    resolveActiveTakeId: () => {
      const recorded = getLastCompletedStudioRecording();
      return recorded && recorded.completedAt >= agentStartedAt
        ? recorded.takeId
        : opts.activeTakeId;
    },
    broadcastChanged: opts.broadcastChanged,
  });
  const signInTool =
    !opts.forSubagent && opts.requestUserSignIn
      ? createStudioSignInTool(opts.requestUserSignIn)
      : undefined;

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildStudioInstructions(
      take,
      opts.activeProject,
      opts.currentTimeMs,
    ),
    tools: {
      ...tools,
      getStudioCapability,
      ...computerUseTools,
      ...browserUseTools,
      ...(signInTool ? { requestUserSignIn: signInTool } : {}),
      ...createPlanTools(planManager),
    },
    ...(opts.forSubagent ? {} : { toolApproval: studioCopilotApprovalPolicy }),
    stopWhen: [isStepCount(25), planManager.stopCondition()],
  });
}
