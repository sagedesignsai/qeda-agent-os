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

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';

import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useDocuments, useDocumentEditor } from '@/hooks/use-documents';
import { WordProcessor } from '@/components/documents/word-processor';
import { TemplatePickerModal } from '@/components/documents/TemplatePickerModal';
import { DocumentsWelcome } from '@/components/documents/DocumentsWelcome';
import { DocumentDrafterSheet } from '@/components/documents/drafter/DocumentDrafterSheet';
import { DOCUMENT_TEMPLATES } from '@/lib/pdf-studio/templates';
import { toast } from 'sonner';

export default function Documents() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId?: string }>();
  const {
    projectId,
    activeProjectId,
    activeProjectName,
    clear: clearProjectScope,
  } = useProjectScope();

  const { documents, loading } = useDocuments(projectId);

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
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<
    string | null
  >(null);

  const handleSelectTemplate = async (templateId: string) => {
    if (creatingFromTemplate !== null) return;
    setCreatingFromTemplate(templateId);
    try {
      const template = DOCUMENT_TEMPLATES.find((t) => t.id === templateId);
      if (!template) {
        toast.error('Template not found');
        return;
      }

      // Create document directly from template
      const newDoc = template.factory(projectId);

      // Save to database
      const savedDoc = await window.electron.ipc.invoke<{ id: string }>(
        'documents:create',
        newDoc,
      );

      if (savedDoc?.id) {
        setTemplatePickerOpen(false);
        navigate(`/documents/${savedDoc.id}`);
        toast.success(`Created ${template.name}`);
      }
    } catch (error) {
      console.error('Failed to create document from template:', error);
      toast.error('Failed to create document');
    } finally {
      setCreatingFromTemplate(null);
    }
  };

  const crumbs: PageCrumb[] = [{ label: 'Documents', to: '/documents' }];

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
          {/* Top Application Bar for the welcome / drafting surface */}
          <PageHeader
            crumbs={crumbs}
            subtitle={
              !loading && documents.length > 0
                ? `${documents.length} document${
                    documents.length === 1 ? '' : 's'
                  }`
                : undefined
            }
            meta={
              <ProjectScopeChip
                name={activeProjectName}
                onClear={clearProjectScope}
              />
            }
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

          {/* AI-first welcome. `min-h-0` + `overflow-y-auto` are both required
              and the order matters: a flex child defaults to `min-height: auto`,
              so without `min-h-0` it refuses to shrink below its content and the
              scroll container never engages — this page used to clip its own
              template grid with no way to reach it. Same pattern as
              `Projects.tsx:419`. */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-background">
            <DocumentsWelcome
              onSelectTemplate={handleSelectTemplate}
              loading={loading}
              isEmpty={documents.length === 0}
            />
          </div>
        </>
      )}

      {/* Template Picker Modal — the explicit "start from a fixed layout" path,
          kept separate from the welcome view. */}
      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelectTemplate={handleSelectTemplate}
        isCreating={creatingFromTemplate !== null}
      />
    </div>
  );
}
