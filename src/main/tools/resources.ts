/**
 * tools/resources.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent tools for searching and downloading web resources:
 *
 *   searchImages     – Google Images via Serper (PNG/SVG/mockups/photos)
 *   searchScholar    – Academic literature, authors, citations, and PDF links
 *   searchPatents    – Technical patent filings and claims
 *   downloadResource – Safe binary fetch & save to project assets folder
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { app } from 'electron';
import { resolveService } from '../services/keys.js';
import {
  serperImages,
  serperScholar,
  serperPatents,
  type ImageFormatFilter,
} from '../services/serper.js';
import { downloadResource } from '../services/downloader.js';
import { getProject } from '../db/projects.js';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── searchImages ─────────────────────────────────────────────────────────────

export const searchImagesTool = tool({
  description:
    'Search Google Images via Serper for photos, transparent PNGs, SVG vector logos, icons, diagrams, or mockups. Returns image URLs, dimensions, and source domains.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('What the image should depict, e.g. "Tshirt mockup png" or "Q Logo SVG".'),
    count: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(10)
      .describe('Number of image results to return (max 30).'),
    formatFilter: z
      .enum(['all', 'png', 'svg', 'jpg'])
      .default('all')
      .describe('Format filter: png (transparent), svg (vector), jpg (photo), or all.'),
    country: z
      .string()
      .optional()
      .describe('Optional country code hint (e.g. "us", "uk", "de").'),
  }),
  execute: async ({ query, count, formatFilter, country }) => {
    try {
      const resolved = resolveService('serper');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await serperImages({
        query,
        count,
        formatFilter: formatFilter as ImageFormatFilter,
        country,
        apiKey: resolved.value.apiKey,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── searchScholar ────────────────────────────────────────────────────────────

export const searchScholarTool = tool({
  description:
    'Search academic papers, articles, and scientific research on Google Scholar via Serper. Returns titles, authors, citations, and direct PDF links when available.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Academic search topic, paper title, or author name.'),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe('Maximum number of scholar results.'),
  }),
  execute: async ({ query, count }) => {
    try {
      const resolved = resolveService('serper');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await serperScholar({
        query,
        count,
        apiKey: resolved.value.apiKey,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── searchPatents ────────────────────────────────────────────────────────────

export const searchPatentsTool = tool({
  description:
    'Search Google Patents via Serper for technical inventions, claims, and patent disclosures. Returns patent numbers, assignees, dates, and PDF links.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Patent search terms, invention title, patent number, or assignee.'),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe('Maximum number of patent results.'),
  }),
  execute: async ({ query, count }) => {
    try {
      const resolved = resolveService('serper');
      if (!resolved.ok) return { success: false, error: resolved.error };

      const result = await serperPatents({
        query,
        count,
        apiKey: resolved.value.apiKey,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  },
});

// ─── downloadResource ─────────────────────────────────────────────────────────

export const downloadResourceTool = tool({
  description:
    'Download a remote resource (image, mockup, SVG, PDF paper, etc.) from a URL to the local project asset directory. Returns local file path, size, and MIME type.',
  inputSchema: z.object({
    url: z.string().describe('The URL of the remote asset to download.'),
    projectId: z
      .string()
      .optional()
      .describe('Project ID whose asset folder should receive the file.'),
    studioTakeId: z
      .string()
      .optional()
      .describe('Studio take ID if downloading for a video project.'),
    filename: z
      .string()
      .optional()
      .describe('Optional custom filename (e.g. "tshirt_mockup.png"). Auto-derived if omitted.'),
    targetFolder: z
      .string()
      .optional()
      .default('assets')
      .describe('Target subfolder inside the project (defaults to "assets").'),
    overwrite: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to overwrite if a file with the same name exists (defaults to false).'),
  }),
  execute: async ({
    url,
    projectId,
    studioTakeId,
    filename,
    targetFolder,
    overwrite,
  }) => {
    try {
      let destinationDir: string;

      if (studioTakeId) {
        destinationDir = path.join(
          app.getPath('userData'),
          'studio',
          studioTakeId,
          targetFolder || 'assets',
        );
      } else if (projectId) {
        const project = getProject(projectId);
        if (project?.repo_path) {
          destinationDir = path.resolve(project.repo_path, targetFolder || 'assets');
        } else {
          destinationDir = path.join(
            app.getPath('userData'),
            'projects',
            projectId,
            targetFolder || 'assets',
          );
        }
      } else {
        // Fallback to user downloads or app assets
        try {
          destinationDir = path.join(app.getPath('downloads'), targetFolder || 'docugent-assets');
        } catch {
          destinationDir = path.resolve(process.cwd(), targetFolder || 'assets');
        }
      }

      const res = await downloadResource({
        url,
        destinationDir,
        filename,
        overwrite,
      });

      return res;
    } catch (err) {
      return { success: false, url, error: errorMessage(err) };
    }
  },
});

export const resourceTools = {
  searchImages: searchImagesTool,
  searchScholar: searchScholarTool,
  searchPatents: searchPatentsTool,
  downloadResource: downloadResourceTool,
};
