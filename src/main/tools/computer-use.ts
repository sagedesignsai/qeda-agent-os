/**
 * tools/computer-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI tools for computer use: semantic inspection, screenshots, mouse/keyboard,
 * and the agent-driven showcase recorder.
 *
 * Phase 1 semantic tools: getAppState, setValue, hotkey, and click accepting
 * element refs (e.g. "@e3") in addition to screen coordinates.
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as cu from '../computer-use.js';
import {
  listCaptureDisplays,
  listNativeWindows,
  listRecordableWindows,
} from '../capture-targets.js';
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

  listCaptureTargets: tool({
    description:
      'List what a demo recording can capture: every display (with bounds) and every app window Qeda owns (with bounds and id). Prefer recording a window over the full screen. The ids returned here — and by openBrowser — are what startDemoRecording accepts as windowId.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return {
          success: true,
          displays: listCaptureDisplays(),
          windows: listRecordableWindows(),
          // Native (non-Electron) windows: resolvable by title fragment through
          // startDemoRecording's windowTitle, but not pinnable like a window we own.
          nativeWindows: await listNativeWindows(),
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

  getAppState: tool({
    description:
      'Inspect the semantic UI state of an app/window. Returns compact accessibility-tree elements tagged with refs like @e1, @e2 (for use with click/setValue), plus change information when available. Prefer this over pixel guessing for Qeda windows and supported desktop apps.',
    inputSchema: z.object({
      app: z
        .string()
        .optional()
        .describe('App name/title hint to inspect (e.g. "qeda" or another app).'),
      windowId: z
        .string()
        .optional()
        .describe('Optional window id/title hint to target a specific window.'),
    }),
    execute: async ({ app, windowId }) => {
      try {
        const result = await cu.getAppState({ app, windowId });
        if (result.error) return blocked(result.error);
        return {
          success: true,
          text: result.text,
          diff: result.diff,
          snapshot: result.snapshot
            ? {
                app: result.snapshot.app,
                title: result.snapshot.title,
                windowId: result.snapshot.windowId,
                elementCount: Object.keys(result.snapshot.elements || {}).length,
              }
            : undefined,
        };
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
    description:
      'Click a UI element by semantic ref (preferred, e.g. element "@e3" from getAppState) or by absolute screen coordinates.',
    inputSchema: z
      .object({
        element: z.string().optional().describe('Semantic element ref like "@e3".'),
        windowId: z.string().optional().describe('Optional window id for element targeting.'),
        x: z.number().optional(),
        y: z.number().optional(),
        button: z.enum(['left', 'right', 'middle']).optional().default('left'),
      })
      .refine((v) => !!v.element || (typeof v.x === 'number' && typeof v.y === 'number'), {
        message: 'Provide either element or both x and y.',
      }),
    execute: async ({ element, windowId, x, y, button }) => {
      try {
        if (element) {
          await cu.click({ element, windowId }, (button as any) ?? 'left');
        } else {
          await cu.click({ x: x as number, y: y as number }, (button as any) ?? 'left');
        }
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

  setValue: tool({
    description:
      'Set the value/text of a semantic UI element (preferred over typing when targeting a specific input). Use an element ref from getAppState.',
    inputSchema: z.object({
      element: z.string().describe('Semantic element ref like "@e2".'),
      value: z.string().describe('Value/text to set.'),
      windowId: z.string().optional().describe('Optional window id for element targeting.'),
    }),
    execute: async ({ element, value, windowId }) => {
      try {
        await cu.setValue({ element, value, windowId });
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

  hotkey: tool({
    description:
      'Trigger a keyboard shortcut/hotkey (e.g. "ctrl+enter", "cmd+c"). Prefer this for app shortcuts over manual key sequences.',
    inputSchema: z.object({
      key: z.string().describe('Shortcut string like "ctrl+enter" or "cmd+shift+p".'),
    }),
    execute: async ({ key }) => {
      try {
        await cu.hotkey(key);
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
      'Begin recording into a new Showcase Studio take. Prefer passing windowId so the take contains only the app being demonstrated instead of the whole desktop. Recording runs in the background while you drive the app with the other computer-use and browser-use tools; call markHighlight at each moment worth showing, then stopDemoRecording. Requires Computer Use to be enabled in Settings.',
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
      windowId: z
        .string()
        .optional()
        .describe(
          'Electron window id to record — from openBrowser or listCaptureTargets. Records just that window and keeps it in front. Strongly preferred over the full screen.',
        ),
      displayId: z
        .string()
        .optional()
        .describe(
          'Display id from listCaptureTargets, to record a full screen.',
        ),
      rect: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional()
        .describe('Explicit screen region, in DIP. Rarely needed.'),
      windowTitle: z
        .string()
        .optional()
        .describe(
          'Native (non-Electron) window title fragment — from listCaptureTargets. Matches the first open window whose title includes it, and records that window. Prefer windowId for windows Qeda owns.',
        ),
    }),
    execute: async ({
      projectId,
      title,
      sourceName,
      fps,
      windowId,
      displayId,
      rect,
      windowTitle,
    }) => {
      try {
        const result = await startStudioRecording({
          projectId: projectId ?? null,
          title,
          sourceName,
          fps,
          target: { windowId, displayId, rect, windowTitle },
        });
        return {
          success: true,
          sessionId: result.sessionId,
          takeId: result.takeId,
          fps: result.fps,
          maxDurationMs: result.maxDurationMs,
          capture: result.capture,
          next: `Drive the app, call markHighlight for each moment worth showing, then call stopDemoRecording with this sessionId. Capturing: ${result.capture.label} (${result.capture.width}x${result.capture.height}).`,
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
