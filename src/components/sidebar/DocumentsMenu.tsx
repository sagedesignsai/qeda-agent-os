/**
 * components/sidebar/DocumentsMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Level-2 rail submenu for the Documents section: list of composed documents,
 * quick template creation, and delete action.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeftIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import { useDocuments } from '@/hooks/use-documents';
import { useProjectScope } from '@/hooks/use-project-scope';
import { TemplatePickerModal } from '@/components/documents/TemplatePickerModal';

export function DocumentsMenu({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { documentId: activeDocumentId } = useParams<{ documentId?: string }>();
  const { activeProjectId } = useProjectScope();
  const { documents, createFromTemplate, deleteDocument } =
    useDocuments(activeProjectId);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const handleSelectTemplate = async (templateId: string) => {
    const id = await createFromTemplate(templateId, activeProjectId);
    if (id) {
      navigate(`/documents/${id}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await deleteDocument(id);
    if (ok && activeDocumentId === id) {
      navigate('/documents');
    }
  };

  return (
    <>
      <SidebarContent>
        {/* Back to main menu */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onBack}
                className="text-muted-foreground"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span>Main menu</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Documents group */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Documents</span>
            <button
              type="button"
              onClick={() => setTemplatePickerOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              title="New Document"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {documents.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No documents yet.
                </div>
              ) : (
                documents.map((doc) => {
                  const isActive = activeDocumentId === doc.id;
                  return (
                    <SidebarMenuItem key={doc.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="truncate"
                      >
                        <FileTextIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                      </SidebarMenuButton>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover>
                            <MoreHorizontalIcon className="h-3.5 w-3.5" />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => handleDelete(doc.id, e)}
                          >
                            <TrashIcon className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <TemplatePickerModal
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelectTemplate={(tId) => void handleSelectTemplate(tId)}
      />
    </>
  );
}
