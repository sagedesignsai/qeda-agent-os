/**
 * components/documents/primitives/PrimitiveNodeRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Recursive DOM canvas renderer for granular Yoga Flexbox micro-primitives.
 *
 * Maps:
 *   - Container nodes (Box, Row, Column) -> 1:1 CSS Flexbox with Yoga layout math
 *   - Text primitives -> Typography styling with live editing
 *   - Icon primitives -> Dynamic Lucide icons
 *   - Image primitives -> Sizing and object-fit modes
 *   - Spacer & Divider primitives -> Spacing rules
 *   - Selection outline ring with contextual node label
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type {
  DocNode,
  BoxNode,
  RowNode,
  ColumnNode,
  TextNode,
  IconNode,
  ImageNode,
  SpacerNode,
  DividerNode,
  YogaFlexProps,
  NodeSizing,
  NodeAppearance,
} from '@/lib/pdf-studio/primitives-ast';
import {
  isContainerNode,
  resolveStyleValue,
} from '@/lib/pdf-studio/primitives-ast';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DocumentTheme } from '@/lib/pdf-studio/types';

interface PrimitiveNodeRendererProps {
  node: DocNode;
  selectedNodeId: string | null;
  theme?: DocumentTheme;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<DocNode>) => void;
}

export function buildTokenMap(theme?: DocumentTheme): Record<string, string> {
  return {
    'color-primary': theme?.primaryColor || '#0284c7',
    'color-secondary': theme?.secondaryColor || '#475569',
    'color-accent': theme?.accentColor || '#f97316',
    'color-background': theme?.backgroundColor || '#ffffff',
    'color-surface': theme?.surfaceColor || '#f8fafc',
    'color-text': theme?.textColor || '#0f172a',
    'color-muted': theme?.mutedColor || '#64748b',
    'color-border': theme?.borderColor || '#e2e8f0',
    'radius-sm': '4',
    'radius-md': '8',
    'radius-lg': '12',
    'radius-full': '9999',
  };
}

export function computeFlexStyles(
  layout: YogaFlexProps | undefined,
  sizing: NodeSizing | undefined,
  appearance: NodeAppearance | undefined,
  tokenMap: Record<string, string>,
): React.CSSProperties {
  const styles: React.CSSProperties = {
    display: 'flex',
    boxSizing: 'border-box',
    position: 'relative',
  };

  // 1. Flexbox Direction & Alignment
  if (layout) {
    styles.flexDirection = layout.flexDirection || 'column';
    styles.justifyContent = layout.justifyContent || 'flex-start';
    styles.alignItems = layout.alignItems || 'stretch';
    styles.flexWrap = layout.flexWrap || 'nowrap';

    if (layout.rowGap !== undefined) {
      styles.rowGap = `${layout.rowGap}pt`;
    }
    if (layout.columnGap !== undefined) {
      styles.columnGap = `${layout.columnGap}pt`;
    }

    if (layout.padding) {
      const p = layout.padding;
      styles.padding = `${p.top}pt ${p.right}pt ${p.bottom}pt ${p.left}pt`;
    }
  }

  // 2. Sizing (Width & Height)
  const effectiveSizing = sizing || layout?.sizing;
  if (effectiveSizing) {
    const { width, height } = effectiveSizing;

    if (width.mode === 'fill') {
      styles.flex = 1;
      styles.width = '100%';
    } else if (width.mode === 'fixed' && width.value !== undefined) {
      styles.width = `${width.value}pt`;
    } else {
      styles.width = 'auto';
    }

    if (height.mode === 'fill') {
      styles.height = '100%';
    } else if (height.mode === 'fixed' && height.value !== undefined) {
      styles.height = `${height.value}pt`;
    } else {
      styles.height = 'auto';
    }

    if (width.min !== undefined) styles.minWidth = `${width.min}pt`;
    if (width.max !== undefined) styles.maxWidth = `${width.max}pt`;
    if (height.min !== undefined) styles.minHeight = `${height.min}pt`;
    if (height.max !== undefined) styles.maxHeight = `${height.max}pt`;
  }

  // 3. Appearance
  if (appearance) {
    if (appearance.background) {
      styles.backgroundColor = resolveStyleValue(
        appearance.background,
        tokenMap,
        'transparent',
      );
    }

    if (appearance.opacity !== undefined) {
      styles.opacity = appearance.opacity / 100;
    }

    if (appearance.blendMode) {
      styles.mixBlendMode = appearance.blendMode;
    }

    if (appearance.radius) {
      const r = appearance.radius;
      styles.borderRadius = `${r.topLeft}pt ${r.topRight}pt ${r.bottomRight}pt ${r.bottomLeft}pt`;
    }

    if (appearance.border) {
      const b = appearance.border;
      styles.borderStyle = b.style || 'solid';
      styles.borderTopWidth = `${b.topWidth}pt`;
      styles.borderRightWidth = `${b.rightWidth}pt`;
      styles.borderBottomWidth = `${b.bottomWidth}pt`;
      styles.borderLeftWidth = `${b.leftWidth}pt`;
      styles.borderColor = resolveStyleValue(b.color, tokenMap, 'transparent');
    }
  }

  return styles;
}

export function PrimitiveNodeRenderer({
  node,
  selectedNodeId,
  theme,
  onSelectNode,
  onUpdateNode,
}: PrimitiveNodeRendererProps) {
  const tokenMap = buildTokenMap(theme);
  const isSelected = selectedNodeId === node.id;
  const isContainer = isContainerNode(node);

  if (node.hidden) {
    return null;
  }

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node.id);
  };

  // Base selection class
  const selectionClass = isSelected
    ? 'ring-2 ring-primary ring-offset-1 z-10'
    : 'hover:outline hover:outline-1 hover:outline-primary/40';

  // ─── 1. Container Nodes (Box, Row, Column) ──────────────────────────────────
  if (isContainer) {
    const containerNode = node as BoxNode | RowNode | ColumnNode;
    const style = computeFlexStyles(
      containerNode.layout,
      containerNode.layout?.sizing,
      containerNode.appearance,
      tokenMap,
    );

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        style={style}
        className={`transition-shadow ${selectionClass}`}
      >
        {/* Selection Tag Pill */}
        {isSelected && (
          <div className="absolute -top-3 left-1 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase">
            <span>{node.type}</span>
            {node.name && <span>({node.name})</span>}
          </div>
        )}

        {/* Children */}
        {containerNode.children.map((child) => (
          <PrimitiveNodeRenderer
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            theme={theme}
            onSelectNode={onSelectNode}
            onUpdateNode={onUpdateNode}
          />
        ))}

        {/* Empty container placeholder */}
        {containerNode.children.length === 0 && (
          <div className="flex h-12 w-full items-center justify-center rounded border border-dashed border-border/80 text-[11px] text-muted-foreground/60 select-none">
            Empty {node.type} container
          </div>
        )}
      </div>
    );
  }

  // ─── 2. Text Primitive ───────────────────────────────────────────────────────
  if (node.type === 'text') {
    const textNode = node as TextNode;
    const color = resolveStyleValue(textNode.color, tokenMap, '#0f172a');
    const fontFamily = resolveStyleValue(
      textNode.fontFamily,
      tokenMap,
      'Inter, sans-serif',
    );

    const textStyle: React.CSSProperties = {
      fontSize: `${textNode.fontSize ?? 11}pt`,
      lineHeight: textNode.lineHeight ?? 1.45,
      letterSpacing: textNode.letterSpacing
        ? `${textNode.letterSpacing}pt`
        : undefined,
      textAlign: textNode.align || 'left',
      color,
      fontFamily,
      fontWeight: textNode.fontWeight ?? (textNode.bold ? 700 : 400),
      fontStyle: textNode.italic ? 'italic' : 'normal',
      textDecoration:
        [textNode.underline && 'underline', textNode.strike && 'line-through']
          .filter(Boolean)
          .join(' ') || undefined,
      outline: 'none',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    };

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        className={`relative rounded px-0.5 transition-shadow ${selectionClass}`}
      >
        {/* Selection Tag Pill */}
        {isSelected && (
          <div className="absolute -top-3 left-1 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase select-none">
            <span>Text</span>
            {node.name && <span>({node.name})</span>}
          </div>
        )}

        <div
          contentEditable={!node.locked}
          suppressContentEditableWarning
          style={textStyle}
          onBlur={(e) => {
            const newText = e.currentTarget.textContent || '';
            if (newText !== textNode.content) {
              onUpdateNode(node.id, { content: newText });
            }
          }}
          className="peer outline-none min-h-[1.2em] w-full"
        >
          {textNode.content}
        </div>

        {/* Placeholder when content is empty */}
        {!textNode.content && (
          <div
            style={textStyle}
            className="absolute inset-0 pointer-events-none text-muted-foreground/50 select-none peer-focus:hidden hidden peer-empty:block px-0.5"
          >
            Type something...
          </div>
        )}
      </div>
    );
  }

  // ─── 3. Icon Primitive ──────────────────────────────────────────────────────
  if (node.type === 'icon') {
    const iconNode = node as IconNode;
    const color = resolveStyleValue(iconNode.color, tokenMap, 'currentColor');

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        className={`relative inline-flex items-center justify-center p-0.5 rounded cursor-pointer ${selectionClass}`}
      >
        {isSelected && (
          <div className="absolute -top-3 left-0 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase">
            <span>Icon</span>
          </div>
        )}
        <DynamicLucideIcon
          name={iconNode.iconName}
          size={iconNode.size ?? 16}
          style={{ color }}
        />
      </div>
    );
  }

  // ─── 4. Image Primitive ─────────────────────────────────────────────────────
  if (node.type === 'image') {
    const imageNode = node as ImageNode;
    const radius = imageNode.radius || {
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    };

    const imageStyle: React.CSSProperties = {
      objectFit: imageNode.fit || 'cover',
      borderRadius: `${radius.topLeft}pt ${radius.topRight}pt ${radius.bottomRight}pt ${radius.bottomLeft}pt`,
      width:
        imageNode.sizing?.width.mode === 'fixed'
          ? `${imageNode.sizing.width.value}pt`
          : '100%',
      height:
        imageNode.sizing?.height.mode === 'fixed'
          ? `${imageNode.sizing.height.value}pt`
          : 'auto',
      maxHeight: imageNode.sizing?.height.max
        ? `${imageNode.sizing.height.max}pt`
        : '320pt',
    };

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        className={`relative inline-block rounded overflow-hidden cursor-pointer ${selectionClass}`}
      >
        {isSelected && (
          <div className="absolute -top-3 left-1 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase">
            <span>Image</span>
          </div>
        )}
        <img
          src={
            imageNode.src ||
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80'
          }
          alt={imageNode.name || 'document image'}
          style={imageStyle}
        />
      </div>
    );
  }

  // ─── 5. Spacer Primitive ────────────────────────────────────────────────────
  if (node.type === 'spacer') {
    const spacerNode = node as SpacerNode;
    const style: React.CSSProperties = {
      flex: spacerNode.flex || (spacerNode.size ? undefined : 1),
      height: spacerNode.size ? `${spacerNode.size}pt` : '16pt',
      width: spacerNode.size ? `${spacerNode.size}pt` : '100%',
    };

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        style={style}
        className={`relative border border-dashed border-border/40 rounded bg-muted/10 cursor-pointer ${selectionClass}`}
      >
        {isSelected && (
          <div className="absolute -top-3 left-1 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase">
            <span>Spacer ({spacerNode.size ?? 16}pt)</span>
          </div>
        )}
      </div>
    );
  }

  // ─── 6. Divider Primitive ───────────────────────────────────────────────────
  if (node.type === 'divider') {
    const dividerNode = node as DividerNode;
    const color = resolveStyleValue(dividerNode.color, tokenMap, '#e2e8f0');
    const isVertical = dividerNode.orientation === 'vertical';

    const style: React.CSSProperties = isVertical
      ? {
          width: '0px',
          height: '100%',
          borderLeftWidth: `${dividerNode.thickness ?? 1}pt`,
          borderLeftStyle: dividerNode.style || 'solid',
          borderLeftColor: color,
          margin: '0 8pt',
        }
      : {
          width: '100%',
          height: '0px',
          borderTopWidth: `${dividerNode.thickness ?? 1}pt`,
          borderTopStyle: dividerNode.style || 'solid',
          borderTopColor: color,
          margin: '8pt 0',
        };

    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        className={`relative cursor-pointer py-1 ${selectionClass}`}
      >
        {isSelected && (
          <div className="absolute -top-3 left-1 z-20 flex items-center gap-1 rounded bg-primary px-1.5 py-0.2 text-[9px] font-mono text-primary-foreground pointer-events-none shadow-xs uppercase">
            <span>Divider</span>
          </div>
        )}
        <div style={style} />
      </div>
    );
  }

  // ─── 7. PageBreak Primitive ─────────────────────────────────────────────────
  if (node.type === 'page-break') {
    return (
      <div
        id={`node-${node.id}`}
        onClick={handleNodeClick}
        className={`relative my-4 flex items-center justify-center border-t-2 border-dashed border-destructive/40 py-2 cursor-pointer select-none ${selectionClass}`}
      >
        <span className="bg-background px-3 text-[10px] font-mono uppercase tracking-wider text-destructive/80 font-semibold">
          ⸺ Forced Page Break ⸺
        </span>
      </div>
    );
  }

  return null;
}
