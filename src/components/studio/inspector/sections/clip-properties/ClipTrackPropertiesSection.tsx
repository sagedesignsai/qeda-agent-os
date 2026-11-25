import React from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  FilmIcon,
  ImageIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  StudioCompositionTransitionType,
  StudioTextStyle,
  TimelineClip,
  TimelineTrack,
} from '@/lib/studio-types';
import type { StudioMediaAsset } from '@/lib/studio/types';
import {
  resolveStudioTextStyle,
  STUDIO_TEXT_FONT_OPTIONS,
} from '@/lib/studio/render/text-style';
import { timelineStore } from '@/hooks/use-timeline-store';
import {
  InspectorCoordinatePad,
  StudioFieldRow,
  StudioPanelSection,
  StudioScrubField,
} from '../../components';

type SectionToggle = (section: string) => (open: boolean) => void;
type UpdateClip = (clipId: string, patch: Partial<TimelineClip>) => void;

function formatAssetDuration(durationMs: number): string {
  if (durationMs <= 0) return 'Still image';
  const seconds = durationMs / 1000;
  return `${seconds >= 60 ? `${Math.floor(seconds / 60)}m ` : ''}${Math.round(
    seconds % 60,
  )}s`;
}

function StudioMediaSourceField({
  assets,
  selectedAsset,
  selectedAssetId,
  hasCurrentSource,
  onSelect,
}: {
  assets: StudioMediaAsset[];
  selectedAsset?: StudioMediaAsset;
  selectedAssetId?: string;
  hasCurrentSource: boolean;
  onSelect: (assetId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const displayName =
    selectedAsset?.name ??
    (selectedAssetId
      ? 'Missing source'
      : hasCurrentSource
        ? 'Current source'
        : 'Select source');
  const displayKind =
    selectedAsset?.kind === 'image'
      ? 'Image'
      : selectedAsset?.kind === 'video'
        ? 'Video'
        : selectedAssetId
          ? 'Unavailable'
          : hasCurrentSource
            ? 'Recorded source'
            : 'No source';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Video source"
          title={displayName}
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-muted/20 px-1.5 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded bg-background/70 text-blue-400 ring-1 ring-border/50">
            {selectedAsset?.kind === 'image' ? (
              <ImageIcon className="size-3.5" />
            ) : (
              <FilmIcon className="size-3.5" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-medium text-foreground">
              {displayName}
            </span>
            <span className="block truncate text-[9px] text-muted-foreground">
              {displayKind}
              {selectedAsset ? ` · ${formatAssetDuration(selectedAsset.durationMs)}` : ''}
            </span>
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 gap-0 overflow-hidden p-1"
      >
        <div className="max-h-64 overflow-y-auto">
          {!selectedAssetId && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent/60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                <FilmIcon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">
                  {hasCurrentSource ? 'Current source' : 'No source selected'}
                </span>
                <span className="block text-[9px] text-muted-foreground">
                  Recorded source
                </span>
              </span>
              {!selectedAssetId && (
                <CheckIcon className="size-3 shrink-0 text-primary" />
              )}
            </button>
          )}
          {selectedAssetId && !selectedAsset && (
            <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                <FilmIcon className="size-3.5" />
              </span>
              <span className="truncate">Missing source</span>
            </div>
          )}
          {assets.map((asset) => {
            const selected = asset.id === selectedAssetId;
            return (
              <button
                type="button"
                key={asset.id}
                onClick={() => {
                  onSelect(asset.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent/60"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-blue-400">
                  {asset.kind === 'image' ? (
                    <ImageIcon className="size-3.5" />
                  ) : (
                    <FilmIcon className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-medium text-foreground"
                    title={asset.name}
                  >
                    {asset.name}
                  </span>
                  <span className="block truncate text-[9px] text-muted-foreground">
                    {asset.kind === 'image' ? 'Image' : 'Video'} ·{' '}
                    {formatAssetDuration(asset.durationMs)}
                  </span>
                </span>
                {selected && (
                  <CheckIcon className="size-3 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ClipTrackPropertiesSectionProps {
  track: TimelineTrack;
  clip: TimelineClip;
  onUpdateClip: UpdateClip;
  maxDurationMs: number;
  mediaAssets: StudioMediaAsset[];
  activeSection: string | null;
  onSectionToggle: SectionToggle;
}

interface ClipPlaybackSpeedFieldProps {
  clip: TimelineClip;
  track: TimelineTrack;
  onUpdateClip: UpdateClip;
  playbackSpeed: number;
}

function getPlaybackSpeed(clip: TimelineClip): number {
  const rawPlaybackSpeed =
    clip.payload?.speed ??
    (clip.durationMs > 0 && clip.sourceDurationMs > 0
      ? clip.sourceDurationMs / clip.durationMs
      : 1);
  return Number.isFinite(rawPlaybackSpeed) && rawPlaybackSpeed > 0
    ? rawPlaybackSpeed
    : 1;
}

export function ClipPlaybackSpeedField({
  clip,
  track,
  onUpdateClip,
  playbackSpeed,
}: ClipPlaybackSpeedFieldProps) {
  const isSpeedEditable =
    (clip.itemType === 'video' || clip.itemType === 'audio') &&
    !track.id.startsWith('track-') &&
    Boolean(
      clip.payload?.mediaAssetId ||
      clip.payload?.filePath ||
      clip.payload?.mediaUrl,
    );

  if (!isSpeedEditable) return null;

  const options = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const selectedSpeed = options.reduce((nearest, option) =>
    Math.abs(option - playbackSpeed) < Math.abs(nearest - playbackSpeed)
      ? option
      : nearest,
  );
  const sourceDurationMs =
    clip.sourceDurationMs > 0
      ? clip.sourceDurationMs
      : clip.durationMs * playbackSpeed;

  return (
    <StudioFieldRow label="Speed">
      <Select
        value={String(selectedSpeed)}
        onValueChange={(value) => {
          const speed = Number(value);
          onUpdateClip(clip.id, {
            durationMs: Math.max(1, sourceDurationMs / speed),
            sourceDurationMs,
            payload: { speed },
          });
        }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((speed) => (
            <SelectItem key={speed} value={String(speed)}>
              {speed}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioFieldRow>
  );
}

export function ClipTrackPropertiesSection({
  track,
  clip,
  onUpdateClip,
  maxDurationMs,
  mediaAssets,
  activeSection,
  onSectionToggle,
}: ClipTrackPropertiesSectionProps) {
  const effectType = clip.payload?.effectType;
  const isZoomClip = !effectType || effectType === 'zoom';
  const currentScale = clip.payload?.scale ?? 1.5;
  const targetX = clip.payload?.targetX ?? 0.5;
  const targetY = clip.payload?.targetY ?? 0.5;
  const textStyle = resolveStudioTextStyle(clip.payload?.textStyle);
  const updateTextStyle = (patch: Partial<StudioTextStyle>) => {
    onUpdateClip(clip.id, {
      payload: { textStyle: { ...textStyle, ...patch } },
    });
  };
  const transitionFrom = clip.payload?.fromClipId
    ? timelineStore.findClip(clip.payload.fromClipId)
    : null;
  const transitionTo = clip.payload?.toClipId
    ? timelineStore.findClip(clip.payload.toClipId)
    : null;
  const legacyTransitionTarget = clip.payload?.targetClipId
    ? timelineStore.findClip(clip.payload.targetClipId)
    : null;
  const transitionCutMs = clip.startMs + clip.durationMs / 2;
  const transitionMaxDurationMs = Math.max(
    100,
    Math.floor(
      Math.min(
        maxDurationMs,
        2000,
        transitionCutMs * 2,
        transitionFrom?.clip.durationMs ?? Infinity,
        transitionTo?.clip.durationMs ?? Infinity,
        legacyTransitionTarget?.clip.durationMs
          ? legacyTransitionTarget.clip.durationMs * 2
          : Infinity,
      ),
    ),
  );
  const playbackSpeed = getPlaybackSpeed(clip);

  return (
    <>
      {track.type === 'transitions' && (
        <StudioPanelSection
          title="Transition"
          open={activeSection === 'Transition'}
          onOpenChange={onSectionToggle('Transition')}
        >
          {transitionFrom && transitionTo && (
            <p className="mb-2 truncate text-[10px] text-muted-foreground">
              {transitionFrom.clip.name} → {transitionTo.clip.name}
            </p>
          )}
          <StudioFieldRow label="Style">
            <Select
              value={clip.payload?.transitionType ?? 'fade'}
              onValueChange={(value) =>
                onUpdateClip(clip.id, {
                  name: `${value} transition`,
                  payload: {
                    transitionType: value as StudioCompositionTransitionType,
                  },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    'fade',
                    'slide-left',
                    'slide-right',
                    'slide-up',
                    'slide-down',
                    'scale',
                  ] as StudioCompositionTransitionType[]
                ).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll('-', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StudioFieldRow>
          <StudioFieldRow label="Duration">
            <StudioScrubField
              label="Transition Duration"
              value={clip.durationMs}
              min={100}
              max={transitionMaxDurationMs}
              step={50}
              suffix="ms"
              onChange={(requestedDurationMs) => {
                const durationMs = Math.max(
                  100,
                  Math.min(requestedDurationMs, transitionMaxDurationMs),
                );
                let startMs = clip.startMs;
                if (transitionFrom && transitionTo) {
                  startMs = transitionCutMs - durationMs / 2;
                } else if (legacyTransitionTarget) {
                  startMs =
                    clip.payload?.transitionSide === 'out'
                      ? legacyTransitionTarget.clip.startMs +
                        legacyTransitionTarget.clip.durationMs -
                        durationMs
                      : legacyTransitionTarget.clip.startMs;
                }
                onUpdateClip(clip.id, {
                  startMs: Math.max(0, startMs),
                  durationMs,
                });
              }}
            />
          </StudioFieldRow>
        </StudioPanelSection>
      )}

      {track.type === 'effects' && isZoomClip && (
        <StudioPanelSection
          title="Zoom"
          open={activeSection === 'Zoom'}
          onOpenChange={onSectionToggle('Zoom')}
        >
          <StudioFieldRow label="Zoom Scale">
            <StudioScrubField
              label="Zoom Scale"
              value={currentScale}
              min={1.1}
              max={3}
              step={0.1}
              suffix="x"
              onChange={(scale) =>
                onUpdateClip(clip.id, {
                  name: `Zoom ${scale.toFixed(1)}x`,
                  payload: { scale },
                })
              }
            />
          </StudioFieldRow>
          <InspectorCoordinatePad
            targetX={targetX}
            targetY={targetY}
            onChange={(newX, newY) =>
              onUpdateClip(clip.id, {
                payload: { targetX: newX, targetY: newY },
              })
            }
          />
        </StudioPanelSection>
      )}

      {track.type === 'effects' && !isZoomClip && (
        <StudioPanelSection
          title="Effect"
          open={activeSection === 'Effect'}
          onOpenChange={onSectionToggle('Effect')}
        >
          <StudioFieldRow label="Intensity">
            <StudioScrubField
              label="Effect Intensity"
              value={Math.round((clip.payload?.intensity ?? 0.6) * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, {
                  payload: { intensity: percent / 100 },
                })
              }
            />
          </StudioFieldRow>
        </StudioPanelSection>
      )}

      {track.type === 'overlays' && (
        <StudioPanelSection
          title="Overlay"
          open={activeSection === 'Overlay'}
          onOpenChange={onSectionToggle('Overlay')}
        >
          <StudioFieldRow label="Width">
            <StudioScrubField
              label="Overlay Width"
              value={Math.round((clip.payload?.widthPct ?? 0.42) * 100)}
              min={10}
              max={100}
              step={1}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, {
                  payload: { widthPct: percent / 100 },
                })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Opacity">
            <StudioScrubField
              label="Opacity"
              value={Math.round((clip.payload?.opacity ?? 1) * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, {
                  payload: { opacity: percent / 100 },
                })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Rotation">
            <StudioScrubField
              label="Rotation"
              value={clip.payload?.rotation ?? 0}
              min={-180}
              max={180}
              step={5}
              suffix="°"
              onChange={(rotation) =>
                onUpdateClip(clip.id, { payload: { rotation } })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Corner Radius">
            <StudioScrubField
              label="Corner Radius"
              value={clip.payload?.cornerRadius ?? 12}
              min={0}
              max={48}
              step={2}
              suffix="px"
              onChange={(cornerRadius) =>
                onUpdateClip(clip.id, { payload: { cornerRadius } })
              }
            />
          </StudioFieldRow>
          <InspectorCoordinatePad
            targetX={clip.payload?.x ?? 0.5}
            targetY={clip.payload?.y ?? 0.5}
            onChange={(x, y) => onUpdateClip(clip.id, { payload: { x, y } })}
          />
        </StudioPanelSection>
      )}

      {track.type === 'captions' && (
        <StudioPanelSection
          title="Caption"
          open={activeSection === 'Caption'}
          onOpenChange={onSectionToggle('Caption')}
        >
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">
              Subtitle Text
            </span>
            <Textarea
              value={clip.payload?.text ?? clip.name}
              onChange={(event) => {
                const text = event.target.value;
                onUpdateClip(clip.id, {
                  name: text,
                  payload: { text },
                });
              }}
              placeholder="Type subtitle text..."
              className="min-h-16 resize-none bg-background font-sans text-xs"
            />
          </div>
          <StudioFieldRow label="Font">
            <Select
              value={textStyle.fontFamily}
              onValueChange={(fontFamily) => updateTextStyle({ fontFamily })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!STUDIO_TEXT_FONT_OPTIONS.some(
                  ({ value }) => value === textStyle.fontFamily,
                ) && (
                  <SelectItem value={textStyle.fontFamily}>
                    {textStyle.fontFamily}
                  </SelectItem>
                )}
                {STUDIO_TEXT_FONT_OPTIONS.map(({ label, value }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StudioFieldRow>
          <StudioFieldRow label="Size">
            <StudioScrubField
              label="Text size"
              value={textStyle.fontSize}
              min={12}
              max={256}
              step={1}
              suffix="px"
              onChange={(fontSize) => updateTextStyle({ fontSize })}
            />
          </StudioFieldRow>
          <StudioFieldRow label="Color">
            <Input
              aria-label="Text color"
              type="color"
              value={textStyle.color}
              onChange={(event) =>
                updateTextStyle({ color: event.target.value })
              }
              className="h-7 w-12 cursor-pointer bg-background p-1"
            />
          </StudioFieldRow>
          <StudioFieldRow label="Alignment">
            <Select
              value={textStyle.align}
              onValueChange={(align) =>
                updateTextStyle({
                  align: align as NonNullable<StudioTextStyle['align']>,
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </StudioFieldRow>
          <p className="text-[10px] text-muted-foreground">
            Drag the text on the canvas to position it.
          </p>
        </StudioPanelSection>
      )}

      {track.type === 'video' && (
        <StudioPanelSection
          title="Video"
          open={activeSection === 'Video'}
          onOpenChange={onSectionToggle('Video')}
        >
          {(() => {
            const visualAssets = mediaAssets.filter(
              (asset) => asset.kind !== 'audio',
            );
            const selectedAssetId = clip.payload?.mediaAssetId;
            const selectedAsset = selectedAssetId
              ? (visualAssets.find((asset) => asset.id === selectedAssetId) ??
                mediaAssets.find((asset) => asset.id === selectedAssetId))
              : undefined;
            const canSelectSource =
              visualAssets.length > 0 ||
              Boolean(selectedAssetId) ||
              !track.id.startsWith('track-');

            if (!canSelectSource) return null;

            return (
              <StudioFieldRow label="Source">
                <StudioMediaSourceField
                  assets={visualAssets}
                  selectedAsset={selectedAsset}
                  selectedAssetId={selectedAssetId}
                  hasCurrentSource={Boolean(
                    clip.payload?.filePath || clip.payload?.mediaUrl,
                  )}
                  onSelect={(assetId) => {
                    if (!assetId) {
                      onUpdateClip(clip.id, {
                        payload: {
                          mediaAssetId: undefined,
                          filePath: undefined,
                          mediaUrl: undefined,
                          srcPath: undefined,
                        },
                      });
                      return;
                    }
                    const asset = mediaAssets.find(
                      (candidate) => candidate.id === assetId,
                    );
                    if (!asset) return;
                    const nextSpeed =
                      Number.isFinite(playbackSpeed) && playbackSpeed > 0
                        ? playbackSpeed
                        : 1;
                    const sourceDurationMs =
                      asset.kind === 'image'
                        ? Math.max(
                            clip.sourceDurationMs || 0,
                            clip.durationMs,
                            1,
                          )
                        : Math.max(asset.durationMs || 0, 1);
                    const durationMs =
                      asset.kind === 'image'
                        ? clip.durationMs
                        : Math.max(1, sourceDurationMs / nextSpeed);

                    onUpdateClip(clip.id, {
                      name: asset.name,
                      durationMs,
                      sourceDurationMs,
                      payload: {
                        mediaAssetId: asset.id,
                        filePath: undefined,
                        mediaUrl: undefined,
                        srcPath: undefined,
                      },
                    });
                  }}
                />
              </StudioFieldRow>
            );
          })()}
          <StudioFieldRow label="Name" wide>
            <Input
              value={clip.name}
              onChange={(event) =>
                onUpdateClip(clip.id, { name: event.target.value })
              }
              className="h-7 bg-background text-xs"
            />
          </StudioFieldRow>
          <ClipPlaybackSpeedField
            clip={clip}
            track={track}
            onUpdateClip={onUpdateClip}
            playbackSpeed={playbackSpeed}
          />
        </StudioPanelSection>
      )}
    </>
  );
}

export function ClipAudioPropertiesSection({
  track,
  clip,
  onUpdateClip,
  activeSection,
  onSectionToggle,
}: {
  track: TimelineTrack;
  clip: TimelineClip;
  onUpdateClip: UpdateClip;
  activeSection: string | null;
  onSectionToggle: SectionToggle;
}) {
  if (track.type !== 'audio') return null;

  return (
    <StudioPanelSection
      title="Audio"
      open={activeSection === 'Audio'}
      onOpenChange={onSectionToggle('Audio')}
    >
      <ClipPlaybackSpeedField
        clip={clip}
        track={track}
        onUpdateClip={onUpdateClip}
        playbackSpeed={getPlaybackSpeed(clip)}
      />
      <StudioFieldRow label="Volume">
        <StudioScrubField
          label="Volume Gain"
          value={
            clip.payload?.volume !== undefined
              ? Math.round(clip.payload.volume * 100)
              : 100
          }
          min={0}
          max={200}
          step={5}
          suffix="%"
          onChange={(volPercent) =>
            onUpdateClip(clip.id, {
              payload: { volume: volPercent / 100 },
            })
          }
        />
      </StudioFieldRow>
    </StudioPanelSection>
  );
}
