/**
 * tools/computer-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI tools for computer use: window enumeration, screenshots, mouse/keyboard,
 * and the agent-driven showcase recorder. Input is gated by
 * settings.computerUse (enabled + allowlist) inside the service; the recorder
 * only requires the feature to be enabled, since capturing a screen sends no
 * input anywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as cu from '../computer-use.js';
import {
  startStudioRecording,
  markStudioHighlight,
  stopStudioRecording,
} from '../studio-recorder.js';

function blocked(err: string) {
  return { success: false as const, error: err };
}

export const computerUseTools = {
  listWindows: tool({
    description:
      'List available screen and window capture sources for computer use.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const electron = require('electron');
        const dc = electron?.desktopCapturer;
        if (!dc?.getSources) {
          return blocked('desktopCapturer is not available.');
        }
        const sources = await dc.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 160, height: 90 },
        });
        return {
          success: true,
          windows: sources.map((s: any) => ({ id: s.id, name: s.name })),
        };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  captureScreenshot: tool({
    description:
      'Capture a screenshot of the screen or a specific window source.',
    inputSchema: z.object({
      sourceId: z
        .string()
        .optional()
        .describe('Source id from listWindows; defaults to primary screen'),
    }),
    execute: async ({ sourceId }) => {
      try {
        const shot = await cu.captureScreenshot(sourceId);
        if (!shot) return blocked('No capture source found.');
        return { success: true, ...shot };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  getActiveWindow: tool({
    description: 'Get the title of the currently focused window.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const title = await cu.getActiveWindowTitle();
        return { success: true, title };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  getCursorPosition: tool({
    description: 'Get the current mouse cursor position.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const pos = await cu.getCursorPosition();
        return { success: true, ...pos };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  moveMouse: tool({
    description: 'Move the mouse cursor to an absolute screen position.',
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
    }),
    execute: async ({ x, y }) => {
      try {
        await cu.moveMouse(x, y);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  click: tool({
    description: 'Click at an absolute screen position.',
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      button: z.enum(['left', 'right', 'middle']).optional().default('left'),
    }),
    execute: async ({ x, y, button }) => {
      try {
        await cu.click(x, y, button as any);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  doubleClick: tool({
    description: 'Double-click at an absolute screen position.',
    inputSchema: z.object({ x: z.number(), y: z.number() }),
    execute: async ({ x, y }) => {
      try {
        await cu.doubleClick(x, y);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  typeText: tool({
    description: 'Type text into the currently focused window.',
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => {
      try {
        await cu.typeText(text);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  pressKey: tool({
    description: 'Press a keyboard key with optional modifiers.',
    inputSchema: z.object({
      key: z.string(),
      modifiers: z.array(z.string()).optional(),
    }),
    execute: async ({ key, modifiers }) => {
      try {
        await cu.pressKey(key, modifiers);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  scroll: tool({
    description: 'Scroll at an absolute screen position.',
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      deltaX: z.number().optional().default(0),
      deltaY: z.number().optional().default(0),
    }),
    execute: async ({ x, y, deltaX, deltaY }) => {
      try {
        await cu.scroll(x, y, deltaX ?? 0, deltaY ?? 0);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  wait: tool({
    description: 'Wait for a number of milliseconds for UI to settle.',
    inputSchema: z.object({ ms: z.number().min(0).max(30000) }),
    execute: async ({ ms }) => {
      try {
        await cu.wait(ms);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  startDemoRecording: tool({
    description:
      'Begin recording the screen into a new Showcase Studio take. Recording runs in the background while you drive the app with the other computer-use and browser-use tools; call markHighlight at each moment worth showing, then stopDemoRecording. Requires Computer Use to be enabled in Settings.',
    inputSchema: z.object({
      projectId: z
        .string()
        .nullable()
        .optional()
        .describe(
          'Project to file the take under, when the demo is about one.',
        ),
      title: z.string().optional().describe('Working title for the take.'),
      sourceName: z
        .string()
        .optional()
        .describe('What is being demonstrated, e.g. "Qeda Builder".'),
      fps: z.number().min(10).max(60).optional(),
    }),
    execute: async ({ projectId, title, sourceName, fps }) => {
      try {
        const result = await startStudioRecording({
          projectId: projectId ?? null,
          title,
          sourceName,
          fps,
        });
        return {
          success: true,
          sessionId: result.sessionId,
          takeId: result.takeId,
          maxDurationMs: result.maxDurationMs,
          next: 'Drive the app, call markHighlight for each moment worth showing, then call stopDemoRecording with this sessionId.',
        };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  markHighlight: tool({
    description:
      'Mark the current moment of a running demo recording as a highlight. Its label becomes a timed caption and its timestamp becomes a kinetic zoom on the finished take, so mark every step the viewer should notice.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session returned by startDemoRecording.'),
      label: z
        .string()
        .min(1)
        .describe(
          'Short caption for the highlight, e.g. "Live preview updates as you type". Written to the viewer, not as an internal note.',
        ),
    }),
    execute: async ({ sessionId, label }) => {
      try {
        const highlight = markStudioHighlight(sessionId, label);
        return {
          success: true,
          tMs: highlight.tMs,
          label: highlight.label,
        };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  stopDemoRecording: tool({
    description:
      'Finish a running demo recording, save it as a Showcase Studio take, and compose captions and zooms from the highlights you marked. Returns the take id to hand to the studio editing tools.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session returned by startDemoRecording.'),
    }),
    execute: async ({ sessionId }) => {
      try {
        const result = await stopStudioRecording(sessionId);
        return {
          success: true,
          takeId: result.take.id,
          title: result.take.title,
          durationMs: result.durationMs,
          highlightCount: result.highlightCount,
          captionCount: result.captionCount,
          zoomCount: result.zoomCount,
          note: result.highlightCount
            ? `Composed ${result.captionCount} captions and ${result.zoomCount} zooms from ${result.highlightCount} highlights. Refine with addKineticZoom / cutSilenceOrRange / setCaptions, then the user only has to export.`
            : 'No highlights were marked, so the draft fell back to telemetry zooms. Add captions with setCaptions and reframe with addKineticZoom if the pacing needs work.',
        };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),
};
