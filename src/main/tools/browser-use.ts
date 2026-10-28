import { tool } from 'ai';
import { z } from 'zod';
import * as bu from '../browser-use.js';

function blocked(err: string) {
  return { success: false as const, error: err };
}

export const browserUseTools = {
  openBrowser: tool({
    description:
      'Open a browser window and navigate to a URL. Set visible=true to let the user pre-authenticate (SSO).',
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
        const r = bu.openBrowser(url, { visible, partition });
        return { success: true, ...r };
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
