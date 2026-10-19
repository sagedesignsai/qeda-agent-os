/**
 * __tests__/document-normalize.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for reading AI-authored document rows.
 *
 * The Document Drafter once persisted `{ blocks }` only (no id/title/settings)
 * and its loose block schema passed model output through unvalidated, so
 * paragraphs arrived as `{ text }` instead of `{ content }`. Opening one of
 * those rows crashed the editor. `normalizePdfDocument` is the read-boundary
 * repair, and these tests pin its tolerance for untrusted JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { normalizePdfDocument } from '../lib/pdf-studio/document-normalize';
import type {
  ColumnsBlock,
  MetricsBlock,
  ParagraphBlock,
  TableBlock,
} from '../lib/pdf-studio/types';

describe('normalizePdfDocument', () => {
  it('heals an AI-shaped body: missing document fields, `text` paragraphs, loose tables', () => {
    const normalized = normalizePdfDocument(
      {
        blocks: [
          {
            id: 'callout-1',
            type: 'callout',
            variant: 'warning',
            title: 'Draft — not reviewed',
            text: 'AI-generated draft',
          },
          // The crash trigger: content lives under `text`.
          { id: 'p-1', type: 'paragraph', text: 'Hello from the drafter' },
          { id: 'p-2', type: 'paragraph', text: 'Second line' },
          {
            type: 'table',
            columns: [{ header: 'Item' }, { header: 'Cost', widthPct: '50' }],
            rows: [
              ['Consulting', 5000],
              [null, undefined],
            ],
          },
          {
            type: 'metrics',
            items: [{ label: 'Velocity', value: '+42%' }],
          },
        ],
      },
      { id: 'doc-1', title: 'AI Draft' },
    );

    expect(normalized.id).toBe('doc-1');
    expect(normalized.title).toBe('AI Draft');
    expect(normalized.settings.pageSize).toBe('A4');
    expect(normalized.settings.orientation).toBe('portrait');
    expect(normalized.settings.margins).toEqual({
      top: 36,
      right: 36,
      bottom: 36,
      left: 36,
    });
    expect(normalized.settings.theme.fontFamily).toBe('Helvetica');
    expect(Number.isFinite(normalized.createdAt)).toBe(true);

    const paragraph = normalized.blocks.find((b) => b.id === 'p-1');
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      content: 'Hello from the drafter',
    });

    const table = normalized.blocks.find((b) => b.type === 'table') as
      TableBlock | undefined;
    expect(table?.columns).toHaveLength(2);
    expect(table?.columns?.[1]?.widthPct).toBe(50);
    expect(table?.rows).toEqual([
      ['Consulting', '5000'],
      ['', ''],
    ]);
    expect(table?.columns?.every((c) => c.id)).toBe(true);

    const metrics = normalized.blocks.find((b) => b.type === 'metrics') as
      MetricsBlock | undefined;
    expect(metrics?.items?.[0]?.label).toBe('Velocity');
    expect(metrics?.items?.[0]?.id).toBeTruthy();
  });

  it('never throws on null, arrays, primitives or malformed blocks', () => {
    expect(() => normalizePdfDocument(null)).not.toThrow();
    expect(() => normalizePdfDocument(undefined)).not.toThrow();
    expect(() => normalizePdfDocument('nope')).not.toThrow();
    expect(() => normalizePdfDocument([1, 2, 3])).not.toThrow();
    expect(() =>
      normalizePdfDocument({ blocks: [null, 42, 'x', { no: 'type' }] }),
    ).not.toThrow();

    const empty = normalizePdfDocument(null);
    expect(empty.blocks).toEqual([]);
    expect(empty.title).toBe('Untitled document');
    expect(empty.settings.pageSize).toBe('A4');
  });

  it('recursively normalizes nested column blocks', () => {
    const normalized = normalizePdfDocument({
      blocks: [
        {
          type: 'columns',
          gap: 12,
          columns: [
            {
              title: 'Left',
              blocks: [{ type: 'paragraph', text: 'Nested text' }],
            },
          ],
        },
      ],
    });

    const columns = normalized.blocks[0] as ColumnsBlock;
    expect(columns.columns[0].blocks).toHaveLength(1);
    const nested = columns.columns[0].blocks[0] as ParagraphBlock;
    expect(nested.content).toBe('Nested text');
  });
});
