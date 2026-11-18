import { tool } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { openBrowser } from '../browser-use.js';
import { BuilderPreview } from '../builder/preview.js';
import type { StudioSignInOutcome } from '../../lib/studio/types.js';
import {
  EMPTY_PREVIEW_STATUS,
  choosePreviewScript,
  detectPackageManager,
  type BuilderPreviewStatus,
} from '../../lib/builder-preview.js';
import {
  getProject,
  type Project,
} from '../db/projects.js';
import {
  listCodeProjects,
  type CodeProject,
} from '../db/code-projects.js';

const LEGACY_REPO_ID = 'legacy-project-repo';
const PREVIEW_READY_TIMEOUT_MS = 45_000;
const previewOwners = new WeakMap<
  PreviewController,
  { projectId: string; codebaseId: string }
>();

interface ProjectCodebase {
  id: string;
  name: string;
  directory: string;
}

interface PreviewController {
  start(input: {
    directory: string;
    script?: string;
  }): Promise<BuilderPreviewStatus>;
  getStatus(): BuilderPreviewStatus;
  subscribe(listener: (status: BuilderPreviewStatus) => void): () => void;
  stop(): Promise<BuilderPreviewStatus>;
  dispose(): void;
}

interface BrowserSession {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface StudioProjectPreviewDependencies {
  getProject: (id: string) => Project | null;
  listCodeProjects: (id: string) => CodeProject[];
  preview: PreviewController;
  readFile: (filePath: string) => Promise<string>;
  readDirectory: (directory: string) => Promise<string[]>;
  openBrowser: (
    url: string,
    options: { visible: true; partition?: string },
  ) => BrowserSession;
}

interface CodebaseRunOptions {
  packageManager: ReturnType<typeof detectPackageManager>;
  scripts: Record<string, string>;
  suggestedScript: string | null;
}

const preview = new BuilderPreview();

export function disposeStudioProjectPreview(): void {
  previewOwners.delete(preview);
  preview.dispose();
}

function projectCodebases(
  project: Project,
  codeProjects: CodeProject[],
): ProjectCodebase[] {
  const codebases = codeProjects.map((codeProject) => ({
    id: codeProject.id,
    name: codeProject.name,
    directory: codeProject.directory,
  }));
  const legacyDirectory = project.repo_path;

  if (
    legacyDirectory &&
    !codebases.some(
      (codebase) =>
        path.resolve(codebase.directory) === path.resolve(legacyDirectory),
    )
  ) {
    codebases.push({
      id: LEGACY_REPO_ID,
      name: `${project.name} repository`,
      directory: legacyDirectory,
    });
  }

  return codebases;
}

async function waitForPreview(
  controller: PreviewController,
  timeoutMs: number,
): Promise<BuilderPreviewStatus> {
  const current = controller.getStatus();
  if (current.state !== 'starting') return current;

  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const finish = (status: BuilderPreviewStatus) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(status);
    };
    const timer = setTimeout(
      () => finish(controller.getStatus()),
      timeoutMs,
    );

    unsubscribe = controller.subscribe((status) => {
      if (status.state !== 'starting') finish(status);
    });

    const afterSubscribe = controller.getStatus();
    if (afterSubscribe.state !== 'starting') finish(afterSubscribe);
  });
}

function publicStatus(status: BuilderPreviewStatus) {
  return {
    state: status.state,
    url: status.url,
    command: status.command,
    directory: status.directory,
    message: status.message,
  };
}

interface PreviewStartResult extends Partial<ReturnType<typeof publicStatus>> {
  success: boolean;
  error?: string;
}

async function inspectCodebase(
  codebase: ProjectCodebase,
  dependencies: StudioProjectPreviewDependencies,
): Promise<CodebaseRunOptions> {
  const manifest = JSON.parse(
    await dependencies.readFile(
      path.join(codebase.directory, 'package.json'),
    ),
  ) as { scripts?: Record<string, unknown> };
  const entries = await dependencies.readDirectory(codebase.directory);
  const scripts = Object.fromEntries(
    Object.entries(manifest.scripts ?? {}).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
  return {
    packageManager: detectPackageManager(entries),
    scripts,
    suggestedScript: choosePreviewScript(scripts),
  };
}

export function createStudioProjectPreviewTools(
  projectId: string | undefined,
  dependencies: StudioProjectPreviewDependencies = {
    getProject,
    listCodeProjects,
    preview,
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    readDirectory: (directory) => fs.readdir(directory),
    openBrowser,
  },
  requestSignIn?: (
    browserId: string,
  ) => Promise<StudioSignInOutcome>,
) {
  const getCodebases = () => {
    if (!projectId) {
      throw new Error(
        'Select a project in Studio before starting its preview.',
      );
    }

    const project = dependencies.getProject(projectId);
    if (!project) {
      throw new Error(`Studio project ${projectId} no longer exists.`);
    }

    return projectCodebases(
      project,
      dependencies.listCodeProjects(projectId),
    );
  };

  const getCodebase = (codebaseId?: string) => {
    const codebases = getCodebases();
    if (codebases.length === 0) {
      throw new Error(
        'This project has no linked codebase. Link one under Projects → Code first.',
      );
    }

    if (codebaseId) {
      const selected = codebases.find(({ id }) => id === codebaseId);
      if (!selected) {
        throw new Error(
          `Codebase ${codebaseId} is not linked to the active Studio project.`,
        );
      }
      return selected;
    }

    if (codebases.length > 1) {
      throw new Error(
        'This project has multiple codebases. Call getProjectRunOptions and choose a codebase id.',
      );
    }

    return codebases[0];
  };

  const currentProjectStatus = () => {
    if (
      !projectId ||
      previewOwners.get(dependencies.preview)?.projectId !== projectId
    ) {
      return EMPTY_PREVIEW_STATUS;
    }
    return dependencies.preview.getStatus();
  };

  const startPreview = async ({
    codebaseId,
    script,
    reuseExisting = false,
  }: {
    codebaseId?: string;
    script?: string;
    reuseExisting?: boolean;
  }): Promise<PreviewStartResult> => {
    let claimedPreview = false;
    try {
      const codebase = getCodebase(codebaseId);
      const status = dependencies.preview.getStatus();
      if (status.state === 'error' || status.state === 'exited') {
        previewOwners.delete(dependencies.preview);
      }
      const existingOwner = previewOwners.get(dependencies.preview);
      if (existingOwner && existingOwner.projectId !== projectId) {
        throw new Error(
          'A Qeda-managed preview for another project is still active. Switch to that project to inspect or stop it.',
        );
      }
      if (existingOwner || status.state === 'starting' || status.state === 'ready') {
        if (
          reuseExisting &&
          existingOwner?.projectId === projectId &&
          existingOwner.codebaseId === codebase.id
        ) {
          const settled =
            status.state === 'starting'
              ? await waitForPreview(
                  dependencies.preview,
                  PREVIEW_READY_TIMEOUT_MS,
                )
              : status;
          return {
            success: settled.state === 'ready',
            ...publicStatus(settled),
          };
        }
        throw new Error(
          'A Qeda-managed project preview is already running. Stop it before starting another.',
        );
      }

      const { scripts } = await inspectCodebase(codebase, dependencies);
      const selectedScript = script ?? choosePreviewScript(scripts);
      if (!selectedScript || !scripts[selectedScript]) {
        throw new Error(
          script
            ? `Script "${script}" is not defined in this codebase's package.json.`
            : 'No preview script found. Add a dev, serve, develop, or start script to package.json.',
        );
      }

      if (!projectId) {
        throw new Error(
          'Select a project in Studio before starting its preview.',
        );
      }
      previewOwners.set(dependencies.preview, {
        projectId,
        codebaseId: codebase.id,
      });
      claimedPreview = true;
      const started = await dependencies.preview.start({
        directory: codebase.directory,
        script: selectedScript,
      });
      const settled =
        started.state === 'starting'
          ? await waitForPreview(
              dependencies.preview,
              PREVIEW_READY_TIMEOUT_MS,
            )
          : started;

      if (settled.state === 'error' || settled.state === 'exited') {
        previewOwners.delete(dependencies.preview);
      }

      return {
        success:
          settled.state === 'ready' || settled.state === 'starting',
        ...publicStatus(settled),
        ...(settled.state === 'starting'
          ? {
              message:
                'The server is still starting. Check getProjectPreviewStatus before opening it.',
            }
          : {}),
      };
    } catch (error) {
      if (claimedPreview) {
        previewOwners.delete(dependencies.preview);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return {
    getProjectRunOptions: tool({
      description:
        'Inspect the active Studio project’s linked codebases, package scripts, detected package managers, and suggested preview scripts. Read-only; does not execute project code.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const codebases = getCodebases();
          const projects = await Promise.all(
            codebases.map(async (codebase) => {
              try {
                return {
                  ...codebase,
                  ...(await inspectCodebase(codebase, dependencies)),
                  error: null,
                };
              } catch (error) {
                return {
                  ...codebase,
                  packageManager: null,
                  scripts: {},
                  suggestedScript: null,
                  error: `Could not read a valid package.json: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                };
              }
            }),
          );
          return { success: true, codebases: projects };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    startProjectPreview: tool({
      description:
        'Run a linked codebase’s package.json script as a managed local preview. Requires user approval because this executes project code. Call getProjectRunOptions first when the project has multiple codebases or to choose a script.',
      inputSchema: z.object({
        codebaseId: z.string().optional(),
        script: z
          .string()
          .optional()
          .describe('A script name listed by getProjectRunOptions.'),
      }),
      execute: ({ codebaseId, script }) =>
        startPreview({ codebaseId, script }),
    }),

    prepareProjectDemo: tool({
      description:
        'Prepare a project demo: optionally start the selected linked codebase using its package.json script, wait for the real local URL, then open a visible browser window that can be recorded by windowId. If sign-in is expected, pause for the user to finish login or MFA before returning. Requires approval because it may execute project code.',
      inputSchema: z.object({
        codebaseId: z.string().optional(),
        script: z.string().optional(),
        url: z.string().url().optional(),
        signInRequired: z.boolean().optional().default(false),
        partition: z
          .string()
          .optional()
          .describe('Persistent browser session name for existing login state.'),
      }),
      execute: async ({
        codebaseId,
        script,
        url: requestedUrl,
        signInRequired,
        partition,
      }) => {
        try {
          if (!requestedUrl && !codebaseId && !projectId) {
            throw new Error(
              'Select a Studio project or provide a URL to prepare a demo.',
            );
          }
          if (signInRequired && !requestSignIn) {
            throw new Error(
              'Sign-in handoff is not available in this Studio session.',
            );
          }

          let url = requestedUrl;
          let previewStatus: BuilderPreviewStatus | null = null;
          if (!url) {
            const result = await startPreview({
              codebaseId,
              script,
              reuseExisting: true,
            });
            if (result.state !== 'ready' || !result.url) {
              throw new Error(
                result.error ??
                  result.message ??
                  'The project preview did not report a ready URL.',
              );
            }
            url = result.url;
            previewStatus = dependencies.preview.getStatus();
          } else {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              throw new Error('Demo URLs must use HTTP or HTTPS.');
            }
          }

          const browser = dependencies.openBrowser(url, {
            visible: true,
            partition,
          });
          let signInConfirmed = false;
          if (signInRequired && requestSignIn) {
            const outcome = await requestSignIn(browser.id);
            if (outcome !== 'confirmed') {
              return {
                success: false,
                browserId: browser.id,
                windowId: browser.id,
                url,
                signInConfirmed: false,
                error:
                  outcome === 'expired'
                    ? 'Sign-in confirmation expired. No recording was started.'
                    : 'Sign-in was cancelled. No recording was started.',
              };
            }
            signInConfirmed = true;
          }

          return {
            success: true,
            browserId: browser.id,
            windowId: browser.id,
            bounds: browser.bounds,
            url,
            preview: previewStatus
              ? publicStatus(previewStatus)
              : null,
            signInConfirmed,
            nextStep:
              'Start recording with this windowId, then drive the demo and mark highlights.',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    getProjectPreviewStatus: tool({
      description:
        'Check the state and local URL of the active project preview without exposing its process log.',
      inputSchema: z.object({}),
      execute: () => ({
        success: true,
        ...publicStatus(currentProjectStatus()),
      }),
    }),

    stopProjectPreview: tool({
      description:
        'Stop the Qeda-managed preview for the active Studio project. Requires user approval.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          if (
            !projectId ||
            previewOwners.get(dependencies.preview)?.projectId !== projectId
          ) {
            throw new Error(
              'There is no Qeda-managed preview owned by the active Studio project.',
            );
          }
          const status = await dependencies.preview.stop();
          previewOwners.delete(dependencies.preview);
          return { success: true, ...publicStatus(status) };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
  };
}
