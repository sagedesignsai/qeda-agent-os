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
  /** If false, the block will not be split across pages (React-PDF wrap={false}) */
  wrap?: boolean;
  /** If true, forces a page break right before this block (React-PDF break={true}) */
  breakBefore?: boolean;
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
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  content: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  lineHeight?: number;
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
