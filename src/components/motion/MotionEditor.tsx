/**
 * components/motion/MotionEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion's editor shell. It owns panel arrangement and chrome; each workspace
 * panel owns only its own view state and delegates document edits to Motion ops.
 */

import { useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  RectangleHorizontalIcon,
} from 'lucide-react';
import {
  useDefaultLayout,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

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
import { createMotionId } from '@/lib/motion/ids';

export function MotionEditor() {
  const { doc } = useMotionSnapshot();
  const [scenePanelCollapsed, setScenePanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const scenePanelRef = useRef<PanelImperativeHandle | null>(null);
  const inspectorPanelRef = useRef<PanelImperativeHandle | null>(null);
  const horizontalLayout = useDefaultLayout({
    id: 'motion-layout-horizontal-v1',
  });
  const verticalLayout = useDefaultLayout({ id: 'motion-layout-vertical-v1' });

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 bg-card/40 px-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={
              scenePanelCollapsed ? 'Show scene panel' : 'Hide scene panel'
            }
            title={
              scenePanelCollapsed ? 'Show scene panel' : 'Hide scene panel'
            }
            onClick={() => togglePanel(scenePanelRef, setScenePanelCollapsed)}
          >
            {scenePanelCollapsed ? (
              <RectangleHorizontalIcon data-icon />
            ) : (
              <ChevronLeftIcon data-icon />
            )}
          </Button>
          <span className="truncate px-1 text-xs font-medium text-foreground/90">
            {doc.meta.name}
          </span>
          <span className="hidden rounded-sm border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground md:inline">
            Scene
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2"
              >
                <PlusIcon data-icon="inline-start" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={addTrack}>
                <PlusIcon data-icon="inline-start" />
                Animation track
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={
              inspectorCollapsed ? 'Show inspector' : 'Hide inspector'
            }
            title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
            onClick={() =>
              togglePanel(inspectorPanelRef, setInspectorCollapsed)
            }
          >
            {inspectorCollapsed ? (
              <RectangleHorizontalIcon data-icon />
            ) : (
              <ChevronRightIcon data-icon />
            )}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
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
          id="motion-workspace-panel"
          defaultSize="58%"
          minSize="320px"
          className="min-w-0"
        >
          <ResizablePanelGroup
            orientation="vertical"
            className="min-h-0"
            {...verticalLayout}
          >
            <ResizablePanel
              id="motion-viewport-panel"
              defaultSize="66%"
              minSize="180px"
              className="min-h-0"
            >
              <MotionViewport />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="motion-timeline-panel"
              defaultSize="34%"
              minSize="190px"
              className="min-h-0"
            >
              <MotionTimeline />
            </ResizablePanel>
          </ResizablePanelGroup>
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
    </div>
  );
}
