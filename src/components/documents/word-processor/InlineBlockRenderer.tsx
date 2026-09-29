/**
 * components/documents/word-processor/InlineBlockRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct in-place visual block editor for the Word Processor canvas:
 *   - Direct on-page typing for Headings, Paragraphs, Tables, and Callouts
 *   - Tab-based cell navigation and auto-row creation for Data Tables
 *   - Hover gutter handles for reordering and element insertion
 *   - Contextual table toolbar when table cells are focused
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useState } from 'react';
import {
  InfoIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  QuoteIcon,
  FileTextIcon,
  PlusIcon,
  Trash2Icon,
  ScissorsIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  PdfBlock,
  BlockType,
  HeadingBlock,
  ParagraphBlock,
  TableBlock,
  CalloutBlock,
  MetricsBlock,
  ColumnsBlock,
  DividerBlock,
  SignatureBlock,
  DocumentTheme,
} from '@/lib/pdf-studio/types';
import { TableContextToolbar } from './TableContextToolbar';
import { BlockGutterHandle } from './BlockGutterHandle';

interface InlineBlockRendererProps {
  block: PdfBlock;
  theme: DocumentTheme;
  isActive: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<PdfBlock>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAfter: (type: BlockType) => void;
  // Table operations
  onAddTableRow?: (rowIndex?: number) => void;
  onDeleteTableRow?: (rowIndex: number) => void;
  onAddTableCol?: (colIndex?: number) => void;
  onDeleteTableCol?: (colIndex: number) => void;
  onUpdateTableCell?: (
    rowIndex: number,
    colIndex: number,
    text: string,
  ) => void;
  onUpdateTableHeader?: (colIndex: number, text: string) => void;
}

export function InlineBlockRenderer({
  block,
  theme,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
  onAddTableRow,
  onDeleteTableRow,
  onAddTableCol,
  onDeleteTableCol,
  onUpdateTableCell,
  onUpdateTableHeader,
}: InlineBlockRendererProps) {
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  return (
    <div
      className={`group/block relative my-1 transition-all duration-100 rounded-sm ${
        isActive
          ? 'ring-1 ring-primary/40 bg-primary/[0.02]'
          : 'hover:ring-1 hover:ring-border/40'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Left Margin Gutter Handle */}
      <BlockGutterHandle
        blockId={block.id}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onInsertAfter={onInsertAfter}
        onDelete={onDelete}
      />

      {/* ─── Block Specific Renderers ────────────────────────────────────────── */}
      {block.type === 'heading' && (
        <HeadingRenderer
          block={block as HeadingBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}

      {block.type === 'paragraph' && (
        <ParagraphRenderer
          block={block as ParagraphBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}

      {block.type === 'table' && (
        <TableRenderer
          block={block as TableBlock}
          theme={theme}
          selectedCell={selectedCell}
          onSelectCell={(row, col) => setSelectedCell({ row, col })}
          onUpdate={onUpdate}
          onDeleteTable={onDelete}
          onAddRow={() => onAddTableRow?.(selectedCell?.row)}
          onDeleteRow={(r) => onDeleteTableRow?.(r)}
          onAddCol={() => onAddTableCol?.(selectedCell?.col)}
          onDeleteCol={(c) => onDeleteTableCol?.(c)}
          onUpdateCell={(r, c, text) => onUpdateTableCell?.(r, c, text)}
          onUpdateHeader={(c, text) => onUpdateTableHeader?.(c, text)}
        />
      )}

      {block.type === 'callout' && (
        <CalloutRenderer
          block={block as CalloutBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}

      {block.type === 'metrics' && (
        <MetricsRenderer
          block={block as MetricsBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}

      {block.type === 'columns' && (
        <ColumnsRenderer
          block={block as ColumnsBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}

      {block.type === 'divider' && (
        <DividerRenderer block={block as DividerBlock} />
      )}

      {block.type === 'page-break' && <PageBreakRenderer />}

      {block.type === 'signature' && (
        <SignatureRenderer
          block={block as SignatureBlock}
          theme={theme}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

// ─── Sub-Renderers ────────────────────────────────────────────────────────────

function HeadingRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: HeadingBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<HeadingBlock>) => void;
}) {
  const getHeadingClass = (level: number) => {
    switch (level) {
      case 1:
        return 'text-2xl font-bold tracking-tight';
      case 2:
        return 'text-xl font-bold';
      case 3:
        return 'text-base font-semibold';
      case 4:
        return 'text-sm font-semibold';
      default:
        return 'text-xl font-bold';
    }
  };

  const getAlignClass = (align?: string) => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  return (
    <div className={`py-1.5 ${getAlignClass(block.align)}`}>
      {block.badge && (
        <input
          value={block.badge}
          onChange={(e) => onUpdate({ badge: e.target.value })}
          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase bg-primary/10 text-primary border-none focus:outline-none mb-1 max-w-xs"
        />
      )}

      <input
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="Heading text..."
        className={`w-full bg-transparent border-none focus:outline-none focus:bg-primary/[0.04] rounded px-1 -mx-1 text-zinc-900 transition-colors ${getHeadingClass(
          block.level,
        )}`}
        style={{
          color: block.level === 1 ? theme.primaryColor : undefined,
          fontFamily:
            theme.fontFamily === 'Courier' ? 'monospace' : theme.fontFamily,
        }}
      />

      {block.subtitle !== undefined && (
        <input
          value={block.subtitle}
          onChange={(e) => onUpdate({ subtitle: e.target.value })}
          placeholder="Add subtitle..."
          className="w-full text-xs text-zinc-500 bg-transparent border-none focus:outline-none focus:bg-primary/[0.04] rounded px-1 -mx-1 mt-0.5"
        />
      )}
    </div>
  );
}

function ParagraphRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: ParagraphBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<ParagraphBlock>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getAlignClass = (align?: string) => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      case 'justify':
        return 'text-justify';
      default:
        return 'text-left';
    }
  };

  // Auto-resize textarea height
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="py-1">
      <textarea
        ref={textareaRef}
        rows={1}
        value={block.content}
        onChange={(e) => {
          onUpdate({ content: e.target.value });
          adjustHeight();
        }}
        onFocus={adjustHeight}
        placeholder="Type your paragraph here..."
        className={`w-full resize-none bg-transparent border-none focus:outline-none focus:bg-primary/[0.04] rounded px-1 -mx-1 text-zinc-800 leading-relaxed transition-colors ${getAlignClass(
          block.align,
        )}`}
        style={{
          fontSize: `${block.fontSize || 11}pt`,
          fontWeight: block.bold ? 'bold' : 'normal',
          fontStyle: block.italic ? 'italic' : 'normal',
          textDecoration: [
            block.underline ? 'underline' : '',
            block.strike ? 'line-through' : '',
          ]
            .filter(Boolean)
            .join(' '),
          color: block.color || theme.textColor || '#18181b',
          fontFamily:
            theme.fontFamily === 'Courier' ? 'monospace' : theme.fontFamily,
        }}
      />
    </div>
  );
}

function TableRenderer({
  block,
  theme,
  selectedCell,
  onSelectCell,
  onUpdate,
  onDeleteTable,
  onAddRow,
  onDeleteRow,
  onAddCol,
  onDeleteCol,
  onUpdateCell,
  onUpdateHeader,
}: {
  block: TableBlock;
  theme: DocumentTheme;
  selectedCell: { row: number; col: number } | null;
  onSelectCell: (row: number, col: number) => void;
  onUpdate: (updates: Partial<TableBlock>) => void;
  onDeleteTable: () => void;
  onAddRow: () => void;
  onDeleteRow: (r: number) => void;
  onAddCol: () => void;
  onDeleteCol: (c: number) => void;
  onUpdateCell: (r: number, c: number, text: string) => void;
  onUpdateHeader: (c: number, text: string) => void;
}) {
  return (
    <div className="relative my-3 select-text">
      {/* On-Focus Context Toolbar */}
      {selectedCell !== null && (
        <TableContextToolbar
          block={block}
          selectedRow={selectedCell.row}
          selectedCol={selectedCell.col}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
          onAddCol={onAddCol}
          onDeleteCol={onDeleteCol}
          onUpdateBlock={onUpdate}
          onDeleteTable={onDeleteTable}
        />
      )}

      <div className="overflow-x-auto rounded border border-zinc-200 shadow-sm">
        <table className="w-full text-xs text-zinc-900 border-collapse">
          {/* Header Row */}
          <thead>
            <tr
              style={{
                backgroundColor:
                  block.headerBg || theme.surfaceColor || '#f4f4f5',
                borderBottom: '2px solid #e4e4e7',
              }}
            >
              {block.columns.map((col, cIdx) => (
                <th
                  key={col.id || cIdx}
                  className="p-2 text-left font-semibold text-zinc-800 border-r border-zinc-200 last:border-r-0"
                  style={{ width: `${col.widthPct}%` }}
                >
                  <input
                    value={col.header}
                    onChange={(e) => onUpdateHeader(cIdx, e.target.value)}
                    className="w-full bg-transparent border-none font-semibold focus:outline-none focus:bg-white/60 rounded px-1"
                  />
                </th>
              ))}
            </tr>
          </thead>

          {/* Data Rows */}
          <tbody>
            {block.rows.map((row, rIdx) => {
              const isEven = rIdx % 2 === 0;
              const isStriped = block.striped && !isEven;

              return (
                <tr
                  key={rIdx}
                  className={`transition-colors border-b border-zinc-200 last:border-b-0 ${
                    isStriped ? 'bg-zinc-50/80' : 'bg-white'
                  }`}
                >
                  {row.map((cellText, cIdx) => {
                    const isCellActive =
                      selectedCell?.row === rIdx && selectedCell?.col === cIdx;

                    return (
                      <td
                        key={cIdx}
                        className={`p-1.5 border-r border-zinc-200 last:border-r-0 transition-colors ${
                          isCellActive
                            ? 'ring-2 ring-primary/60 bg-primary/5'
                            : ''
                        }`}
                        onClick={() => onSelectCell(rIdx, cIdx)}
                      >
                        <input
                          value={cellText}
                          onChange={(e) =>
                            onUpdateCell(rIdx, cIdx, e.target.value)
                          }
                          onFocus={() => onSelectCell(rIdx, cIdx)}
                          onKeyDown={(e) => {
                            // Pressing Tab in last cell adds a row
                            if (
                              e.key === 'Tab' &&
                              !e.shiftKey &&
                              rIdx === block.rows.length - 1 &&
                              cIdx === block.columns.length - 1
                            ) {
                              e.preventDefault();
                              onAddRow();
                            }
                          }}
                          className="w-full bg-transparent border-none focus:outline-none text-zinc-900 rounded px-1"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalloutRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: CalloutBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<CalloutBlock>) => void;
}) {
  const getVariantStyles = (variant: string) => {
    switch (variant) {
      case 'warning':
        return {
          bg: '#fffbeb',
          border: '#f59e0b',
          icon: AlertTriangleIcon,
          iconColor: 'text-amber-500',
        };
      case 'success':
        return {
          bg: '#f0fdf4',
          border: '#22c55e',
          icon: CheckCircle2Icon,
          iconColor: 'text-emerald-500',
        };
      case 'quote':
        return {
          bg: '#fafafa',
          border: '#71717a',
          icon: QuoteIcon,
          iconColor: 'text-zinc-500',
        };
      case 'note':
        return {
          bg: '#f8fafc',
          border: '#64748b',
          icon: FileTextIcon,
          iconColor: 'text-slate-500',
        };
      default:
        return {
          bg: '#f0f9ff',
          border: '#0284c7',
          icon: InfoIcon,
          iconColor: 'text-sky-500',
        };
    }
  };

  const style = getVariantStyles(block.variant);
  const Icon = style.icon;

  return (
    <div
      className="my-3 rounded-md p-3 border-l-4 shadow-xs text-xs"
      style={{
        backgroundColor: style.bg,
        borderLeftColor: style.border,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
        <div className="flex-1 space-y-1">
          <input
            value={block.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Callout title..."
            className="w-full font-semibold text-zinc-900 bg-transparent border-none focus:outline-none"
          />
          <textarea
            rows={2}
            value={block.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="Callout body text..."
            className="w-full resize-none text-zinc-700 bg-transparent border-none focus:outline-none leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}

function MetricsRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: MetricsBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<MetricsBlock>) => void;
}) {
  const cols = block.columns || 3;

  return (
    <div
      className="my-3 grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {block.items.map((item, idx) => (
        <div
          key={item.id || idx}
          className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 shadow-xs space-y-1"
        >
          <input
            value={item.value}
            onChange={(e) => {
              const next = [...block.items];
              next[idx] = { ...item, value: e.target.value };
              onUpdate({ items: next });
            }}
            className="w-full text-xl font-extrabold text-zinc-900 bg-transparent border-none focus:outline-none"
          />
          <input
            value={item.label}
            onChange={(e) => {
              const next = [...block.items];
              next[idx] = { ...item, label: e.target.value };
              onUpdate({ items: next });
            }}
            className="w-full text-xs font-medium text-zinc-600 bg-transparent border-none focus:outline-none"
          />
          {item.change && (
            <input
              value={item.change}
              onChange={(e) => {
                const next = [...block.items];
                next[idx] = { ...item, change: e.target.value };
                onUpdate({ items: next });
              }}
              className="text-[10px] font-mono text-zinc-500 bg-transparent border-none focus:outline-none"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ColumnsRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: ColumnsBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<ColumnsBlock>) => void;
}) {
  return (
    <div
      className="my-3 grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
      }}
    >
      {block.columns.map((col, idx) => (
        <div
          key={col.id || idx}
          className="rounded border border-dashed border-zinc-300 p-2 space-y-2 bg-zinc-50/40"
        >
          {col.title && (
            <div className="font-semibold text-xs text-zinc-700">
              {col.title}
            </div>
          )}
          <div className="text-xs text-zinc-500">
            {col.blocks.length > 0
              ? `${col.blocks.length} sub-elements`
              : 'Empty column'}
          </div>
        </div>
      ))}
    </div>
  );
}

function DividerRenderer({ block }: { block: DividerBlock }) {
  return (
    <div className="py-3">
      <hr
        className="border-t border-zinc-300 w-full"
        style={{
          borderTopWidth: `${block.thickness || 1}px`,
          borderTopStyle: block.style || 'solid',
        }}
      />
    </div>
  );
}

function PageBreakRenderer() {
  return (
    <div className="relative my-4 flex items-center justify-center select-none">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-dashed border-rose-300" />
      </div>
      <div className="relative bg-white px-2 text-[10px] font-mono uppercase text-rose-500 flex items-center gap-1">
        <ScissorsIcon className="h-3 w-3" />
        <span>Page Break</span>
      </div>
    </div>
  );
}

function SignatureRenderer({
  block,
  theme,
  onUpdate,
}: {
  block: SignatureBlock;
  theme: DocumentTheme;
  onUpdate: (updates: Partial<SignatureBlock>) => void;
}) {
  return (
    <div className="my-6 max-w-xs space-y-1">
      <div className="h-8 border-b border-zinc-400 font-serif italic text-sm text-zinc-700 flex items-end pb-1">
        {block.signeeName || 'Signature'}
      </div>
      <input
        value={block.signeeName}
        onChange={(e) => onUpdate({ signeeName: e.target.value })}
        placeholder="Signee Name"
        className="w-full font-semibold text-xs text-zinc-900 bg-transparent border-none focus:outline-none"
      />
      <input
        value={block.role || ''}
        onChange={(e) => onUpdate({ role: e.target.value })}
        placeholder="Role / Title"
        className="w-full text-xs text-zinc-500 bg-transparent border-none focus:outline-none"
      />
      <input
        value={block.date || ''}
        onChange={(e) => onUpdate({ date: e.target.value })}
        placeholder="Date"
        className="w-full text-[10px] font-mono text-zinc-400 bg-transparent border-none focus:outline-none"
      />
    </div>
  );
}
