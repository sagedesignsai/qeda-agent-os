/**
 * __tests__/project-files-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The drafter's two read-only project-file tools: `listProjectFiles` and
 * `readProjectFile`.
 *
 * Fixtures are temp folders wired into a real in-memory database as a project's
 * `repo_path`, with NO git anywhere — which is the point of the module. The bug
 * this suite exists to prevent is someone "simplifying" the resolver back to
 * `tools/repo.ts`'s, which demands a `.git` entry and would then refuse every
 * legal project's matter folder.
 *
 * Everything security-relevant is asserted rather than left to review: no `.git`
 * requirement, no path fallback, `..` refused, symlink escape refused, absolute
 * path refused, output capped and truncation reported.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { projectFilesTools } from '../main/tools/project-files';
import { documentDrafterTools } from '../main/tools/documents-drafter';
import { documentDrafterToolPolicies } from '../main/tools/policies/drafter';
import { policyDrift } from '../main/tools/capability';

/** Invoke a tool the way the SDK does: `execute(input, options)`. */
function run(tool: unknown, input: unknown): Promise<any> {
  return (
    tool as { execute: (i: unknown, o: unknown) => Promise<any> }
  ).execute(input, { toolCallId: 'test', messages: [] });
}

let db: Database.Database;
/** The project folder. Deliberately not a git repository. */
let root: string;
/** A project whose `repo_path` points at `root`. */
let projectId: string;

function write(rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  useTestDatabase(db);

  // realpathSync because macOS hands back /var -> /private/var symlinks; without
  // it every containment comparison in the tool would be against a different
  // string than the one it computed.
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-matter-')),
  );

  write('engagement.md', '# Engagement letter\n\nDated 3 March.\n');
  write('notes/strategy.md', '# Strategy notes\n');
  write('notes/scratch.md', '# Scratch\n');
  write('correspondence/2024-01-05.txt', 'plain text, not markdown\n');
  write('node_modules/dep/readme.md', '# vendored\n');
  write('.git/config.md', '# pretend git metadata\n');
  write('dist/bundle.md', '# build output\n');
  write('.hidden/secret.md', '# hidden\n');

  projectId = createProject({ name: 'Matter', repo_path: root }).id;
});

afterEach(() => {
  useTestDatabase(null as unknown as Database.Database);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('listProjectFiles', () => {
  it('accepts a project folder that is not a git repository', async () => {
    expect(fs.existsSync(path.join(root, '.git'))).toBe(false);

    const result = await run(projectFilesTools.listProjectFiles, { projectId });
    expect(result.success).toBe(true);
    expect(result.projectName).toBe('Matter');
    // The folder really was used, not a silently-chosen default.
    expect(result.root).toBe(root);
  });

  it('lists only .md files by default, with size and mtime but no content', async () => {
    const result = await run(projectFilesTools.listProjectFiles, { projectId });
    expect(result.count).toBe(3);
    const paths = result.files.map((f: { path: string }) => f.path);
    expect(paths).toEqual([
      'engagement.md',
      'notes/scratch.md',
      'notes/strategy.md',
    ]);

    const first = result.files[0];
    expect(typeof first.sizeBytes).toBe('number');
    expect(first.sizeBytes).toBe(
      fs.statSync(path.join(root, 'engagement.md')).size,
    );
    expect(first.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Names and metadata only. A listing that leaked content would make the
    // cheap orientation call the expensive one.
    expect(JSON.stringify(result.files)).not.toContain('Dated 3 March');
  });

  it('skips node_modules, .git, dist and hidden folders', async () => {
    const result = await run(projectFilesTools.listProjectFiles, { projectId });
    const paths = result.files.map((f: { path: string }) => f.path);
    expect(paths.join(' ')).not.toContain('node_modules');
    expect(paths.join(' ')).not.toContain('.git');
    expect(paths.join(' ')).not.toContain('dist');
    expect(paths.join(' ')).not.toContain('.hidden');
  });

  it('honours an explicit suffix filter', async () => {
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId,
      include: ['.txt'],
    });
    expect(result.files.map((f: { path: string }) => f.path)).toEqual([
      'correspondence/2024-01-05.txt',
    ]);
  });

  it('scopes to a subdir', async () => {
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId,
      subdir: 'notes',
    });
    expect(result.files.map((f: { path: string }) => f.path)).toEqual([
      'notes/scratch.md',
      'notes/strategy.md',
    ]);
    // Paths stay project-relative, not relative to the subdir.
    expect(result.files[0].path.startsWith('notes/')).toBe(true);
  });

  it('reports truncation instead of silently capping', async () => {
    for (let i = 0; i < 6; i++) write(`bulk/f${i}.md`, `# ${i}\n`);

    const result = await run(projectFilesTools.listProjectFiles, {
      projectId,
      maxEntries: 2,
    });
    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.note).toContain('2-entry cap');
    expect(result.note).toContain('more matching files exist');
  });

  it('errors when the project has no folder configured, and never falls back', async () => {
    const noRepo = createProject({ name: 'No Folder', repo_path: null }).id;
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId: noRepo,
    });
    expect(result.success).toBe(false);
    // The error must name the project and the fix, and must not hand back a path.
    expect(result.error).toContain('No Folder');
    expect(result.error).toContain('no folder configured');
    expect(result.root).toBeUndefined();
  });

  it('errors for an unknown project id', async () => {
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId: 'nope',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('listProjects');
  });

  it('refuses a subdir that escapes the project folder', async () => {
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId,
      subdir: '../',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('outside the project folder');
  });

  it('errors for a missing subdir instead of returning an empty list', async () => {
    const result = await run(projectFilesTools.listProjectFiles, {
      projectId,
      subdir: 'no-such-folder',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('no-such-folder');
  });

  it('does not list a symlinked folder that escapes the project', async () => {
    const outside = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-outside-')),
    );
    try {
      fs.writeFileSync(path.join(outside, 'loot.md'), '# leaked\n');
      fs.symlinkSync(outside, path.join(root, 'escape'));

      const result = await run(projectFilesTools.listProjectFiles, {
        projectId,
      });
      const paths = result.files.map((f: { path: string }) => f.path);
      expect(paths.join(' ')).not.toContain('escape');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('readProjectFile', () => {
  it('reads a project-relative path and returns its text', async () => {
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'notes/strategy.md',
    });
    expect(result.success).toBe(true);
    expect(result.relativePath).toBe('notes/strategy.md');
    expect(result.content).toBe('# Strategy notes\n');
    expect(result.truncated).toBe(false);
    expect(result.sizeBytes).toBe(17);
  });

  it('returns only the requested bytes and says how much it cut', async () => {
    const long = 'abcdefghij'.repeat(50); // 500 bytes
    write('long.md', long);

    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'long.md',
      maxBytes: 100,
    });
    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.sizeBytes).toBe(500);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(100);
    // The model must not mistake a prefix for the whole file.
    expect(result.note).toContain('cut to the first 100 bytes of 500');
    expect(result.note).toContain('NOT read');
  });

  it('reports truncated: false when the file fits the budget', async () => {
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'engagement.md',
      maxBytes: 30_000,
    });
    expect(result.truncated).toBe(false);
    expect(result.content).toContain('Dated 3 March');
    expect(result.note).toContain('SOURCE EVIDENCE');
  });

  it('refuses an absolute path', async () => {
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: path.join(root, 'engagement.md'),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('relative to the project folder');
  });

  it('refuses a ../ escape', async () => {
    const outside = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-outside-')),
    );
    try {
      fs.writeFileSync(path.join(outside, 'secret.md'), '# secret\n');
      const result = await run(projectFilesTools.readProjectFile, {
        projectId,
        filePath: path.join(outside, 'secret.md'),
      });
      // An absolute path is refused first; the escape guard is what catches the
      // relative form of the same request.
      expect(result.success).toBe(false);

      const relative = await run(projectFilesTools.readProjectFile, {
        projectId,
        filePath: `../${path.basename(outside)}/secret.md`,
      });
      expect(relative.success).toBe(false);
      expect(relative.error).toContain('outside the project folder');
      expect(relative.content).toBeUndefined();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses to follow a symlink out of the project folder', async () => {
    const outside = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-outside-')),
    );
    try {
      fs.writeFileSync(path.join(outside, 'secret.md'), '# secret\n');
      fs.symlinkSync(
        path.join(outside, 'secret.md'),
        path.join(root, 'linked.md'),
      );

      const result = await run(projectFilesTools.readProjectFile, {
        projectId,
        filePath: 'linked.md',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('symlink escape');
      expect(result.content).toBeUndefined();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('allows a symlink that stays inside the project folder', async () => {
    fs.symlinkSync(
      path.join(root, 'engagement.md'),
      path.join(root, 'alias.md'),
    );
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'alias.md',
    });
    // Containment, not link-ness, is the rule: an internal alias is harmless and
    // refusing it would be the kind of false negative that teaches the model to
    // work around the guard.
    expect(result.success).toBe(true);
    expect(result.relativePath).toBe('engagement.md');
  });

  it('errors for a missing file', async () => {
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'nope.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('nope.md');
    expect(result.error).toContain('listProjectFiles');
  });

  it('refuses to read a directory', async () => {
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'notes',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a file');
  });

  it('refuses a binary file rather than emitting mangled text', async () => {
    fs.writeFileSync(
      path.join(root, 'blob.md'),
      Buffer.from([0x61, 0x00, 0x62]),
    );
    const result = await run(projectFilesTools.readProjectFile, {
      projectId,
      filePath: 'blob.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('text file');
  });

  it('errors when the project has no folder configured', async () => {
    const noRepo = createProject({ name: 'No Folder', repo_path: null }).id;
    const result = await run(projectFilesTools.readProjectFile, {
      projectId: noRepo,
      filePath: 'engagement.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No Folder');
  });
});

describe('wiring into the drafter', () => {
  it('exposes exactly eight tools, with both project-file reads among them', () => {
    const names = Object.keys(documentDrafterTools);
    expect(names).toHaveLength(8);
    expect(names).toContain('listProjectFiles');
    expect(names).toContain('readProjectFile');
  });

  it('classifies every exposed tool and leaves no stale policy row', () => {
    const drift = policyDrift(
      documentDrafterToolPolicies,
      Object.keys(documentDrafterTools),
    );
    expect(drift.unclassified).toEqual([]);
    expect(drift.stale).toEqual([]);
  });

  it('classifies both project-file tools as read, so neither is gated', () => {
    expect(documentDrafterToolPolicies.listProjectFiles.capability).toBe(
      'read',
    );
    expect(documentDrafterToolPolicies.readProjectFile.capability).toBe('read');
  });

  it('leaves the drafter with no shell, no write and no export tool', () => {
    for (const name of [
      'runShell',
      'writeFile',
      'deleteFile',
      'readFile',
      'listDir',
      'indexFile',
      'exportDocument',
      'sendEmail',
    ]) {
      expect(documentDrafterTools).not.toHaveProperty(name);
    }
  });
});
