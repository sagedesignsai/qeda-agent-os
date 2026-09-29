/**
 * tools/services.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent tools for the external knowledge services. These complement the
 * built-in Brave `webSearch`/`fetchUrl` pair:
 *
 *   advancedSearch – pick the best configured search backend (Tavily / Exa /
 *                    Serper / Brave / Firecrawl) with one normalized result shape
 *   scrapePage     – render a page to clean markdown (Firecrawl)
 *   libraryDocs    – version-specific library docs + code (Context7)
 *   findImages     – cover art / photos (Unsplash)
 *   textToSpeech   – narrate a page or note (ElevenLabs / Deepgram / Cartesia)
 *   transcribeAudio – speech-to-text from a local file (Deepgram)
 *
 * All are read-only over the local system (transcribeAudio only reads a file),
 * so none require approval.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveService, resolveServiceKey } from '../services/keys.js';
import {
  searchWithProvider,
  SEARCH_PROVIDERS,
  type SearchProvider,
} from '../services/search.js';
import { firecrawlScrape } from '../services/scrape.js';
import { context7Docs } from '../services/docs.js';
import { unsplashSearch } from '../services/images.js';
import {
  synthesizeSpeech,
  deepgramTranscribe,
  TTS_PROVIDERS,
} from '../services/speech.js';

/** Preference order used when the caller asks for `provider: 'auto'`. */
const AUTO_SEARCH_ORDER: SearchProvider[] = [
  'tavily',
  'exa',
  'serper',
  'brave',
  'firecrawl',
];

function pickAutoProvider(): SearchProvider | null {
  for (const provider of AUTO_SEARCH_ORDER) {
    if (resolveServiceKey(provider)) return provider;
  }
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.aac': 'audio/aac',
};

// ─── advancedSearch ───────────────────────────────────────────────────────────

export const advancedSearchTool = tool({
  description:
    'Search the web with the best configured provider (Tavily, Exa, Serper/Google, Brave or Firecrawl). Returns normalized { title, url, snippet, provider } results, plus a synthesized answer when one is available. Prefer this over the basic webSearch when you want Google results, published dates, or a direct answer.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'The search query. Be specific; add the current year for recent topics.',
      ),
    provider: z
      .enum(['auto', ...SEARCH_PROVIDERS] as [string, ...string[]])
      .default('auto')
      .describe(
        'Which search backend to use. "auto" picks the first configured provider.',
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(6)
      .describe('Maximum number of results.'),
    includeAnswer: z
      .boolean()
      .default(false)
      .describe(
        'Ask for a synthesized answer where the provider supports it (Tavily/Serper).',
      ),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe('Restrict results to these domains.'),
    excludeDomains: z
      .array(z.string())
      .optional()
      .describe('Exclude these domains.'),
  }),
  execute: async ({
    query,
    provider,
    count,
    includeAnswer,
    includeDomains,
    excludeDomains,
  }) => {
    try {
      const chosen: SearchProvider | null =
        provider === 'auto' ? pickAutoProvider() : (provider as SearchProvider);
      if (!chosen) {
        return {
          success: false,
          error:
            'No search provider is configured. Add a key for Tavily, Exa, Serper, Brave or Firecrawl in Settings.',
        };
      }

      const resolved = resolveService(chosen);
      if (!resolved.ok) return { success: false, error: resolved.error };

      const response = await searchWithProvider(chosen, {
        query,
        count,
        includeAnswer,
        apiKey: resolved.value.apiKey,
        ...(includeDomains?.length ? { includeDomains } : {}),
        ...(excludeDomains?.length ? { excludeDomains } : {}),
      });

      return {
        success: true,
        provider: chosen,
        query,
        ...(response.answer ? { answer: response.answer } : {}),
        results: response.results,
      };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── scrapePage ───────────────────────────────────────────────────────────────

export const scrapePageTool = tool({
  description:
    'Render a web page (including JavaScript-heavy docs sites) and return clean markdown. Use after a search to read a specific source in full. Requires the Firecrawl key.',
  inputSchema: z.object({
    url: z.string().url().describe('The http(s) URL to scrape.'),
    maxChars: z
      .number()
      .int()
      .min(1_000)
      .max(80_000)
      .default(24_000)
      .describe('Maximum markdown characters to return.'),
  }),
  execute: async ({ url, maxChars }) => {
    try {
      const resolved = resolveService('firecrawl');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await firecrawlScrape({
        url,
        maxChars,
        apiKey: resolved.value.apiKey,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── libraryDocs ──────────────────────────────────────────────────────────────

export const libraryDocsTool = tool({
  description:
    'Look up up-to-date, version-specific documentation and code snippets for a software library (e.g. "Jules API", "Godot 4 CharacterBody2D", "Next.js middleware"). Use this before writing API or framework code so the notebook cites real, current APIs. Requires the Context7 key.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('What you are trying to do, as a natural-language question.'),
    library: z
      .array(z.string())
      .max(4)
      .optional()
      .describe('Library hints, e.g. ["godot"] or ["/vercel/next.js"]. Max 4.'),
    language: z
      .string()
      .optional()
      .describe('Programming language preference, e.g. "gdscript".'),
    version: z.string().optional().describe('Version constraint, e.g. "4.3".'),
  }),
  execute: async ({ query, library, language, version }) => {
    try {
      const resolved = resolveService('context7');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await context7Docs({
        query,
        apiKey: resolved.value.apiKey,
        ...(library?.length ? { libraries: library } : {}),
        ...(language ? { language } : {}),
        ...(version ? { version } : {}),
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── findImages ───────────────────────────────────────────────────────────────

export const findImagesTool = tool({
  description:
    'Find stock photos for a notebook or page — cover images, section artwork, illustrative photos. Returns image URLs plus attribution. Requires the Unsplash access key.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'What the image should depict, e.g. "2.5d platformer game scene".',
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(6)
      .describe('How many images to return.'),
    orientation: z
      .enum(['landscape', 'portrait', 'squarish'])
      .optional()
      .describe('Preferred orientation (landscape suits cover images).'),
  }),
  execute: async ({ query, count, orientation }) => {
    try {
      const resolved = resolveService('unsplash');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await unsplashSearch({
        query,
        count,
        apiKey: resolved.value.apiKey,
        ...(orientation ? { orientation } : {}),
      });
      return { success: true, query, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── textToSpeech ─────────────────────────────────────────────────────────────

export const textToSpeechTool = tool({
  description:
    'Narrate text as audio for a page, summary or study aid. Returns an audio data URL the user can play. Keep text under ~3000 characters; split longer content across calls.',
  inputSchema: z.object({
    text: z.string().min(1).max(3_000).describe('The text to speak.'),
    provider: z
      .enum(['elevenlabs', 'deepgram', 'cartesia'] as [string, ...string[]])
      .default('elevenlabs')
      .describe('Which speech provider to use.'),
    voice: z
      .string()
      .optional()
      .describe('Provider-specific voice id or model name.'),
  }),
  execute: async ({ text, provider, voice }) => {
    try {
      const resolved = resolveService(provider);
      if (!resolved.ok) return { success: false, error: resolved.error };

      const audio = await synthesizeSpeech({
        provider: provider as (typeof TTS_PROVIDERS)[number],
        text,
        apiKey: resolved.value.apiKey,
        ...(voice ? { voice } : {}),
      });

      const base64 = Buffer.from(audio.bytes).toString('base64');
      return {
        success: true,
        provider: audio.provider,
        contentType: audio.contentType,
        bytes: audio.bytes.byteLength,
        dataUrl: `data:${audio.contentType};base64,${base64}`,
      };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── transcribeAudio ──────────────────────────────────────────────────────────

export const transcribeAudioTool = tool({
  description:
    'Transcribe a local audio file to text (Deepgram Nova). Useful for turning a recorded meeting or voice note into a page. Requires the Deepgram key.',
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        'Absolute path to a local audio file (mp3, wav, m4a, ogg, flac, webm).',
      ),
    model: z
      .string()
      .optional()
      .describe('Deepgram model id (default nova-3).'),
  }),
  execute: async ({ filePath, model }) => {
    try {
      const resolved = resolveService('deepgram');
      if (!resolved.ok) return { success: false, error: resolved.error };

      let audio: Buffer;
      try {
        audio = await fs.readFile(filePath);
      } catch (err) {
        return {
          success: false,
          error: `Could not read ${filePath}: ${errorMessage(err)}`,
        };
      }

      const contentType =
        CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ??
        'audio/mpeg';

      const { text } = await deepgramTranscribe({
        apiKey: resolved.value.apiKey,
        audio: new Uint8Array(audio),
        contentType,
        ...(model ? { model } : {}),
      });

      return { success: true, filePath, text };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

export const serviceTools = {
  advancedSearch: advancedSearchTool,
  scrapePage: scrapePageTool,
  libraryDocs: libraryDocsTool,
  findImages: findImagesTool,
  textToSpeech: textToSpeechTool,
  transcribeAudio: transcribeAudioTool,
};
