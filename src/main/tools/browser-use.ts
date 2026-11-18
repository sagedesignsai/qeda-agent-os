import { tool } from 'ai';
import { z } from 'zod';
import * as bu from '../browser-use.js';
import { hasActiveStudioRecording } from '../studio-recorder.js';

function blocked(err: string) {
  return { success: false as const, error: err };
}

export const browserUseTools = {
  openBrowser: tool({
    description:
      'Open a browser window and navigate to a URL. Set visible=true to let the user pre-authenticate (SSO). Always visible while a demo recording is running, because a hidden window would not appear in the capture.',
    inputSchema: z.object({
      url: z.string(),
      visible: z.boolean().optional().default(false),
      partition: z
        .string()
        .optional()
        .describe('Persistent session name for cookies/storage'),
    }),
    execute: async ({ url, visible, partition }) => {
      try {
        // Model compliance is not a guarantee: during a screen take a hidden
        // browser produces a recording of whatever else is on screen.
        const shouldShow = hasActiveStudioRecording()
          ? true
          : (visible ?? false);
        const r = bu.openBrowser(url, {
          visible: shouldShow,
          partition,
        });
        // `id` doubles as the `windowId` for startDemoRecording.
        return { success: true, ...r, windowId: r.id, visible: shouldShow };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  navigateBrowser: tool({
    description: 'Navigate an open browser session to a URL.',
    inputSchema: z.object({ id: z.string(), url: z.string() }),
    execute: async ({ id, url }) => {
      try {
        await bu.navigate(id, url);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  clickSelector: tool({
    description: 'Click an element by CSS selector in a browser session.',
    inputSchema: z.object({ id: z.string(), selector: z.string() }),
    execute: async ({ id, selector }) => {
      try {
        await bu.clickSelector(id, selector);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  typeSelector: tool({
    description:
      'Type text into an element by CSS selector in a browser session.',
    inputSchema: z.object({
      id: z.string(),
      selector: z.string(),
      text: z.string(),
    }),
    execute: async ({ id, selector, text }) => {
      try {
        await bu.typeSelector(id, selector, text);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  evaluateBrowser: tool({
    description:
      'Evaluate JavaScript in a browser session and return the result.',
    inputSchema: z.object({ id: z.string(), code: z.string() }),
    execute: async ({ id, code }) => {
      try {
        const result = await bu.evaluate(id, code);
        return { success: true, result };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  screenshotBrowser: tool({
    description: 'Capture a screenshot of a browser session.',
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      try {
        const dataUrl = await bu.screenshot(id);
        return { success: true, dataUrl };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),

  closeBrowser: tool({
    description: 'Close a browser session.',
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      try {
        bu.closeBrowser(id);
        return { success: true };
      } catch (e) {
        return blocked((e as Error).message);
      }
    },
  }),
};
