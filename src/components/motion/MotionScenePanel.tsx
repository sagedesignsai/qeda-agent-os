/**
 * components/motion/MotionScenePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * VS Code Explorer-style Motion Scene Panel. Single unified view with the
 * scene hierarchy as the main section and Tracks/Assets/Clips as collapsible
 * bottom sections (like VS Code's Outline and Timeline panels).
 */

import { useEffect, useMemo, useState } from 'react';
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
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GripVerticalIcon,
  LayoutPanelTopIcon,
  LightbulbIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  PackageIcon,
  PlusIcon,
  TriangleAlertIcon,
  TypeIcon,
  WandSparklesIcon,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { useMotionAssets } from '@/hooks/use-motion-assets';
import { useMotionSceneSearch } from '@/hooks/use-motion-scene-search';
import { MotionScenePanelHeader } from './MotionScenePanelHeader';
import { createMotionId } from '@/lib/motion/ids';
import { getMotionNodeType } from '@/lib/motion/node-registry';
import { buildMotionSceneCreation } from '@/lib/motion/scene-create';
import {
  buildMotionHierarchy,
  checkMotionReparent,
  type MotionHierarchyRow,
} from '@/lib/motion/hierarchy';
import type { MotionNode, MotionTrack } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

function nodeIcon(node: MotionNode) {
  const category = getMotionNodeType(node.type)?.category;
  if (node.type.startsWith('text.')) return TypeIcon;
  if (category === 'camera') return CameraIcon;
  if (category === 'lighting') return LightbulbIcon;
  if (category === 'product') return PackageIcon;
  if (category === 'ui') return LayoutPanelTopIcon;
  if (category === 'surface') return AppWindowIcon;
  return BoxIcon;
}

function trackIcon(_track: MotionTrack) {
  return BoxIcon;
}

export function MotionScenePanel() {
  const { doc, selection } = useMotionSnapshot();
  const motionAssets = useMotionAssets(doc.meta.id);

  // Search state
  const { searchValue, onSearchChange, filteredNodes, filteredTracks } = useMotionSceneSearch({
    nodes: doc.scene.nodes,
    tracks: doc.timeline.tracks,
  });

  // Expand/collapse state
  const [sceneExpanded, setSceneExpanded] = useState(true);
  const [scenesListExpanded, setScenesListExpanded] = useState(true);
  const [tracksExpanded, setTracksExpanded] = useState(false);
  const [assetsExpanded, setAssetsExpanded] = useState(false);
  const [clipsExpanded, setClipsExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // Selection state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [altPressed, setAltPressed] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setAltPressed(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setAltPressed(false);
    };
    const onWindowBlur = () => setAltPressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const selectedTrackId =
    selection && selection.kind !== 'node' ? selection.trackId : undefined;
  const selectedNodeIds =
    selection?.kind === 'node' ? selection.selectedNodeIds ?? [selection.nodeId] : [];

  const clips = useMemo(
    () => [...doc.timeline.clips].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.timeline.clips],
  );

  const assets = useMemo(
    () => [...doc.assets].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.assets],
  );

  const rows = useMemo(
    () => buildMotionHierarchy(filteredNodes, collapsed),
    [filteredNodes, collapsed],
  );

  const dropChecks = useMemo(() => {
    const checks = new Map<string, { allowed: boolean; reason: string }>();
    if (!draggingNodeId) return checks;
    for (const node of doc.scene.nodes) {
      const targetParentId = altPressed ? node.id : node.parentId;
      const result = checkMotionReparent(doc.scene.nodes, draggingNodeId, targetParentId);
      checks.set(node.id, result.allowed ? { allowed: true, reason: '' } : result);
    }
    return checks;
  }, [altPressed, draggingNodeId, doc.scene.nodes]);

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

  const selectNode = (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey && selectionAnchor) {
      const from = rows.findIndex((row) => row.node.id === selectionAnchor);
      const to = rows.findIndex((row) => row.node.id === nodeId);
      if (from >= 0 && to >= 0) {
        const low = Math.min(from, to);
        const high = Math.max(from, to);
        const selectedNodeIds = rows.slice(low, high + 1).map((row) => row.node.id);
        motionStore.setSelection({ kind: 'node', nodeId, selectedNodeIds });
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      const selected = new Set(selectedNodeIds);
      if (selected.has(nodeId)) selected.delete(nodeId);
      else selected.add(nodeId);
      const ids = [...selected];
      if (ids.length === 0) motionStore.setSelection(null);
      else
        motionStore.setSelection({
          kind: 'node',
          nodeId: selected.has(nodeId) ? nodeId : ids[ids.length - 1],
          ...(ids.length > 1 ? { selectedNodeIds: ids } : {}),
        });
      setSelectionAnchor(nodeId);
      return;
    }
    motionStore.setSelection({ kind: 'node', nodeId });
    setSelectionAnchor(nodeId);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingNodeId(null);
    const nodeId = event.active.data.current?.nodeId;
    if (typeof nodeId !== 'string' || !event.over) return;
    const data = event.over.data.current;
    const targetNodeId = typeof data?.targetNodeId === 'string' ? data.targetNodeId : null;
    const target = targetNodeId
      ? doc.scene.nodes.find((node) => node.id === targetNodeId)
      : undefined;
    if (target?.id === nodeId) return;
    const parentId = altPressed && target ? target.id : target?.parentId ?? null;
    const check = checkMotionReparent(doc.scene.nodes, nodeId, parentId);
    if (!check.allowed) return;

    const source = doc.scene.nodes.find((node) => node.id === nodeId);
    if (!source) return;
    if (!target) {
      const rootCount = doc.scene.nodes.filter(
        (node) => node.parentId === null && node.id !== nodeId,
      ).length;
      motionStore.commit('Move object to scene root', [
        { op: 'scene.node.reparent', nodeId, parentId: null },
        { op: 'scene.node.reorder', nodeId, toIndex: rootCount },
      ]);
      return;
    }

    const after = event.delta.y > 0;
    const remainingSiblings = doc.scene.nodes.filter(
      (node) => node.parentId === parentId && node.id !== nodeId,
    );
    const targetIndex = remainingSiblings.findIndex((node) => node.id === target.id);
    const toIndex = Math.max(0, targetIndex + (after ? 1 : 0));
    const ops = [] as Array<
      | { op: 'scene.node.reparent'; nodeId: string; parentId: string | null }
      | { op: 'scene.node.reorder'; nodeId: string; toIndex: number }
    >;
    if (source.parentId !== parentId) ops.push({ op: 'scene.node.reparent', nodeId, parentId });
    ops.push({
      op: 'scene.node.reorder',
      nodeId,
      toIndex: Math.min(toIndex, remainingSiblings.length),
    });
    motionStore.commit(altPressed ? 'Reparent object' : 'Reorder object', ops);
  };

  const onDragStart = (event: DragStartEvent) => {
    const nodeId = event.active.data.current?.nodeId;
    setDraggingNodeId(typeof nodeId === 'string' ? nodeId : null);
  };

  const deleteNode = (nodeId: string) => {
    motionStore.commit('Delete scene object', [{ op: 'scene.node.remove', nodeId }]);
  };

  const duplicateNode = (nodeId: string) => {
    const subtree = [doc.scene.nodes.find((node) => node.id === nodeId)].filter(
      (node): node is MotionNode => Boolean(node),
    );
    for (let index = 0; index < subtree.length; index += 1) {
      const parentId = subtree[index].id;
      subtree.push(...doc.scene.nodes.filter((node) => node.parentId === parentId));
    }
    const subtreeIds = new Set(subtree.map((node) => node.id));
    const matchingClips = doc.timeline.clips.flatMap((clip) => {
      const channels = clip.channels.filter((channel) => subtreeIds.has(channel.targetId));
      return channels.length ? [{ clip, channels }] : [];
    });
    const clipIds = new Set(matchingClips.map(({ clip }) => clip.id));
    const placements = doc.timeline.tracks.flatMap((track) =>
      track.placements.filter((placement) => clipIds.has(placement.clipId)),
    );
    const channels = matchingClips.flatMap(({ channels: matching }) => matching);
    const keyframes = channels.flatMap((channel) => channel.keyframes);
    const nodeMap = Object.fromEntries(
      subtree.map((node) => [node.id, `node_${createMotionId('doc')}`]),
    );
    motionStore.commit('Duplicate scene object', [
      {
        op: 'scene.node.duplicate',
        nodeId,
        newRootId: nodeMap[nodeId],
        includeAnimation: true,
        idMap: {
          nodes: nodeMap,
          clips: Object.fromEntries(
            matchingClips.map(({ clip }) => [clip.id, createMotionId('clip')]),
          ),
          placements: Object.fromEntries(
            placements.map((placement) => [placement.id, createMotionId('placement')]),
          ),
          channels: Object.fromEntries(
            channels.map((channel) => [channel.id, createMotionId('channel')]),
          ),
          keyframes: Object.fromEntries(
            keyframes.map((key) => [key.id, createMotionId('keyframe')]),
          ),
        },
      },
    ]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — VS Code Explorer style */}
      <div className="flex h-8 shrink-0 items-center px-3 border-b border-border/40">
        <span className="text-[11px] font-semibold text-foreground/90">Explorer</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 text-muted-foreground/70 hover:text-foreground"
            aria-label="Add node"
            title="Add node"
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'a', shiftKey: true });
              window.dispatchEvent(event);
            }}
          >
            <PlusIcon className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 text-muted-foreground/70 hover:text-foreground"
            aria-label="AI suggestions"
            title="AI suggestions"
          >
            <WandSparklesIcon className="size-3" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <MotionScenePanelHeader searchValue={searchValue} onSearchChange={onSearchChange} />

      {/* Main content area — scrollable tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="min-h-0 flex flex-col">
          {/* Scenes — list every scene in the document. The active one is
              highlighted; clicking a row switches (resyncs doc.scene/timeline
              via the ops path). Hidden only when the collapse menu hides it. */}
          <div>
            <div className="flex items-center">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/30"
                onClick={() => setScenesListExpanded((v) => !v)}
              >
                {scenesListExpanded ? (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-foreground/70" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-foreground/70" />
                )}
                <ClapperboardIcon className="size-3.5 shrink-0 text-foreground/70" />
                <span className="text-[11px] font-semibold text-foreground">Scenes</span>
                <span className="rounded px-1 text-[9px] tabular-nums text-muted-foreground">
                  {doc.scenes.length}
                </span>
              </button>
              <button
                type="button"
                className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 outline-none hover:bg-accent/40 hover:text-foreground"
                title="Add scene"
                aria-label="Add scene"
                onClick={() => {
                  const creation = buildMotionSceneCreation(doc, false);
                  motionStore.commit(creation.label, [creation.op]);
                }}
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>

            {scenesListExpanded && (
              <div className="pb-1">
                {doc.scenes.map((scene, index) => {
                  const active = scene.id === doc.activeSceneId;
                  return (
                    <ContextMenu key={scene.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => {
                            if (active) return;
                            motionStore.commit('Switch scene', [
                              { op: 'document.setActiveScene', sceneId: scene.id },
                            ]);
                          }}
                          className={cn(
                            'flex w-full items-center gap-1.5 px-3 py-0.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                            active
                              ? 'bg-accent/50 text-foreground'
                              : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                          )}
                        >
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              active ? 'bg-primary' : 'bg-muted-foreground/40',
                            )}
                          />
                          <ClapperboardIcon
                            className={cn(
                              'size-3 shrink-0',
                              active ? 'text-foreground/80' : 'text-muted-foreground/60',
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-left">
                            {scene.name}
                          </span>
                          <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/80">
                            {index + 1} · {scene.timeline.duration.toFixed(1)}s
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem
                          disabled={active}
                          onSelect={() =>
                            motionStore.commit('Switch scene', [
                              { op: 'document.setActiveScene', sceneId: scene.id },
                            ])
                          }
                        >
                          {active ? 'Active scene' : 'Switch to scene'}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            const creation = buildMotionSceneCreation(doc, true);
                            motionStore.commit(creation.label, [creation.op]);
                          }}
                        >
                          Duplicate
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            const next = window.prompt(
                              'Rename scene',
                              scene.name,
                            );
                            const name = next?.trim();
                            if (!name || name === scene.name) return;
                            motionStore.commit('Rename scene', [
                              { op: 'scene.rename', sceneId: scene.id, name },
                            ]);
                          }}
                        >
                          Rename
                        </ContextMenuItem>
                        {doc.scenes.length > 1 && (
                          <ContextMenuItem
                            variant="destructive"
                            onSelect={() => {
                              const confirmation = window.prompt(
                                `Delete "${scene.name}" (${scene.timeline.duration.toFixed(1)}s)? Type the scene name to confirm.`,
                              );
                              if (confirmation !== scene.name) return;
                              motionStore.commit(
                                'Delete scene',
                                [{ op: 'scene.remove', sceneId: scene.id }],
                                { approved: true },
                              );
                            }}
                          >
                            Delete
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scene Objects — main section (like project folder in VS Code) */}
          <div className="border-t border-border/40">
            <button
              type="button"
              className="flex w-full items-center gap-1 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setSceneExpanded((v) => !v)}
            >
              {sceneExpanded ? (
                <ChevronDownIcon className="size-3.5 shrink-0 text-foreground/70" />
              ) : (
                <ChevronRightIcon className="size-3.5 shrink-0 text-foreground/70" />
              )}
              <span className="text-[11px] font-semibold text-foreground">
                {doc.meta.name}
              </span>
            </button>

            {sceneExpanded && (
              <DndContext
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDraggingNodeId(null)}
              >
                <div data-motion-scene-tree className="min-h-0">
                  {rows.map((row) => (
                    <div key={row.node.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div>
                            <SceneNodeRow
                              row={row}
                              rows={rows}
                              selected={selectedNodeIds.includes(row.node.id)}
                              collapsed={collapsed.has(row.node.id)}
                              animated={animatedNodeIds.has(row.node.id)}
                              missingAsset={missingAssetFor(row.node, motionAssets.missingIds)}
                              dropCheck={dropChecks.get(row.node.id)}
                              onSelectNode={selectNode}
                              onDuplicate={duplicateNode}
                              onToggleCollapsed={toggleCollapsed}
                            />
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-44">
                          <ContextMenuItem
                            onSelect={() => {
                              const node = doc.scene.nodes.find((n) => n.id === row.node.id);
                              if (node)
                                motionStore.setSelection({ kind: 'node', nodeId: node.id });
                            }}
                          >
                            Rename
                            <ContextMenuShortcut>F2</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => duplicateNode(row.node.id)}>
                            Duplicate
                            <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuItem
                            variant="destructive"
                            onSelect={() => deleteNode(row.node.id)}
                          >
                            Delete
                            <ContextMenuShortcut>Del</ContextMenuShortcut>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuCheckboxItem
                            checked={row.node.visible ?? true}
                            onSelect={() =>
                              motionStore.commit('Toggle object visibility', [
                                {
                                  op: 'scene.node.update',
                                  nodeId: row.node.id,
                                  visible: !(row.node.visible ?? true),
                                },
                              ])
                            }
                          >
                            Visible
                          </ContextMenuCheckboxItem>
                          <ContextMenuCheckboxItem
                            checked={row.node.locked ?? false}
                            onSelect={() =>
                              motionStore.commit('Toggle object lock', [
                                {
                                  op: 'scene.node.update',
                                  nodeId: row.node.id,
                                  locked: !(row.node.locked ?? false),
                                },
                              ])
                            }
                          >
                            Locked
                          </ContextMenuCheckboxItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => {
                              motionStore.setSelection({ kind: 'node', nodeId: row.node.id });
                            }}
                          >
                            Focus in Viewport
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </div>
                  ))}
                  {filteredNodes.length === 0 && !searchValue && (
                    <p className="px-4 py-3 text-[11px] text-muted-foreground">
                      Add a scene object to begin.
                    </p>
                  )}
                  {filteredNodes.length === 0 && searchValue && (
                    <p className="px-4 py-3 text-[11px] text-muted-foreground">
                      No objects match "{searchValue}".
                    </p>
                  )}
                  {draggingNodeId && <RootDropZone />}
                </div>
              </DndContext>
            )}
          </div>

          {/* Bottom sections — VS Code Outline/Timeline style */}
          {filteredTracks.length > 0 && (
            <div className="border-t border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/30"
                onClick={() => setTracksExpanded((v) => !v)}
              >
                {tracksExpanded ? (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-foreground/70" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-foreground/70" />
                )}
                <span className="text-[11px] font-semibold text-foreground">Tracks</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {filteredTracks.length}
                </span>
              </button>
              {tracksExpanded && (
                <div className="pb-1">
                  {filteredTracks.map((track) => {
                    const Icon = trackIcon(track);
                    const selected = selectedTrackId === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        className={cn(
                          'group flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          selected
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground/80 hover:bg-accent/40',
                        )}
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
                        <span className="min-w-0 flex-1 truncate text-left">{track.name}</span>
                        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={
                              track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`
                            }
                            title={track.muted ? 'Unmute track' : 'Mute track'}
                            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-5')}
                            onClick={(e) => {
                              e.stopPropagation();
                              motionStore.commit('Toggle track mute', [
                                {
                                  op: 'track.update',
                                  trackId: track.id,
                                  muted: !track.muted,
                                },
                              ]);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                e.preventDefault();
                                motionStore.commit('Toggle track mute', [
                                  {
                                    op: 'track.update',
                                    trackId: track.id,
                                    muted: !track.muted,
                                  },
                                ]);
                              }
                            }}
                          >
                            {track.muted ? (
                              <EyeOffIcon data-icon />
                            ) : (
                              <EyeIcon data-icon />
                            )}
                          </div>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={
                              track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`
                            }
                            title={track.locked ? 'Unlock track' : 'Lock track'}
                            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-5')}
                            onClick={(e) => {
                              e.stopPropagation();
                              motionStore.commit('Toggle track lock', [
                                {
                                  op: 'track.update',
                                  trackId: track.id,
                                  locked: !track.locked,
                                },
                              ]);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                e.preventDefault();
                                motionStore.commit('Toggle track lock', [
                                  {
                                    op: 'track.update',
                                    trackId: track.id,
                                    locked: !track.locked,
                                  },
                                ]);
                              }
                            }}
                          >
                            {track.locked ? (
                              <LockKeyholeIcon data-icon />
                            ) : (
                              <LockKeyholeOpenIcon data-icon />
                            )}
                          </div>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Assets section */}
          {assets.length > 0 && (
            <div className="border-t border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/30"
                onClick={() => setAssetsExpanded((v) => !v)}
              >
                {assetsExpanded ? (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-foreground/70" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-foreground/70" />
                )}
                <span className="text-[11px] font-semibold text-foreground">Assets</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {assets.length}
                </span>
              </button>
              {assetsExpanded && (
                <div className="pb-1">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group flex h-7 w-full items-center gap-2 rounded px-1.5 text-xs hover:bg-accent/50"
                    >
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                        {asset.kind}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Clips section */}
          {clips.length > 0 && (
            <div className="border-t border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/30"
                onClick={() => setClipsExpanded((v) => !v)}
              >
                {clipsExpanded ? (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-foreground/70" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-foreground/70" />
                )}
                <span className="text-[11px] font-semibold text-foreground">Clips</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {clips.length}
                </span>
              </button>
              {clipsExpanded && (
                <div className="pb-1">
                  {clips.map((clip) => (
                    <button
                      type="button"
                      key={clip.id}
                      className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <ClapperboardIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{clip.name}</span>
                      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                        {clip.duration.toFixed(1)}s
                      </span>
                      <AudioLinesIcon className="size-3 shrink-0 text-muted-foreground/70" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function missingAssetFor(node: MotionNode, missingIds: ReadonlySet<string>): boolean {
  // Show warning if the node explicitly marks its asset as missing
  if (node.props.missingAsset === true) return true;
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
  onSelectNode,
  onDuplicate,
  onToggleCollapsed,
}: {
  row: MotionHierarchyRow;
  rows: readonly MotionHierarchyRow[];
  selected: boolean;
  collapsed: boolean;
  animated: boolean;
  missingAsset: boolean;
  dropCheck?: { allowed: boolean; reason: string };
  onSelectNode: (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onDuplicate: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
}) {
  const { node, depth, childIds } = row;
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `motion-drop-${node.id}`,
    data: { targetNodeId: node.id, parentId: node.parentId },
    disabled: !dropCheck?.allowed,
  });
  const { setNodeRef: setDragRef, listeners, attributes, transform, isDragging } = useDraggable({
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

  const commitName = () => {
    const name = draftName.trim();
    setRenaming(false);
    if (!name || name === node.name) {
      setDraftName(node.name);
      return;
    }
    motionStore.commit('Rename scene object', [
      { op: 'scene.node.update', nodeId: node.id, name },
    ]);
  };

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group flex h-7 items-center rounded px-1',
        selected ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/40',
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
        style={
          transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
        }
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
          {collapsed ? <ChevronRightIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {renaming ? (
        <input
          autoFocus
          aria-label={`Rename ${node.name}`}
          className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1 text-xs outline-none"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraftName(node.name);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => onSelectNode(node.id, event)}
          onKeyDown={onTreeKeyDown}
          onDoubleClick={() => {
            setDraftName(node.name);
            setRenaming(true);
          }}
          aria-pressed={selected}
          aria-label={`Select scene object ${node.name}`}
          data-motion-node-id={node.id}
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
            <span title="Missing asset — bind a model in the Inspector">
              <TriangleAlertIcon
                className="size-3 shrink-0 text-amber-500"
                aria-label="Missing asset — bind a model in the Inspector"
              />
            </span>
          )}
          <span className="ml-auto truncate text-[9px] text-muted-foreground">{node.type}</span>
        </button>
      )}
      <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={`Duplicate ${node.name}`}
          onClick={() => onDuplicate(node.id)}
        >
          <CopyIcon data-icon />
        </Button>
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
