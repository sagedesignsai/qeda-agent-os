/**
 * renderer/pages/Builder.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Builder composition root: page chrome, chat, canvas, and the small local UI
 * hooks that join them. Runtime and session mechanics remain outside the view.
 *
 * PROJECT SCOPE
 * ─────────────
 * Builder reads the same `?project=` lens as Tasks/Terminal/Chat, because the
 * project model is the only place the app knows a repository path. The scope
 * does two things here and nothing more: it is shown (chip + crumb), and it
 * pre-fills the folder picker with `repo_path`. It never binds that directory
 * on its own — the user still confirms a folder in the OS dialog and main still
 * proves it is a git repo, so the "a run happens only in a folder you chose"
 * guarantee in `main/builder/workspace.ts` is untouched.
 *
 * ONE OWNER FOR THE FOLDER PICKER
 * ──────────────────────────────
 * `chooseWorkspace` is handed to exactly one component: the chat panel. It gates
 * sending a prompt, so it belongs beside the Send button it enables rather than
 * in the canvas chrome, where it was a folder button nobody was looking at while
 * typing. The canvas still receives `builderSession.workspace` — it renders the
 * repo name, branch, and dirty count — but no longer owns the action.
 *
 * `BuilderWorkspaceHeader`, the standalone header this page once described, is
 * deleted: it was imported nowhere, and keeping a second identity component
 * around only invites the two to drift apart again.
 *
 * WHAT THIS PAGE CONTRIBUTES
 * ──────────────────────────
 * The page header and full-workspace welcome state live here. The resizable
 * chat/canvas split and compact-width tab switch appear only after a session and
 * workspace are restored or created, so the empty route never renders editor
 * chrome that has nothing to inspect.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderChatPanel } from '@/components/builder/BuilderChatPanel';
import { BuilderWelcome } from '@/components/builder/BuilderWelcome';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useBuilderPreview } from '@/hooks/use-builder-preview';
import {
  latestLocalUrl,
  type BuilderPreviewOwner,
} from '@/lib/builder-preview';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuilderRuntime } from '@/hooks/use-builder-runtime';
import { useBuilderSession } from '@/hooks/use-builder-session';
import { useBuilderChanges } from '@/hooks/use-builder-changes';
import { useBuilderFiles } from '@/hooks/use-builder-files';
import { useBuilderModels } from '@/hooks/use-builder-models';
import { useBuilderCodeProjects } from '@/hooks/use-builder-code-projects';
import { useBuilderWorkspace } from '@/hooks/use-builder-workspace';
import { useDefaultLayout } from 'react-resizable-panels';
import type { CodeProject } from '@/main/ipc/channels';

export default function Builder() {
  const navigate = useNavigate();
  const runtime = useBuilderRuntime();
  const builderSession = useBuilderSession();
  const builderChanges = useBuilderChanges(
    builderSession.session?.id,
    builderSession.events,
  );
  // Destructured so the callbacks depend on the stable functions the hook
  // memoizes, not on the object it rebuilds every render.
  const { keep: keepBuilderChanges, discard: discardBuilderChanges } =
    builderChanges;
  const builderFiles = useBuilderFiles(
    builderSession.session?.id,
    builderSession.events,
    // Discard can delete files without a tool event; Keep advances the review
    // baseline. Both should refresh the tree the same way a tool does.
    builderChanges.revision,
  );
  const builderModels = useBuilderModels(builderSession.session?.id);
  const workspace = useBuilderWorkspace();
  const layout = useDefaultLayout({ id: 'qeda-builder-workspace-v1' });
  const {
    chooseWorkspace: chooseSessionWorkspace,
    createSession: createBuilderSession,
    detachSession: detachBuilderSession,
    stopSession: stopBuilderSession,
    sendPrompt: sendBuilderPrompt,
  } = builderSession;
  const setDraftPrompt = workspace.setPrompt;

  // `activeProject` is the project an agent would act on (explicit scope, else
  // the persisted default), while `projectName` is only the explicit scope — so
  // the chip stays quiet for a restored default, exactly as on other pages.
  const {
    projectName,
    activeProject,
    clear: clearProjectScope,
    withScope,
  } = useProjectScope();
  const activeProjectId = activeProject?.id ?? null;
  const activeProjectName = activeProject?.name ?? projectName;
  const {
    codeProjects: projectCodebases,
    loading: codeProjectsLoading,
    busy: codeProjectsBusy,
    indexingId,
    error: codeProjectsError,
    register: registerCodeProject,
    provision: provisionCodeProjectAction,
    index: indexCodeProject,
  } = useBuilderCodeProjects(activeProjectId);

  const preview = useBuilderPreview();

  // The always-on half of the preview: a dev server the agent started inside a
  // turn announces its address in tool output, so the feed already knows about
  // it. No process of ours is needed to *detect* one — only to own one.
  const detectedUrl = useMemo(
    () => latestLocalUrl(builderSession.events),
    [builderSession.events],
  );

  // A live Qeda process wins; a detected address only fills the gap. The owner
  // follows the same rule, so the Stop control appears exactly when there is a
  // process we can actually stop.
  const qedaLive =
    preview.status.owner === 'qeda' &&
    (preview.status.state === 'starting' || preview.status.state === 'ready');
  const previewUrl =
    (qedaLive ? preview.status.url : null) ?? detectedUrl ?? '';
  const previewOwner: BuilderPreviewOwner | null = qedaLive
    ? 'qeda'
    : detectedUrl
      ? 'detected'
      : null;

  const [pendingWorkspaceSwitch, setPendingWorkspaceSwitch] = useState<{
    defaultPath?: string | null;
  } | null>(null);
  const [confirmDiscardSession, setConfirmDiscardSession] = useState(false);

  // Only the folder the user picks in the dialog is ever bound; this just opens
  // the picker at the project's repo when there is one.
  const openWorkspace = useCallback(
    async (defaultPath?: string | null) => {
      const started = await chooseSessionWorkspace(
        defaultPath === null
          ? undefined
          : (defaultPath ?? activeProject?.repo_path ?? undefined),
        { runInSandbox: workspace.runInSandbox },
      );
      if (started?.workspace && activeProject?.id) {
        await registerCodeProject(started.workspace.directory);
      }
      return started;
    },
    [
      chooseSessionWorkspace,
      activeProject?.repo_path,
      activeProject?.id,
      registerCodeProject,
      workspace.runInSandbox,
    ],
  );

  /**
   * Changing folders tears down the current session and its worktree, so ask
   * before doing it. The welcome screen has no session yet and therefore goes
   * straight to the picker.
   */
  const chooseWorkspace = useCallback(
    async (defaultPath?: string | null) => {
      // The chat panel hands this callback straight to an onClick, so a click
      // can arrive here as a MouseEvent despite the narrower signature. Only a
      // real path (or an explicit "no default") should reach the picker.
      const target =
        typeof defaultPath === 'string' || defaultPath === null
          ? defaultPath
          : undefined;
      if (builderSession.session) {
        setPendingWorkspaceSwitch({ defaultPath: target });
        return null;
      }
      return openWorkspace(target);
    },
    [builderSession.session, openWorkspace],
  );

  /**
   * The welcome composer's Send is a one-shot start: confirm a folder, create
   * the session, then submit the draft the user already wrote. Cancelling the
   * folder picker (or failing to create a session) leaves the draft intact.
   */
  const startBuildFromWelcome = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || builderSession.creating) return;
      const started = await openWorkspace(undefined);
      if (!started) return;
      // The session exists now, so the draft has done its job. Clear it before
      // the prompt resolves: LocalBuilderSession's prompt() runs the whole turn
      // and would otherwise leave stale text in the composer while the agent
      // works. Restore it only if the send itself failed and the user has not
      // started a new draft.
      setDraftPrompt('');
      const sent = await sendBuilderPrompt(trimmed);
      if (!sent) {
        setDraftPrompt((current) => current || trimmed);
      }
    },
    [builderSession.creating, openWorkspace, sendBuilderPrompt, setDraftPrompt],
  );

  const openCodeProject = useCallback(
    (codeProject: CodeProject) => {
      void createBuilderSession(codeProject.directory);
    },
    [createBuilderSession],
  );

  const openCodeProjectTerminal = useCallback(
    async (codeProject: CodeProject) => {
      try {
        const terminal = await window.electron.ipc.invoke<{ id: string }>(
          'terminal:session-create',
          {
            title: `Terminal · ${codeProject.name}`,
            goal: '',
            cwd: codeProject.directory,
            project_id: activeProjectId,
          },
        );
        navigate(withScope(`/terminal/${terminal.id}`));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not open Terminal.',
        );
      }
    },
    [activeProjectId, navigate, withScope],
  );

  const provisionCodeProject = useCallback(
    async (input: {
      name: string;
      source: 'created' | 'clone';
      remoteUrl?: string;
    }) => {
      try {
        const parentDirectory = await window.electron.ipc.invoke<string | null>(
          'dialog:open-directory',
          { title: 'Choose where to put this codebase' },
        );
        if (!parentDirectory) return;
        const codeProject = await provisionCodeProjectAction({
          ...input,
          parentDirectory,
        });
        if (codeProject) {
          await createBuilderSession(codeProject.directory);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Could not prepare codebase.',
        );
      }
    },
    [createBuilderSession, provisionCodeProjectAction],
  );

  const linkExistingCodeProject = useCallback(
    async (defaultPath?: string | null) => {
      try {
        const directory = await window.electron.ipc.invoke<string | null>(
          'dialog:open-directory',
          {
            title: 'Choose an existing Git repository to link',
            ...(defaultPath ? { defaultPath } : {}),
          },
        );
        if (!directory) return;
        const linked = await registerCodeProject(directory);
        if (linked) {
          toast.success(
            `Linked ${linked.name} to ${activeProjectName ?? 'Project'}.`,
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not link repository.',
        );
      }
    },
    [activeProjectName, registerCodeProject],
  );

  const runCodeProjectIndex = useCallback(
    async (id: string) => {
      const result = await indexCodeProject(id);
      if (result) {
        toast.success(
          `Indexed ${result.indexedFiles} source files (${result.indexedChunks} chunks).`,
          {
            description: result.skippedFiles
              ? `${result.skippedFiles} ignored, binary, or oversized files were skipped.`
              : 'Source is now searchable in project-scoped AI conversations.',
          },
        );
      }
    },
    [indexCodeProject],
  );
  const [isCompact, setIsCompact] = useState(false);
  const [compactSurface, setCompactSurface] = useState<'chat' | 'canvas'>(
    'canvas',
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const keepChanges = useCallback(async () => {
    try {
      const paths = await keepBuilderChanges();
      if (paths.length === 0) {
        toast.info('Nothing to keep — the worktree matches its baseline.');
      } else {
        toast.success(
          `Applied ${paths.length} file${paths.length === 1 ? '' : 's'} to your repository.`,
          {
            description:
              'Your source tree is updated but not committed; commit when you are ready.',
          },
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not apply the Builder changes.',
      );
    }
  }, [keepBuilderChanges]);

  const discardChanges = useCallback(async () => {
    try {
      await discardBuilderChanges();
      toast.success('Discarded Builder changes.', {
        description: 'The worktree is back to its last kept baseline.',
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not discard the Builder changes.',
      );
    }
  }, [discardBuilderChanges]);

  /**
   * Disconnect releases the live feed but keeps the worktree, its uncommitted
   * changes, and the persisted session row, so the next visit re-attaches.
   * Deleting the session is the explicit, confirmed Discard action below.
   */
  const disconnectSession = useCallback(async () => {
    const detached = await detachBuilderSession();
    if (detached) {
      toast.success('Builder session disconnected', {
        description:
          'Its worktree and uncommitted changes are kept. Open Builder again to re-attach.',
      });
    }
  }, [detachBuilderSession]);

  const chatPanel = (
    <BuilderChatPanel
      status={runtime.status}
      prompt={workspace.prompt}
      onPromptChange={workspace.setPrompt}
      workspace={builderSession.workspace}
      session={builderSession.session}
      events={builderSession.events}
      creatingSession={builderSession.creating}
      running={builderSession.running}
      sessionError={builderSession.error}
      pendingResponse={builderSession.pendingResponse}
      models={builderModels.models}
      selectedModel={builderModels.selected}
      modelsLoading={builderModels.loading}
      modelSwitching={builderModels.switching}
      modelError={builderModels.error}
      onChooseWorkspace={chooseWorkspace}
      onModelChange={(value) => void builderModels.select(value)}
      onSend={builderSession.sendPrompt}
      onAbort={builderSession.abort}
      onDisconnectSession={() => void disconnectSession()}
      onDiscardSession={() => setConfirmDiscardSession(true)}
      onPermissionDecision={builderSession.replyPermission}
      onFormReply={builderSession.replyForm}
      runInSandbox={workspace.runInSandbox}
      onToggleSandbox={workspace.setRunInSandbox}
    />
  );

  const canvasPanel = (
    <BuilderCanvas
      surface={workspace.surface}
      viewport={workspace.viewport}
      onSurfaceChange={workspace.setSurface}
      onViewportChange={workspace.setViewport}
      previewUrl={previewUrl}
      previewOwner={previewOwner}
      // An IPC failure (for example "no session yet") has no status of its own,
      // so it takes the message slot rather than being swallowed.
      previewStatus={
        preview.error
          ? { ...preview.status, message: preview.error }
          : preview.status
      }
      previewStarting={preview.starting}
      previewStopping={preview.stopping}
      canStartPreview={Boolean(builderSession.workspace)}
      previewCommand={workspace.previewCommand}
      onPreviewCommandChange={workspace.setPreviewCommand}
      onStartPreview={(command) =>
        void preview.start(command ? { command } : {})
      }
      onStopPreview={() => void preview.stop()}
      onOpenExternal={preview.openExternal}
      selectedFilePath={workspace.selectedFilePath}
      onSelectFile={workspace.setSelectedFilePath}
      files={builderFiles.files}
      filesLoading={builderFiles.loading}
      changes={builderChanges.changes}
      changesLoading={builderChanges.loading}
      keeping={builderChanges.keeping}
      discarding={builderChanges.discarding}
      // Workspace identity (name/branch/dirty) lives in the canvas bar; the
      // folder picker itself lives in the chat panel, next to Send.
      workspace={builderSession.workspace}
      runtimeStatus={runtime.status}
      runtimeLoading={runtime.loading}
      // Keep / Discard are wired through the changes hook so the diff list and
      // tree refresh after the operation instead of going stale.
      onKeepAll={
        builderSession.workspace?.worktreePath ? keepChanges : undefined
      }
      onDiscardAll={
        builderSession.workspace?.worktreePath ? discardChanges : undefined
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <PageHeader
        crumbs={[
          { label: 'Builder' },
          ...(projectName ? [{ label: projectName }] : []),
        ]}
        meta={
          <ProjectScopeChip name={projectName} onClear={clearProjectScope} />
        }
      />

      {builderSession.restoring ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Restoring your Builder workspace…
        </div>
      ) : !builderSession.session || !builderSession.workspace ? (
        <BuilderWelcome
          status={runtime.status}
          runtimeLoading={runtime.loading}
          projectName={activeProjectName}
          projectRepoPath={activeProject?.repo_path ?? null}
          prompt={workspace.prompt}
          onPromptChange={workspace.setPrompt}
          onSubmitPrompt={(text) => void startBuildFromWelcome(text)}
          creatingSession={builderSession.creating}
          error={builderSession.error || codeProjectsError}
          projectId={activeProject?.id ?? null}
          codeProjects={projectCodebases}
          codeProjectsLoading={codeProjectsLoading}
          codeProjectsBusy={codeProjectsBusy || builderSession.creating}
          indexingId={indexingId}
          onOpenCodeProject={openCodeProject}
          onOpenTerminal={(codeProject) =>
            void openCodeProjectTerminal(codeProject)
          }
          onProvisionCodeProject={(input) => void provisionCodeProject(input)}
          onIndexCodeProject={(id) => void runCodeProjectIndex(id)}
          onChooseWorkspace={(defaultPath) => {
            void chooseWorkspace(defaultPath);
          }}
          onLinkExistingCodeProject={(defaultPath) =>
            void linkExistingCodeProject(defaultPath)
          }
        />
      ) : isCompact ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            value={compactSurface}
            onValueChange={(value) =>
              setCompactSurface(value as 'chat' | 'canvas')
            }
            className="min-h-0 flex-1"
          >
            <TabsList variant="line" className="mx-3 h-9 shrink-0">
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
            <TabsContent value="canvas" className="min-h-0 overflow-hidden">
              {canvasPanel}
            </TabsContent>
            <TabsContent value="chat" className="min-h-0 overflow-hidden">
              {chatPanel}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1 overflow-hidden"
          {...layout}
        >
          <ResizablePanel
            id="builder-chat"
            defaultSize="36%"
            minSize="28%"
            maxSize="52%"
            className="min-h-0 min-w-0 overflow-hidden"
          >
            {chatPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="builder-canvas"
            defaultSize="64%"
            minSize="48%"
            className="min-h-0 min-w-0 overflow-hidden"
          >
            {canvasPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <AlertDialog
        open={pendingWorkspaceSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingWorkspaceSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Builder workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops the current session and removes its isolated worktree.
              Any changes you have not kept will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingWorkspaceSwitch?.defaultPath;
                setPendingWorkspaceSwitch(null);
                void openWorkspace(target);
              }}
            >
              Switch workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDiscardSession}
        onOpenChange={setConfirmDiscardSession}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this Builder session?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops the session and deletes its isolated worktree. Any
              changes you have not kept will be lost. Use Disconnect instead to
              keep them for later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscardSession(false);
                void stopBuilderSession();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
