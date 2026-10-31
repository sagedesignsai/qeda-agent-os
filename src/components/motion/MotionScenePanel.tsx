/**
 * components/motion/MotionScenePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene hierarchy and reusable clip library. Rows select Motion entities and
 * drag-to-reparent emits one op; this panel never mutates scene data directly.
 */

import { useMemo, useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AppWindowIcon,
  AudioLinesIcon,
  BoxIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GripVerticalIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  PlusIcon,
  TriangleAlertIcon,
  TypeIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { useMotionAssets } from '@/hooks/use-motion-assets';
import {
  buildMotionHierarchy,
  checkMotionReparent,
  type MotionHierarchyRow,
} from '@/lib/motion/hierarchy';
import type { MotionNode, MotionTrack } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

function nodeIcon(node: MotionNode) {
  if (node.type.startsWith('camera.')) return CameraIcon;
  if (node.type.startsWith('text.')) return TypeIcon;
  if (node.type.startsWith('screen.')) return AppWindowIcon;
  return BoxIcon;
}

function trackIcon(track: MotionTrack) {
  return BoxIcon;
}

export function MotionScenePanel() {
  const { doc, selection } = useMotionSnapshot();
  const motionAssets = useMotionAssets(doc.meta.id);
  const [sceneExpanded, setSceneExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const selectedTrackId = selection && selection.kind !== 'node' ? selection.trackId : undefined;
  const selectedNodeId = selection?.kind === 'node' ? selection.nodeId : undefined;
  const clips = useMemo(
    () => [...doc.timeline.clips].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.timeline.clips],
  );
  const assets = useMemo(
    () => [...doc.assets].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.assets],
  );
  const rows = useMemo(
    () => buildMotionHierarchy(doc.scene.nodes, collapsed),
    [doc.scene.nodes, collapsed],
  );
  const dropChecks = useMemo(() => {
    const checks = new Map<string, { allowed: boolean; reason: string }>();
    if (!draggingNodeId) return checks;
    for (const node of doc.scene.nodes) {
      const result = checkMotionReparent(doc.scene.nodes, draggingNodeId, node.id);
      checks.set(node.id, result.allowed ? { allowed: true, reason: '' } : result);
    }
    return checks;
  }, [draggingNodeId, doc.scene.nodes]);
  const animatedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const clip of doc.timeline.clips) {
      for (const channel of clip.channels) {
        if (channel.keyframes.length > 0) ids.add(channel.targetId);
      }
    }
    return ids;
  }, [doc.timeline.clips]);

  const toggleCollapsed = (nodeId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingNodeId(null);
    const nodeId = event.active.data.current?.nodeId;
    if (typeof nodeId !== 'string' || !event.over) return;
    const parentId = event.over.data.current?.parentId ?? null;
    if (typeof parentId !== 'string' && parentId !== null) return;
    if (!checkMotionReparent(doc.scene.nodes, nodeId, parentId).allowed) return;
    motionStore.commit('Reparent object', [{ op: 'scene.node.reparent', nodeId, parentId }]);
  };

  const onDragStart = (event: DragStartEvent) => {
    const nodeId = event.active.data.current?.nodeId;
    setDraggingNodeId(typeof nodeId === 'string' ? nodeId : null);
  };

  return (
    <Tabs defaultValue="scene" className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-2">
        <TabsList className="h-7 gap-0.5 rounded-md bg-transparent p-0">
          <TabsTrigger value="scene" className="h-7 flex-none px-2 text-xs">
            Scene
          </TabsTrigger>
          <TabsTrigger value="assets" className="h-7 flex-none px-2 text-xs">
            Assets
          </TabsTrigger>
        </TabsList>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {doc.timeline.tracks.length}
        </span>
      </div>

      <TabsContent value="scene" forceMount className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-2">
            <Collapsible open={sceneExpanded} onOpenChange={setSceneExpanded}>
              <CollapsibleTrigger className="flex h-7 w-full items-center gap-1 rounded px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                {sceneExpanded ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                )}
                <FolderIcon className="size-3.5" />
                <span className="flex-1">
                  {doc.scenes.find((scene) => scene.id === doc.activeSceneId)?.name ?? 'Scene'}
                </span>
                <span className="font-normal tabular-nums">{doc.scene.nodes.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDraggingNodeId(null)}>
                  <div data-motion-scene-tree className="ml-2 border-l border-border/60 pl-2">
                    {rows.map((row) => (
                      <SceneNodeRow
                        key={row.node.id}
                        row={row}
                        rows={rows}
                        selected={selectedNodeId === row.node.id}
                        collapsed={collapsed.has(row.node.id)}
                        animated={animatedNodeIds.has(row.node.id)}
                        missingAsset={missingAssetFor(row.node, motionAssets.missingIds)}
                        dropCheck={dropChecks.get(row.node.id)}
                        onToggleCollapsed={toggleCollapsed}
                      />
                    ))}
                    {doc.scene.nodes.length === 0 && (
                      <p className="px-2 py-3 text-[11px] text-muted-foreground">
                        Add a scene object to begin.
                      </p>
                    )}
                    {draggingNodeId && <RootDropZone />}
                    {doc.timeline.tracks.map((track) => {
                      const Icon = trackIcon(track);
                      const selected = selectedTrackId === track.id;
                      return (
                        <div
                          key={track.id}
                          className={cn(
                            'group flex h-7 items-center gap-1 rounded px-1.5 text-xs',
                            selected
                              ? 'bg-accent text-accent-foreground'
                              : 'text-foreground/80 hover:bg-accent/40',
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() =>
                              motionStore.setSelection({
                                kind: 'track',
                                trackId: track.id,
                              })
                            }
                            aria-pressed={selected}
                            aria-label={`Select ${track.name}`}
                            title={`Select ${track.name}`}
                          >
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{track.name}</span>
                          </button>
                          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5"
                              aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
                              title={track.muted ? 'Unmute track' : 'Mute track'}
                              onClick={() =>
                                motionStore.commit('Toggle track mute', [
                                  { op: 'track.update', trackId: track.id, muted: !track.muted },
                                ])
                              }
                            >
                              {track.muted ? <EyeOffIcon data-icon /> : <EyeIcon data-icon />}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5"
                              aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
                              title={track.locked ? 'Unlock track' : 'Lock track'}
                              onClick={() =>
                                motionStore.commit('Toggle track lock', [
                                  { op: 'track.update', trackId: track.id, locked: !track.locked },
                                ])
                              }
                            >
                              {track.locked ? (
                                <LockKeyholeIcon data-icon />
                              ) : (
                                <LockKeyholeOpenIcon data-icon />
                              )}
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                    {doc.timeline.tracks.length === 0 && (
                      <p className="px-2 py-3 text-[11px] text-muted-foreground">
                        Add an animation track to start shaping this scene.
                      </p>
                    )}
                  </div>
                </DndContext>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="assets" forceMount className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-2">
            <div className="mb-2 flex h-7 items-center justify-between px-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Imported media
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {assets.length}
              </span>
            </div>

            {assets.length > 0 ? (
              <div className="space-y-1">
                {assets.map((asset) => {
                  const isAssigned = doc.scene.nodes.some(
                    (node) =>
                      node.type === 'screen.image' &&
                      typeof node.props.source === 'string' &&
                      (node.props.assetId === asset.id || node.props.source === asset.id),
                  );

                  return (
                    <div
                      key={asset.id}
                      className="group flex h-9 w-full items-center gap-2 rounded-md px-2 hover:bg-accent/50"
                    >
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() => {
                          const targetScreen = doc.scene.nodes.find(
                            (node) => node.type === 'screen.image',
                          );
                          if (!targetScreen) return;
                          motionStore.commit('Assign media to screen', [
                            {
                              op: 'scene.node.update',
                              nodeId: targetScreen.id,
                              props: { source: asset.id, assetId: asset.id },
                            },
                          ]);
                        }}
                        title={`Use ${asset.name} on the current screen`}
                      >
                        {asset.name}
                      </button>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {asset.kind === 'image-sequence' ? `${asset.frameCount}f` : asset.kind}
                      </span>
                      {isAssigned && (
                        <span className="text-[10px] text-muted-foreground">On screen</span>
                      )}
                      {motionAssets.missingIds.has(asset.id) && (
                        <>
                          <span className="text-[10px] text-destructive">Missing</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => void motionAssets.relinkAsset(asset.id)}
                          >
                            Relink
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Reveal ${asset.name}`}
                        onClick={() =>
                          void window.electron.ipc.invoke<void>('motion:reveal-asset', {
                            projectId: doc.meta.id,
                            assetId: asset.id,
                          })
                        }
                      >
                        <FolderIcon data-icon />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Remove ${asset.name}`}
                        title="Remove unused asset"
                        onClick={() => motionAssets.removeAsset(asset.id)}
                      >
                        <span aria-hidden="true">×</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <FolderIcon className="size-5 text-muted-foreground/70" />
                <p className="text-[11px] text-muted-foreground">
                  Import images or image sequences to mount them on a screen.
                </p>
              </div>
            )}

            {motionAssets.errors.length > 0 && (
              <ul
                role="alert"
                className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2"
              >
                {motionAssets.errors.map((error, index) => (
                  <li
                    key={`${error.name}-${index}`}
                    className="text-[10px] leading-relaxed text-destructive"
                  >
                    <span className="font-medium">{error.name}:</span> {error.message}
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground underline"
                    onClick={motionAssets.clearErrors}
                  >
                    Dismiss
                  </button>
                </li>
              </ul>
            )}

            <div className="mt-4 flex h-8 items-center justify-between px-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Motion clips
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {clips.length}
              </span>
            </div>
            {clips.length > 0 ? (
              <div className="space-y-1">
                {clips.map((clip) => {
                  const track = doc.timeline.tracks.find((candidate) =>
                    candidate.placements.some((placement) => placement.clipId === clip.id),
                  );
                  return (
                    <button
                      type="button"
                      key={clip.id}
                      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => {
                        const placement = track?.placements.find(
                          (item) => item.clipId === clip.id,
                        );
                        if (track && placement) {
                          motionStore.setSelection({
                            kind: 'placement',
                            trackId: track.id,
                            placementId: placement.id,
                          });
                        }
                      }}
                      title={track ? `Select ${clip.name} on ${track.name}` : clip.name}
                    >
                      <ClapperboardIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs">{clip.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {clip.duration.toFixed(1)}s
                      </span>
                      <AudioLinesIcon className="size-3 shrink-0 text-muted-foreground/70" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                Clips you create will appear here.
              </p>
            )}

            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={motionAssets.isImporting}
                onClick={() => void motionAssets.importAssets()}
              >
                <PlusIcon data-icon="inline-start" />
                {motionAssets.isImporting ? 'Importing…' : 'Import media'}
              </Button>
            </div>
            <div className="mt-2 flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[10px]"
                onClick={() => void motionAssets.cleanUnusedFiles()}
              >
                Clean unused asset files…
              </Button>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function missingAssetFor(node: MotionNode, missingIds: ReadonlySet<string>): boolean {
  const assetId = typeof node.props.assetId === 'string' ? node.props.assetId : null;
  return Boolean(assetId && missingIds.has(assetId));
}

function SceneNodeRow({
  row,
  rows,
  selected,
  collapsed,
  animated,
  missingAsset,
  dropCheck,
  onToggleCollapsed,
}: {
  row: MotionHierarchyRow;
  rows: readonly MotionHierarchyRow[];
  selected: boolean;
  collapsed: boolean;
  animated: boolean;
  missingAsset: boolean;
  dropCheck?: { allowed: boolean; reason: string };
  onToggleCollapsed: (nodeId: string) => void;
}) {
  const { node, depth, childIds } = row;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `motion-drop-${node.id}`,
    data: { parentId: node.id },
    disabled: !dropCheck?.allowed,
  });
  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    transform,
    isDragging,
  } = useDraggable({
    id: `motion-drag-${node.id}`,
    data: { nodeId: node.id },
  });
  const Icon = nodeIcon(node);

  const onTreeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();

    const visibleRows = rows;
    const index = visibleRows.findIndex((candidate) => candidate.node.id === node.id);
    const focusNode = (nodeId: string | undefined) => {
      if (!nodeId) return;
      motionStore.setSelection({ kind: 'node', nodeId });
      const button = Array.from(
        event.currentTarget
          .closest('[data-motion-scene-tree]')
          ?.querySelectorAll<HTMLButtonElement>('[data-motion-node-id]') ?? [],
      ).find((candidate) => candidate.dataset.motionNodeId === nodeId);
      button?.focus();
    };

    if (event.key === 'ArrowUp') {
      focusNode(visibleRows[index - 1]?.node.id);
      return;
    }
    if (event.key === 'ArrowDown') {
      focusNode(visibleRows[index + 1]?.node.id);
      return;
    }
    if (event.key === 'ArrowLeft') {
      if (childIds.length > 0 && !collapsed) onToggleCollapsed(node.id);
      else if (node.parentId) focusNode(node.parentId);
      return;
    }
    if (collapsed && childIds.length > 0) {
      onToggleCollapsed(node.id);
      return;
    }
    focusNode(childIds[0]);
  };

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group flex h-7 items-center rounded px-1',
        selected
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground/80 hover:bg-accent/40',
        isOver && 'ring-1 ring-primary',
        isDragging && 'opacity-50',
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
      title={dropCheck && !dropCheck.allowed ? dropCheck.reason : undefined}
    >
      <button
        ref={setDragRef}
        {...listeners}
        {...attributes}
        type="button"
        aria-label={`Drag ${node.name}`}
        className="flex size-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 opacity-0 outline-none focus-visible:opacity-100 group-hover:opacity-100"
        style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      >
        <GripVerticalIcon className="size-3" />
      </button>
      {childIds.length > 0 ? (
        <button
          type="button"
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          aria-label={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
          onClick={() => onToggleCollapsed(node.id)}
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3" />
          ) : (
            <ChevronDownIcon className="size-3" />
          )}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => motionStore.setSelection({ kind: 'node', nodeId: node.id })}
        aria-pressed={selected}
        aria-label={`Select scene object ${node.name}`}
        data-motion-node-id={node.id}
        onKeyDown={onTreeKeyDown}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
        {animated && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-primary"
            aria-label="Animated"
            title="Animated"
          />
        )}
        {missingAsset && (
          <TriangleAlertIcon
            className="size-3 shrink-0 text-destructive"
            aria-label="Missing media asset"
          />
        )}
        <span className="ml-auto truncate text-[9px] text-muted-foreground">{node.type}</span>
      </button>
      <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
          onClick={() =>
            motionStore.commit('Toggle object visibility', [
              { op: 'scene.node.update', nodeId: node.id, visible: !node.visible },
            ])
          }
        >
          {node.visible ? <EyeIcon data-icon /> : <EyeOffIcon data-icon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`}
          onClick={() =>
            motionStore.commit('Toggle object lock', [
              { op: 'scene.node.update', nodeId: node.id, locked: !node.locked },
            ])
          }
        >
          {node.locked ? <LockKeyholeIcon data-icon /> : <LockKeyholeOpenIcon data-icon />}
        </Button>
      </span>
    </div>
  );
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'motion-drop-root',
    data: { parentId: null },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'my-1 flex h-6 items-center justify-center rounded border border-dashed border-border/70 text-[10px] text-muted-foreground',
        isOver && 'border-primary text-primary',
      )}
    >
      Drop here to move to the scene root
    </div>
  );
}
