/**
 * tools/clipboard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI SDK tools for reading and writing the system clipboard.
 * Electron's clipboard API is synchronous.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { clipboard } from 'electron';
import { z } from 'zod';

export const readClipboardTool = tool({
  description: 'Read the current text content from the system clipboard.',
  inputSchema: z.object({}),
  execute: async () => {
    const text = await clipboard.readText();
    return {
      success: true,
      text,
      isEmpty: text.length === 0,
    };
  },
});

export const writeClipboardTool = tool({
  description: 'Write text to the system clipboard. REQUIRES USER APPROVAL.',
  inputSchema: z.object({
    text: z.string().describe('The text content to place on the clipboard.'),
  }),
  execute: async ({ text }) => {
    await clipboard.writeText(text);
    return { success: true, bytesWritten: Buffer.byteLength(text, 'utf8') };
  },
});

export const clipboardTools = {
  readClipboard: readClipboardTool,
  writeClipboard: writeClipboardTool,
};
