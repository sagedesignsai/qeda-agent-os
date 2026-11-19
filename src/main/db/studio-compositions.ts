import { getDb } from './client.js';
import { nanoid } from 'nanoid';
import {
  addCompositionImageLayer,
  createStudioCompositionDocumentFromTake,
  createStudioCompositionTemplate,
  instantiateStudioCompositionTemplate,
  parseStudioCompositionDocument,
  parseStudioCompositionTemplate,
} from '../../lib/studio/composition.js';
import type {
  StudioComposition,
  StudioCompositionDocument,
  StudioCompositionImageAsset,
  StudioCompositionSummary,
  StudioCompositionTemplate,
  StudioCompositionTemplateSummary,
  StudioTake,
  StudioTakeSummary,
} from '../../lib/studio/types.js';

interface CompositionRow {
  id: string;
  project_id: string | null;
  project_name?: string | null;
  title: string;
  data_json: string;
  revision?: number;
  created_at: number;
  updated_at: number;
}

function rowToComposition(row: CompositionRow): StudioComposition {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    document: parseStudioCompositionDocument(JSON.parse(row.data_json)),
    revision: row.revision ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStudioCompositions(
  projectId?: string | null,
): StudioCompositionSummary[] {
  const rows = projectId
    ? (getDb()
        .prepare(
          `SELECT c.id, c.project_id, p.name AS project_name, c.title,
                  c.data_json, c.revision, c.created_at, c.updated_at
             FROM studio_compositions c
        LEFT JOIN projects p ON p.id = c.project_id
            WHERE c.project_id = ?
         ORDER BY c.updated_at DESC, c.rowid DESC`,
        )
        .all(projectId) as CompositionRow[])
    : (getDb()
        .prepare(
          `SELECT c.id, c.project_id, p.name AS project_name, c.title,
                  c.data_json, c.revision, c.created_at, c.updated_at
             FROM studio_compositions c
        LEFT JOIN projects p ON p.id = c.project_id
         ORDER BY c.updated_at DESC, c.rowid DESC`,
        )
        .all() as CompositionRow[]);

  return rows.map((row) => {
    const composition = rowToComposition(row);
    return {
      id: composition.id,
      projectId: composition.projectId,
      projectName: row.project_name,
      title: composition.title,
      sceneId: composition.document.sceneId,
      aspectRatio: composition.document.aspectRatio,
      layerCount: composition.document.layers.length,
      durationMs: composition.document.durationMs,
      createdAt: composition.createdAt,
      updatedAt: composition.updatedAt,
    };
  });
}

export function getStudioComposition(id: string): StudioComposition | null {
  const row = getDb()
    .prepare(
      `SELECT id, project_id, title, data_json, revision, created_at, updated_at
         FROM studio_compositions
        WHERE id = ?`,
    )
    .get(id) as CompositionRow | undefined;
  return row ? rowToComposition(row) : null;
}

export function getDefaultStudioCompositionIdForTake(
  takeId: string,
): string | null {
  const row = getDb()
    .prepare(
      `SELECT composition_id
         FROM studio_take_default_compositions
        WHERE take_id = ?`,
    )
    .get(takeId) as { composition_id: string } | undefined;
  return row?.composition_id ?? null;
}

export function getDefaultStudioCompositionForTake(
  takeId: string,
): StudioComposition | null {
  const compositionId = getDefaultStudioCompositionIdForTake(takeId);
  return compositionId ? getStudioComposition(compositionId) : null;
}

export function getOrCreateDefaultStudioCompositionForTake(
  take: StudioTake,
): StudioComposition {
  const db = getDb();
  const existing = getDefaultStudioCompositionForTake(take.id);
  if (existing) return existing;
  if (!take.videoPath) {
    throw new Error(`Recording "${take.title}" has no video source.`);
  }

  const id = nanoid();
  const document = createStudioCompositionDocumentFromTake(take);
  const now = Math.floor(Date.now() / 1000);
  const resolveOrCreate = db.transaction(() => {
    const mapped = db
      .prepare(
        `SELECT composition_id
           FROM studio_take_default_compositions
          WHERE take_id = ?`,
      )
      .get(take.id) as { composition_id: string } | undefined;
    if (mapped) return mapped.composition_id;

    const prototypeRows = db
      .prepare(
        `SELECT id, data_json
           FROM studio_compositions
          WHERE project_id IS ? AND title = ?
          ORDER BY updated_at DESC, rowid DESC`,
      )
      .all(take.projectId, `${take.title} composition`) as Array<{
      id: string;
      data_json: string;
    }>;
    for (const row of prototypeRows) {
      try {
        const candidate = parseStudioCompositionDocument(
          JSON.parse(row.data_json),
        );
        const onlyLayer = candidate.layers[0];
        if (
          candidate.layers.length === 1 &&
          onlyLayer?.kind === 'video' &&
          onlyLayer.sourceId === take.id
        ) {
          db.prepare(
            `INSERT INTO studio_take_default_compositions (take_id, composition_id)
             VALUES (?, ?)`,
          ).run(take.id, row.id);
          return row.id;
        }
      } catch {
        // Ignore malformed/obsolete compositions; the Take importer below is recoverable.
      }
    }

    db.prepare(
      `INSERT INTO studio_compositions
         (id, project_id, title, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, take.projectId, take.title, JSON.stringify(document), now, now);
    db.prepare(
      `INSERT INTO studio_take_default_compositions (take_id, composition_id)
       VALUES (?, ?)`,
    ).run(take.id, id);
    return id;
  });

  const compositionId = resolveOrCreate();
  const composition = getStudioComposition(compositionId);
  if (!composition) {
    throw new Error(
      `Failed to create a default composition for take ${take.id}.`,
    );
  }
  return composition;
}

export function saveStudioComposition(input: {
  id: string;
  projectId?: string | null;
  title: string;
  document: StudioCompositionDocument;
  expectedRevision?: number;
}): StudioComposition {
  const document = parseStudioCompositionDocument(input.document);
  const title = input.title.trim();
  if (!title) throw new Error('A composition title is required.');

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const dataJson = JSON.stringify(document);
  if (input.expectedRevision !== undefined) {
    const result = db
      .prepare(
        `UPDATE studio_compositions
            SET project_id = ?, title = ?, data_json = ?,
                revision = revision + 1, updated_at = ?
          WHERE id = ? AND revision = ?`,
      )
      .run(
        input.projectId ?? null,
        title,
        dataJson,
        now,
        input.id,
        input.expectedRevision,
      );
    if (result.changes === 0) {
      throw new Error('This composition changed elsewhere. Reload and retry your edit.');
    }
  } else {
    db.prepare(
      `INSERT INTO studio_compositions
         (id, project_id, title, data_json, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_id = excluded.project_id,
         title = excluded.title,
         data_json = excluded.data_json,
         revision = studio_compositions.revision + 1,
         updated_at = excluded.updated_at`,
    ).run(
      input.id,
      input.projectId ?? null,
      title,
      dataJson,
      now,
      now,
    );
  }

  const saved = getStudioComposition(input.id);
  if (!saved) throw new Error(`Failed to save Studio composition ${input.id}.`);
  return saved;
}

export function deleteStudioComposition(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM studio_compositions WHERE id = ?').run(id)
      .changes > 0
  );
}

export function importStudioCompositionImageAsset(input: {
  id: string;
  compositionId: string;
  name: string;
  path: string;
}): StudioCompositionImageAsset {
  const composition = getStudioComposition(input.compositionId);
  if (!composition) {
    throw new Error(`Studio composition ${input.compositionId} was not found.`);
  }
  const document = addCompositionImageLayer(composition.document, {
    id: input.id,
    name: input.name,
  });
  const db = getDb();
  const persist = db.transaction(() => {
    db.prepare(
      `INSERT INTO studio_composition_assets (id, composition_id, name, path)
       VALUES (?, ?, ?, ?)`,
    ).run(input.id, input.compositionId, input.name, input.path);
    db.prepare(
      `UPDATE studio_compositions
          SET data_json = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?`,
    ).run(
      JSON.stringify(document),
      Math.floor(Date.now() / 1000),
      composition.id,
    );
  });
  persist();
  return { id: input.id, name: input.name };
}

export function getStudioCompositionImagePath(assetId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT path FROM studio_composition_assets
        WHERE id = ?`,
    )
    .get(assetId) as { path: string } | undefined;
  return row?.path ?? null;
}

export function listStudioCompositionTemplates(): StudioCompositionTemplateSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, data_json, created_at, updated_at
         FROM studio_composition_templates
        ORDER BY updated_at DESC, rowid DESC`,
    )
    .all() as Array<{
    id: string;
    data_json: string;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map(({ data_json }) => {
    const template = parseStudioCompositionTemplate(JSON.parse(data_json));
    return {
      id: template.id,
      title: template.title,
      sceneId: template.sceneId,
      aspectRatio: template.aspectRatio,
      videoLayers: template.layers
        .filter((layer) => layer.kind === 'video')
        .map((layer) => ({ id: layer.id, name: layer.name })),
      imageLayerCount: template.layers.filter((layer) => layer.kind === 'image')
        .length,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  });
}

export function getStudioCompositionTemplate(
  id: string,
): StudioCompositionTemplate | null {
  const row = getDb()
    .prepare(`SELECT data_json FROM studio_composition_templates WHERE id = ?`)
    .get(id) as { data_json: string } | undefined;
  return row ? parseStudioCompositionTemplate(JSON.parse(row.data_json)) : null;
}

export function saveStudioCompositionAsTemplate(input: {
  id: string;
  title: string;
  compositionId: string;
}): StudioCompositionTemplate {
  const composition = getStudioComposition(input.compositionId);
  if (!composition) {
    throw new Error(`Studio composition ${input.compositionId} was not found.`);
  }
  const assetRows = getDb()
    .prepare(
      `SELECT id, path FROM studio_composition_assets
        WHERE composition_id = ?`,
    )
    .all(composition.id) as Array<{ id: string; path: string }>;
  const imageAssetPaths = Object.fromEntries(
    assetRows.map((asset) => [asset.id, asset.path]),
  );
  const template = createStudioCompositionTemplate({
    id: input.id,
    title: input.title,
    composition,
    imageAssetPaths,
  });
  getDb()
    .prepare(
      `INSERT INTO studio_composition_templates
         (id, title, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      template.id,
      template.title,
      JSON.stringify(template),
      template.createdAt,
      template.updatedAt,
    );
  return template;
}

export function createStudioCompositionFromTemplate(input: {
  id: string;
  projectId?: string | null;
  title: string;
  templateId: string;
  sourceTakeIds: string[];
  getTake: (id: string) => StudioTakeSummary | null;
}): StudioComposition {
  const template = getStudioCompositionTemplate(input.templateId);
  if (!template) {
    throw new Error(
      `Studio composition template ${input.templateId} was not found.`,
    );
  }
  const takes = input.sourceTakeIds.map((id) => {
    const take = input.getTake(id);
    if (!take) throw new Error(`Studio take ${id} was not found.`);
    return { id: take.id, title: take.title, durationMs: take.durationMs };
  });
  const { document, imageAssets } = instantiateStudioCompositionTemplate(
    template,
    takes,
  );
  const title = input.title.trim();
  if (!title) throw new Error('A composition title is required.');

  const now = Math.floor(Date.now() / 1000);
  const db = getDb();
  const persist = db.transaction(() => {
    db.prepare(
      `INSERT INTO studio_compositions
         (id, project_id, title, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.projectId ?? null,
      title,
      JSON.stringify(document),
      now,
      now,
    );
    const insertAsset = db.prepare(
      `INSERT INTO studio_composition_assets (id, composition_id, name, path)
       VALUES (?, ?, ?, ?)`,
    );
    for (const asset of imageAssets) {
      insertAsset.run(asset.id, input.id, asset.name, asset.path);
    }
  });
  persist();
  const created = getStudioComposition(input.id);
  if (!created) {
    throw new Error(`Failed to create Studio composition ${input.id}.`);
  }
  return created;
}

export function deleteStudioCompositionTemplate(id: string): boolean {
  return (
    getDb()
      .prepare('DELETE FROM studio_composition_templates WHERE id = ?')
      .run(id).changes > 0
  );
}
