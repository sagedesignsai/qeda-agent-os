/**
 * components/motion/MotionEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion's editor shell. It owns panel arrangement and chrome; each workspace
 * panel owns only its own view state and delegates document edits to Motion ops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoxesIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DownloadIcon,
  PlusIcon,
  Redo2Icon,
  RectangleHorizontalIcon,
  Undo2Icon,
} from 'lucide-react';
import {
  useDefaultLayout,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

import { MotionAssetMarketplaceDialog } from '@/components/motion/assets/MotionAssetMarketplaceDialog';
import { MotionExportDialog } from '@/components/motion/export/MotionExportDialog';
import { MotionInspector } from '@/components/motion/MotionInspector';
import { MotionScenePanel } from '@/components/motion/MotionScenePanel';
import { MotionTimeline } from '@/components/motion/MotionTimeline';
import { MotionViewport } from '@/components/motion/MotionViewport';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { useMotionExport } from '@/hooks/use-motion-export';
import { createMotionId } from '@/lib/motion/ids';
import { listMotionNodeTypes } from '@/lib/motion/node-registry';

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed';

interface MotionEditorProps {
  canUndo: boolean;
  canRedo: boolean;
  motionProject: {
    saveStatus: SaveStatus;
    readOnly: boolean;
    saveNow: () => Promise<boolean>;
  };
}

export function MotionEditor({ canUndo, canRedo, motionProject }: MotionEditorProps) {
  const { doc } = useMotionSnapshot();
  const [scenePanelCollapsed, setScenePanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('motion.timeline.collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportState = useMotionExport();
  const scenePanelRef = useRef<PanelImperativeHandle | null>(null);
  const inspectorPanelRef = useRef<PanelImperativeHandle | null>(null);
  const timelinePanelRef = useRef<PanelImperativeHandle | null>(null);
  const horizontalLayout = useDefaultLayout({
    id: 'motion-layout-horizontal-v1',
  });
  const verticalLayout = useDefaultLayout({ id: 'motion-layout-vertical-v2' });

  const toggleTimelineCollapse = useCallback(() => {
    const panel = timelinePanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setTimelineCollapsed(false);
    } else {
      panel.collapse();
      setTimelineCollapsed(true);
    }
  }, []);

  // Persist timeline collapsed state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem('motion.timeline.collapsed', String(timelineCollapsed));
    } catch {
      // Storage unavailable — no-op
    }
  }, [timelineCollapsed]);

  // Keyboard shortcut: Ctrl/Cmd+Shift+T to toggle timeline collapse
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        toggleTimelineCollapse();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleTimelineCollapse]);

  const togglePanel = (
    ref: typeof scenePanelRef,
    setCollapsed: (collapsed: boolean) => void,
  ) => {
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setCollapsed(false);
    } else {
      panel.collapse();
      setCollapsed(true);
    }
  };

  const addTrack = () => {
    motionStore.commit('Add track', [
      {
        op: 'track.add',
        trackId: createMotionId('track'),
        name: `Track ${doc.timeline.tracks.length + 1}`,
      },
    ]);
  };

  const addNode = (type: string) => {
    const definition = listMotionNodeTypes().find((item) => item.id === type);
    if (!definition) return;
    const nodeId = createMotionId('scene');
    motionStore.commit(`Add ${definition.label}`, [{ op: 'scene.node.add', nodeId, type }]);
  };

  const createScene = (duplicate: boolean) => {
    const sceneId = createMotionId('scene');
    const sceneName = duplicate ? `${doc.scenes.find((scene) => scene.id === doc.activeSceneId)?.name ?? 'Scene'} copy` : `Scene ${doc.scenes.length + 1}`;
    const ids = duplicate
      ? [
          ...doc.scene.nodes.map((node) => node.id),
          ...doc.timeline.tracks.map((track) => track.id),
          ...doc.timeline.tracks.flatMap((track) => track.placements.map((placement) => placement.id)),
          ...doc.timeline.clips.map((clip) => clip.id),
          ...doc.timeline.clips.flatMap((clip) => clip.channels.map((channel) => channel.id)),
          ...doc.timeline.clips.flatMap((clip) => clip.channels.flatMap((channel) => channel.keyframes.map((key) => key.id))),
          ...(doc.timeline.audio ?? []).map((audio) => audio.id),
        ]
      : doc.scene.nodes.filter((node) => node.type.startsWith('camera.') || node.type.startsWith('light.') || node.type === 'stage.ground').map((node) => node.id);
    const idMap = Object.fromEntries(ids.map((id) => [id, createMotionId('scene')]));
    motionStore.commit(duplicate ? 'Duplicate scene' : 'Add scene', [duplicate
      ? { op: 'scene.duplicate', sceneId, name: sceneName, idMap }
      : { op: 'scene.add', sceneId, name: sceneName, rigIdMap: idMap }]);
  };

  const activeScene = doc.scenes.find((scene) => scene.id === doc.activeSceneId);
  const nodeTypes = listMotionNodeTypes();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 bg-card/40 px-1.5">
        {/* Left: panel toggle, document, scene */}
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={scenePanelCollapsed ? 'Show scene panel' : 'Hide scene panel'}
            title={scenePanelCollapsed ? 'Show scene panel' : 'Hide scene panel'}
            onClick={() => togglePanel(scenePanelRef, setScenePanelCollapsed)}
          >
            {scenePanelCollapsed ? <RectangleHorizontalIcon className="size-3.5" /> : <ChevronLeftIcon className="size-3.5" />}
          </Button>
          <span className="truncate px-0.5 text-[11px] font-medium text-foreground/90">
            {doc.meta.name}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-6 max-w-36 px-1.5 text-[11px]">
                <span className="truncate">{activeScene?.name ?? 'Scene'}</span>
                <span className="ml-0.5 text-[10px] text-muted-foreground">{doc.timeline.duration.toFixed(1)}s</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {doc.scenes.map((scene) => (
                <DropdownMenuItem key={scene.id} onSelect={() => motionStore.commit('Switch scene', [{ op: 'document.setActiveScene', sceneId: scene.id }])}>
                  {scene.id === doc.activeSceneId ? '\u2713 ' : ''}{scene.name} \u00b7 {(scene.timeline.duration).toFixed(1)}s
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => createScene(false)}>+ New scene</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => createScene(true)}>Duplicate scene</DropdownMenuItem>
              {doc.scenes.length > 1 && activeScene && <DropdownMenuItem onSelect={() => {
                const confirmation = window.prompt(`Delete "${activeScene.name}" (${activeScene.timeline.duration.toFixed(1)}s)? Type the scene name to confirm.`);
                if (confirmation === activeScene.name) motionStore.commit('Delete scene', [{ op: 'scene.remove', sceneId: activeScene.id }], { approved: true });
              }}>Delete scene...</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Center spacer */}
        <div className="flex-1" />

        {/* Right: save, undo/redo, actions, panel toggles */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Save status and button */}
          <span className="mr-0.5 text-[10px] text-muted-foreground" role="status" aria-live="polite">
            {motionProject.readOnly ? 'Read only' : motionProject.saveStatus === 'saving' ? 'Saving...' : motionProject.saveStatus === 'failed' ? 'Save failed' : motionProject.saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => void motionProject.saveNow()}
            disabled={motionProject.readOnly || motionProject.saveStatus === 'saving'}
          >
            Save
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => motionStore.undo()}
          >
            <Undo2Icon className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => motionStore.redo()}
          >
            <Redo2Icon className="size-3.5" />
          </Button>

          {/* Timeline collapse */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={timelineCollapsed ? 'Expand timeline' : 'Collapse timeline'}
            title={timelineCollapsed ? 'Expand timeline (Ctrl+Shift+T)' : 'Collapse timeline (Ctrl+Shift+T)'}
            onClick={toggleTimelineCollapse}
          >
            {timelineCollapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
          </Button>

          {/* Add dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[11px]">
                <PlusIcon className="size-3" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={addTrack}>
                <PlusIcon className="size-3.5" />
                Animation track
              </DropdownMenuItem>
              {(['scene', 'camera', 'geometry', 'surface', 'model', 'lighting', 'stage'] as const).map((category) => {
                const categoryNodes = nodeTypes.filter((node) => node.category === category);
                if (!categoryNodes.length) return null;
                return categoryNodes.map((node) => <DropdownMenuItem key={node.id} onSelect={() => addNode(node.id)}>{node.label}</DropdownMenuItem>);
              })}
              <DropdownMenuItem onSelect={() => setMarketplaceOpen(true)}>
                <BoxesIcon className="size-3.5" />
                Browse asset library...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button
            type="button"
            variant={exportState.busy ? 'secondary' : 'outline'}
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            aria-label="Export composition"
            onClick={() => setExportOpen(true)}
          >
            <DownloadIcon className="size-3" />
            Export
            {exportState.busy && (
              <span className="text-[10px] tabular-nums">
                {Math.round((exportState.progress?.fraction ?? 0) * 100)}%
              </span>
            )}
          </Button>

          {/* Inspector toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
            title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
            onClick={() => togglePanel(inspectorPanelRef, setInspectorCollapsed)}
          >
            {inspectorCollapsed ? <RectangleHorizontalIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
        {...verticalLayout}
      >
        {/* Top panel: horizontal group (scene | viewport | inspector) */}
        <ResizablePanel
          id="motion-top-panel"
          defaultSize="66%"
          minSize="200px"
          className="min-h-0"
        >
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0"
            {...horizontalLayout}
          >
            <ResizablePanel
              id="motion-scene-panel"
              panelRef={scenePanelRef}
              defaultSize="20%"
              minSize="180px"
              maxSize="32%"
              collapsible
              collapsedSize="0px"
              onResize={(size) => setScenePanelCollapsed(size.inPixels <= 1)}
              className="min-w-0"
            >
              <MotionScenePanel />
            </ResizablePanel>
            <ResizableHandle withHandle />

            <ResizablePanel
              id="motion-viewport-panel"
              defaultSize="58%"
              minSize="320px"
              className="min-w-0 min-h-0"
            >
              <MotionViewport />
            </ResizablePanel>

            <ResizableHandle withHandle />
            <ResizablePanel
              id="motion-inspector-panel"
              panelRef={inspectorPanelRef}
              defaultSize="22%"
              minSize="210px"
              maxSize="36%"
              collapsible
              collapsedSize="0px"
              onResize={(size) => setInspectorCollapsed(size.inPixels <= 1)}
              className="min-w-0"
            >
              <MotionInspector />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Bottom panel: full-width timeline */}
        <ResizablePanel
          id="motion-timeline-panel"
          panelRef={timelinePanelRef}
          defaultSize="34%"
          minSize="48px"
          maxSize="50%"
          collapsible
          collapsedSize="48px"
          onResize={(size) => setTimelineCollapsed(size.inPixels <= 48)}
          className="min-h-0"
        >
          <MotionTimeline collapsed={timelineCollapsed} onExpand={toggleTimelineCollapse} />
        </ResizablePanel>
      </ResizablePanelGroup>

      {marketplaceOpen && (
        <MotionAssetMarketplaceDialog
          projectId={doc.meta.id}
          onClose={() => setMarketplaceOpen(false)}
        />
      )}

      {exportOpen && (
        <MotionExportDialog
          doc={doc}
          state={exportState}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
