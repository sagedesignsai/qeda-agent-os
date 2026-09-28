/**
 * components/documents/word-processor/WordProcessor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Word Processor component providing a true Google Docs / LibreOffice
 * editing experience for Qeda Desktop:
 *   - Tier 1 & 2 Office ribbon toolbar
 *   - Virtual multi-sheet paper canvas with in-place typing
 *   - Interactive margin ruler and status bar
 *   - Seamless background PDF compilation and native file export
 *   - Integrated inline (Ctrl+K) & slide-over AI Copilot
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import type {
  PdfDocument,
  PageSize,
  PageOrientation,
  DocumentTheme,
  DocumentMargins,
} from '@/lib/pdf-studio/types';
import { useWordProcessor } from './use-word-processor';
import { DocumentRibbon } from './DocumentRibbon';
import { DocumentPageCanvas } from './DocumentPageCanvas';
import { DocumentStatusBar } from './DocumentStatusBar';
import { DocumentSettingsModal } from '../DocumentSettingsModal';
import { WordProcessorCopilotSheet } from './WordProcessorCopilotSheet';
import { DocumentLayersTree } from '../layers/DocumentLayersTree';
import { DocumentInspector } from '../inspector/DocumentInspector';
import { printDocument } from '@/lib/pdf-studio/export-service';

export interface WordProcessorProps {
  doc: PdfDocument;
  projectName?: string | null;
  projectId?: string | null;
  onNewDocument?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  onUpdateDocument: (nextDoc: PdfDocument) => void;
  onSetTitle: (title: string) => void;
  onSetPageSize: (size: PageSize) => void;
  onSetOrientation: (orientation: PageOrientation) => void;
  onSetTheme: (theme: DocumentTheme) => void;
  onUpdateMargins: (margins: Partial<DocumentMargins>) => void;
  onUpdateHeader: (header: Partial<PdfDocument['settings']['header']>) => void;
  onUpdateFooter: (footer: Partial<PdfDocument['settings']['footer']>) => void;
}

export function WordProcessor({
  doc,
  projectName,
  projectId,
  onNewDocument,
  isSaving,
  isDirty,
  onUpdateDocument,
  onSetTitle,
  onSetPageSize,
  onSetOrientation,
  onSetTheme,
  onUpdateMargins,
  onUpdateHeader,
  onUpdateFooter,
}: WordProcessorProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [inlineAiOpen, setInlineAiOpen] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [showInspector, setShowInspector] = useState(true);

  const {
    activeBlock,
    activeBlockId,
    setActiveBlockId,
    currentNodes,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    updateNode,
    deleteNode,
    addNode,
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
  } = useWordProcessor({ doc, onUpdateDocument });

  // ─── Global Keyboard Shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInlineAiOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void printDocument(doc);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [undo, redo, doc]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Unified Studio Header Toolbar */}
      <DocumentRibbon
        doc={doc}
        projectName={projectName}
        projectId={projectId}
        onNewDocument={onNewDocument}
        activeBlock={activeBlock}
        canUndo={canUndo}
        canRedo={canRedo}
        isSaving={isSaving}
        isDirty={isDirty}
        darkCanvas={darkCanvas}
        showRuler={showRuler}
        showLayers={showLayers}
        showInspector={showInspector}
        onUndo={undo}
        onRedo={redo}
        onSetTitle={onSetTitle}
        onUpdateBlock={updateBlock}
        onInsertBlock={insertBlockAfter}
        onInsertNode={(type) => addNode(selectedNodeId, type)}
        onToggleDarkCanvas={() => setDarkCanvas(!darkCanvas)}
        onToggleRuler={() => setShowRuler((prev) => !prev)}
        onToggleLayers={() => setShowLayers((prev) => !prev)}
        onToggleInspector={() => setShowInspector((prev) => !prev)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCopilot={() => setCopilotOpen(true)}
        onOpenInlineAi={() => setInlineAiOpen(true)}
      />

      {/* Viewport: Layers Tree + Paper Canvas + Style & Layout Inspector */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Collapsible Layers Tree */}
        {showLayers && (
          <DocumentLayersTree
            nodes={currentNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              if (id && !showInspector) setShowInspector(true);
            }}
            onUpdateNode={updateNode}
            onDeleteNode={deleteNode}
            onAddChild={addNode}
            onClose={() => setShowLayers(false)}
          />
        )}

        {/* Main Multi-sheet Virtual Paper Canvas */}
        <DocumentPageCanvas
          doc={doc}
          nodes={currentNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            if (id && !showInspector) setShowInspector(true);
          }}
          onUpdateNode={updateNode}
          activeBlockId={activeBlockId}
          zoom={zoom}
          darkCanvas={darkCanvas}
          inlineAiOpen={inlineAiOpen}
          showRuler={showRuler}
          onSelectBlock={setActiveBlockId}
          onUpdateBlock={updateBlock}
          onDeleteBlock={removeBlock}
          onMoveBlock={moveBlock}
          onInsertBlockAfter={insertBlockAfter}
          onUpdateMargins={onUpdateMargins}
          onCloseInlineAi={() => setInlineAiOpen(false)}
          // Table operations
          onAddTableRow={addTableRow}
          onDeleteTableRow={deleteTableRow}
          onAddTableCol={addTableColumn}
          onDeleteTableCol={deleteTableColumn}
          onUpdateTableCell={updateTableCell}
          onUpdateTableHeader={updateTableHeader}
        />

        {/* Right Docked Style & Property Inspector */}
        {showInspector && (
          <DocumentInspector
            selectedNode={selectedNode}
            theme={doc.settings.theme}
            onUpdateNode={updateNode}
            onDeleteNode={deleteNode}
            onClose={() => setShowInspector(false)}
          />
        )}
      </div>

      {/* Bottom Status Bar */}
      <DocumentStatusBar
        stats={stats}
        pageSize={doc.settings.pageSize}
        orientation={doc.settings.orientation}
        zoom={zoom}
        onSetZoom={setZoom}
        totalPages={stats.estimatedPages}
      />

      {/* Slide-over AI Copilot Sheet */}
      <WordProcessorCopilotSheet
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        documentTitle={doc.title}
        activeBlockId={activeBlockId}
        onInsertBlock={(targetId, newBlock) => {
          insertBlockAfter(targetId, newBlock.type);
          if (newBlock) {
            updateBlock(activeBlockId || '', newBlock);
          }
        }}
      />

      {/* Page Setup & Theme Modal */}
      <DocumentSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        doc={doc}
        onUpdateTitle={onSetTitle}
        onUpdatePageSize={onSetPageSize}
        onUpdateOrientation={onSetOrientation}
        onUpdateTheme={onSetTheme}
        onUpdateMargins={onUpdateMargins}
        onUpdateHeader={onUpdateHeader}
        onUpdateFooter={onUpdateFooter}
      />
    </div>
  );
}
