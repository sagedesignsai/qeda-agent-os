/**
 * db/documents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite storage for PDF Document Studio.
 *
 * Persists composed documents with their block trees, page settings, and
 * theme definitions as versioned JSON snapshots. Tied optionally to projects
 * via project_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';

export interface PdfDocumentRecord {
  id: string;
  project_id: string | null;
  title: string;
  description: string;
  template_id: string;
  data_json: string;
  created_at: number;
  updated_at: number;
}

export interface PdfDocumentSummary {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  title: string;
  description: string;
  templateId: string;
  blockCount: number;
  createdAt: number;
  updatedAt: number;
}

interface DocumentRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  title: string;
  description: string;
  template_id: string;
  data_json: string;
  created_at: number;
  updated_at: number;
}

export function listDocuments(projectId?: string | null): PdfDocumentSummary[] {
  const db = getDb();
  let rows: DocumentRow[];

  if (projectId) {
    rows = db
      .prepare(
        `SELECT d.id, d.project_id, p.name AS project_name, d.title, d.description,
                d.template_id, d.data_json, d.created_at, d.updated_at
           FROM documents d
      LEFT JOIN projects p ON p.id = d.project_id
          WHERE d.project_id = ?
       ORDER BY d.updated_at DESC`,
      )
      .all(projectId) as DocumentRow[];
  } else {
    rows = db
      .prepare(
        `SELECT d.id, d.project_id, p.name AS project_name, d.title, d.description,
                d.template_id, d.data_json, d.created_at, d.updated_at
           FROM documents d
      LEFT JOIN projects p ON p.id = d.project_id
       ORDER BY d.updated_at DESC`,
      )
      .all() as DocumentRow[];
  }

  return rows.map((r) => {
    let blockCount = 0;
    try {
      const parsed = JSON.parse(r.data_json);
      if (Array.isArray(parsed.blocks)) {
        blockCount = parsed.blocks.length;
      }
    } catch {
      // Best-effort
    }

    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      title: r.title,
      description: r.description,
      templateId: r.template_id,
      blockCount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export function getDocument(id: string): PdfDocumentRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, project_id, title, description, template_id, data_json, created_at, updated_at
         FROM documents
        WHERE id = ?`,
    )
    .get(id) as PdfDocumentRecord | undefined;

  return row ?? null;
}

export function saveDocument(input: {
  id: string;
  projectId?: string | null;
  title: string;
  description?: string;
  templateId?: string;
  dataJson: string;
}): PdfDocumentRecord {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const existing = db
    .prepare('SELECT id, created_at FROM documents WHERE id = ?')
    .get(input.id) as { id: string; created_at: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE documents
          SET project_id = ?,
              title = ?,
              description = ?,
              template_id = ?,
              data_json = ?,
              updated_at = ?
        WHERE id = ?`,
    ).run(
      input.projectId ?? null,
      input.title,
      input.description ?? '',
      input.templateId ?? '',
      input.dataJson,
      now,
      input.id,
    );
  } else {
    db.prepare(
      `INSERT INTO documents (id, project_id, title, description, template_id, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.projectId ?? null,
      input.title,
      input.description ?? '',
      input.templateId ?? '',
      input.dataJson,
      now,
      now,
    );
  }

  const saved = getDocument(input.id);
  if (!saved) {
    throw new Error(`Failed to save document ${input.id}`);
  }
  return saved;
}

export function deleteDocument(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return res.changes > 0;
}
