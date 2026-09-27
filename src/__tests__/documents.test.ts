/**
 * __tests__/documents.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for PDF Document Studio:
 *   - Template factories and schema structure
 *   - SQLite database CRUD operations and migrations
 *   - @react-pdf/renderer document compilation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  listDocuments,
  getDocument,
  saveDocument,
  deleteDocument,
} from '../main/db/documents';
import {
  createExecutiveProposal,
  createProfessionalInvoice,
  createModernResume,
  createTechnicalSpec,
  createBlankDocument,
  DOCUMENT_TEMPLATES,
} from '../lib/pdf-studio/templates';
import { PdfDocumentView } from '../lib/pdf-studio/renderer';
import { pdf } from '@react-pdf/renderer';
import React from 'react';

describe('PDF Studio Templates', () => {
  it('provides all 5 core document templates', () => {
    expect(DOCUMENT_TEMPLATES.length).toBe(5);
    const ids = DOCUMENT_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('executive-proposal');
    expect(ids).toContain('professional-invoice');
    expect(ids).toContain('modern-resume');
    expect(ids).toContain('technical-spec');
    expect(ids).toContain('blank-document');
  });

  it('creates an executive proposal with proper block types and settings', () => {
    const doc = createExecutiveProposal();
    expect(doc.title).toContain('Proposal');
    expect(doc.settings.pageSize).toBe('A4');
    expect(doc.settings.header.enabled).toBe(true);
    expect(doc.settings.footer.enabled).toBe(true);
    expect(doc.blocks.length).toBeGreaterThan(4);

    const blockTypes = doc.blocks.map((b) => b.type);
    expect(blockTypes).toContain('heading');
    expect(blockTypes).toContain('callout');
    expect(blockTypes).toContain('metrics');
    expect(blockTypes).toContain('table');
    expect(blockTypes).toContain('signature');
  });

  it('creates a professional invoice with itemized table and payment instructions', () => {
    const doc = createProfessionalInvoice();
    expect(doc.title).toContain('Invoice');
    expect(doc.settings.theme.name).toBe('Emerald Slate');

    const tableBlock = doc.blocks.find((b) => b.type === 'table') as
      import('../lib/pdf-studio/types').TableBlock | undefined;
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.columns.length).toBe(4);
    expect(tableBlock?.rows.length).toBeGreaterThan(2);
  });

  it('creates a modern resume with 2-column competencies', () => {
    const doc = createModernResume();
    expect(doc.settings.pageSize).toBe('LETTER');
    const cols = doc.blocks.find((b) => b.type === 'columns');
    expect(cols).toBeDefined();
  });
});

describe('PDF Studio Database Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  it('saves and retrieves a document by ID', () => {
    const proposal = createExecutiveProposal();
    const saved = saveDocument({
      id: proposal.id,
      projectId: proposal.projectId,
      title: proposal.title,
      description: proposal.description,
      templateId: proposal.templateId,
      dataJson: JSON.stringify(proposal),
    });

    expect(saved.id).toBe(proposal.id);
    expect(saved.title).toBe(proposal.title);

    const retrieved = getDocument(proposal.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe(proposal.title);

    const parsed = JSON.parse(retrieved!.data_json);
    expect(parsed.blocks.length).toBe(proposal.blocks.length);
  });

  it('lists documents ordered by updated_at', () => {
    const doc1 = createBlankDocument();
    const doc2 = createProfessionalInvoice();

    saveDocument({
      id: doc1.id,
      title: doc1.title,
      dataJson: JSON.stringify(doc1),
    });

    saveDocument({
      id: doc2.id,
      title: doc2.title,
      dataJson: JSON.stringify(doc2),
    });

    const list = listDocuments();
    expect(list.length).toBe(2);
    expect(list.map((d) => d.id)).toContain(doc1.id);
    expect(list.map((d) => d.id)).toContain(doc2.id);
  });

  it('updates an existing document in-place', () => {
    const doc = createBlankDocument();
    saveDocument({
      id: doc.id,
      title: 'Original Title',
      dataJson: JSON.stringify(doc),
    });

    saveDocument({
      id: doc.id,
      title: 'Updated Title',
      dataJson: JSON.stringify({ ...doc, title: 'Updated Title' }),
    });

    const updated = getDocument(doc.id);
    expect(updated?.title).toBe('Updated Title');
  });

  it('deletes a document', () => {
    const doc = createTechnicalSpec();
    saveDocument({
      id: doc.id,
      title: doc.title,
      dataJson: JSON.stringify(doc),
    });

    expect(getDocument(doc.id)).not.toBeNull();
    const ok = deleteDocument(doc.id);
    expect(ok).toBe(true);
    expect(getDocument(doc.id)).toBeNull();
  });
});

describe('React-PDF Renderer Compilation', () => {
  it('compiles a document tree into a valid PDF binary blob', async () => {
    const doc = createExecutiveProposal();
    const element = React.createElement(PdfDocumentView, { doc });
    const instance = pdf(element);
    const blob = await instance.toBlob();

    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('PDF Studio Text Elements & Rich Inline Capabilities', () => {
  const {
    parseInlineSpans,
    renderInlineFormattedText,
  } = require('../lib/pdf-studio/inline-text');
  const { THEMES } = require('../lib/pdf-studio/themes');

  it('parses markdown formatting into structured inline text spans', () => {
    const input =
      'Hello **bold**, *italic*, __underline__, ~~strike~~, `const x = 1;`, and [Docugent](https://docugent.ai) with {color:accent}highlight{/color}!';
    const spans = parseInlineSpans(input);

    expect(spans.length).toBeGreaterThan(6);

    const boldSpan = spans.find((s: any) => s.text === 'bold');
    expect(boldSpan?.bold).toBe(true);

    const italicSpan = spans.find((s: any) => s.text === 'italic');
    expect(italicSpan?.italic).toBe(true);

    const underlineSpan = spans.find((s: any) => s.text === 'underline');
    expect(underlineSpan?.underline).toBe(true);

    const strikeSpan = spans.find((s: any) => s.text === 'strike');
    expect(strikeSpan?.strike).toBe(true);

    const codeSpan = spans.find((s: any) => s.text === 'const x = 1;');
    expect(codeSpan?.code).toBe(true);

    const linkSpan = spans.find((s: any) => s.text === 'Docugent');
    expect(linkSpan?.href).toBe('https://docugent.ai');

    const colorSpan = spans.find((s: any) => s.text === 'highlight');
    expect(colorSpan?.color).toBe('accent');
  });

  it('compiles document with headings, bookmarks, minPresenceAhead, and destinations', async () => {
    const baseDoc = createBlankDocument();
    baseDoc.blocks = [
      {
        id: 'h1-intro',
        anchorId: 'section-intro',
        type: 'heading',
        level: 1,
        text: '1. Executive Summary',
        bookmark: 'Executive Summary',
        minPresenceAhead: 40,
        hyphenationPenalty: Infinity,
      },
      {
        id: 'p1-desc',
        anchorId: 'p-summary',
        type: 'paragraph',
        content:
          'This document contains **crucial** project data with [Jump to Terms](#section-terms) and `code snippets`.',
        orphans: 3,
        widows: 3,
        minPresenceAhead: 15,
      },
      {
        id: 'p2-dynamic',
        type: 'paragraph',
        content: 'Document Page: {{pageNumber}} / {{totalPages}}',
        renderDynamic: true,
      },
      {
        id: 'h2-terms',
        anchorId: 'section-terms',
        type: 'heading',
        level: 2,
        text: '2. Terms & Pricing',
        bookmark: true,
        minPresenceAhead: 25,
      },
    ];

    const element = React.createElement(PdfDocumentView, { doc: baseDoc });
    const instance = pdf(element);
    const blob = await instance.toBlob();

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
  });
});

