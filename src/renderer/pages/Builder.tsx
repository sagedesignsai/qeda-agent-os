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
 * Only the frame: the page header (title + project scope chip), the wide-layout
 * resizable split, and the compact-width tab switch between canvas and chat. All
 * of Builder's chrome decisions live inside the two panels, so this file does not
 * grow a second opinion about them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import { BuilderChatPanel } from '@/components/builder/BuilderChatPanel';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useBuilderPreview } from '@/hooks/use-builder-preview';
import {
  latestLocalUrl,
  type BuilderPreviewOwner,
} from '@/lib/builder-preview';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBuilderRuntime } from '@/hooks/use-builder-runtime';
import { useBuilderSession } from '@/hooks/use-builder-session';
import { useBuilderFiles } from '@/hooks/use-builder-files';
import { useBuilderModels } from '@/hooks/use-builder-models';
import { useBuilderWorkspace } from '@/hooks/use-builder-workspace';
import { useDefaultLayout } from 'react-resizable-panels';

export default function Builder() {
  const runtime = useBuilderRuntime();
  const builderSession = useBuilderSession();
  const builderFiles = useBuilderFiles(
    builderSession.session?.id,
    builderSession.events,
  );
  const builderModels = useBuilderModels(builderSession.session?.id);
  const workspace = useBuilderWorkspace();
  const layout = useDefaultLayout({ id: 'qeda-builder-workspace-v1' });
  const { chooseWorkspace: chooseSessionWorkspace } = builderSession;

  // `activeProject` is the project an agent would act on (explicit scope, else
  // the persisted default), while `projectName` is only the explicit scope — so
  // the chip stays quiet for a restored default, exactly as on other pages.
  const {
    projectName,
    activeProject,
    clear: clearProjectScope,
  } = useProjectScope();

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

  // Only the folder the user picks in the dialog is ever bound; this just opens
  // the picker at the project's repo when there is one.
  const chooseWorkspace = useCallback(
    () => chooseSessionWorkspace(activeProject?.repo_path ?? undefined),
    [chooseSessionWorkspace, activeProject?.repo_path],
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
      onDisconnectSession={builderSession.stopSession}
      onPermissionDecision={builderSession.replyPermission}
      onFormReply={builderSession.replyForm}
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
      onStartPreview={() => void preview.start()}
      onStopPreview={() => void preview.stop()}
      onOpenExternal={preview.openExternal}
      selectedFilePath={workspace.selectedFilePath}
      onSelectFile={workspace.setSelectedFilePath}
      files={builderFiles.files}
      filesLoading={builderFiles.loading}
      // Workspace identity (name/branch/dirty) lives in the canvas bar; the
      // folder picker itself lives in the chat panel, next to Send.
      workspace={builderSession.workspace}
      runtimeStatus={runtime.status}
      runtimeLoading={runtime.loading}
      // Keep / Discard — only available when a session is bound
      onKeepAll={
        builderSession.workspace
          ? () => void window.electron.ipc.invoke('builder:changes-keep')
          : undefined
      }
      onDiscardAll={
        builderSession.workspace
          ? () => void window.electron.ipc.invoke('builder:changes-discard')
          : undefined
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

      {isCompact ? (
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
    </div>
  );
}
