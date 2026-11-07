/**
 * __tests__/project-files-media.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The `qeda-media://project-file/<id>` host.
 *
 * The host is the only place the renderer's previews get bytes, so the tests are
 * about the allow-list: an unknown id is a 404, a row marked missing is a 404, a
 * path-shaped id never resolves a path, and a catalogued file streams with range
 * support (which is what makes video seeking work).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { makeScannedFile, upsertProjectFiles } from '../main/db/project-files';
import { serveProjectFile } from '../main/media/project-files';

/**
 * jsdom does not implement fetch's Response/Headers. The host only needs status
 * and header reads, so a tiny stand-in is enough — and it keeps the test focused
 * on resolution rather than on undici.
 */
class TestHeaders {
  private values = new Map<string, string>();

  constructor(init?: Record<string, string> | TestHeaders) {
    if (init instanceof TestHeaders) {
      for (const [key, value] of init.values) this.values.set(key, value);
    } else if (init) {
      for (const [key, value] of Object.entries(init)) {
        this.values.set(key.toLowerCase(), String(value));
      }
    }
  }

  set(key: string, value: string): void {
    this.values.set(key.toLowerCase(), value);
  }

  get(key: string): string | null {
    return this.values.get(key.toLowerCase()) ?? null;
  }
}

class TestResponse {
  status: number;
  headers: TestHeaders;
  body: unknown;

  constructor(
    body?: unknown,
    init?: { status?: number; headers?: Record<string, string> | TestHeaders },
  ) {
    this.status = init?.status ?? 200;
    this.headers =
      init?.headers instanceof TestHeaders
        ? init.headers
        : new TestHeaders(init?.headers);
    this.body = body;
  }
}

function fakeRequest(url: string, range?: string): Request {
  return {
    url,
    method: 'GET',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'range' ? (range ?? null) : null,
    },
  } as unknown as Request;
}

describe('project file media host', () => {
  let db: Database.Database;
  let root: string;
  let projectId: string;

  beforeAll(() => {
    const globals = globalThis as unknown as {
      Response?: unknown;
      Headers?: unknown;
    };
    // jsdom provides neither, but Node's undici may provide Headers only. Use
    // the stand-ins for both so a Response never wraps a real Headers object
    // the assertions cannot read.
    globals.Response = TestResponse;
    globals.Headers = TestHeaders;
  });

  afterAll(() => {
    const globals = globalThis as unknown as {
      Response?: unknown;
      Headers?: unknown;
    };
    delete globals.Response;
    delete globals.Headers;
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-project-media-'));

    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
      'project-media',
      'Media',
    );
    projectId = 'project-media';
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function catalogue(fileName: string, contents: string, missing = false) {
    const filePath = path.join(root, fileName);
    fs.writeFileSync(filePath, contents);
    const file = makeScannedFile({
      filePath,
      relativePath: fileName,
      rootKey: 'repo',
      sources: ['repo'],
      missing,
      sizeBytes: contents.length,
      mtimeMs: 1,
    });
    upsertProjectFiles(projectId, [file], Math.floor(Date.now() / 1000));
    return file;
  }

  it('serves a catalogued file by id, with an etag and content type', async () => {
    const file = catalogue('notes.txt', 'hello world');
    const row = db
      .prepare('SELECT id FROM project_files WHERE path = ?')
      .get(file.path) as { id: string };

    const response = await serveProjectFile(
      fakeRequest(`qeda-media://project-file/${row.id}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('etag')).toBe(`"${row.id}-1"`);
  });

  it('supports byte ranges so video can seek', async () => {
    const file = catalogue('clip.mp4', '0123456789');
    const row = db
      .prepare('SELECT id FROM project_files WHERE path = ?')
      .get(file.path) as { id: string };

    const response = await serveProjectFile(
      fakeRequest(`qeda-media://project-file/${row.id}`, 'bytes=2-4'),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(response.headers.get('content-length')).toBe('3');
  });

  it('404s an unknown id and a row marked missing', async () => {
    expect(
      (await serveProjectFile(fakeRequest('qeda-media://project-file/nope')))
        .status,
    ).toBe(404);

    const file = catalogue('gone.png', 'x', true);
    const row = db
      .prepare('SELECT id FROM project_files WHERE path = ?')
      .get(file.path) as { id: string };

    expect(
      (
        await serveProjectFile(
          fakeRequest(`qeda-media://project-file/${row.id}`),
        )
      ).status,
    ).toBe(404);
  });

  it('never treats a path-shaped id as a filesystem path', async () => {
    const response = await serveProjectFile(
      fakeRequest(
        `qeda-media://project-file/${encodeURIComponent('../../etc/passwd')}`,
      ),
    );
    expect(response.status).toBe(404);
  });
});
