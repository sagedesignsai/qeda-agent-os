/**
 * lib/pdf-studio/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Foundation types for the PDF Document Composer & Editor.
 *
 * Designed around @react-pdf/renderer primitives (Document, Page, View, Text,
 * Image, Svg, Form) with a rich block-based semantic tree that supports:
 *   - Executive proposals, invoices, technical specs, resumes, and reports
 *   - Multi-page pagination, headers, footers with dynamic page numbers
 *   - Flexible columns, structured tables, callout boxes, and metric cards
 *   - Unbreakable blocks (wrap: false) and forced page breaks (breakBefore)
 *   - Reusable color palettes and typography presets
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PageSize = 'A4' | 'LETTER' | 'LEGAL' | 'TABLOID';
export type PageOrientation = 'portrait' | 'landscape';
export type FontFamily = 'Helvetica' | 'Times-Roman' | 'Courier';

export interface DocumentMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocumentTheme {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: FontFamily;
}

export interface DocumentHeaderConfig {
  enabled: boolean;
  leftText?: string;
  rightText?: string;
  showDivider?: boolean;
}

export interface DocumentFooterConfig {
  enabled: boolean;
  leftText?: string;
  rightText?: string;
  pageNumberFormat?: 'simple' | 'page_of_total'; // e.g. "1" vs "Page 1 of 3"
  showDivider?: boolean;
}

export interface DocumentSettings {
  pageSize: PageSize;
  orientation: PageOrientation;
  margins: DocumentMargins;
  theme: DocumentTheme;
  header: DocumentHeaderConfig;
  footer: DocumentFooterConfig;
}

// ─── Bookmark & Inline Text Definitions ──────────────────────────────────────

export interface PdfBookmarkObject {
  title: string;
  top?: number;
  left?: number;
  zoom?: number;
  fit?: boolean;
  expanded?: boolean;
}

export type PdfBookmark = string | PdfBookmarkObject;

// Module augmentation for @react-pdf/renderer TextProps
declare module '@react-pdf/renderer' {
  interface TextProps {
    bookmark?: string | PdfBookmarkObject;
  }
}

export interface InlineTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  backgroundColor?: string;
  href?: string; // external URL or internal '#destination'
}

// ─── Block Definitions ────────────────────────────────────────────────────────

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'columns'
  | 'table'
  | 'callout'
  | 'metrics'
  | 'divider'
  | 'page-break'
  | 'signature'
  | 'image';

export interface BaseBlock {
  id: string;
  type: BlockType;
  /** Custom destination ID for internal document navigation / #links */
  anchorId?: string;
  /** If false, the block will not be split across pages (React-PDF wrap={false}) */
  wrap?: boolean;
  /** If true, forces a page break right before this block (React-PDF break={true}) */
  breakBefore?: boolean;
  /** Hint that no page wrapping should occur between following sibling elements within n points */
  minPresenceAhead?: number;
  /** If true, renders element in all wrapped pages (React-PDF fixed={true}) */
  fixed?: boolean;
  /** Enables debug bounding box outline */
  debug?: boolean;
  marginTop?: number;
  marginBottom?: number;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4;
  text: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  badge?: string;
  /** Attach bookmark to PDF outline tree (string, Bookmark object, or false to disable) */
  bookmark?: boolean | PdfBookmark;
  /** Hyphenation penalty (e.g. Infinity to prevent hyphenating words in headings) */
  hyphenationPenalty?: number;
  /** Structured inline text spans if not using string formatting */
  spans?: InlineTextSpan[];
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  content: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  lineHeight?: number;
  /** Minimum lines at bottom of page before breaking (default: 2) */
  orphans?: number;
  /** Minimum lines at top of page after breaking (default: 2) */
  widows?: number;
  /** Hyphenation penalty for paragraph text */
  hyphenationPenalty?: number;
  /** Attach bookmark to PDF outline tree */
  bookmark?: boolean | PdfBookmark;
  /** Structured inline text spans if not using string formatting */
  spans?: InlineTextSpan[];
  /** Render dynamic page context ({{pageNumber}}, {{totalPages}}) via React-PDF render prop */
  renderDynamic?: boolean;
}

export interface ColumnDefinition {
  id: string;
  title?: string;
  widthRatio?: number; // relative weight, e.g. 1, 2
  blocks: PdfBlock[];
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: ColumnDefinition[];
  gap: number;
}

export interface TableColumn {
  id: string;
  header: string;
  widthPct: number; // percentage of total table width (sums to 100)
  align?: 'left' | 'center' | 'right';
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  columns: TableColumn[];
  rows: string[][]; // rows[rowIndex][colIndex]
  striped?: boolean;
  showBorders?: boolean;
  headerBg?: string;
}

export type CalloutVariant = 'info' | 'warning' | 'success' | 'note' | 'quote';

export interface CalloutBlock extends BaseBlock {
  type: 'callout';
  variant: CalloutVariant;
  title?: string;
  text: string;
  icon?: string;
}

export interface MetricItem {
  id: string;
  label: string;
  value: string;
  change?: string;
  isPositive?: boolean;
}

export interface MetricsBlock extends BaseBlock {
  type: 'metrics';
  items: MetricItem[];
  columns?: 2 | 3 | 4;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  thickness?: number;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  spacing?: number;
}

export interface PageBreakBlock extends BaseBlock {
  type: 'page-break';
}

export interface SignatureBlock extends BaseBlock {
  type: 'signature';
  signeeName: string;
  role?: string;
  date?: string;
  company?: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  height?: number;
  width?: number;
  align?: 'left' | 'center' | 'right';
  caption?: string;
}

export type PdfBlock =
  | HeadingBlock
  | ParagraphBlock
  | ColumnsBlock
  | TableBlock
  | CalloutBlock
  | MetricsBlock
  | DividerBlock
  | PageBreakBlock
  | SignatureBlock
  | ImageBlock;

// ─── Top-level Document Structure ─────────────────────────────────────────────

export interface PdfDocument {
  id: string;
  title: string;
  description?: string;
  projectId?: string | null;
  templateId?: string;
  settings: DocumentSettings;
  blocks: PdfBlock[];
  createdAt: number;
  updatedAt: number;
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
