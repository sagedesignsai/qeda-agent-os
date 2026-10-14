import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import { renderProjectContext } from '../main/ai/project-context';
import { getRecentProjectMemories } from '../main/tools/rag';
import { createProject } from '../main/db/projects';

describe('Project Vector Memory and Scoped RAG', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as any);
    db.close();
  });

  it('migrates chunks table to include project_id', () => {
    const columns = db
      .prepare('PRAGMA table_info(chunks)')
      .all() as Array<{ name: string }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain('project_id');
  });

  it('stores and retrieves project memories for active project context', () => {
    const project = createProject({
      name: 'Alpha Project',
      description: 'Building a vector memory agent OS',
    });

    const chunkId = 'chunk-mem-1';
    const filePath = `project-memory://${project.id}/mem-1`;
    const content = '[DECISION] Use sqlite-vec for project-scoped vector memories';

    db.prepare(
      'INSERT INTO chunks (id, file_path, chunk_index, content, project_id) VALUES (?, ?, ?, ?, ?)',
    ).run(chunkId, filePath, 0, content, project.id);

    const memories = getRecentProjectMemories(project.id, 5);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain('Use sqlite-vec for project-scoped vector memories');

    const contextText = renderProjectContext({ projectId: project.id });
    expect(contextText).toContain('Alpha Project');
    expect(contextText).toContain('Recent Project Memory Context');
    expect(contextText).toContain('[DECISION] Use sqlite-vec for project-scoped vector memories');
  });

  it('filters project memories strictly by project_id', () => {
    const projA = createProject({ name: 'Project A' });
    const projB = createProject({ name: 'Project B' });

    db.prepare(
      'INSERT INTO chunks (id, file_path, chunk_index, content, project_id) VALUES (?, ?, ?, ?, ?)',
    ).run('c-1', `project-memory://${projA.id}/m1`, 0, 'Memory A', projA.id);

    db.prepare(
      'INSERT INTO chunks (id, file_path, chunk_index, content, project_id) VALUES (?, ?, ?, ?, ?)',
    ).run('c-2', `project-memory://${projB.id}/m2`, 0, 'Memory B', projB.id);

    const memoriesA = getRecentProjectMemories(projA.id);
    const memoriesB = getRecentProjectMemories(projB.id);

    expect(memoriesA).toHaveLength(1);
    expect(memoriesA[0].content).toBe('Memory A');

    expect(memoriesB).toHaveLength(1);
    expect(memoriesB[0].content).toBe('Memory B');
  });
});
