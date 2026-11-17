/**
 * components/motion/MotionViewport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Preview controls and stage chrome for the document-driven 3D scene.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoxIcon,
  CameraIcon,
  ClapperboardIcon,
  Grid2X2Icon,
  Loader2Icon,
  MinusIcon,
  MonitorIcon,
  PlusIcon,
  Rotate3DIcon,
} from 'lucide-react';

import { MotionWorldPopover } from '@/components/motion/MotionWorldPopover';
import { MotionLookMenu } from '@/components/motion/MotionLookMenu';
import { MotionSequencePreview } from '@/components/motion/MotionSequencePreview';
import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import type {
  MotionCameraView,
  MotionStageColor,
} from '@/components/motion/scene/MotionSceneCanvas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { resolveSceneWorld } from '@/lib/motion/environment';
import { createMotionId } from '@/lib/motion/ids';
import { listMotionNodeTypes } from '@/lib/motion/node-registry';
import type { MotionNode } from '@/lib/motion/types';

type StageTone = 'graphite' | 'slate' | 'paper';

const STAGE_COLORS: Record<StageTone, MotionStageColor> = {
  graphite: '#171a22',
  slate: '#39424f',
  paper: '#e1e4e9',
};

export function MotionViewport() {
  const { doc, selection } = useMotionSnapshot();
  const [viewMode, setViewMode] = useState<MotionCameraView>('perspective');
  const [stageTone, setStageTone] = useState<StageTone>('graphite');
  const [gridVisible, setGridVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sequencePreviewOpen, setSequencePreviewOpen] = useState(false);
  const loadingTimer = useRef<number | null>(null);
  const activeScene =
    doc.scenes.find((scene) => scene.id === doc.activeSceneId) ?? doc.scenes[0];
  const world = resolveSceneWorld(activeScene, doc.assets, doc.meta.id);

  const addNode = (type: string) => {
    if (!listMotionNodeTypes().some((item) => item.id === type)) return;
    motionStore.commit('Add scene object', [
      { op: 'scene.node.add', nodeId: createMotionId('scene'), type },
    ]);
  };

  const handleCanvasReady = useCallback(() => {
    // Clear any pending timer to avoid race on doc change
    if (loadingTimer.current) {
      clearTimeout(loadingTimer.current);
      loadingTimer.current = null;
    }
    // Short delay so the user doesn't see a flash
    loadingTimer.current = window.setTimeout(() => setLoading(false), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
    };
  }, []);

  // Reset loading when the document changes (new scene needs init)
  useEffect(() => {
    setLoading(true);
  }, [doc.meta.id]);

  return (
    <section
      aria-label="Motion preview"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MonitorIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Preview</span>
          <Badge
            variant="outline"
            className="h-4 px-1.5 text-[9px] font-normal text-muted-foreground"
          >
            {doc.meta.output.width} × {doc.meta.output.height}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === 'perspective' || value === 'front') {
                setViewMode(value);
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Preview camera view"
            className="h-7"
          >
            <ToggleGroupItem
              value="perspective"
              aria-label="Perspective view"
              title="Perspective view"
            >
              <Rotate3DIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="front"
              aria-label="Front view"
              title="Front view"
            >
              <MonitorIcon />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            type="button"
            variant={gridVisible ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={gridVisible ? 'Hide stage grid' : 'Show stage grid'}
            aria-pressed={gridVisible}
            title={gridVisible ? 'Hide stage grid' : 'Show stage grid'}
            onClick={() => setGridVisible((visible) => !visible)}
          >
            <Grid2X2Icon data-icon />
          </Button>

          <MotionLookMenu doc={doc} />

          {doc.scenes.length > 1 && (
            <Button
              type="button"
              variant={sequencePreviewOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              aria-label="Preview full sequence"
              title="Preview full sequence"
              onClick={() => {
                motionStore.pause();
                setSequencePreviewOpen(true);
              }}
            >
              <ClapperboardIcon data-icon />
              <span className="hidden sm:inline">Sequence</span>
            </Button>
          )}

          <MotionWorldPopover
            doc={doc}
            stageTone={stageTone}
            onStageToneChange={setStageTone}
          />

          <div className="ml-1 flex items-center gap-0.5 border-l border-border/60 pl-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Zoom out"
              onClick={() =>
                setZoom((value) =>
                  Math.max(0.7, Math.round((value - 0.1) * 10) / 10),
                )
              }
            >
              <MinusIcon data-icon />
            </Button>
            <span className="w-9 text-center text-[10px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Zoom in"
              onClick={() =>
                setZoom((value) =>
                  Math.min(1.3, Math.round((value + 0.1) * 10) / 10),
                )
              }
            >
              <PlusIcon data-icon />
            </Button>
          </div>
        </div>
      </div>

      {/* Scene switching lives on the timeline header — it is a timeline
          scope, not a preview mode. */}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* An alpha world is transparent in the canvas; the checkerboard
                sits behind it so the user can see there is no backdrop. */}
            {world?.kind === 'transparent' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(#22262f 0% 25%, #171a21 0% 50%)',
                  backgroundSize: '16px 16px',
                }}
              />
            )}
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading scene …</span>
                </div>
              </div>
            )}
            <MotionSceneCanvas
              doc={doc}
              clock={motionStore.clock}
              viewMode={viewMode}
              stageColor={STAGE_COLORS[stageTone]}
              gridVisible={gridVisible}
              zoom={zoom}
              selectedNodeId={selection?.kind === 'node' ? selection.nodeId : undefined}
              onSelectNode={(nodeId, modifiers) => {
                if (!nodeId) {
                  motionStore.setSelection(null);
                  return;
                }
                const current = motionStore.getSnapshot().selection;
                const selected = new Set(
                  current?.kind === 'node'
                    ? current.selectedNodeIds ?? [current.nodeId]
                    : [],
                );
                if (modifiers?.shiftKey) selected.add(nodeId);
                else if (modifiers?.ctrlKey || modifiers?.metaKey) {
                  if (selected.has(nodeId)) selected.delete(nodeId);
                  else selected.add(nodeId);
                } else {
                  motionStore.setSelection({ kind: 'node', nodeId });
                  return;
                }
                const ids = [...selected];
                if (ids.length === 0) motionStore.setSelection(null);
                else motionStore.setSelection({
                  kind: 'node',
                  nodeId: ids.includes(nodeId) ? nodeId : ids[ids.length - 1],
                  ...(ids.length > 1 ? { selectedNodeIds: ids } : {}),
                });
              }}
              onTransformNode={(nodeId, transform: MotionNode['transform']) => {
                motionStore.commit('Move scene object', [{ op: 'scene.node.update', nodeId, transform }]);
              }}
              onReady={handleCanvasReady}
            />
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-border/70 bg-background/85 px-2 py-1 text-[10px] backdrop-blur">
              <span className="size-1.5 rounded-full bg-chart-3" />
              <span className="text-muted-foreground">3D scene</span>
              <span className="text-border">/</span>
              <span className="text-muted-foreground">Document scene</span>
            </div>
            {sequencePreviewOpen && (
              <MotionSequencePreview doc={doc} onClose={() => setSequencePreviewOpen(false)} />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onSelect={() => {
            setViewMode('perspective');
            setZoom(1);
          }}>
            Reset Camera
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={gridVisible}
            onSelect={() => setGridVisible((v) => !v)}
          >
            Show Grid
          </ContextMenuCheckboxItem>
          {selection?.kind === 'node' && (
            <ContextMenuItem onSelect={() => {
              motionStore.setSelection({ kind: 'node', nodeId: selection.nodeId });
            }}>
              Focus Selected
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>Add Node</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              {listMotionNodeTypes().map((nodeType) => (
                <ContextMenuItem
                  key={nodeType.id}
                  onSelect={() => addNode(nodeType.id)}
                >
                  {nodeType.id.startsWith('camera.') ? (
                    <CameraIcon className="size-3.5" />
                  ) : (
                    <BoxIcon className="size-3.5" />
                  )}
                  {nodeType.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/60 px-2.5 text-[10px] text-muted-foreground">
        <span>Live scene · scrubbing updates the preview</span>
        <span className="tabular-nums">
          {doc.meta.output.fps} fps · {doc.timeline.duration.toFixed(1)}s
        </span>
      </div>
    </section>
  );
}
