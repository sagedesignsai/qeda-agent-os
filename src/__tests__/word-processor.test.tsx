/**
 * __tests__/word-processor.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Google Docs / LibreOffice Word Processor:
 *   - Dimension calculation across page sizes and orientations
 *   - useWordProcessor hook state, history stack, and mutations
 *   - Headless background PDF Blob compilation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createExecutiveProposal } from '../lib/pdf-studio/templates';
import { useWordProcessor } from '../components/documents/word-processor/use-word-processor';
import { DocumentRibbon } from '../components/documents/word-processor/DocumentRibbon';
import { getPageDimensions } from '../components/documents/word-processor/PageSheet';
import { compilePdfBlob } from '../lib/pdf-studio/export-service';
import type { PdfDocument } from '../lib/pdf-studio/types';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

describe('Word Processor Page Dimensions', () => {
  it('calculates correct pixel dimensions for A4 portrait and landscape', () => {
    const portrait = getPageDimensions('A4', 'portrait');
    expect(portrait.width).toBe(794);
    expect(portrait.height).toBe(1123);

    const landscape = getPageDimensions('A4', 'landscape');
    expect(landscape.width).toBe(1123);
    expect(landscape.height).toBe(794);
  });

  it('calculates correct pixel dimensions for Letter size', () => {
    const letter = getPageDimensions('LETTER', 'portrait');
    expect(letter.width).toBe(816);
    expect(letter.height).toBe(1056);
  });
});

describe('useWordProcessor Hook State & History', () => {
  it('computes live document statistics accurately', () => {
    const doc = createExecutiveProposal();
    let currentDoc = doc;
    const onUpdate = (next: PdfDocument) => {
      currentDoc = next;
    };

    const { result } = renderHook(() =>
      useWordProcessor({ doc: currentDoc, onUpdateDocument: onUpdate }),
    );

    expect(result.current.stats.words).toBeGreaterThan(20);
    expect(result.current.stats.characters).toBeGreaterThan(100);
    expect(result.current.stats.blocks).toBe(doc.blocks.length);
    expect(result.current.stats.estimatedPages).toBeGreaterThanOrEqual(1);
  });

  it('supports undo and redo state traversal', () => {
    const initialDoc = createExecutiveProposal();
    let currentDoc = initialDoc;
    const onUpdate = (next: PdfDocument) => {
      currentDoc = next;
    };

    const { result, rerender } = renderHook(() =>
      useWordProcessor({ doc: currentDoc, onUpdateDocument: onUpdate }),
    );

    expect(result.current.canUndo).toBe(false);

    // Make an edit
    const firstBlockId = initialDoc.blocks[0].id;
    act(() => {
      result.current.updateBlock(firstBlockId, {
        text: 'Modified Title',
      } as any);
    });

    rerender();
    expect(result.current.canUndo).toBe(true);

    // Perform undo
    act(() => {
      result.current.undo();
    });

    rerender();
    expect(result.current.canRedo).toBe(true);
  });

  it('performs table operations: adding rows and updating cells', () => {
    const doc = createExecutiveProposal();
    const tableBlock = doc.blocks.find((b) => b.type === 'table');
    expect(tableBlock).toBeDefined();
    if (!tableBlock) return;

    let currentDoc = doc;
    const onUpdate = (next: PdfDocument) => {
      currentDoc = next;
    };

    const { result } = renderHook(() =>
      useWordProcessor({ doc: currentDoc, onUpdateDocument: onUpdate }),
    );

    const initialRowCount = (tableBlock as any).rows.length;

    act(() => {
      result.current.addTableRow(tableBlock.id);
    });

    const updatedTable = currentDoc.blocks.find(
      (b) => b.id === tableBlock.id,
    ) as any;
    expect(updatedTable.rows.length).toBe(initialRowCount + 1);

    act(() => {
      result.current.updateTableCell(tableBlock.id, 0, 0, 'Updated Value');
    });

    const cellTable = currentDoc.blocks.find(
      (b) => b.id === tableBlock.id,
    ) as any;
    expect(cellTable.rows[0][0]).toBe('Updated Value');
  });
});

describe('Background PDF Export Service', () => {
  it('compiles document into Blob in the background without on-screen DOM', async () => {
    const doc = createExecutiveProposal();
    const blob = await compilePdfBlob(doc);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('DocumentRibbon Unified Studio Header & Real-Estate Controls', () => {
  it('renders unified header with title, project crumb, and triggers', () => {
    const doc = createExecutiveProposal();
    const onSetTitle = jest.fn();
    const onToggleRuler = jest.fn();
    const onNewDocument = jest.fn();

    const { getByDisplayValue, getByText } = render(
      <MemoryRouter>
        <TooltipProvider>
          <SidebarProvider>
            <DocumentRibbon
              doc={doc}
              projectName="Test Project"
              projectId="proj-123"
              onNewDocument={onNewDocument}
              activeBlock={null}
              canUndo={false}
              canRedo={false}
              darkCanvas={false}
              showRuler={true}
              onUndo={jest.fn()}
              onRedo={jest.fn()}
              onSetTitle={onSetTitle}
              onInsertBlock={jest.fn()}
              onToggleDarkCanvas={jest.fn()}
              onToggleRuler={onToggleRuler}
              onOpenSettings={jest.fn()}
              onOpenCopilot={jest.fn()}
              onOpenInlineAi={jest.fn()}
            />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(getByDisplayValue(doc.title)).toBeInTheDocument();
    expect(getByText('Test Project')).toBeInTheDocument();
    expect(getByText('Docs')).toBeInTheDocument();
    expect(getByText('Export PDF')).toBeInTheDocument();
  });

  it('keeps canvas vertical space clear by omitting redundant Tier 2 formatting toolbar', () => {
    const doc = createExecutiveProposal();

    const { queryByText, getByText } = render(
      <MemoryRouter>
        <TooltipProvider>
          <SidebarProvider>
            <DocumentRibbon
              doc={doc}
              activeBlock={null}
              canUndo={false}
              canRedo={false}
              darkCanvas={false}
              showRuler={true}
              showLayers={false}
              showInspector={true}
              onUndo={jest.fn()}
              onRedo={jest.fn()}
              onSetTitle={jest.fn()}
              onInsertBlock={jest.fn()}
              onToggleDarkCanvas={jest.fn()}
              onToggleRuler={jest.fn()}
              onToggleLayers={jest.fn()}
              onToggleInspector={jest.fn()}
              onOpenSettings={jest.fn()}
              onOpenCopilot={jest.fn()}
              onOpenInlineAi={jest.fn()}
            />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );

    // Redundant formatting ribbon items should not exist
    expect(queryByText('Normal Text')).not.toBeInTheDocument();
    expect(queryByText('Helvetica / Arial')).not.toBeInTheDocument();
    // Unified studio controls are present
    expect(getByText('Export PDF')).toBeInTheDocument();
    expect(getByText('Copilot')).toBeInTheDocument();
  });
});

describe('Hierarchical Primitives AST & Tree Mutations', () => {
  const {
    legacyBlocksToDocNodes,
    findNodeById,
    updateNodeInTree,
    removeNodeFromTree,
    insertNodeInTree,
    createBoxNode,
    createRowNode,
    createColumnNode,
    createTextNode,
  } = require('../lib/pdf-studio/primitives-ast');

  it('converts all legacy blocks into hierarchical DocNodes with nested containers', () => {
    const doc = createExecutiveProposal();
    const nodes = legacyBlocksToDocNodes(doc.blocks);

    expect(nodes.length).toBe(doc.blocks.length);

    // Heading block -> Column with Badge Row + Text
    const headingNode = nodes.find((n: any) => n.name?.startsWith('Heading'));
    expect(headingNode).toBeDefined();
    expect(headingNode.type).toBe('column');
    expect(headingNode.children.length).toBeGreaterThanOrEqual(1);

    // Table block -> Column with Table Header Row + child Data Rows
    const tableNode = nodes.find((n: any) => n.name === 'Table Container');
    expect(tableNode).toBeDefined();
    expect(tableNode.type).toBe('column');
    expect(tableNode.children[0].type).toBe('row'); // Header row

    // Metrics block -> Row with child Box cards
    const metricsNode = nodes.find((n: any) => n.name === 'Metrics Row');
    expect(metricsNode).toBeDefined();
    expect(metricsNode.type).toBe('row');
    expect(metricsNode.children[0].type).toBe('box');
  });

  it('finds nested nodes, updates properties, inserts, and deletes in the tree', () => {
    const rootCol = createColumnNode({ id: 'root-col' });
    const innerRow = createRowNode({ id: 'inner-row' });
    const textNode = createTextNode('Hello Yoga', { id: 'text-1' });

    innerRow.children.push(textNode);
    rootCol.children.push(innerRow);
    const tree = [rootCol];

    // Find deep nested
    const found = findNodeById(tree, 'text-1');
    expect(found).not.toBeNull();
    expect((found as any).content).toBe('Hello Yoga');

    // Update deep nested
    const updatedTree = updateNodeInTree(tree, 'text-1', (n: any) => ({
      ...n,
      content: 'Updated Content',
      fontSize: 16,
    }));
    const updatedFound = findNodeById(updatedTree, 'text-1');
    expect((updatedFound as any).content).toBe('Updated Content');
    expect((updatedFound as any).fontSize).toBe(16);

    // Insert inside inner-row
    const newBox = createBoxNode({ id: 'box-new' });
    const treeWithNew = insertNodeInTree(
      updatedTree,
      'inner-row',
      newBox,
      'inside',
    );
    const insertedFound = findNodeById(treeWithNew, 'box-new');
    expect(insertedFound).not.toBeNull();

    // Delete node
    const prunedTree = removeNodeFromTree(treeWithNew, 'text-1');
    expect(findNodeById(prunedTree, 'text-1')).toBeNull();
    expect(findNodeById(prunedTree, 'box-new')).not.toBeNull();
  });

  it('manages hierarchical node mutations via useWordProcessor', () => {
    const doc = createExecutiveProposal();
    let currentDoc = doc;
    const onUpdate = (next: PdfDocument) => {
      currentDoc = next;
    };

    const { result, rerender } = renderHook(() =>
      useWordProcessor({ doc: currentDoc, onUpdateDocument: onUpdate }),
    );

    expect(result.current.currentNodes.length).toBeGreaterThan(0);

    // Add a new primitive
    act(() => {
      result.current.addNode(null, 'box');
    });

    rerender();
    expect(result.current.selectedNodeId).not.toBeNull();
    expect(result.current.selectedNode?.type).toBe('box');

    // Update the selected node
    const selectedId = result.current.selectedNodeId!;
    act(() => {
      result.current.updateNode(selectedId, { name: 'My Custom Box' });
    });

    rerender();
    expect(result.current.selectedNode?.name).toBe('My Custom Box');

    // Delete the node
    act(() => {
      result.current.deleteNode(selectedId);
    });

    rerender();
    expect(result.current.selectedNodeId).toBeNull();
  });
});
