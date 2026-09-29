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
import { getStudioTake, type StudioTake } from '../db/studio-store.js';
import type { ModelTarget } from './fallback.js';

export interface StudioCopilotAgentOptions {
  activeTakeId: string;
  activeProject?: string;
  currentTimeMs?: number;
  target?: ModelTarget;
  broadcastChanged?: () => void;
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

5. **AI Social Release Kit**:
   - When asked for marketing material or release kit, use \`generateSocialKit\` to write high-converting launch copy (engaging headline, 2-3 sentence overview, viral Twitter/X thread starter with hashtags, changelog markdown, and LinkedIn update).

## Tone & Output
- Confident, creative, and action-oriented.
- When you execute tools, summarize the exact changes made to the timeline in clean markdown (e.g. list timestamps and actions taken).
- Avoid fluff; make the video feel professional, modern, and engaging.`;
}

export function createStudioCopilotAgent(opts: StudioCopilotAgentOptions) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  const take = getStudioTake(opts.activeTakeId);

  const tools = createStudioTools({
    activeTakeId: opts.activeTakeId,
    broadcastChanged: opts.broadcastChanged,
  });

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildStudioInstructions(
      take,
      opts.activeProject,
      opts.currentTimeMs,
    ),
    tools,
    stopWhen: isStepCount(25),
  });
}
