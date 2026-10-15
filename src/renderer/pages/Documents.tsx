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
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useDocuments, useDocumentEditor } from '@/hooks/use-documents';
import { WordProcessor } from '@/components/documents/word-processor';
import { TemplatePickerModal } from '@/components/documents/TemplatePickerModal';
import { DocumentsWelcome } from '@/components/documents/DocumentsWelcome';
import { DocumentDrafterSheet } from '@/components/documents/drafter/DocumentDrafterSheet';

export default function Documents() {
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId?: string }>();
  const {
    projectId,
    activeProjectId,
    activeProjectName,
    clear: clearProjectScope,
  } = useProjectScope();

  const { documents, createFromTemplate, loading } = useDocuments(projectId);

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
  /** Template id currently being created, or null when idle.
   *
   *  `createFromTemplate` is async and the cards are bare buttons, so before
   *  this a double-click opened the same template twice and produced two
   *  documents with two ids. Naming the in-flight template (rather than a bare
   *  boolean) also lets the card show which one is being created. */
  const [creatingFromTemplate, setCreatingFromTemplate] = useState<
    string | null
  >(null);
  /** Prompt handed to the Document Drafter, or null when the panel is closed.
   *
   *  The welcome composer does NOT create a document itself. It opens the
   *  drafter seeded with what was typed, so the agent — not a template click —
   *  produces the draft, which is the whole AI-first premise of this page.
   *  The drafter's `onDocumentCreated` then navigates to the finished file. */
  const [draftPrompt, setDraftPrompt] = useState<string | null>(null);

  const handleDraft = (prompt: string) => setDraftPrompt(prompt);

  // Note: this route deliberately does *not* auto-open the most recent document.
  // It used to navigate to `documents[0]`, which is `ORDER BY updated_at DESC` —
  // so visiting /documents silently dropped you into your last edit and the
  // gallery below could never render unless you had zero documents. /documents
  // is now a real landing page, matching how Projects handles its index.

  const handleSelectTemplate = async (templateId: string) => {
    // Guard rather than rely on `disabled` alone: the state update lands after
    // the current event, so two clicks in the same tick would both pass.
    if (creatingFromTemplate !== null) return;
    setCreatingFromTemplate(templateId);
    try {
      const id = await createFromTemplate(templateId, projectId);
      if (id) {
        navigate(`/documents/${id}`);
      }
    } finally {
      setCreatingFromTemplate(null);
    }
  };

  // The dense header promotes the trailing crumb to the heading, so a project
  // crumb here would replace "Documents" as the page title. Scope is carried by
  // ProjectScopeChip in `meta` instead.
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
              // The count was previously shown nowhere, so a user with 200
              // documents had no idea how much they were not seeing here —
              // matching `Projects.tsx:379-383`.
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
              onDraft={handleDraft}
              loading={loading}
              isEmpty={documents.length === 0}
            />
          </div>
        </>
      )}

      {/* Template Picker Modal — the explicit "start from a fixed layout" path,
          kept separate from the AI composer on the welcome view. */}
      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelectTemplate={(tmplId) => void handleSelectTemplate(tmplId)}
      />

      {/* The Document Drafter. Mounted always and opened by presence of a
          prompt, so a draft conversation survives closing the panel and
          reopening it — same pattern `Tasks.tsx` uses for its task drafter. */}
      <DocumentDrafterSheet
        open={draftPrompt !== null}
        onOpenChange={(open) => !open && setDraftPrompt(null)}
        projectId={projectId ?? undefined}
        initialPrompt={draftPrompt ?? undefined}
        onDocumentCreated={(id) => {
          setDraftPrompt(null);
          navigate(`/documents/${id}`);
        }}
      />
    </div>
  );
}
