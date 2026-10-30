/**
 * components/motion/MotionInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Context-aware properties for the current selection plus document output
 * settings. Every persistent change goes through the Motion op registry.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AudioLinesIcon,
  BoxIcon,
  ClapperboardIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { EASING_PRESETS, easingLabel } from '@/lib/motion/easing';
import { findClip, findTrack } from '@/lib/motion/types';

const RESOLUTIONS = [
  { value: '1920x1080', label: '1920 × 1080', width: 1920, height: 1080 },
  { value: '2560x1440', label: '2560 × 1440', width: 2560, height: 1440 },
  { value: '1080x1920', label: '1080 × 1920', width: 1080, height: 1920 },
  { value: '1280x720', label: '1280 × 720', width: 1280, height: 720 },
];

const FPS_OPTIONS = [24, 30, 60];

export function MotionInspector() {
  const { doc, selection } = useMotionSnapshot();
  const [outputOpen, setOutputOpen] = useState(true);
  const [selectionOpen, setSelectionOpen] = useState(true);

  const selectedData = useMemo(() => {
    if (!selection) return null;
    const track = findTrack(doc, selection.trackId);
    if (!track) return null;
    if (selection.kind === 'track')
      return {
        track,
        placement: null,
        clip: null,
        channel: null,
        keyframe: null,
      };
    const placement =
      track.placements.find((item) => item.id === selection.placementId) ??
      null;
    const clip = placement ? (findClip(doc, placement.clipId) ?? null) : null;
    if (selection.kind === 'placement')
      return { track, placement, clip, channel: null, keyframe: null };
    const channel =
      clip?.channels.find((item) => item.id === selection.channelId) ?? null;
    const keyframe =
      channel?.keyframes.find((item) => item.id === selection.keyframeId) ??
      null;
    return { track, placement, clip, channel, keyframe };
  }, [doc, selection]);

  const [trackName, setTrackName] = useState(selectedData?.track.name ?? '');
  const [keyValue, setKeyValue] = useState(
    String(selectedData?.keyframe?.value ?? ''),
  );

  useEffect(() => {
    setTrackName(selectedData?.track.name ?? '');
    setKeyValue(String(selectedData?.keyframe?.value ?? ''));
  }, [
    selectedData?.track.id,
    selectedData?.track.name,
    selectedData?.keyframe?.id,
    selectedData?.keyframe?.value,
  ]);

  const resolutionValue = `${doc.meta.output.width}x${doc.meta.output.height}`;
  const resolutionOptions = RESOLUTIONS.some(
    (item) => item.value === resolutionValue,
  )
    ? RESOLUTIONS
    : [
        {
          value: resolutionValue,
          label: `${doc.meta.output.width} × ${doc.meta.output.height} (custom)`,
          width: doc.meta.output.width,
          height: doc.meta.output.height,
        },
        ...RESOLUTIONS,
      ];

  const saveTrackName = () => {
    const name = trackName.trim();
    if (
      !selectedData ||
      name.length === 0 ||
      name === selectedData.track.name
    ) {
      setTrackName(selectedData?.track.name ?? '');
      return;
    }
    motionStore.commit('Rename track', [
      { op: 'track.update', trackId: selectedData.track.id, name },
    ]);
  };

  const saveKeyValue = () => {
    if (!selectedData?.keyframe || !selectedData.clip || !selectedData.channel)
      return;
    const value = Number(keyValue);
    if (!Number.isFinite(value)) {
      setKeyValue(String(selectedData.keyframe.value));
      return;
    }
    motionStore.commit('Set keyframe value', [
      {
        op: 'keyframe.setValue',
        clipId: selectedData.clip.id,
        channelId: selectedData.channel.id,
        keyframeId: selectedData.keyframe.id,
        value,
      },
    ]);
  };

  const setEasing = (value: string) => {
    if (!selectedData?.keyframe || !selectedData.clip || !selectedData.channel)
      return;
    const preset = EASING_PRESETS[value as keyof typeof EASING_PRESETS];
    if (!preset) return;
    motionStore.commit('Set keyframe easing', [
      {
        op: 'keyframe.setEasing',
        clipId: selectedData.clip.id,
        channelId: selectedData.channel.id,
        keyframeId: selectedData.keyframe.id,
        easing: preset.value,
      },
    ]);
  };
  const easingPresetId =
    Object.entries(EASING_PRESETS).find(
      ([, preset]) =>
        preset.value.type === selectedData?.keyframe?.easing.type &&
        JSON.stringify(preset.value) ===
          JSON.stringify(selectedData?.keyframe?.easing),
    )?.[0] ??
    (selectedData?.keyframe?.easing.type === 'cubic' ? 'custom' : 'linear');

  return (
    <aside
      aria-label="Motion inspector"
      className="flex h-full min-h-0 flex-col bg-card/35"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <SlidersHorizontalIcon className="size-3.5 text-muted-foreground" />
        <h2 className="text-xs font-medium">Inspector</h2>
        <Badge
          variant={selectedData ? 'secondary' : 'outline'}
          className="ml-auto h-4 px-1.5 text-[9px]"
        >
          {selectedData?.keyframe
            ? 'KEY'
            : selectedData?.clip
              ? 'CLIP'
              : selectedData
                ? 'TRACK'
                : 'OUTPUT'}
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          <Collapsible open={selectionOpen} onOpenChange={setSelectionOpen}>
            <CollapsibleTrigger className="flex h-8 w-full items-center gap-2 border-b border-border/50 px-3 text-left text-[11px] font-medium hover:bg-accent/30">
              {selectedData?.keyframe ? (
                <AudioLinesIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <BoxIcon className="size-3.5 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">
                {selectedData?.keyframe?.id ??
                  selectedData?.clip?.name ??
                  selectedData?.track.name ??
                  'Selection'}
              </span>
              <span className="text-[9px] font-normal text-muted-foreground">
                {selectionOpen ? '−' : '+'}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-b border-border/50 p-3">
              {selectedData ? (
                <FieldGroup className="gap-3">
                  <Field className="gap-1">
                    <FieldLabel
                      htmlFor="motion-track-name"
                      className="text-[10px] text-muted-foreground"
                    >
                      Track name
                    </FieldLabel>
                    <Input
                      id="motion-track-name"
                      value={trackName}
                      onChange={(event) => setTrackName(event.target.value)}
                      onBlur={saveTrackName}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      className="h-7 text-xs"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground">
                        Target
                      </span>
                      <p className="mt-1 truncate text-xs">
                        {selectedData.track.targetId ?? '—'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground">
                        Placements
                      </span>
                      <p className="mt-1 text-xs tabular-nums">
                        {selectedData.track.placements.length}
                      </p>
                    </div>
                  </div>

                  {selectedData.clip && (
                    <div className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <ClapperboardIcon className="size-3 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                          {selectedData.clip.name}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {selectedData.clip.duration.toFixed(2)}s
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedData.keyframe &&
                    selectedData.clip &&
                    selectedData.channel && (
                      <>
                        <Field className="gap-1">
                          <FieldLabel
                            htmlFor="motion-keyframe-value"
                            className="text-[10px] text-muted-foreground"
                          >
                            {selectedData.channel.property} value
                          </FieldLabel>
                          <Input
                            id="motion-keyframe-value"
                            type="number"
                            step="any"
                            value={keyValue}
                            onChange={(event) =>
                              setKeyValue(event.target.value)
                            }
                            onBlur={saveKeyValue}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter')
                                event.currentTarget.blur();
                            }}
                            className="h-7 text-xs tabular-nums"
                          />
                        </Field>
                        <Field className="gap-1">
                          <FieldLabel
                            htmlFor="motion-keyframe-easing"
                            className="text-[10px] text-muted-foreground"
                          >
                            Segment easing
                          </FieldLabel>
                          <Select
                            value={easingPresetId}
                            onValueChange={setEasing}
                          >
                            <SelectTrigger
                              id="motion-keyframe-easing"
                              size="sm"
                              className="h-7 w-full text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {easingPresetId === 'custom' && (
                                  <SelectItem value="custom" disabled>
                                    Custom curve
                                  </SelectItem>
                                )}
                                {Object.entries(EASING_PRESETS).map(
                                  ([id, preset]) => (
                                    <SelectItem key={id} value={id}>
                                      {preset.label}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <p className="text-[10px] text-muted-foreground">
                          At {selectedData.keyframe.time.toFixed(3)}s ·{' '}
                          {easingLabel(selectedData.keyframe.easing)}
                        </p>
                      </>
                    )}
                </FieldGroup>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center">
                  <SparklesIcon className="mx-auto size-4 text-muted-foreground/70" />
                  <p className="mt-2 text-[11px] font-medium">
                    Nothing selected
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Choose a scene object, clip, or keyframe to edit its
                    properties.
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
            <CollapsibleTrigger className="flex h-8 w-full items-center gap-2 border-b border-border/50 px-3 text-left text-[11px] font-medium hover:bg-accent/30">
              <MonitorIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1">Output</span>
              <span className="text-[9px] font-normal text-muted-foreground">
                {outputOpen ? '−' : '+'}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-b border-border/50 p-3">
              <FieldGroup className="gap-3">
                <Field className="gap-1">
                  <FieldLabel
                    htmlFor="motion-output-resolution"
                    className="text-[10px] text-muted-foreground"
                  >
                    Resolution
                  </FieldLabel>
                  <Select
                    value={resolutionValue}
                    onValueChange={(value) => {
                      const resolution = resolutionOptions.find(
                        (item) => item.value === value,
                      );
                      if (!resolution) return;
                      motionStore.commit('Set output resolution', [
                        {
                          op: 'document.setOutput',
                          width: resolution.width,
                          height: resolution.height,
                        },
                      ]);
                    }}
                  >
                    <SelectTrigger
                      id="motion-output-resolution"
                      size="sm"
                      className="h-7 w-full text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {resolutionOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field className="gap-1">
                  <FieldLabel
                    htmlFor="motion-output-fps"
                    className="text-[10px] text-muted-foreground"
                  >
                    Frame rate
                  </FieldLabel>
                  <Select
                    value={String(doc.meta.output.fps)}
                    onValueChange={(value) =>
                      motionStore.commit('Set output frame rate', [
                        { op: 'document.setOutput', fps: Number(value) },
                      ])
                    }
                  >
                    <SelectTrigger
                      id="motion-output-fps"
                      size="sm"
                      className="h-7 w-full text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {!FPS_OPTIONS.includes(doc.meta.output.fps) && (
                          <SelectItem value={String(doc.meta.output.fps)}>
                            {doc.meta.output.fps} fps · current
                          </SelectItem>
                        )}
                        {FPS_OPTIONS.map((fps) => (
                          <SelectItem key={fps} value={String(fps)}>
                            {fps} fps
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Changing output settings keeps existing keyframe timing
                  intact.
                </p>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </aside>
  );
}
