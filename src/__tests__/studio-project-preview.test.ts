jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
}));

import {
  EMPTY_PREVIEW_STATUS,
  type BuilderPreviewStatus,
} from '../lib/builder/preview';
import type { Project } from '../main/db/projects';
import type { CodeProject } from '../main/db/code-projects';
import { createStudioProjectPreviewTools } from '../main/tools/studio-project-preview';

function makePreview() {
  let status: BuilderPreviewStatus = { ...EMPTY_PREVIEW_STATUS };
  const listeners = new Set<(next: BuilderPreviewStatus) => void>();
  const preview = {
    start: jest.fn(
      async ({ directory, script }: { directory: string; script?: string }) => {
        status = {
          ...EMPTY_PREVIEW_STATUS,
          state: 'ready',
          owner: 'qeda',
          url: 'http://localhost:5173/',
          command: `pnpm run ${script}`,
          directory,
        };
        for (const listener of listeners) listener(status);
        return status;
      },
    ),
    getStatus: () => status,
    subscribe: jest.fn((listener: (next: BuilderPreviewStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    stop: jest.fn(async () => {
      status = { ...EMPTY_PREVIEW_STATUS, message: 'Preview stopped.' };
      return status;
    }),
    dispose: jest.fn(),
  };
  return preview;
}

const project = {
  id: 'project-1',
  name: 'Demo project',
  repo_path: null,
} as Project;

const codeProject = (id: string, directory: string) =>
  ({
    id,
    project_id: 'project-1',
    name: id,
    directory,
  }) as CodeProject;

function dependencies(preview = makePreview()) {
  return {
    getProject: jest.fn(() => project),
    listCodeProjects: jest.fn(() => [
      codeProject('code-1', '/repos/demo'),
    ]),
    preview,
    readFile: jest.fn(async () =>
      JSON.stringify({
        scripts: { start: 'vite --host', dev: 'vite --host' },
      }),
    ),
    readDirectory: jest.fn(async () => ['pnpm-lock.yaml']),
    openBrowser: jest.fn(
      (_url: string, _options: { visible: true; partition?: string }) => ({
        id: 'browser-1',
        bounds: { x: 10, y: 20, width: 1280, height: 800 },
      }),
    ),
  };
}

describe('Studio project preview tools', () => {
  it('lists linked codebases with scripts, manager, and a suggested script', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.getProjectRunOptions as any).execute({});

    expect(result).toEqual({
      success: true,
      codebases: [
        {
          id: 'code-1',
          name: 'code-1',
          directory: '/repos/demo',
          packageManager: 'pnpm',
          scripts: { start: 'vite --host', dev: 'vite --host' },
          suggestedScript: 'dev',
          error: null,
        },
      ],
    });
  });

  it('will not run a codebase that is not linked to the active project', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.startProjectPreview as any).execute({
      codebaseId: 'other-project-code',
      script: 'dev',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not linked to the active Studio project/);
    expect(deps.preview.start).not.toHaveBeenCalled();
  });

  it('requires a codebase choice when the project has multiple repositories', async () => {
    const deps = dependencies();
    deps.listCodeProjects.mockReturnValue([
      codeProject('code-1', '/repos/demo'),
      codeProject('code-2', '/repos/api'),
    ]);
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.startProjectPreview as any).execute({});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/multiple codebases/);
    expect(deps.preview.start).not.toHaveBeenCalled();
  });

  it('starts only a manifest-listed script and returns the ready URL without logs', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.startProjectPreview as any).execute({
      codebaseId: 'code-1',
    });

    expect(deps.preview.start).toHaveBeenCalledWith({
      directory: '/repos/demo',
      script: 'dev',
    });
    expect(result).toMatchObject({
      success: true,
      state: 'ready',
      url: 'http://localhost:5173/',
    });
    expect(result).not.toHaveProperty('log');
  });

  it('rejects a script name that is not in the project manifest', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.startProjectPreview as any).execute({
      codebaseId: 'code-1',
      script: 'dev; arbitrary-command',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not defined in this codebase/);
    expect(deps.preview.start).not.toHaveBeenCalled();
  });

  it('starts the selected project, opens its ready URL visibly, and returns a capture target', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.prepareProjectDemo as any).execute({
      codebaseId: 'code-1',
      signInRequired: false,
    });

    expect(deps.preview.start).toHaveBeenCalledWith({
      directory: '/repos/demo',
      script: 'dev',
    });
    expect(deps.openBrowser).toHaveBeenCalledWith(
      'http://localhost:5173/',
      { visible: true, partition: undefined },
    );
    expect(result).toMatchObject({
      success: true,
      browserId: 'browser-1',
      windowId: 'browser-1',
      url: 'http://localhost:5173/',
      signInConfirmed: false,
    });
  });

  it('reuses the active matching preview instead of starting it twice', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    await (tools.startProjectPreview as any).execute({
      codebaseId: 'code-1',
    });

    const result = await (tools.prepareProjectDemo as any).execute({
      codebaseId: 'code-1',
    });

    expect(deps.preview.start).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      url: 'http://localhost:5173/',
      windowId: 'browser-1',
    });
  });

  it('waits for sign-in confirmation before returning a recordable browser', async () => {
    const deps = dependencies();
    const requestSignIn = jest.fn().mockResolvedValue('confirmed');
    const tools = createStudioProjectPreviewTools(
      'project-1',
      deps,
      requestSignIn,
    );
    const result = await (tools.prepareProjectDemo as any).execute({
      codebaseId: 'code-1',
      signInRequired: true,
    });

    expect(requestSignIn).toHaveBeenCalledWith('browser-1');
    expect(result).toMatchObject({
      success: true,
      windowId: 'browser-1',
      signInConfirmed: true,
    });
  });

  it('does not open a browser or return success if the user cancels sign-in', async () => {
    const deps = dependencies();
    const requestSignIn = jest.fn().mockResolvedValue('cancelled');
    const tools = createStudioProjectPreviewTools(
      'project-1',
      deps,
      requestSignIn,
    );
    const result = await (tools.prepareProjectDemo as any).execute({
      codebaseId: 'code-1',
      signInRequired: true,
    });

    expect(deps.openBrowser).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      browserId: 'browser-1',
      error: expect.stringMatching(/cancelled/),
    });
    expect(result).not.toHaveProperty('nextStep');
  });

  it('opens a supplied HTTP(S) URL without starting an unrelated project script', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools(undefined, deps);
    const result = await (tools.prepareProjectDemo as any).execute({
      url: 'https://demo.example.test/dashboard',
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://demo.example.test/dashboard');
    expect(deps.preview.start).not.toHaveBeenCalled();
    expect(deps.openBrowser).toHaveBeenCalledWith(
      'https://demo.example.test/dashboard',
      { visible: true, partition: undefined },
    );
  });

  it('rejects non-HTTP(S) URLs without opening a browser', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools(undefined, deps);
    const result = await (tools.prepareProjectDemo as any).execute({
      url: 'file:///etc/passwd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/HTTP or HTTPS/);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it('requires an available sign-in handoff before opening a login browser', async () => {
    const deps = dependencies();
    const tools = createStudioProjectPreviewTools('project-1', deps);
    const result = await (tools.prepareProjectDemo as any).execute({
      url: 'https://demo.example.test/login',
      signInRequired: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Sign-in handoff is not available/);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });
});
