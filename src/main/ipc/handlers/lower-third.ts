/**
 * main/ipc/handlers/lower-third.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for lower third overlay generation and export.
 *
 * Callable from the renderer via:
 *   window.electron.ipc.invoke('lower-third:generate', { config })
 *   window.electron.ipc.invoke('lower-third:export-gsap', { format, ... })
 *   window.electron.ipc.invoke('lower-third:export-svg', { loop })
 */

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  instantiateLowerThirdTemplate,
  type LowerThirdConfig,
} from '@/lib/trace/templates/lower-third';
import { generateGsapCode, type GsapCodeOptions } from '@/lib/trace/export/gsap-code';
import {
  compileProjectToAnimatedSvg,
  type AnimatedSvgOptions,
} from '@/lib/trace/export/animated-svg';
import { stageOf } from '@/lib/trace/document';
import type { TraceDocument } from '@/lib/trace/types';

export function registerLowerThirdHandlers() {
  /**
   * Generate a lower third overlay project.
   *
   * Example:
   *   const result = await window.electron.ipc.invoke(
   *     'lower-third:generate',
   *     {
   *       title: 'Processing',
   *       subtitle: 'Installing dependencies...',
   *       metric: '3/12',
   *       durationMs: 5000,
   *     }
   *   );
   */
  ipcMain.handle(
    'lower-third:generate',
    async (
      _event: IpcMainInvokeEvent,
      config: LowerThirdConfig,
    ): Promise<{
      project: TraceDocument;
      elementCount: number;
      durationMs: number;
    }> => {
      const project = instantiateLowerThirdTemplate(config);
      return {
        project,
        elementCount: Object.keys(stageOf(project).elements).length,
        durationMs: project.durationMs,
      };
    },
  );

  /**
   * Export lower third as GSAP code.
   *
   * Example:
   *   const code = await window.electron.ipc.invoke(
   *     'lower-third:export-gsap',
   *     {
   *       project: { ... },
   *       format: 'react',
   *       componentName: 'LowerThird'
   *     }
   *   );
   */
  ipcMain.handle(
    'lower-third:export-gsap',
    async (
      _event: IpcMainInvokeEvent,
      {
        project,
        format = 'react',
        componentName = 'LowerThirdOverlay',
        loop = false,
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
   * Export lower third as animated SVG.
   *
   * Example:
   *   const svg = await window.electron.ipc.invoke(
   *     'lower-third:export-svg',
   *     {
   *       project: { ... },
   *       loop: false
   *     }
   *   );
   */
  ipcMain.handle(
    'lower-third:export-svg',
    async (
      _event: IpcMainInvokeEvent,
      {
        project,
        loop = false,
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
