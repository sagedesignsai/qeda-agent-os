/**
 * main/ipc/handlers/sponsor-card.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for sponsor card generation and export.
 *
 * Callable from the renderer via:
 *   window.electron.ipc.invoke('sponsor-card:generate', { features })
 *   window.electron.ipc.invoke('sponsor-card:export-gsap', { format, ... })
 *   window.electron.ipc.invoke('sponsor-card:export-svg', { loop })
 */

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  instantiateSponsorCardTemplate,
  type SponsorCardFeature,
} from '@/lib/trace/templates/sponsor-card';
import { generateGsapCode, type GsapCodeOptions } from '@/lib/trace/export/gsap-code';
import {
  compileProjectToAnimatedSvg,
  type AnimatedSvgOptions,
} from '@/lib/trace/export/animated-svg';
import { stageOf } from '@/lib/trace/document';
import type { TraceDocument } from '@/lib/trace/types';

export function registerSponsorCardHandlers() {
  /**
   * Generate a sponsor card project from a feature list.
   *
   * Example:
   *   const result = await window.electron.ipc.invoke(
   *     'sponsor-card:generate',
   *     {
   *       features: [
   *         { title: 'Feature 1', subtitle: 'Subtext' },
   *         { title: 'Feature 2', subtitle: 'Subtext' },
   *       ]
   *     }
   *   );
   */
  ipcMain.handle(
    'sponsor-card:generate',
    async (
      _event: IpcMainInvokeEvent,
      {
        features = [],
      }: {
        features?: SponsorCardFeature[];
      },
    ): Promise<{
      project: TraceDocument;
      elementCount: number;
      durationMs: number;
    }> => {
      const project = instantiateSponsorCardTemplate(features);
      return {
        project,
        elementCount: Object.keys(stageOf(project).elements).length,
        durationMs: project.durationMs,
      };
    },
  );

  /**
   * Export sponsor card as GSAP code (React or vanilla).
   *
   * Example:
   *   const code = await window.electron.ipc.invoke(
   *     'sponsor-card:export-gsap',
   *     {
   *       project: { ... },
   *       format: 'react',
   *       componentName: 'SponsorCard'
   *     }
   *   );
   */
  ipcMain.handle(
    'sponsor-card:export-gsap',
    async (
      _event: IpcMainInvokeEvent,
      {
        project,
        format = 'react',
        componentName = 'SponsorCard',
        loop = true,
      }: {
        project: TraceDocument;
        format?: 'react' | 'vanilla';
        componentName?: string;
        loop?: boolean;
      },
    ): Promise<{
      code: string;
      format: 'react' | 'vanilla';
      codeLength: number;
    }> => {
      const options: GsapCodeOptions = {
        format,
        componentName,
        loop,
        includeMarkup: true,
      };
      const code = generateGsapCode(project, options);
      return {
        code,
        format,
        codeLength: code.length,
      };
    },
  );

  /**
   * Export sponsor card as animated SVG.
   *
   * Example:
   *   const svg = await window.electron.ipc.invoke(
   *     'sponsor-card:export-svg',
   *     {
   *       project: { ... },
   *       loop: true
   *     }
   *   );
   */
  ipcMain.handle(
    'sponsor-card:export-svg',
    async (
      _event: IpcMainInvokeEvent,
      {
        project,
        loop = true,
        includeDimensions = true,
      }: {
        project: TraceDocument;
        loop?: boolean;
        includeDimensions?: boolean;
      },
    ): Promise<{
      svg: string;
      svgLength: number;
    }> => {
      const options: AnimatedSvgOptions = {
        loop,
        includeDimensions,
      };
      const svg = compileProjectToAnimatedSvg(project, options);
      return {
        svg,
        svgLength: svg.length,
      };
    },
  );
}
