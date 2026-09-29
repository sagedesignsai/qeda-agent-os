/**
 * lib/pdf-studio/primitives-ast.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Foundation schema and types for granular Yoga Flexbox document primitives.
 *
 * Micro-primitives supported:
 *   - Containers: Box (styled wrapper), Row (horizontal flex), Column (vertical flex)
 *   - Content: Text, Icon, Image, Spacer, Divider, PageBreak
 *
 * Provides:
 *   - Full Yoga flexbox layout properties (direction, justify, align, gap, padding, sizing)
 *   - Dual-mode style value bindings (Design Tokens vs. Raw Values)
 *   - Tree traversal, mutation helpers, and backwards-compatible AST adapter
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type {
  PdfBlock,
  HeadingBlock,
  ParagraphBlock,
  CalloutBlock,
  MetricsBlock,
  TableBlock,
  SignatureBlock,
  DividerBlock,
  ImageBlock,
} from './types';

// ─── Primitive Node Types ────────────────────────────────────────────────────

export type DocNodeType =
  // Layout Containers (Yoga Flexbox)
  | 'box'
  | 'row'
  | 'column'
  | 'spacer'
  // Content Primitives
  | 'text'
  | 'icon'
  | 'image'
  | 'divider'
  | 'page-break';

// ─── Sizing & Layout Models ──────────────────────────────────────────────────

export type SizingMode = 'auto' | 'fill' | 'fixed';

export interface SizingDimension {
  mode: SizingMode;
  value?: number; // pt or px when mode === 'fixed'
  min?: number;
  max?: number;
}

export interface NodeSizing {
  width: SizingDimension;
  height: SizingDimension;
}

export interface NodePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NodeBorder {
  color?: StyleValue<string>;
  style: 'solid' | 'dashed' | 'dotted';
  topWidth: number;
  rightWidth: number;
  bottomWidth: number;
  leftWidth: number;
}

export interface NodeCornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface YogaFlexProps {
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  rowGap?: number;
  columnGap?: number;
  padding?: NodePadding;
  sizing?: NodeSizing;
}

// ─── Design Tokens & Appearance ──────────────────────────────────────────────

export interface TokenReference {
  kind: 'token';
  name: string; // e.g., 'primary', 'secondary', 'surface', 'border', 'radius-md'
}

export type StyleValue<T> = T | TokenReference;

export function isToken(val: unknown): val is TokenReference {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as TokenReference).kind === 'token'
  );
}

export function resolveStyleValue<T>(
  val: StyleValue<T> | undefined,
  tokens: Record<string, T>,
  fallback: T,
): T {
  if (val === undefined || val === null) return fallback;
  if (isToken(val)) {
    return tokens[val.name] ?? fallback;
  }
  return val;
}

export interface NodeAppearance {
  background?: StyleValue<string>;
  opacity?: number; // 0..100
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  border?: NodeBorder;
  radius?: NodeCornerRadius;
  shadow?: {
    x: number;
    y: number;
    blur: number;
    color: string;
  };
}

// ─── Node Definitions ────────────────────────────────────────────────────────

export interface BaseDocNode {
  id: string;
  type: DocNodeType;
  name?: string; // Optional user label (e.g., 'submit_button', 'hero_card')
  locked?: boolean;
  hidden?: boolean;
}

// Layout Container Nodes
export interface BoxNode extends BaseDocNode {
  type: 'box';
  layout?: YogaFlexProps;
  appearance?: NodeAppearance;
  children: DocNode[];
}

export interface RowNode extends BaseDocNode {
  type: 'row';
  layout: Omit<YogaFlexProps, 'flexDirection'> & { flexDirection: 'row' };
  appearance?: NodeAppearance;
  children: DocNode[];
}

export interface ColumnNode extends BaseDocNode {
  type: 'column';
  layout: Omit<YogaFlexProps, 'flexDirection'> & { flexDirection: 'column' };
  appearance?: NodeAppearance;
  children: DocNode[];
}

// Content Primitives
export interface TextNode extends BaseDocNode {
  type: 'text';
  content: string;
  fontFamily?: StyleValue<string>;
  fontWeight?: 300 | 400 | 500 | 600 | 700 | 800;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: StyleValue<string>;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export interface IconNode extends BaseDocNode {
  type: 'icon';
  iconName: string; // Lucide icon identifier
  size?: number;
  color?: StyleValue<string>;
}

export interface ImageNode extends BaseDocNode {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  sizing?: NodeSizing;
  radius?: NodeCornerRadius;
}

export interface SpacerNode extends BaseDocNode {
  type: 'spacer';
  size?: number; // Fixed points or flex weight
  flex?: number;
}

export interface DividerNode extends BaseDocNode {
  type: 'divider';
  orientation?: 'horizontal' | 'vertical';
  thickness?: number;
  color?: StyleValue<string>;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface PageBreakNode extends BaseDocNode {
  type: 'page-break';
}

export type DocNode =
  | BoxNode
  | RowNode
  | ColumnNode
  | TextNode
  | IconNode
  | ImageNode
  | SpacerNode
  | DividerNode
  | PageBreakNode;

export type ContainerNode = BoxNode | RowNode | ColumnNode;

export function isContainerNode(node: DocNode): node is ContainerNode {
  return node.type === 'box' || node.type === 'row' || node.type === 'column';
}

// ─── Default Node Constructors ───────────────────────────────────────────────

export function createBoxNode(overrides?: Partial<BoxNode>): BoxNode {
  return {
    id: nanoid(8),
    type: 'box',
    layout: {
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      rowGap: 8,
      sizing: {
        width: { mode: 'fill' },
        height: { mode: 'auto' },
      },
    },
    appearance: {
      background: 'transparent',
      opacity: 100,
      radius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 },
    },
    children: [],
    ...overrides,
  };
}

export function createRowNode(overrides?: Partial<RowNode>): RowNode {
  return {
    id: nanoid(8),
    type: 'row',
    layout: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      columnGap: 8,
      rowGap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      sizing: {
        width: { mode: 'fill' },
        height: { mode: 'auto' },
      },
    },
    children: [],
    ...overrides,
  };
}

export function createColumnNode(overrides?: Partial<ColumnNode>): ColumnNode {
  return {
    id: nanoid(8),
    type: 'column',
    layout: {
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      rowGap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      sizing: {
        width: { mode: 'fill' },
        height: { mode: 'auto' },
      },
    },
    children: [],
    ...overrides,
  };
}

export function createTextNode(
  content: string,
  overrides?: Partial<TextNode>,
): TextNode {
  return {
    id: nanoid(8),
    type: 'text',
    content,
    fontSize: 11,
    lineHeight: 1.45,
    align: 'left',
    color: '#18181b',
    ...overrides,
  };
}

export function createIconNode(
  iconName: string,
  overrides?: Partial<IconNode>,
): IconNode {
  return {
    id: nanoid(8),
    type: 'icon',
    iconName,
    size: 16,
    color: '#3b82f6',
    ...overrides,
  };
}

export function createDividerNode(
  overrides?: Partial<DividerNode>,
): DividerNode {
  return {
    id: nanoid(8),
    type: 'divider',
    orientation: 'horizontal',
    thickness: 1,
    style: 'solid',
    color: '#e4e4e7',
    ...overrides,
  };
}

export function createSpacerNode(
  size = 16,
  overrides?: Partial<SpacerNode>,
): SpacerNode {
  return {
    id: nanoid(8),
    type: 'spacer',
    size,
    ...overrides,
  };
}

export function createPageBreakNode(): PageBreakNode {
  return {
    id: nanoid(8),
    type: 'page-break',
  };
}

// ─── Tree Traversal & Mutation Utilities ──────────────────────────────────────

export function findNodeById(root: DocNode[], id: string): DocNode | null {
  for (const node of root) {
    if (node.id === id) return node;
    if (isContainerNode(node)) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findNodePath(root: DocNode[], targetId: string): DocNode[] {
  function search(nodes: DocNode[], path: DocNode[]): DocNode[] | null {
    for (const node of nodes) {
      const currentPath = [...path, node];
      if (node.id === targetId) return currentPath;
      if (isContainerNode(node)) {
        const found = search(node.children, currentPath);
        if (found) return found;
      }
    }
    return null;
  }
  return search(root, []) || [];
}

export function updateNodeInTree(
  root: DocNode[],
  targetId: string,
  updater: (node: DocNode) => DocNode,
): DocNode[] {
  return root.map((node) => {
    if (node.id === targetId) {
      return updater(node);
    }
    if (isContainerNode(node)) {
      return {
        ...node,
        children: updateNodeInTree(node.children, targetId, updater),
      } as DocNode;
    }
    return node;
  });
}

export function removeNodeFromTree(
  root: DocNode[],
  targetId: string,
): DocNode[] {
  return root
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (isContainerNode(node)) {
        return {
          ...node,
          children: removeNodeFromTree(node.children, targetId),
        } as DocNode;
      }
      return node;
    });
}

export function insertNodeInTree(
  root: DocNode[],
  targetId: string | null,
  newNode: DocNode,
  position: 'after' | 'inside' = 'after',
): DocNode[] {
  if (!targetId) {
    return [...root, newNode];
  }

  function walk(nodes: DocNode[]): DocNode[] {
    const next: DocNode[] = [];
    for (const node of nodes) {
      if (node.id === targetId) {
        if (position === 'inside' && isContainerNode(node)) {
          next.push({
            ...node,
            children: [...node.children, newNode],
          } as DocNode);
        } else {
          next.push(node);
          next.push(newNode);
        }
      } else {
        if (isContainerNode(node)) {
          next.push({
            ...node,
            children: walk(node.children),
          } as DocNode);
        } else {
          next.push(node);
        }
      }
    }
    return next;
  }

  return walk(root);
}

// ─── Transparent Legacy Block Adapter ────────────────────────────────────────

/**
 * Converts any legacy flat PdfBlock into a modern hierarchical DocNode tree.
 */
export function legacyBlockToDocNode(block: PdfBlock): DocNode {
  switch (block.type) {
    case 'heading': {
      const h = block as HeadingBlock;
      const col = createColumnNode({ id: h.id, name: `Heading (H${h.level})` });
      col.layout.rowGap = 4;

      if (h.badge) {
        const badgeRow = createRowNode({ name: 'Badge' });
        badgeRow.layout.padding = { top: 2, right: 6, bottom: 2, left: 6 };
        if (badgeRow.layout?.sizing) {
          badgeRow.layout.sizing.width = { mode: 'auto' };
        }
        badgeRow.appearance = {
          background: { kind: 'token', name: 'primary' },
          opacity: 15,
          radius: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
        };
        badgeRow.children.push(
          createTextNode(h.badge, {
            fontSize: 9,
            fontWeight: 700,
            color: { kind: 'token', name: 'primary' },
          }),
        );
        col.children.push(badgeRow);
      }

      const fontSizes = { 1: 22, 2: 17, 3: 13, 4: 11 };
      col.children.push(
        createTextNode(h.text, {
          fontSize: fontSizes[h.level] || 16,
          fontWeight: 700,
          align: h.align || 'left',
          color: h.level === 1 ? { kind: 'token', name: 'primary' } : '#09090b',
        }),
      );

      if (h.subtitle) {
        col.children.push(
          createTextNode(h.subtitle, {
            fontSize: 11,
            color: '#71717a',
            align: h.align || 'left',
          }),
        );
      }
      return col;
    }

    case 'paragraph': {
      const p = block as ParagraphBlock;
      return createTextNode(p.content, {
        id: p.id,
        name: 'Paragraph',
        fontSize: p.fontSize || 11,
        lineHeight: p.lineHeight || 1.45,
        align: p.align || 'left',
        bold: p.bold,
        italic: p.italic,
        underline: p.underline,
        strike: p.strike,
        color: p.color || '#27272a',
      });
    }

    case 'callout': {
      const c = block as CalloutBlock;
      const box = createBoxNode({ id: c.id, name: `Callout (${c.variant})` });

      const variantColors: Record<
        string,
        { border: string; bg: string; icon: string }
      > = {
        info: { border: '#0284c7', bg: '#f0f9ff', icon: 'info' },
        warning: { border: '#f59e0b', bg: '#fffbeb', icon: 'alert-triangle' },
        success: { border: '#22c55e', bg: '#f0fdf4', icon: 'check-circle-2' },
        note: { border: '#64748b', bg: '#f8fafc', icon: 'file-text' },
        quote: { border: '#71717a', bg: '#fafafa', icon: 'quote' },
      };
      const v = variantColors[c.variant] || variantColors.info;

      box.appearance = {
        background: v.bg,
        border: {
          style: 'solid',
          topWidth: 0,
          rightWidth: 0,
          bottomWidth: 0,
          leftWidth: 3,
          color: v.border,
        },
        radius: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
      };
      box.layout = {
        ...box.layout,
        padding: { top: 10, right: 12, bottom: 10, left: 12 },
        rowGap: 4,
      };

      const row = createRowNode({ name: 'Callout Content' });
      row.layout.columnGap = 10;
      row.layout.alignItems = 'flex-start';

      row.children.push(createIconNode(v.icon, { size: 16, color: v.border }));

      const textCol = createColumnNode({ name: 'Text Container' });
      textCol.layout.rowGap = 2;
      if (c.title) {
        textCol.children.push(
          createTextNode(c.title, {
            fontSize: 11,
            fontWeight: 700,
            color: '#0f172a',
          }),
        );
      }
      textCol.children.push(
        createTextNode(c.text, {
          fontSize: 10,
          lineHeight: 1.4,
          color: '#334155',
        }),
      );

      row.children.push(textCol);
      box.children.push(row);
      return box;
    }

    case 'metrics': {
      const m = block as MetricsBlock;
      const row = createRowNode({ id: m.id, name: 'Metrics Row' });
      row.layout.columnGap = 12;

      for (const item of m.items) {
        const card = createBoxNode({
          id: item.id,
          name: `Metric (${item.label})`,
        });
        card.appearance = {
          background: '#ffffff',
          border: {
            style: 'solid',
            topWidth: 1,
            rightWidth: 1,
            bottomWidth: 1,
            leftWidth: 1,
            color: '#e4e4e7',
          },
          radius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 },
        };
        card.layout = {
          ...card.layout,
          padding: { top: 8, right: 10, bottom: 8, left: 10 },
          rowGap: 2,
        };

        card.children.push(
          createTextNode(item.value, {
            fontSize: 18,
            fontWeight: 800,
            color: '#09090b',
          }),
        );
        card.children.push(
          createTextNode(item.label, {
            fontSize: 10,
            fontWeight: 500,
            color: '#71717a',
          }),
        );
        if (item.change) {
          card.children.push(
            createTextNode(item.change, {
              fontSize: 9,
              color: item.isPositive ? '#16a34a' : '#71717a',
            }),
          );
        }
        row.children.push(card);
      }
      return row;
    }

    case 'table': {
      const t = block as TableBlock;
      const tableCol = createColumnNode({ id: t.id, name: 'Table Container' });
      tableCol.layout.rowGap = 0;
      tableCol.appearance = {
        border: {
          style: 'solid',
          topWidth: 1,
          rightWidth: 1,
          bottomWidth: 1,
          leftWidth: 1,
          color: '#e4e4e7',
        },
        radius: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
      };

      // Header row
      const headerRow = createRowNode({ name: 'Table Header' });
      headerRow.appearance = { background: t.headerBg || '#f4f4f5' };
      headerRow.layout.padding = { top: 6, right: 8, bottom: 6, left: 8 };

      for (const col of t.columns) {
        const thBox = createBoxNode({ name: `Header: ${col.header}` });
        if (thBox.layout?.sizing) {
          thBox.layout.sizing.width = { mode: 'fill' };
        }
        thBox.children.push(
          createTextNode(col.header, {
            fontSize: 10,
            fontWeight: 700,
            align: col.align || 'left',
            color: '#18181b',
          }),
        );
        headerRow.children.push(thBox);
      }
      tableCol.children.push(headerRow);

      // Data rows
      t.rows.forEach((row, rIdx) => {
        const dataRow = createRowNode({ name: `Row ${rIdx + 1}` });
        dataRow.appearance = {
          background: t.striped && rIdx % 2 === 1 ? '#f9fafb' : '#ffffff',
          border: {
            style: 'solid',
            topWidth: 1,
            rightWidth: 0,
            bottomWidth: 0,
            leftWidth: 0,
            color: '#f1f5f9',
          },
        };
        dataRow.layout.padding = { top: 6, right: 8, bottom: 6, left: 8 };

        row.forEach((cellText, cIdx) => {
          const tdBox = createBoxNode({ name: `Cell [${rIdx},${cIdx}]` });
          if (tdBox.layout?.sizing) {
            tdBox.layout.sizing.width = { mode: 'fill' };
          }
          tdBox.children.push(
            createTextNode(cellText, {
              fontSize: 10,
              align: t.columns[cIdx]?.align || 'left',
              color: '#334155',
            }),
          );
          dataRow.children.push(tdBox);
        });
        tableCol.children.push(dataRow);
      });

      return tableCol;
    }

    case 'signature': {
      const s = block as SignatureBlock;
      const sigCol = createColumnNode({ id: s.id, name: 'Signature Block' });
      sigCol.layout.rowGap = 4;
      if (sigCol.layout?.sizing) {
        sigCol.layout.sizing.width = { mode: 'fixed', value: 200 };
      }

      // Line
      sigCol.children.push(
        createDividerNode({ thickness: 1, color: '#a1a1aa' }),
      );

      // Signee Name
      sigCol.children.push(
        createTextNode(s.signeeName, {
          fontSize: 11,
          fontWeight: 700,
          color: '#09090b',
        }),
      );

      // Role & Company
      if (s.role || s.company) {
        sigCol.children.push(
          createTextNode([s.role, s.company].filter(Boolean).join(' • '), {
            fontSize: 9,
            color: '#71717a',
          }),
        );
      }

      // Date
      if (s.date) {
        sigCol.children.push(
          createTextNode(`Date: ${s.date}`, {
            fontSize: 9,
            color: '#a1a1aa',
          }),
        );
      }

      return sigCol;
    }

    case 'divider': {
      const d = block as DividerBlock;
      return createDividerNode({
        id: d.id,
        thickness: d.thickness || 1,
        style: d.style || 'solid',
        color: d.color || '#e4e4e7',
      });
    }

    case 'image': {
      const img = block as ImageBlock;
      return {
        id: img.id,
        type: 'image',
        name: 'Image',
        src: img.src,
        fit: 'contain',
        sizing: {
          width: { mode: img.width ? 'fixed' : 'auto', value: img.width },
          height: { mode: img.height ? 'fixed' : 'auto', value: img.height },
        },
      };
    }

    case 'page-break':
    default:
      return createPageBreakNode();
  }
}

/**
 * Converts a legacy PdfBlock array into a modern DocNode array.
 */
export function legacyBlocksToDocNodes(blocks: PdfBlock[]): DocNode[] {
  return (blocks || []).map(legacyBlockToDocNode);
}
