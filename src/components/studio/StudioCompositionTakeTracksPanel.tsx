import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  StudioCaption,
  StudioCut,
  StudioOverlay,
  StudioTakePresentation,
  StudioZoom,
} from '@/lib/studio/types';

function seconds(value: number): number {
  return Number((value / 1000).toFixed(2));
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <Input
        key={`${label}-${value}`}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        disabled={disabled}
        className="h-7 px-2 text-xs"
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next) && next !== value) {
            onCommit(Math.max(min, Math.min(max, next)));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function patchById<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function StudioCompositionTakeTracksPanel({
  presentation,
  durationMs,
  playheadSourceMs,
  disabled,
  onUpdate,
  onAddCut,
  onAddCaption,
  onAddZoom,
}: {
  presentation: StudioTakePresentation;
  durationMs: number;
  playheadSourceMs: number;
  disabled: boolean;
  onUpdate: (patch: Partial<StudioTakePresentation>) => void;
  onAddCut: () => void;
  onAddCaption: () => void;
  onAddZoom: () => void;
}) {
  const updateCut = (id: string, patch: Partial<StudioCut>) =>
    onUpdate({ cuts: patchById(presentation.cuts, id, patch) });
  const updateCaption = (id: string, patch: Partial<StudioCaption>) =>
    onUpdate({ captions: patchById(presentation.captions, id, patch) });
  const updateZoom = (id: string, patch: Partial<StudioZoom>) =>
    onUpdate({ zooms: patchById(presentation.zooms, id, patch) });
  const updateOverlay = (id: string, patch: Partial<StudioOverlay>) =>
    onUpdate({ overlays: patchById(presentation.overlays, id, patch) });

  return (
    <section
      aria-label="Take editing tracks"
      className="flex flex-col gap-3 border-t border-border/50 p-3"
    >
      <div>
        <h3 className="text-xs font-medium">Recording edits</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          These source edits stay attached to this recording layer and appear on
          the shared timeline.
        </p>
      </div>

      <section aria-label="Cuts" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-medium">
            Cuts · {presentation.cuts.length}
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || durationMs < 2}
            onClick={onAddCut}
          >
            Add at playhead
          </Button>
        </div>
        {presentation.cuts.map((cut) => (
          <div
            key={cut.id}
            className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5 rounded-md border border-border/50 p-2"
          >
            <NumberField
              label="From (sec)"
              value={seconds(cut.startMs)}
              min={0}
              max={seconds(cut.endMs - 1)}
              step={0.05}
              disabled={disabled}
              onCommit={(value) => updateCut(cut.id, { startMs: value * 1000 })}
            />
            <NumberField
              label="To (sec)"
              value={seconds(cut.endMs)}
              min={seconds(cut.startMs + 1)}
              max={seconds(durationMs)}
              step={0.05}
              disabled={disabled}
              onCommit={(value) => updateCut(cut.id, { endMs: value * 1000 })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove cut"
              disabled={disabled}
              onClick={() =>
                onUpdate({
                  cuts: presentation.cuts.filter((item) => item.id !== cut.id),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </section>

      <section aria-label="Captions" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-medium">
            Captions · {presentation.captions.length}
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onAddCaption}
          >
            Add at playhead
          </Button>
        </div>
        {presentation.captions.map((caption) => (
          <div
            key={caption.id}
            className="flex flex-col gap-2 rounded-md border border-border/50 p-2"
          >
            <Input
              key={`${caption.id}-${caption.text}`}
              aria-label="Caption text"
              defaultValue={caption.text}
              disabled={disabled}
              maxLength={4000}
              className="h-8 text-xs"
              onBlur={(event) => {
                if (event.currentTarget.value !== caption.text) {
                  updateCaption(caption.id, {
                    text: event.currentTarget.value,
                  });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                label="Start (sec)"
                value={seconds(caption.startMs)}
                min={0}
                max={seconds(caption.endMs - 1)}
                disabled={disabled}
                onCommit={(value) =>
                  updateCaption(caption.id, { startMs: value * 1000 })
                }
              />
              <NumberField
                label="End (sec)"
                value={seconds(caption.endMs)}
                min={seconds(caption.startMs + 1)}
                max={seconds(durationMs)}
                disabled={disabled}
                onCommit={(value) =>
                  updateCaption(caption.id, { endMs: value * 1000 })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              disabled={disabled}
              onClick={() =>
                onUpdate({
                  captions: presentation.captions.filter(
                    (item) => item.id !== caption.id,
                  ),
                })
              }
            >
              Remove caption
            </Button>
          </div>
        ))}
      </section>

      <section aria-label="Camera zooms" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-medium">
            Camera zooms · {presentation.zooms.length}
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onAddZoom}
          >
            Add at playhead
          </Button>
        </div>
        {presentation.zooms.map((zoom) => (
          <div
            key={zoom.id}
            className="flex flex-col gap-2 rounded-md border border-border/50 p-2"
          >
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField
                label="Start (sec)"
                value={seconds(zoom.startMs)}
                min={0}
                max={seconds(zoom.endMs - 1)}
                disabled={disabled}
                onCommit={(value) =>
                  updateZoom(zoom.id, { startMs: value * 1000 })
                }
              />
              <NumberField
                label="End (sec)"
                value={seconds(zoom.endMs)}
                min={seconds(zoom.startMs + 1)}
                max={seconds(durationMs)}
                disabled={disabled}
                onCommit={(value) =>
                  updateZoom(zoom.id, { endMs: value * 1000 })
                }
              />
              <NumberField
                label="Scale"
                value={zoom.scale}
                min={1}
                max={8}
                step={0.1}
                disabled={disabled}
                onCommit={(value) => updateZoom(zoom.id, { scale: value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                label="Target X"
                value={zoom.targetX}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) => updateZoom(zoom.id, { targetX: value })}
              />
              <NumberField
                label="Target Y"
                value={zoom.targetY}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) => updateZoom(zoom.id, { targetY: value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              disabled={disabled}
              onClick={() =>
                onUpdate({
                  zooms: presentation.zooms.filter(
                    (item) => item.id !== zoom.id,
                  ),
                })
              }
            >
              Remove zoom
            </Button>
          </div>
        ))}
      </section>

      <section aria-label="Media overlays" className="flex flex-col gap-2">
        <h4 className="text-[11px] font-medium">
          Media overlays · {presentation.overlays.length}
        </h4>
        {presentation.overlays.map((overlay) => (
          <div
            key={overlay.id}
            className="flex flex-col gap-2 rounded-md border border-border/50 p-2"
          >
            <p className="truncate text-[10px] text-muted-foreground">
              {overlay.kind === 'image' ? 'Image' : 'Video'} overlay
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField
                label="X"
                value={overlay.x}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) => updateOverlay(overlay.id, { x: value })}
              />
              <NumberField
                label="Y"
                value={overlay.y}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) => updateOverlay(overlay.id, { y: value })}
              />
              <NumberField
                label="Width"
                value={overlay.widthPct}
                min={0.04}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) =>
                  updateOverlay(overlay.id, { widthPct: value })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField
                label="Opacity"
                value={overlay.opacity}
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                onCommit={(value) =>
                  updateOverlay(overlay.id, { opacity: value })
                }
              />
              <NumberField
                label="Rotation"
                value={overlay.rotation}
                min={-360}
                max={360}
                disabled={disabled}
                onCommit={(value) =>
                  updateOverlay(overlay.id, { rotation: value })
                }
              />
              <NumberField
                label="Corners"
                value={overlay.cornerRadius}
                min={0}
                max={128}
                disabled={disabled}
                onCommit={(value) =>
                  updateOverlay(overlay.id, { cornerRadius: value })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              disabled={disabled}
              onClick={() =>
                onUpdate({
                  overlays: presentation.overlays.filter(
                    (item) => item.id !== overlay.id,
                  ),
                })
              }
            >
              Remove overlay
            </Button>
          </div>
        ))}
      </section>
      <span className="sr-only" aria-live="polite">
        Playhead source time {seconds(playheadSourceMs).toFixed(2)} seconds
      </span>
    </section>
  );
}
