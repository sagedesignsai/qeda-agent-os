/**
 * lib/builder-workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI-facing shapes for the Builder's file explorer and review surface. These
 * are renderer-safe view models; a later service adapter can map OpenCode/Git
 * records into them without coupling components to transport payloads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface BuilderFile {
  path: string;
  name: string;
  kind: 'file';
  language?: string;
  content?: string;
  change?: 'added' | 'modified' | 'deleted';
}

/**
 * A validated repository directory that a Builder session is bound to.
 *
 * The directory is the safety boundary: it is resolved to a real path and
 * proven to be a git repository *before* a session can be created against it,
 * so OpenCode never falls back to its ambient working directory. `branch` and
 * `dirty` are displayed to the user so a run never starts on a tree they did
 * not intend to change.
 *
 * `worktreePath` is present when Builder has created an isolated git worktree
 * for this session. All OpenCode turns run inside the worktree; the source
 * branch is never touched until the user explicitly keeps the changes.
 */
export interface BuilderWorkspace {
  /** Canonical repository root (realpath). */
  directory: string;
  /** Display name — the repository root's basename. */
  name: string;
  /** Current branch, or null for a detached HEAD. */
  branch: string | null;
  /** True when the working tree has uncommitted or untracked changes. */
  dirty: boolean;
  /** Number of changed/untracked entries reported by `git status`. */
  changedFileCount: number;
  /**
   * Absolute path to the isolated git worktree created for this session.
   * Present when worktree isolation is active; null when the session runs
   * directly in `directory` (legacy / fallback).
   */
  worktreePath: string | null;
}

export interface BuilderDirectory {
  path: string;
  name: string;
  kind: 'directory';
  children: BuilderFileNode[];
}

export type BuilderFileNode = BuilderFile | BuilderDirectory;

export type BuilderChangeKind = 'added' | 'modified' | 'deleted';

export interface BuilderFileChange {
  path: string;
  kind: BuilderChangeKind;
  additions: number;
  deletions: number;
  diff?: string;
}
