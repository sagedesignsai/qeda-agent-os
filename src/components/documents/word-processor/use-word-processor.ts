/**
 * components/documents/word-processor/use-word-processor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * State coordination hook for the Word Processor:
 *   - Active block selection and cursor state
 *   - Undo / Redo history buffer for full document state
 *   - Live text statistics (words, characters, paragraphs)
 *   - Zoom scale and dark canvas toggles
 *   - In-place block, inline formatting, and table mutations
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import type {
  PdfDocument,
  PdfBlock,
  BlockType,
  HeadingBlock,
  ParagraphBlock,
  TableBlock,
} from '@/lib/pdf-studio/types';
import type { DocNode, DocNodeType } from '@/lib/pdf-studio/primitives-ast';
import {
  legacyBlocksToDocNodes,
  findNodeById,
  updateNodeInTree,
  removeNodeFromTree,
  insertNodeInTree,
  createBoxNode,
  createRowNode,
  createColumnNode,
  createTextNode,
  createIconNode,
  createSpacerNode,
  createDividerNode,
  createPageBreakNode,
} from '@/lib/pdf-studio/primitives-ast';

export interface DocumentStats {
  words: number;
  characters: number;
  blocks: number;
  estimatedPages: number;
}

export interface UseWordProcessorProps {
  doc: PdfDocument;
  onUpdateDocument: (nextDoc: PdfDocument) => void;
}

export function useWordProcessor({ doc, onUpdateDocument }: UseWordProcessorProps) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [darkCanvas, setDarkCanvas] = useState<boolean>(false);
  const [activeTableCoord, setActiveTableCoord] = useState<{
    blockId: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  // ─── Current Node Tree (Hierarchical Primitives) ───────────────────────────
  const currentNodes: DocNode[] = useMemo(() => {
    if (doc.nodes && doc.nodes.length > 0) {
      return doc.nodes;
    }
    return legacyBlocksToDocNodes(doc.blocks);
  }, [doc.nodes, doc.blocks]);

  // ─── Undo / Redo History Stack ──────────────────────────────────────────────
  const [history, setHistory] = useState<PdfDocument[]>([doc]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isInternalUpdate = useRef(false);

  // Keep history updated if doc prop updates externally
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    // Only reset history if switched to a different document
    setHistory((prev) => {
      if (prev.length > 0 && prev[0].id === doc.id) {
        return prev;
      }
      setHistoryIndex(0);
      return [doc];
    });
  }, [doc]);

  const commitSnapshot = useCallback(
    (nextDoc: PdfDocument) => {
      isInternalUpdate.current = true;
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const newHist = [...sliced, nextDoc];
        if (newHist.length > 40) newHist.shift();
        return newHist;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 39));
      onUpdateDocument(nextDoc);
    },
    [historyIndex, onUpdateDocument],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const targetIndex = historyIndex - 1;
    const targetDoc = history[targetIndex];
    setHistoryIndex(targetIndex);
    isInternalUpdate.current = true;
    onUpdateDocument(targetDoc);
  }, [canUndo, historyIndex, history, onUpdateDocument]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const targetIndex = historyIndex + 1;
    const targetDoc = history[targetIndex];
    setHistoryIndex(targetIndex);
    isInternalUpdate.current = true;
    onUpdateDocument(targetDoc);
  }, [canRedo, historyIndex, history, onUpdateDocument]);

  // ─── Document Statistics ────────────────────────────────────────────────────
  const stats: DocumentStats = useMemo(() => {
    let words = 0;
    let characters = 0;

    for (const b of doc.blocks) {
      let text = '';
      if (b.type === 'heading') {
        text = `${b.text} ${b.subtitle || ''}`;
      } else if (b.type === 'paragraph') {
        text = b.content;
      } else if (b.type === 'callout') {
        text = `${b.title || ''} ${b.text}`;
      } else if (b.type === 'table') {
        text = b.columns.map((c) => c.header).join(' ') + ' ' + b.rows.flat().join(' ');
      } else if (b.type === 'metrics') {
        text = b.items.map((i) => `${i.label} ${i.value}`).join(' ');
      }

      characters += text.length;
      const w = text.trim().split(/\s+/).filter(Boolean);
      words += w.length;
    }

    // Estimate pages based on content weight (~350 words per page or explicit breaks)
    const explicitBreaks = doc.blocks.filter((b) => b.type === 'page-break').length;
    const estimatedPages = Math.max(1, explicitBreaks + Math.ceil(words / 380) || 1);

    return {
      words,
      characters,
      blocks: doc.blocks.length,
      estimatedPages,
    };
  }, [doc.blocks]);

  // ─── Block Mutations ────────────────────────────────────────────────────────
  const updateBlock = useCallback(
    (blockId: string, updates: Partial<PdfBlock>) => {
      const nextBlocks = doc.blocks.map((b) =>
        b.id === blockId ? ({ ...b, ...updates } as PdfBlock) : b,
      );
      commitSnapshot({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, commitSnapshot],
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      const nextBlocks = doc.blocks.filter((b) => b.id !== blockId);
      commitSnapshot({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
      if (activeBlockId === blockId) {
        setActiveBlockId(null);
      }
    },
    [doc, activeBlockId, commitSnapshot],
  );

  const insertBlockAfter = useCallback(
    (targetBlockId: string | null, type: BlockType) => {
      let newBlock: PdfBlock;
      const baseId = nanoid(8);

      switch (type) {
        case 'heading':
          newBlock = {
            id: baseId,
            type: 'heading',
            level: 2,
            text: 'Section Heading',
          };
          break;
        case 'paragraph':
          newBlock = {
            id: baseId,
            type: 'paragraph',
            content: 'Write something insightful here...',
          };
          break;
        case 'table':
          newBlock = {
            id: baseId,
            type: 'table',
            columns: [
              { id: 'c1', header: 'Item / Deliverable', widthPct: 60, align: 'left' },
              { id: 'c2', header: 'Status', widthPct: 40, align: 'center' },
            ],
            rows: [
              ['System Architecture Design', 'Completed'],
              ['Integration Test Matrix', 'In Progress'],
            ],
            striped: true,
            showBorders: true,
          };
          break;
        case 'callout':
          newBlock = {
            id: baseId,
            type: 'callout',
            variant: 'info',
            title: 'Note',
            text: 'Important requirement details or contextual guidance here.',
          };
          break;
        case 'metrics':
          newBlock = {
            id: baseId,
            type: 'metrics',
            columns: 3,
            items: [
              { id: nanoid(4), label: 'Metric A', value: '99.9%', isPositive: true },
              { id: nanoid(4), label: 'Metric B', value: '< 25ms', isPositive: true },
              { id: nanoid(4), label: 'Throughput', value: '4.2k req/s' },
            ],
          };
          break;
        case 'divider':
          newBlock = {
            id: baseId,
            type: 'divider',
            thickness: 1,
            style: 'solid',
          };
          break;
        case 'page-break':
          newBlock = {
            id: baseId,
            type: 'page-break',
          };
          break;
        case 'signature':
          newBlock = {
            id: baseId,
            type: 'signature',
            signeeName: 'Authorized Signatory',
            role: 'Executive Lead',
            date: new Date().toLocaleDateString(),
          };
          break;
        default:
          newBlock = {
            id: baseId,
            type: 'paragraph',
            content: '',
          };
      }

      let nextBlocks: PdfBlock[];
      if (!targetBlockId) {
        nextBlocks = [...doc.blocks, newBlock];
      } else {
        const index = doc.blocks.findIndex((b) => b.id === targetBlockId);
        if (index === -1) {
          nextBlocks = [...doc.blocks, newBlock];
        } else {
          nextBlocks = [
            ...doc.blocks.slice(0, index + 1),
            newBlock,
            ...doc.blocks.slice(index + 1),
          ];
        }
      }

      commitSnapshot({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
      setActiveBlockId(newBlock.id);
    },
    [doc, commitSnapshot],
  );

  const moveBlock = useCallback(
    (blockId: string, direction: 'up' | 'down') => {
      const index = doc.blocks.findIndex((b) => b.id === blockId);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= doc.blocks.length) return;

      const nextBlocks = [...doc.blocks];
      const [item] = nextBlocks.splice(index, 1);
      nextBlocks.splice(targetIndex, 0, item);
      commitSnapshot({ ...doc, blocks: nextBlocks, updatedAt: Date.now() });
    },
    [doc, commitSnapshot],
  );

  // ─── Table Specific Operations ──────────────────────────────────────────────
  const addTableRow = useCallback(
    (blockId: string, rowIndex?: number) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;

      const newRow = block.columns.map(() => '');
      const nextRows = [...block.rows];
      const insertAt = rowIndex !== undefined ? rowIndex + 1 : nextRows.length;
      nextRows.splice(insertAt, 0, newRow);

      updateBlock(blockId, { rows: nextRows } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  const deleteTableRow = useCallback(
    (blockId: string, rowIndex: number) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;
      if (block.rows.length <= 1) return;

      const nextRows = block.rows.filter((_, idx) => idx !== rowIndex);
      updateBlock(blockId, { rows: nextRows } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  const addTableColumn = useCallback(
    (blockId: string, colIndex?: number) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;

      const currentCols = block.columns;
      const newWidth = Math.max(10, Math.floor(100 / (currentCols.length + 1)));
      const adjustedCols = currentCols.map((c) => ({
        ...c,
        widthPct: Math.floor((c.widthPct * currentCols.length) / (currentCols.length + 1)),
      }));

      const newCol = {
        id: nanoid(4),
        header: 'New Column',
        widthPct: newWidth,
        align: 'left' as const,
      };

      const insertAt = colIndex !== undefined ? colIndex + 1 : adjustedCols.length;
      adjustedCols.splice(insertAt, 0, newCol);

      const nextRows = block.rows.map((row) => {
        const copy = [...row];
        copy.splice(insertAt, 0, '');
        return copy;
      });

      updateBlock(blockId, {
        columns: adjustedCols,
        rows: nextRows,
      } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  const deleteTableColumn = useCallback(
    (blockId: string, colIndex: number) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;
      if (block.columns.length <= 1) return;

      const nextCols = block.columns.filter((_, idx) => idx !== colIndex);
      // Re-normalize width percentages to sum to 100
      const totalWidth = nextCols.reduce((sum, c) => sum + c.widthPct, 0) || 1;
      const normalizedCols = nextCols.map((c) => ({
        ...c,
        widthPct: Math.round((c.widthPct / totalWidth) * 100),
      }));

      const nextRows = block.rows.map((row) => row.filter((_, idx) => idx !== colIndex));

      updateBlock(blockId, {
        columns: normalizedCols,
        rows: nextRows,
      } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  const updateTableCell = useCallback(
    (blockId: string, rowIndex: number, colIndex: number, text: string) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;

      const nextRows = block.rows.map((row, rIdx) => {
        if (rIdx !== rowIndex) return row;
        const nextRow = [...row];
        nextRow[colIndex] = text;
        return nextRow;
      });

      updateBlock(blockId, { rows: nextRows } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  const updateTableHeader = useCallback(
    (blockId: string, colIndex: number, text: string) => {
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block || block.type !== 'table') return;

      const nextCols = block.columns.map((col, idx) =>
        idx === colIndex ? { ...col, header: text } : col,
      );

      updateBlock(blockId, { columns: nextCols } as Partial<TableBlock>);
    },
    [doc.blocks, updateBlock],
  );

  // ─── Active Block formatting helper ─────────────────────────────────────────
  const activeBlock = useMemo(() => {
    if (!activeBlockId) return null;
    return doc.blocks.find((b) => b.id === activeBlockId) || null;
  }, [activeBlockId, doc.blocks]);

  // ─── Hierarchical Node Operations ──────────────────────────────────────────
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNodeById(currentNodes, selectedNodeId);
  }, [currentNodes, selectedNodeId]);

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<DocNode>) => {
      const nextNodes = updateNodeInTree(currentNodes, nodeId, (node) => ({
        ...node,
        ...patch,
      } as DocNode));
      commitSnapshot({ ...doc, nodes: nextNodes, updatedAt: Date.now() });
    },
    [currentNodes, doc, commitSnapshot],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nextNodes = removeNodeFromTree(currentNodes, nodeId);
      commitSnapshot({ ...doc, nodes: nextNodes, updatedAt: Date.now() });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [currentNodes, selectedNodeId, doc, commitSnapshot],
  );

  const addNode = useCallback(
    (parentId: string | null, type: DocNodeType) => {
      let newNode: DocNode;
      switch (type) {
        case 'box':
          newNode = createBoxNode();
          break;
        case 'row':
          newNode = createRowNode();
          break;
        case 'column':
          newNode = createColumnNode();
          break;
        case 'text':
          newNode = createTextNode('New text primitive');
          break;
        case 'icon':
          newNode = createIconNode('sparkles');
          break;
        case 'image':
          newNode = {
            id: nanoid(8),
            type: 'image',
            src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80',
            fit: 'cover',
            sizing: { width: { mode: 'fill' }, height: { mode: 'fixed', value: 140 } },
          };
          break;
        case 'spacer':
          newNode = createSpacerNode(16);
          break;
        case 'divider':
          newNode = createDividerNode();
          break;
        case 'page-break':
          newNode = createPageBreakNode();
          break;
        default:
          newNode = createTextNode('Text');
      }

      const nextNodes = insertNodeInTree(
        currentNodes,
        parentId,
        newNode,
        parentId ? 'inside' : 'after',
      );
      commitSnapshot({ ...doc, nodes: nextNodes, updatedAt: Date.now() });
      setSelectedNodeId(newNode.id);
    },
    [currentNodes, doc, commitSnapshot],
  );

  return {
    doc,
    activeBlock,
    activeBlockId,
    setActiveBlockId,
    // Hierarchical Node Tree
    currentNodes,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    updateNode,
    deleteNode,
    addNode,
    activeTableCoord,
    setActiveTableCoord,
    zoom,
    setZoom,
    darkCanvas,
    setDarkCanvas,
    stats,
    canUndo,
    canRedo,
    undo,
    redo,
    updateBlock,
    removeBlock,
    insertBlockAfter,
    moveBlock,
    // Table operations
    addTableRow,
    deleteTableRow,
    addTableColumn,
    deleteTableColumn,
    updateTableCell,
    updateTableHeader,
  };
}
