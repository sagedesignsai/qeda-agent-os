/**
 * ai/music-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Music Copilot — an in-house DJ that can read the local library, build and
 * save playlists, queue music, apply ambience scenes, adjust levels and start a
 * focus session.
 *
 * The agent only *decides*; the renderer owns audio. Tools that affect playback
 * emit a `MusicCopilotCommand`, which `FocusRuntime` applies to the app-wide
 * stores. That split is what keeps this agent testable without a Web Audio
 * context.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { createMusicTools } from '../tools/music.js';
import { getMusicCapability } from '../tools/capability-simple-tools.js';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import type { ModelTarget } from './fallback.js';
import type { MusicCopilotCommand, MusicCopilotContext } from '../../lib/music/types.js';

export interface MusicCopilotAgentOptions {
  target?: ModelTarget;
  context?: MusicCopilotContext;
  onCommand?: (command: MusicCopilotCommand) => void;
  onChanged?: () => void;
}

function buildMusicInstructions(context?: MusicCopilotContext): string {
  const nowPlaying = context?.currentTrackTitle
    ? `“${context.currentTrackTitle}”${context.currentTrackArtist ? ` by ${context.currentTrackArtist}` : ''}`
    : 'nothing';
  const surface = [
    `Playback: ${context?.playing ? 'playing' : 'paused'}`,
    `Current track: ${nowPlaying}`,
    context?.queueLength !== undefined
      ? `Queue length: ${context.queueLength}`
      : '',
    context?.sceneId ? `Active scene: ${context.sceneId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `You are the Music Copilot — the in-house DJ and listening concierge inside Qeda.

You are not a search box. You read the user's actual local library, choose a coherent set, explain the arc in a sentence or two, and then make it happen with your tools.

## How to work
1. **Ground every choice.** Call \`getMusicLibrarySummary\` or \`searchMusic\` before naming tracks. Never invent a track id, artist or album. If the library is empty, say so and ask the user to add a folder.
2. **Build sets, not lists.** For a set request, search a few angles (artist, album, mood keywords, adjacent genres), then pick 8–20 tracks with a deliberate rise/plateau/close. Prefer instrumental or low-vocal music for deep work unless the user asks otherwise.
3. **Use the right container.** If the user wants to keep the set, call \`createPlaylist\` (then \`playMusic\` with its id). For one-off listening, call \`playMusic\` with track ids. Do not create a playlist for every request.
4. **Own the room.** Use \`setAmbience\` for rain/forest/late-night scenes, \`setLevels\` for quieter/louder, and \`controlPlayback\` for pause/skip/stop. Do not claim playback started unless the tool returned success.
5. **Connect focus and music.** For "score my next task" style requests, call \`listFocusTasks\`, pick the most urgent/open task, start it with \`startFocusSession\`, and pair it with a fitting set. If there is no task, ask which one.
6. **Respect the library.** If a search returns nothing, widen it or say the library does not have that sound. Never pad a queue with off-genre tracks just to hit a number.

## Current surface
${surface}

## Style
- Warm, concise, specific. Name the artists and tracks you chose, and why in one line.
- Summarize tool results in prose; never dump raw JSON or long id lists.
- If a tool fails, say what failed and offer the nearest working alternative.
- End with what is now playing or what the user can ask next.`;
}

export function createMusicCopilotAgent(opts: MusicCopilotAgentOptions = {}) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildMusicInstructions(opts.context),
    tools: {
      ...createMusicTools({
        onCommand: opts.onCommand,
        onChanged: opts.onChanged,
      }),
      getMusicCapability,
    },
    stopWhen: isStepCount(20),
  });
}
