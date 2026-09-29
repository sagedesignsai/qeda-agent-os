/**
 * components/documents/word-processor/DocumentPageCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-sheet virtual canvas for the Word Processor:
 *   - Renders paper pages centered in a dark studio workspace backdrop
 *   - Smooth responsive zoom scaling with crisp font rendering
 *   - Distributes blocks across physical sheets with page-break support
 *   - Coordinates InlineBlockRenderer, Table toolbar, and Inline AI (Ctrl+K)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo } from 'react';
import type { PdfDocument, PdfBlock, BlockType } from '@/lib/pdf-studio/types';
import type { DocNode } from '@/lib/pdf-studio/primitives-ast';
import { PageSheet, getPageDimensions } from './PageSheet';
import { InlineBlockRenderer } from './InlineBlockRenderer';
import { InlineAiPrompt } from './InlineAiPrompt';
import { DocumentRuler } from './DocumentRuler';
import { PrimitiveNodeRenderer } from '../primitives/PrimitiveNodeRenderer';
import { NodeBreadcrumb } from '../primitives/NodeBreadcrumb';

interface DocumentPageCanvasProps {
  doc: PdfDocument;
  nodes?: DocNode[];
  selectedNodeId?: string | null;
  onSelectNode?: (id: string | null) => void;
  onUpdateNode?: (nodeId: string, patch: Partial<DocNode>) => void;
  activeBlockId: string | null;
  zoom: number;
  darkCanvas: boolean;
  inlineAiOpen: boolean;
  showRuler?: boolean;
  onSelectBlock: (id: string | null) => void;
  onUpdateBlock: (blockId: string, updates: Partial<PdfBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: 'up' | 'down') => void;
  onInsertBlockAfter: (targetId: string | null, type: BlockType) => void;
  onUpdateMargins: (
    margins: Partial<PdfDocument['settings']['margins']>,
  ) => void;
  onCloseInlineAi: () => void;
  // Table operations
  onAddTableRow: (blockId: string, rowIndex?: number) => void;
  onDeleteTableRow: (blockId: string, rowIndex: number) => void;
  onAddTableCol: (blockId: string, colIndex?: number) => void;
  onDeleteTableCol: (blockId: string, colIndex: number) => void;
  onUpdateTableCell: (
    blockId: string,
    r: number,
    c: number,
    text: string,
  ) => void;
  onUpdateTableHeader: (blockId: string, c: number, text: string) => void;
}

export function DocumentPageCanvas({
  doc,
  nodes,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  activeBlockId,
  zoom,
  darkCanvas,
  inlineAiOpen,
  showRuler = true,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onMoveBlock,
  onInsertBlockAfter,
  onUpdateMargins,
  onCloseInlineAi,
  onAddTableRow,
  onDeleteTableRow,
  onAddTableCol,
  onDeleteTableCol,
  onUpdateTableCell,
  onUpdateTableHeader,
}: DocumentPageCanvasProps) {
  const { width } = getPageDimensions(
    doc.settings.pageSize,
    doc.settings.orientation,
  );
  const scale = zoom / 100;

  // Split nodes into pages based on explicit 'page-break' nodes
  const nodePages = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    const result: DocNode[][] = [[]];
    let currentPageIdx = 0;

    for (const node of nodes) {
      if (node.type === 'page-break') {
        result[currentPageIdx].push(node);
        result.push([]);
        currentPageIdx++;
      } else {
        result[currentPageIdx].push(node);
      }
    }

    return result.filter((p, idx) => p.length > 0 || idx === 0);
  }, [nodes]);

  const hasNodes = nodes && nodes.length > 0;

  // Split blocks into pages based on explicit 'page-break' blocks
  const pages = useMemo(() => {
    const result: PdfBlock[][] = [[]];
    let currentPageIdx = 0;

    for (const block of doc.blocks) {
      if (block.type === 'page-break') {
        // Push the page-break block to indicate the break, then start next page
        result[currentPageIdx].push(block);
        result.push([]);
        currentPageIdx++;
      } else {
        result[currentPageIdx].push(block);
      }
    }

    return result.filter((p, idx) => p.length > 0 || idx === 0);
  }, [doc.blocks]);

  const activeBlock = useMemo(() => {
    if (!activeBlockId) return null;
    return doc.blocks.find((b) => b.id === activeBlockId) || null;
  }, [activeBlockId, doc.blocks]);

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-zinc-950/90 relative">
      {/* Horizontal Margin Ruler at Top */}
      {showRuler && (
        <DocumentRuler
          pageWidthPx={width}
          margins={doc.settings.margins}
          onUpdateMargins={onUpdateMargins}
          scale={scale}
        />
      )}

      {/* Node Breadcrumb Navigation for Hierarchical Tree */}
      {hasNodes && onSelectNode && (
        <NodeBreadcrumb
          nodes={nodes}
          selectedNodeId={selectedNodeId ?? null}
          onSelectNode={onSelectNode}
        />
      )}

      {/* Main Canvas Scroll Area */}
      <div
        className="flex-1 overflow-auto p-8 flex flex-col items-center cursor-default"
        onClick={() => {
          onSelectBlock(null);
          onSelectNode?.(null);
        }}
      >
        <div
          className="transition-transform duration-75 origin-top flex flex-col items-center"
          style={{
            transform: `scale(${scale})`,
            width: `${width}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {hasNodes
            ? /* ─── Modern Hierarchical Flexbox Engine Canvas ──────────────── */
              nodePages.map((pageNodes, pageIdx) => (
                <PageSheet
                  key={pageIdx}
                  pageNumber={pageIdx + 1}
                  totalPages={nodePages.length}
                  settings={doc.settings}
                  theme={doc.settings.theme}
                  darkCanvas={darkCanvas}
                >
                  <div className="flex flex-col gap-3 w-full h-full min-h-[300px]">
                    {pageNodes.map((node) => (
                      <PrimitiveNodeRenderer
                        key={node.id}
                        node={node}
                        selectedNodeId={selectedNodeId ?? null}
                        theme={doc.settings.theme}
                        onSelectNode={onSelectNode || (() => {})}
                        onUpdateNode={onUpdateNode || (() => {})}
                      />
                    ))}
                  </div>
                </PageSheet>
              ))
            : /* ─── Legacy Macro Blocks Canvas ────────────────────────────── */
              pages.map((pageBlocks, pageIdx) => (
                <PageSheet
                  key={pageIdx}
                  pageNumber={pageIdx + 1}
                  totalPages={pages.length}
                  settings={doc.settings}
                  theme={doc.settings.theme}
                  darkCanvas={darkCanvas}
                >
                  {pageBlocks.map((block) => {
                    const isActive = activeBlockId === block.id;

                    return (
                      <div key={block.id} className="relative">
                        {/* Inline AI Prompt positioned right above the active block */}
                        {isActive && inlineAiOpen && (
                          <InlineAiPrompt
                            block={activeBlock}
                            documentTitle={doc.title}
                            onUpdateBlock={onUpdateBlock}
                            onClose={onCloseInlineAi}
                          />
                        )}

                        <InlineBlockRenderer
                          block={block}
                          theme={doc.settings.theme}
                          isActive={isActive}
                          onSelect={() => onSelectBlock(block.id)}
                          onUpdate={(updates) =>
                            onUpdateBlock(block.id, updates)
                          }
                          onDelete={() => onDeleteBlock(block.id)}
                          onMoveUp={() => onMoveBlock(block.id, 'up')}
                          onMoveDown={() => onMoveBlock(block.id, 'down')}
                          onInsertAfter={(type) =>
                            onInsertBlockAfter(block.id, type)
                          }
                          // Table operations
                          onAddTableRow={(r) => onAddTableRow(block.id, r)}
                          onDeleteTableRow={(r) =>
                            onDeleteTableRow(block.id, r)
                          }
                          onAddTableCol={(c) => onAddTableCol(block.id, c)}
                          onDeleteTableCol={(c) =>
                            onDeleteTableCol(block.id, c)
                          }
                          onUpdateTableCell={(r, c, text) =>
                            onUpdateTableCell(block.id, r, c, text)
                          }
                          onUpdateTableHeader={(c, text) =>
                            onUpdateTableHeader(block.id, c, text)
                          }
                        />
                      </div>
                    );
                  })}

                  {/* Empty page helper */}
                  {pageBlocks.length === 0 && (
                    <div
                      className="py-12 text-center text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      onClick={() => onInsertBlockAfter(null, 'paragraph')}
                    >
                      Click here to start typing on this page...
                    </div>
                  )}
                </PageSheet>
              ))}
        </div>
      </div>
    </div>
  );
}
