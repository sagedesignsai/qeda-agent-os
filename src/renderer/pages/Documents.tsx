/**
 * renderer/pages/Documents.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Document Studio route view (/documents and /documents/:documentId).
 *
 * Implements a full-featured Google Docs / LibreOffice Word Processor experience:
 *   - Two-tier Office ribbon toolbar (Actions, Styling, Fonts, Formats)
 *   - Virtual multi-sheet paper canvas with realistic drop shadows and corner crop marks
 *   - Interactive margin ruler and status bar (word count, page count, zoom slider)
 *   - Direct in-place editing across all blocks and data tables
 *   - Background PDF compilation and native file export via Electron
 *   - Integrated inline (Ctrl+K) & slide-over AI Copilot
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { PlusIcon, FileTextIcon } from 'lucide-react';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useDocuments, useDocumentEditor } from '@/hooks/use-documents';
import { WordProcessor } from '@/components/documents/word-processor';
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
    updateDocument,
  } = useDocumentEditor(documentId ?? null);

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
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Main Studio Area: Full Word Processor or Template Picker Hero */}
      {doc ? (
        <div className="flex-1 overflow-hidden">
          <WordProcessor
            doc={doc}
            projectName={activeProjectName}
            projectId={activeProjectId}
            onNewDocument={() => setTemplatePickerOpen(true)}
            isSaving={isSaving}
            isDirty={isDirty}
            onUpdateDocument={updateDocument}
            onSetTitle={setTitle}
            onSetPageSize={setPageSize}
            onSetOrientation={setOrientation}
            onSetTheme={setTheme}
            onUpdateMargins={updateMargins}
            onUpdateHeader={updateHeader}
            onUpdateFooter={updateFooter}
          />
        </div>
      ) : (
        <>
          {/* Top Application Bar for Template Gallery / Empty State */}
          <PageHeader
            crumbs={crumbs}
            actions={
              <Button
                variant="default"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs shadow-sm"
                onClick={() => setTemplatePickerOpen(true)}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                <span>New Document</span>
              </Button>
            }
          />

          {/* Empty State / Template Gallery Hero */}
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-background">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <FileTextIcon className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Document Composer & Studio
            </h2>
            <p className="max-w-md text-sm text-muted-foreground mt-1.5 mb-6">
              Design multi-page proposals, itemized invoices, technical specs,
              and resumes with live paper-sheet canvas, office formatting
              ribbon, and AI drafting.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl w-full text-left">
              {DOCUMENT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => void handleSelectTemplate(tmpl.id)}
                  className="group flex flex-col rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary hover:bg-muted/30 hover:shadow-md cursor-pointer"
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
        </>
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
