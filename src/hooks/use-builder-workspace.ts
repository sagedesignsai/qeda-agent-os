/**
 * hooks/use-builder-workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI-only Builder workspace state: active canvas surface, viewport preset, and
 * unsent prompt. Persist only lightweight preferences.
 *
 * NOT here: the preview address. That is live status owned by main (see
 * `use-builder-preview`), because a dev-server port dies with its process — a
 * renderer-local or persisted copy would outlive the thing it names and lie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';

export type BuilderSurface = 'preview' | 'code' | 'changes';
export type BuilderViewport = 'desktop' | 'tablet' | 'mobile';

interface BuilderPreferences {
  surface: BuilderSurface;
  viewport: BuilderViewport;
  /** Last custom preview command, kept per install so non-Node projects resume. */
  previewCommand: string;
  /**
   * When true, the next Builder session is created with `runInSandbox: true`,
   * i.e. inside an ephemeral E2B sandbox rather than a local worktree. The
   * preference is per-install; the actual sandbox creation still requires a
   * configured E2B key and a resolvable git remote.
   */
  runInSandbox: boolean;
}

const STORAGE_KEY = 'qeda:builder:preferences:v1';

function readPreferences(): BuilderPreferences {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return { surface: 'preview', viewport: 'desktop', previewCommand: '', runInSandbox: false };
    }
    const parsed = JSON.parse(value) as Partial<BuilderPreferences>;
    return {
      surface:
        parsed.surface === 'code' || parsed.surface === 'changes'
          ? parsed.surface
          : 'preview',
      viewport:
        parsed.viewport === 'tablet' || parsed.viewport === 'mobile'
          ? parsed.viewport
          : 'desktop',
      previewCommand:
        typeof parsed.previewCommand === 'string' ? parsed.previewCommand : '',
      runInSandbox: parsed.runInSandbox === true,
    };
  } catch {
    return { surface: 'preview', viewport: 'desktop', previewCommand: '', runInSandbox: false };
  }
}

export function useBuilderWorkspace() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [prompt, setPrompt] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be unavailable in private/test contexts; UI still works.
    }
  }, [preferences]);

  const setSurface = useCallback((surface: BuilderSurface) => {
    setPreferences((current) => ({ ...current, surface }));
  }, []);

  const setViewport = useCallback((viewport: BuilderViewport) => {
    setPreferences((current) => ({ ...current, viewport }));
  }, []);

  const setPreviewCommand = useCallback((previewCommand: string) => {
    setPreferences((current) => ({ ...current, previewCommand }));
  }, []);

  const setRunInSandbox = useCallback((runInSandbox: boolean) => {
    setPreferences((current) => ({ ...current, runInSandbox }));
  }, []);

  return {
    ...preferences,
    setSurface,
    setViewport,
    setPreviewCommand,
    setRunInSandbox,
    prompt,
    setPrompt,
    selectedFilePath,
    setSelectedFilePath,
  };
}
