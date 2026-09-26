/**
 * renderer/pages/Workspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The knowledge workspace. Notebook/page navigation lives in the rail
 * (WorkspaceMenu); this page renders the selected page's block editor and the
 * right-hand info panel, both keyed off `/workspace/:notebookId/:pageId`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';
import type { Notebook, Page } from '@/main/ipc/channels';
import { useNotebooks, usePageDetail } from '@/hooks/use-workspace';
import { BlockEditor } from '@/components/workspace/BlockEditor';
import { PageInfoPanel } from '@/components/workspace/PageInfoPanel';
import {
  MessageSquareIcon,
  NotebookIcon,
  PanelRightIcon,
  PlusIcon,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Workspace() {
  const navigate = useNavigate();
  const { notebookId, pageId } = useParams<{
    notebookId?: string;
    pageId?: string;
  }>();

  const { notebooks } = useNotebooks();
  const { detail, reload: reloadDetail } = usePageDetail(pageId ?? null);
  const [infoOpen, setInfoOpen] = useState(true);

  // Prefer the loaded page's own notebook (a cross-notebook link may have
  // navigated with a stale :notebookId).
  const contextNotebookId =
    detail?.page.notebook_id ?? notebookId ?? null;
  const activeNotebook =
    notebooks.find((n) => n.id === contextNotebookId) ?? null;

  const crumbs: PageCrumb[] = [
    { label: 'Workspace', to: '/workspace' },
    ...(activeNotebook
      ? [{ label: activeNotebook.title, to: `/workspace/${activeNotebook.id}` }]
      : []),
    ...(detail ? [{ label: detail.page.title || 'Untitled' }] : []),
  ];

  const handleCreateNotebook = async (title: string) => {
    try {
      const notebook = await window.electron.ipc.invoke<Notebook>(
        'notebooks:create',
        { title },
      );
      navigate(`/workspace/${notebook.id}`);
    } catch {
      toast.error('Failed to create notebook.');
    }
  };

  const handleCreatePage = async (targetNotebookId: string) => {
    try {
      const page = await window.electron.ipc.invoke<Page>('pages:create', {
        notebookId: targetNotebookId,
        title: 'Untitled',
        parentPageId: null,
      });
      navigate(`/workspace/${targetNotebookId}/${page.id}`);
    } catch {
      toast.error('Failed to create page.');
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    const ok = await window.electron.ipc.invoke<boolean>(
      'pages:restore-version',
      { versionId },
    );
    if (ok) {
      await reloadDetail(pageId ?? '');
      toast.success('Version restored.');
    }
  };

  const handleChatWithContext = (id: string) => {
    navigate('/chat', { state: { chatContext: { pageId: id } } });
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel id="workspace-editor" minSize="380px">
          <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
              crumbs={crumbs}
              actions={
                <>
                  {detail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => handleChatWithContext(detail.page.id)}
                    >
                      <MessageSquareIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Chat about page</span>
                    </Button>
                  )}
                  {notebookId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => void handleCreatePage(notebookId)}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">New page</span>
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={infoOpen ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => setInfoOpen((v) => !v)}
                        aria-label="Toggle info panel"
                      >
                        <PanelRightIcon className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {infoOpen ? 'Hide info panel' : 'Show info panel'}
                    </TooltipContent>
                  </Tooltip>
                </>
              }
            />

            <div className="min-h-0 flex-1 overflow-hidden">
              {detail ? (
                <BlockEditor
                  pageId={detail.page.id}
                  title={detail.page.title}
                  initialBlocks={detail.blocks}
                  onSaved={
                    pageId ? () => void reloadDetail(pageId) : undefined
                  }
                />
              ) : (
                <EmptyWorkspace
                  hasNotebook={Boolean(notebookId)}
                  onCreatePage={() => {
                    if (notebookId) void handleCreatePage(notebookId);
                  }}
                  onCreateNotebook={() => {
                    const title = window.prompt('Notebook name');
                    if (title?.trim()) void handleCreateNotebook(title.trim());
                  }}
                />
              )}
            </div>
          </div>
        </ResizablePanel>

        {infoOpen && (
          <>
            <ResizableHandle withHandle />

            <ResizablePanel
              id="workspace-info"
              defaultSize="300px"
              minSize="220px"
              maxSize="420px"
              className="border-l"
            >
              <PageInfoPanel
                detail={detail}
                onNavigate={(id) => {
                  if (contextNotebookId) {
                    navigate(`/workspace/${contextNotebookId}/${id}`);
                  }
                }}
                onChatWithContext={handleChatWithContext}
                onVersionRestore={handleRestoreVersion}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

function EmptyWorkspace({
  hasNotebook,
  onCreatePage,
  onCreateNotebook,
}: {
  hasNotebook: boolean;
  onCreatePage: () => void;
  onCreateNotebook: () => void;
}) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <NotebookIcon />
        </EmptyMedia>
        <EmptyTitle>Your knowledge workspace</EmptyTitle>
        <EmptyDescription>
          Create a notebook, add pages, and write with the block editor. Then
          chat with your notes or launch a deep-research run from Chat.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={hasNotebook ? onCreatePage : onCreateNotebook}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {hasNotebook ? 'New page' : 'New notebook'}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
