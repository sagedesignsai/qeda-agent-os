/**
 * components/documents/word-processor/DocumentRibbon.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Studio Header Toolbar for Word Processor:
 *   - Document title, breadcrumbs, and live save status badge
 *   - Undo / Redo history controls and Insert menu (Blocks & Micro-Primitives)
 *   - Quick inline AI assist trigger (⌘K)
 *   - Panel toggles: Layers Tree, Style & Property Inspector, Margin Ruler
 *   - Studio controls: Canvas mode, Page Setup & Theme Settings, Copilot,
 *     Print, and Native PDF Export
 *   - Formatting and styling are centralized in the Style & Property Inspector
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  Undo2Icon,
  Redo2Icon,
  PrinterIcon,
  DownloadIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  PlusIcon,
  MoonIcon,
  SunIcon,
  TableIcon,
  FileTextIcon,
  HeadingIcon,
  InfoIcon,
  BarChart3Icon,
  MinusIcon,
  PenToolIcon,
  SplitIcon,
  ScissorsIcon,
  ChevronRightIcon,
  RulerIcon,
  CheckIcon,
  Loader2Icon,
  SlidersIcon,
  LayersIcon,
  SquareIcon,
  ColumnsIcon,
  RowsIcon,
  TypeIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import type { PdfDocument, PdfBlock, BlockType } from '@/lib/pdf-studio/types';
import type { DocNodeType } from '@/lib/pdf-studio/primitives-ast';
import {
  exportDocumentToDisk,
  printDocument,
} from '@/lib/pdf-studio/export-service';

export interface DocumentRibbonProps {
  doc: PdfDocument;
  projectName?: string | null;
  projectId?: string | null;
  onNewDocument?: () => void;
  activeBlock?: PdfBlock | null;
  canUndo: boolean;
  canRedo: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
  darkCanvas: boolean;
  showRuler: boolean;
  ribbonCollapsed?: boolean;
  showLayers?: boolean;
  showInspector?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSetTitle: (title: string) => void;
  onUpdateBlock?: (blockId: string, updates: Partial<PdfBlock>) => void;
  onInsertBlock: (targetBlockId: string | null, type: BlockType) => void;
  onInsertNode?: (type: DocNodeType) => void;
  onToggleDarkCanvas: () => void;
  onToggleRuler: () => void;
  onToggleRibbon?: () => void;
  onToggleLayers?: () => void;
  onToggleInspector?: () => void;
  onOpenSettings: () => void;
  onOpenCopilot: () => void;
  onOpenInlineAi: () => void;
}

export function DocumentRibbon({
  doc,
  projectName,
  projectId,
  onNewDocument,
  activeBlock,
  canUndo,
  canRedo,
  isSaving,
  isDirty,
  darkCanvas,
  showRuler,
  showLayers,
  showInspector,
  onUndo,
  onRedo,
  onSetTitle,
  onInsertBlock,
  onInsertNode,
  onToggleDarkCanvas,
  onToggleRuler,
  onToggleLayers,
  onToggleInspector,
  onOpenSettings,
  onOpenCopilot,
  onOpenInlineAi,
}: DocumentRibbonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    await exportDocumentToDisk(doc);
    setIsExporting(false);
  };

  const handlePrint = async () => {
    await printDocument(doc);
  };

  return (
    <div className="flex flex-col border-b border-border/60 bg-muted/20 select-none">
      {/* ─── TIER 1: Unified Document Studio Header ────────────────────────── */}
      <div className="flex h-10 items-center justify-between px-2.5 sm:px-3 gap-2 border-b border-border/50 bg-card/30 backdrop-blur-xs">
        {/* Left: Sidebar trigger, Breadcrumbs, Document Title & Save Status */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SidebarTrigger className="-ml-1 h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" />

          {/* Compact breadcrumb trail */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Link
              to="/documents"
              className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
            >
              <FileTextIcon className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Docs</span>
            </Link>
            {projectName && (
              <>
                <ChevronRightIcon className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <Link
                  to={
                    projectId
                      ? `/documents?projectId=${projectId}`
                      : '/documents'
                  }
                  className="max-w-[100px] truncate hover:text-foreground transition-colors md:max-w-[140px]"
                >
                  {projectName}
                </Link>
              </>
            )}
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          </div>

          {/* In-place Editable Title */}
          <Input
            value={doc.title}
            onChange={(e) => onSetTitle(e.target.value)}
            placeholder="Untitled Document..."
            className="h-7 w-36 sm:w-48 md:w-64 font-semibold text-xs border-transparent hover:border-border/60 focus:border-border focus:bg-background/80 bg-transparent transition-all shadow-none px-1.5 rounded-md truncate"
          />

          {/* Auto-save status */}
          <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground ml-0.5">
            {isSaving ? (
              <span className="flex items-center gap-1 text-primary">
                <Loader2Icon className="h-3 w-3 animate-spin" />
                <span className="hidden lg:inline">Saving</span>
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-1 text-amber-500">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span className="hidden lg:inline">Unsaved</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-500">
                <CheckIcon className="h-3 w-3" />
                <span className="hidden lg:inline text-muted-foreground">
                  Saved
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Center: Undo / Redo & Insert Menu */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Undo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Undo <Kbd>Ctrl+Z</Kbd>
            </TooltipContent>
          </Tooltip>

          {/* Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Redo <Kbd>Ctrl+Y</Kbd>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-4 mx-0.5" />

          {/* Insert Block Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <PlusIcon className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Insert</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 text-xs">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Document Elements
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'heading')
                }
              >
                <HeadingIcon className="mr-2 h-3.5 w-3.5 text-sky-400" />
                <span>Heading</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'paragraph')
                }
              >
                <FileTextIcon className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                <span>Paragraph</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onInsertBlock(activeBlock?.id ?? null, 'table')}
              >
                <TableIcon className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                <span>Data Table</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'callout')
                }
              >
                <InfoIcon className="mr-2 h-3.5 w-3.5 text-amber-400" />
                <span>Callout Box</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'metrics')
                }
              >
                <BarChart3Icon className="mr-2 h-3.5 w-3.5 text-purple-400" />
                <span>Metric Cards</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'columns')
                }
              >
                <SplitIcon className="mr-2 h-3.5 w-3.5 text-indigo-400" />
                <span>2-Column Layout</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'divider')
                }
              >
                <MinusIcon className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                <span>Horizontal Rule</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'page-break')
                }
              >
                <ScissorsIcon className="mr-2 h-3.5 w-3.5 text-rose-400" />
                <span>Page Break</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onInsertBlock(activeBlock?.id ?? null, 'signature')
                }
              >
                <PenToolIcon className="mr-2 h-3.5 w-3.5 text-blue-400" />
                <span>Signature Block</span>
              </DropdownMenuItem>
              {onInsertNode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Micro-Primitives (Yoga)
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onInsertNode('box')}>
                    <SquareIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                    <span>Box Container</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onInsertNode('row')}>
                    <ColumnsIcon className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                    <span>Row Container</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onInsertNode('column')}>
                    <RowsIcon className="mr-2 h-3.5 w-3.5 text-purple-500" />
                    <span>Column Container</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onInsertNode('text')}>
                    <TypeIcon className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    <span>Text Primitive</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick AI inline assist */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-1.5 sm:px-2 text-xs text-primary hover:bg-primary/10"
                onClick={onOpenInlineAi}
              >
                <SparklesIcon className="h-3 w-3" />
                <span className="hidden md:inline">AI Assist</span>
                <Kbd className="text-[9px] py-0 px-1 ml-0.5 hidden sm:inline">
                  ⌘K
                </Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Inline AI Assist on Active Block (Ctrl+K)
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Right: Real-Estate Toggles, Layout Settings, Dark Canvas, Copilot, Print, PDF Export & New */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Toggle Layers Tree */}
          {onToggleLayers && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showLayers ? 'secondary' : 'ghost'}
                  size="icon"
                  className={`h-7 w-7 ${showLayers ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={onToggleLayers}
                >
                  <LayersIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showLayers ? 'Hide Document Layers' : 'Show Document Layers'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Toggle Style Inspector */}
          {onToggleInspector && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showInspector ? 'secondary' : 'ghost'}
                  size="icon"
                  className={`h-7 w-7 ${showInspector ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={onToggleInspector}
                >
                  <SlidersIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showInspector
                  ? 'Hide Style & Layout Inspector'
                  : 'Show Style & Layout Inspector'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Toggle Margin Ruler */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showRuler ? 'secondary' : 'ghost'}
                size="icon"
                className={`h-7 w-7 ${showRuler ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={onToggleRuler}
              >
                <RulerIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showRuler ? 'Hide Margin Ruler' : 'Show Margin Ruler'}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-4 mx-0.5" />

          {/* Dark Canvas Invert Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onToggleDarkCanvas}
              >
                {darkCanvas ? (
                  <SunIcon className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <MoonIcon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {darkCanvas
                ? 'Switch to White Paper'
                : 'Switch to Dark Paper Canvas'}
            </TooltipContent>
          </Tooltip>

          {/* Page Setup & Theme Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
              >
                <SlidersHorizontalIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Page Layout & Theme Settings</TooltipContent>
          </Tooltip>

          {/* AI Copilot Drawer */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary"
            onClick={onOpenCopilot}
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copilot</span>
          </Button>

          <Separator orientation="vertical" className="h-4 mx-0.5" />

          {/* Print */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handlePrint}
              >
                <PrinterIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Print Document</TooltipContent>
          </Tooltip>

          {/* One-Click Native PDF Export */}
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1.5 px-2.5 sm:px-3 text-xs shadow-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Export PDF</span>
          </Button>

          {/* New Document Button */}
          {onNewDocument && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs shadow-xs"
              onClick={onNewDocument}
            >
              <PlusIcon className="h-3.5 w-3.5 text-primary" />
              <span className="hidden xl:inline">New</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
