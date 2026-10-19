/**
 * lib/pdf-studio/document-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runtime healing for `PdfDocument` bodies read back from SQLite.
 *
 * Documents do not all arrive through the template factories. The AI Document
 * Drafter's `createDocument` tool once persisted `{ blocks }` only, omitting the
 * document id, title, settings and timestamps, and its loosely-typed block
 * schema let models emit paragraphs as `{ text }` instead of `{ content }`.
 * Opening such a row crashed the editor on `text.length` (and would then crash
 * on `doc.settings.theme`), leaving the document permanently un-openable.
 *
 * Normalisation happens at the read boundary rather than through a destructive
 * data migration: old rows stay intact and readable, while the next editor save
 * writes the healed shape back. This function must therefore be TOTAL — it is
 * fed untrusted JSON and must never throw, whatever the shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { DEFAULT_THEME } from './themes';
import type {
  BlockType,
  CalloutVariant,
  ColumnDefinition,
  DocNode,
  DocumentSettings,
  HeadingBlock,
  ImageBlock,
  MetricsBlock,
  PageOrientation,
  PageSize,
  ParagraphBlock,
  PdfBlock,
  PdfDocument,
  SignatureBlock,
  TableBlock,
} from './types';

export interface PdfDocumentFallback {
  id?: string;
  title?: string;
  description?: string;
  projectId?: string | null;
  templateId?: string;
}

const PAGE_SIZES: readonly PageSize[] = ['A4', 'LETTER', 'LEGAL', 'TABLOID'];
const ORIENTATIONS: readonly PageOrientation[] = ['portrait', 'landscape'];
const FONT_FAMILIES = ['Helvetica', 'Times-Roman', 'Courier'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const CALLOUT_VARIANTS: readonly CalloutVariant[] = [
  'info',
  'warning',
  'success',
  'note',
  'quote',
];
const BLOCK_TYPES: readonly BlockType[] = [
  'heading',
  'paragraph',
  'columns',
  'table',
  'callout',
  'metrics',
  'divider',
  'page-break',
  'signature',
  'image',
];

const DEFAULT_MARGINS = { top: 36, right: 36, bottom: 36, left: 36 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 | 4 {
  const level = Math.round(asNumber(value, 2));
  if (level <= 1) return 1;
  if (level >= 4) return 4;
  return level as 1 | 2 | 3 | 4;
}

function normalizeSettings(raw: unknown): DocumentSettings {
  const settings = isRecord(raw) ? raw : {};
  const margins = isRecord(settings.margins) ? settings.margins : {};
  const theme = isRecord(settings.theme) ? settings.theme : {};
  const header = isRecord(settings.header) ? settings.header : {};
  const footer = isRecord(settings.footer) ? settings.footer : {};

  return {
    pageSize: oneOf(settings.pageSize, PAGE_SIZES, 'A4'),
    orientation: oneOf(settings.orientation, ORIENTATIONS, 'portrait'),
    margins: {
      top: asNumber(margins.top, DEFAULT_MARGINS.top),
      right: asNumber(margins.right, DEFAULT_MARGINS.right),
      bottom: asNumber(margins.bottom, DEFAULT_MARGINS.bottom),
      left: asNumber(margins.left, DEFAULT_MARGINS.left),
    },
    theme: {
      name: asString(theme.name, DEFAULT_THEME.name),
      primaryColor: asString(theme.primaryColor, DEFAULT_THEME.primaryColor),
      secondaryColor: asString(
        theme.secondaryColor,
        DEFAULT_THEME.secondaryColor,
      ),
      accentColor: asString(theme.accentColor, DEFAULT_THEME.accentColor),
      backgroundColor: asString(
        theme.backgroundColor,
        DEFAULT_THEME.backgroundColor,
      ),
      surfaceColor: asString(theme.surfaceColor, DEFAULT_THEME.surfaceColor),
      textColor: asString(theme.textColor, DEFAULT_THEME.textColor),
      mutedColor: asString(theme.mutedColor, DEFAULT_THEME.mutedColor),
      borderColor: asString(theme.borderColor, DEFAULT_THEME.borderColor),
      fontFamily: oneOf(
        theme.fontFamily,
        FONT_FAMILIES,
        DEFAULT_THEME.fontFamily,
      ),
    },
    header: {
      enabled: asBoolean(header.enabled, false),
      leftText: asOptionalString(header.leftText),
      rightText: asOptionalString(header.rightText),
      showDivider: asBoolean(header.showDivider, false),
    },
    footer: {
      enabled: asBoolean(footer.enabled, false),
      leftText: asOptionalString(footer.leftText),
      rightText: asOptionalString(footer.rightText),
      pageNumberFormat: oneOf(
        footer.pageNumberFormat,
        ['simple', 'page_of_total'] as const,
        'simple',
      ),
      showDivider: asBoolean(footer.showDivider, false),
    },
  };
}

function normalizeTableColumn(raw: unknown): unknown {
  const column = isRecord(raw) ? raw : {};
  return {
    ...column,
    id: asString(column.id) || nanoid(),
    header: asString(column.header),
    widthPct: asNumber(column.widthPct, 25),
    align: oneOf(column.align, TEXT_ALIGNS, 'left'),
  };
}

function normalizeMetricItem(raw: unknown): unknown {
  const item = isRecord(raw) ? raw : {};
  return {
    ...item,
    id: asString(item.id) || nanoid(),
    label: asString(item.label),
    value: asString(item.value),
    change: asOptionalString(item.change),
    isPositive:
      typeof item.isPositive === 'boolean' ? item.isPositive : undefined,
  };
}

function normalizeColumnDefinition(raw: unknown): ColumnDefinition {
  const column = isRecord(raw) ? raw : {};
  return {
    ...column,
    id: asString(column.id) || nanoid(),
    title: asOptionalString(column.title),
    widthRatio:
      typeof column.widthRatio === 'number' &&
      Number.isFinite(column.widthRatio)
        ? column.widthRatio
        : undefined,
    blocks: normalizeBlocks(column.blocks),
  };
}

function normalizeBlock(raw: unknown): PdfBlock | null {
  if (!isRecord(raw)) return null;

  const type = asString(raw.type) as BlockType;
  if (!BLOCK_TYPES.includes(type)) return null;

  const base = { ...raw, id: asString(raw.id) || nanoid(), type };

  switch (type) {
    case 'heading':
      return {
        ...base,
        level: normalizeHeadingLevel(raw.level),
        text: asString(raw.text, asString(raw.content)),
      } as HeadingBlock;

    case 'paragraph':
      // AI output commonly used `text`; the editor and renderer read `content`.
      return {
        ...base,
        content: asString(raw.content, asString(raw.text)),
      } as ParagraphBlock;

    case 'callout':
      return {
        ...base,
        variant: oneOf(raw.variant, CALLOUT_VARIANTS, 'info'),
        text: asString(raw.text, asString(raw.content)),
      } as PdfBlock;

    case 'table':
      return {
        ...base,
        columns: asArray(raw.columns).map(normalizeTableColumn),
        rows: asArray(raw.rows)
          .filter(Array.isArray)
          .map((row) =>
            (row as unknown[]).map((cell) =>
              cell === null || cell === undefined ? '' : String(cell),
            ),
          ),
      } as TableBlock;

    case 'metrics':
      return {
        ...base,
        items: asArray(raw.items).map(normalizeMetricItem),
      } as MetricsBlock;

    case 'columns':
      return {
        ...base,
        columns: asArray(raw.columns).map(normalizeColumnDefinition),
      } as PdfBlock;

    case 'image':
      return {
        ...base,
        src: asString(raw.src),
      } as ImageBlock;

    case 'signature':
      return {
        ...base,
        signeeName: asString(raw.signeeName),
      } as SignatureBlock;

    case 'divider':
    case 'page-break':
      return base as PdfBlock;
  }
}

function normalizeBlocks(raw: unknown): PdfBlock[] {
  return asArray(raw)
    .map(normalizeBlock)
    .filter((block): block is PdfBlock => block !== null);
}

/**
 * Turn any parsed `data_json` payload into a complete, editor-safe
 * `PdfDocument`. The optional `fallback` carries metadata from the SQLite row
 * (id, title, project) for documents whose stored body predates those fields.
 */
export function normalizePdfDocument(
  raw: unknown,
  fallback: PdfDocumentFallback = {},
): PdfDocument {
  const data = isRecord(raw) ? raw : {};
  const now = Date.now();
  const nodes = Array.isArray(data.nodes)
    ? (data.nodes as DocNode[])
    : undefined;

  const rawProjectId = data.projectId;
  const projectId =
    rawProjectId === null
      ? null
      : typeof rawProjectId === 'string' && rawProjectId
        ? rawProjectId
        : (fallback.projectId ?? null);

  return {
    id: asString(data.id) || asString(fallback.id) || nanoid(),
    title:
      asString(data.title) || asString(fallback.title) || 'Untitled document',
    description: asString(data.description, asString(fallback.description)),
    projectId,
    templateId:
      asString(data.templateId) || asString(fallback.templateId) || '',
    settings: normalizeSettings(data.settings),
    blocks: normalizeBlocks(data.blocks),
    ...(nodes && nodes.length > 0 ? { nodes } : {}),
    createdAt: asNumber(data.createdAt, now),
    updatedAt: asNumber(data.updatedAt, now),
  };
}
