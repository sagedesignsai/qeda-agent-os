/**
 * components/motion/MotionScenePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene hierarchy and reusable clip library. Rows select Motion entities; this
 * panel never owns or mutates scene data.
 */

import { useMemo, useRef, useState } from 'react';
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
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  PlusIcon,
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
import { createMotionId } from '@/lib/motion/ids';
import type { MotionTrack } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

const NODE_ICONS: Record<string, typeof BoxIcon> = {
  camera: CameraIcon,
  product: AppWindowIcon,
  title: TypeIcon,
};

function trackIcon(track: MotionTrack) {
  return NODE_ICONS[track.targetId ?? ''] ?? BoxIcon;
}

export function MotionScenePanel() {
  const { doc, selection } = useMotionSnapshot();
  const [sceneExpanded, setSceneExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTrackId = selection?.trackId;
  const clips = useMemo(
    () => [...doc.timeline.clips].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.timeline.clips],
  );
  const assets = useMemo(
    () => [...doc.assets].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.assets],
  );

  const handleImportMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const targetScreen = doc.scene.nodes.find((node) => node.type === 'screen.image');
    const ops = files.flatMap((file) => {
      const id = createMotionId('asset');
      const mimeType = file.type || 'image/png';
      const source =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : `data:${mimeType};base64,`;

      const asset = {
        id,
        name: file.name,
        kind: file.type.startsWith('image/') ? 'image' : 'image-sequence',
        mimeType,
        frameCount: 1,
        fps: 30,
        uri: source,
      };

      const opsForFile = [{ op: 'asset.add', ...asset } as const];
      if (!targetScreen) return opsForFile;
      return [
        ...opsForFile,
        {
          op: 'scene.node.update',
          nodeId: targetScreen.id,
          props: { source },
        } as const,
      ];
    });

    motionStore.commit('Import media', ops);
    event.target.value = '';
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
                <span className="flex-1">Launch scene</span>
                <span className="font-normal tabular-nums">
                  {doc.timeline.tracks.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <div className="ml-2 border-l border-border/60 pl-2">
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
                            aria-label={
                              track.muted
                                ? `Unmute ${track.name}`
                                : `Mute ${track.name}`
                            }
                            title={track.muted ? 'Unmute track' : 'Mute track'}
                            onClick={() =>
                              motionStore.commit('Toggle track mute', [
                                {
                                  op: 'track.update',
                                  trackId: track.id,
                                  muted: !track.muted,
                                },
                              ])
                            }
                          >
                            {track.muted ? (
                              <EyeOffIcon data-icon />
                            ) : (
                              <EyeIcon data-icon />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-5"
                            aria-label={
                              track.locked
                                ? `Unlock ${track.name}`
                                : `Lock ${track.name}`
                            }
                            title={track.locked ? 'Unlock track' : 'Lock track'}
                            onClick={() =>
                              motionStore.commit('Toggle track lock', [
                                {
                                  op: 'track.update',
                                  trackId: track.id,
                                  locked: !track.locked,
                                },
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
                  const isAssigned =
                    doc.scene.nodes.some(
                      (node) =>
                        node.type === 'screen.image' &&
                        typeof node.props.source === 'string' &&
                        (node.props.source === asset.id || node.props.source === asset.uri),
                    );

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => {
                        const targetScreen = doc.scene.nodes.find((node) => node.type === 'screen.image');
                        if (!targetScreen) return;
                        motionStore.commit('Assign media to screen', [
                          {
                            op: 'scene.node.update',
                            nodeId: targetScreen.id,
                            props: { source: asset.uri ?? asset.id },
                          },
                        ]);
                      }}
                      title={`Use ${asset.name} on the current screen`}
                    >
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {asset.kind === 'image-sequence' ? `${asset.frameCount}f` : 'img'}
                      </span>
                      {isAssigned && <span className="text-[10px] text-muted-foreground">On screen</span>}
                    </button>
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
                        const placement = track?.placements.find((item) => item.clipId === clip.id);
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Import motion media"
                onChange={handleImportMedia}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => fileInputRef.current?.click()}
              >
                <PlusIcon data-icon="inline-start" />
                Import media
              </Button>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
