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
  MoveIcon,
  PlusIcon,
  Rotate3DIcon,
  ScaleIcon,
} from 'lucide-react';

import { MotionWorldPopover } from '@/components/motion/MotionWorldPopover';
import { MotionLookMenu } from '@/components/motion/MotionLookMenu';
import { MotionSequencePreview } from '@/components/motion/MotionSequencePreview';
import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import type {
  MotionCameraView,
  MotionStageColor,
  MotionTransformMode,
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
import { createMotionAutoKeyOps } from '@/lib/motion/auto-key';
import { resolveSceneWorld } from '@/lib/motion/environment';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import { createMotionId } from '@/lib/motion/ids';
import { hasAnimatableProperty, listMotionNodeTypes } from '@/lib/motion/node-registry';
import type { MotionNode } from '@/lib/motion/types';

type StageTone = 'graphite' | 'slate' | 'paper';

const STAGE_COLORS: Record<StageTone, MotionStageColor> = {
  graphite: '#171a22',
  slate: '#39424f',
  paper: '#e1e4e9',
};

export function MotionViewport() {
  const { doc, selection } = useMotionSnapshot();
  const [viewMode, setViewMode] = useState<MotionCameraView>('editorial');
  const [stageTone, setStageTone] = useState<StageTone>('graphite');
  const [gridVisible, setGridVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sequencePreviewOpen, setSequencePreviewOpen] = useState(false);
  const [transformMode, setTransformMode] = useState<MotionTransformMode>('translate');
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

  // Keyboard shortcuts for viewport switching and transform mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is in an input field.
      const target = e.target as HTMLElement | null;
      const targetElement = target && typeof target.closest === 'function' ? target : null;
      const isInput =
        targetElement instanceof HTMLInputElement ||
        targetElement instanceof HTMLTextAreaElement ||
        targetElement?.isContentEditable ||
        targetElement?.tagName === 'SELECT';
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (targetElement?.closest('[role="dialog"], [role="alertdialog"]')) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          setViewMode('cinematic');
          break;
        case '2':
          e.preventDefault();
          setViewMode('editorial');
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          setTransformMode('translate');
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setTransformMode('rotate');
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          setTransformMode('scale');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
              if (value === 'cinematic' || value === 'editorial') {
                setViewMode(value);
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Viewport camera view"
            className="h-7"
          >
            <ToggleGroupItem
              value="cinematic"
              aria-label="Cinematic view"
              title="Cinematic view (1)"
            >
              <Rotate3DIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="editorial"
              aria-label="Editorial view"
              title="Editorial view (2)"
            >
              <MonitorIcon />
            </ToggleGroupItem>
          </ToggleGroup>

          {viewMode === 'editorial' && selection?.kind === 'node' && (
            <ToggleGroup
              type="single"
              value={transformMode}
              onValueChange={(value) => {
                if (value === 'translate' || value === 'rotate' || value === 'scale') {
                  setTransformMode(value);
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Transform gizmo mode"
              className="h-7"
            >
              <ToggleGroupItem
                value="translate"
                aria-label="Translate mode"
                title="Translate (W)"
              >
                <MoveIcon />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="rotate"
                aria-label="Rotate mode"
                title="Rotate (R)"
              >
                <Rotate3DIcon />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="scale"
                aria-label="Scale mode"
                title="Scale (E)"
              >
                <ScaleIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          )}

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
              transformMode={transformMode}
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
                const current = motionStore.getDocument();
                const node = current.scene.nodes.find((candidate) => candidate.id === nodeId);
                if (!node) return;
                if (motionStore.getSnapshot().autoKeyEnabled) {
                  const playhead = motionStore.clock.getTime();
                  // Compare against the evaluated pose, not the rest pose: the
                  // gizmo starts from the animated transform, so keying every
                  // axis would freeze an axis the user never touched.
                  const evaluated = evaluateMotionFrame(
                    { id: current.activeSceneId, nodes: current.scene.nodes, timeline: current.timeline },
                    playhead,
                  ).nodes.find((candidate) => candidate.id === nodeId) ?? node;
                  const axes = ['x', 'y', 'z'] as const;
                  const changes = (['position', 'rotation', 'scale'] as const).flatMap((property) =>
                    axes.flatMap((axis, index) => {
                      const path = `${property}.${axis}`;
                      if (!hasAnimatableProperty(node.type, path)) return [];
                      const next = transform[property][index];
                      if (Math.abs(next - evaluated.transform[property][index]) <= 1e-9) return [];
                      return [{ nodeId, property: path, value: next }];
                    }),
                  );
                  if (changes.length > 0) {
                    const ops = createMotionAutoKeyOps(current, changes, playhead, {
                      track: () => createMotionId('track'),
                      clip: () => createMotionId('clip'),
                      placement: () => createMotionId('placement'),
                      channel: () => createMotionId('channel'),
                      keyframe: () => createMotionId('keyframe'),
                    });
                    if (ops.length) {
                      motionStore.commit('Auto-key object transform', ops);
                      return;
                    }
                  }
                }
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
            {viewMode === 'editorial' && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-md border border-border/70 bg-background/85 px-2 py-1 text-[10px] backdrop-blur">
                <span className="size-1.5 rounded-full bg-chart-3" />
                <span className="text-muted-foreground">Free orbit</span>
              </div>
            )}
            {sequencePreviewOpen && (
              <MotionSequencePreview doc={doc} onClose={() => setSequencePreviewOpen(false)} />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuSub>
            <ContextMenuSubTrigger>Viewport</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              <ContextMenuItem onSelect={() => setViewMode('cinematic')}>
                Cinematic (1)
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setViewMode('editorial')}>
                Editorial (2)
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => {
                setViewMode('cinematic');
                setZoom(1);
              }}>
                Reset View
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {selection?.kind === 'node' && viewMode === 'editorial' && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                Transform
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-32">
                <ContextMenuItem onSelect={() => setTransformMode('translate')}>
                  Translate (W)
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTransformMode('rotate')}>
                  Rotate (R)
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTransformMode('scale')}>
                  Scale (E)
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={gridVisible}
            onSelect={() => setGridVisible((v) => !v)}
          >
            Show Grid
          </ContextMenuCheckboxItem>
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
