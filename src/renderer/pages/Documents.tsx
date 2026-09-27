/**
 * renderer/pages/Documents.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Document Studio route view (/documents and /documents/:documentId).
 *
 * Implements a dual-pane studio layout:
 *   - Left pane: Visual Block Composer with inline editing and outline management
 *   - Right pane: Synchronized live React-PDF preview canvas with instant export
 *
 * Integrated with:
 *   - App layout rail and project scope
 *   - SQLite document persistence and auto-save
 *   - Native Electron PDF file export
 *   - AI Copilot structured drafting
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  PlusIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  CheckIcon,
  Loader2Icon,
  FileTextIcon,
  HeadingIcon,
  AlignLeftIcon,
  TableIcon,
  InfoIcon,
  BarChart3Icon,
  ColumnsIcon,
  MinusIcon,
  SplitIcon,
  PenToolIcon,
} from 'lucide-react';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useDocuments, useDocumentEditor } from '@/hooks/use-documents';
import { BlockEditorCard } from '@/components/documents/BlockEditorCard';
import { PdfLivePreview } from '@/components/documents/PdfLivePreview';
import { DocumentSettingsModal } from '@/components/documents/DocumentSettingsModal';
import { AiDocumentAssistant } from '@/components/documents/AiDocumentAssistant';
import { TemplatePickerModal } from '@/components/documents/TemplatePickerModal';
import { DOCUMENT_TEMPLATES } from '@/lib/pdf-studio/templates';

export default function Documents() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId?: string }>();
  const { activeProjectId, activeProjectName } = useProjectScope();

  const {
    documents,
    loading: listLoading,
    createFromTemplate,
  } = useDocuments(activeProjectId);

  const {
    doc,
    isSaving,
    isDirty,
    setTitle,
    setPageSize,
    setOrientation,
    setTheme,
    updateMargins,
    updateHeader,
    updateFooter,
    addBlock,
    updateBlock,
    moveBlock,
    duplicateBlock,
    removeBlock,
  } = useDocumentEditor(documentId ?? null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Auto-navigate to first available document if on /documents index and items exist
  useEffect(() => {
    if (!documentId && !listLoading && documents.length > 0) {
      navigate(`/documents/${documents[0].id}`, { replace: true });
    }
  }, [documentId, listLoading, documents, navigate]);

  const handleSelectTemplate = async (templateId: string) => {
    const id = await createFromTemplate(templateId, activeProjectId);
    if (id) {
      navigate(`/documents/${id}`);
    }
  };

  const crumbs: PageCrumb[] = [
    { label: 'Documents', to: '/documents' },
    ...(activeProjectName
      ? [
          {
            label: activeProjectName,
            to: `/documents?projectId=${activeProjectId}`,
          },
        ]
      : []),
    ...(doc ? [{ label: doc.title || 'Untitled' }] : []),
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top Application Bar */}
      <PageHeader
        crumbs={crumbs}
        actions={
          <div className="flex items-center gap-1.5">
            {doc && (
              <>
                {/* Auto-save status */}
                <div className="mr-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {isSaving ? (
                    <>
                      <Loader2Icon className="h-3 w-3 animate-spin text-primary" />
                      <span>Saving...</span>
                    </>
                  ) : isDirty ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span>Unsaved</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-3 w-3 text-emerald-500" />
                      <span>Saved</span>
                    </>
                  )}
                </div>

                {/* AI Copilot Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary"
                  onClick={() => setAiAssistantOpen(true)}
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>AI Copilot</span>
                </Button>

                {/* Layout Settings */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <SlidersHorizontalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Page Layout & Theme Settings</TooltipContent>
                </Tooltip>
              </>
            )}

            {/* New Document Button */}
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs shadow-sm"
              onClick={() => setTemplatePickerOpen(true)}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span>New Document</span>
            </Button>
          </div>
        }
      />

      {/* Main Studio Area */}
      {doc ? (
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full w-full"
          >
            {/* Left Pane: Block Composer */}
            <ResizablePanel id="doc-composer" minSize="380px" defaultSize="50">
              <div className="flex h-full flex-col overflow-hidden bg-background">
                {/* Title & Quick Controls Bar */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-2">
                  <Input
                    value={doc.title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Document title..."
                    className="h-8 max-w-sm font-semibold text-sm border-transparent hover:border-border/60 focus:border-border bg-transparent shadow-none"
                  />

                  {/* Add Block Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        <span>Add Block</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 text-xs">
                      <DropdownMenuItem onClick={() => addBlock('heading')}>
                        <HeadingIcon className="mr-2 h-3.5 w-3.5 text-sky-400" />
                        <span>Heading</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('paragraph')}>
                        <AlignLeftIcon className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                        <span>Paragraph</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('table')}>
                        <TableIcon className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                        <span>Data Table</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('callout')}>
                        <InfoIcon className="mr-2 h-3.5 w-3.5 text-amber-400" />
                        <span>Callout Box</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('metrics')}>
                        <BarChart3Icon className="mr-2 h-3.5 w-3.5 text-purple-400" />
                        <span>Metric Cards</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('columns')}>
                        <ColumnsIcon className="mr-2 h-3.5 w-3.5 text-indigo-400" />
                        <span>2-Column Grid</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('signature')}>
                        <PenToolIcon className="mr-2 h-3.5 w-3.5 text-teal-400" />
                        <span>Signature Block</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('divider')}>
                        <MinusIcon className="mr-2 h-3.5 w-3.5 text-zinc-500" />
                        <span>Divider</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addBlock('page-break')}>
                        <SplitIcon className="mr-2 h-3.5 w-3.5 text-rose-400" />
                        <span>Page Break</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Blocks Scrollable Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {doc.blocks.map((block, index) => (
                    <BlockEditorCard
                      key={block.id}
                      block={block}
                      isFirst={index === 0}
                      isLast={index === doc.blocks.length - 1}
                      onUpdate={(updates) => updateBlock(block.id, updates)}
                      onMoveUp={() => moveBlock(block.id, 'up')}
                      onMoveDown={() => moveBlock(block.id, 'down')}
                      onDuplicate={() => duplicateBlock(block.id)}
                      onDelete={() => removeBlock(block.id)}
                    />
                  ))}

                  {/* Bottom Quick-Add Bar */}
                  <div className="pt-2 pb-6 flex items-center justify-center gap-1.5 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('paragraph')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Paragraph
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('heading')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Heading
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('table')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Table
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('callout')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Callout
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('metrics')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Metrics
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addBlock('page-break')}
                    >
                      <PlusIcon className="mr-1 h-3 w-3" /> Page Break
                    </Button>
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Pane: Live PDF Preview */}
            <ResizablePanel id="doc-preview" minSize="380px" defaultSize="50">
              <PdfLivePreview doc={doc} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        /* Empty State / Template Gallery Hero */
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-background">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <FileTextIcon className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Document Composer & Studio
          </h2>
          <p className="max-w-md text-sm text-muted-foreground mt-1.5 mb-6">
            Design multi-page proposals, itemized invoices, technical specs, and
            resumes with live @react-pdf/renderer preview and AI drafting.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl w-full text-left">
            {DOCUMENT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => void handleSelectTemplate(tmpl.id)}
                className="group flex flex-col rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary hover:bg-muted/30 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    {tmpl.category}
                  </span>
                  <PlusIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h4 className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {tmpl.name}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {tmpl.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {doc && (
        <DocumentSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          doc={doc}
          onUpdateTitle={setTitle}
          onUpdatePageSize={setPageSize}
          onUpdateOrientation={setOrientation}
          onUpdateTheme={setTheme}
          onUpdateMargins={updateMargins}
          onUpdateHeader={updateHeader}
          onUpdateFooter={updateFooter}
        />
      )}

      {/* AI Copilot Drawer */}
      {doc && (
        <AiDocumentAssistant
          open={aiAssistantOpen}
          onOpenChange={setAiAssistantOpen}
          documentTitle={doc.title}
          onInsertBlock={(block) => addBlock(block.type, undefined, block)}
        />
      )}

      {/* Template Picker Modal */}
      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelectTemplate={(tmplId) => void handleSelectTemplate(tmplId)}
      />
    </div>
  );
}
