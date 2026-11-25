import { useEffect, useState } from 'react';
import { MonitorIcon, SmartphoneIcon, XIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClipDeviceFrame, DeviceFrameType } from '@/lib/studio-types';
import { studioMediaAssetUrl } from '@/lib/studio/media';
import type { StudioClipAddonDialogProps } from './StudioAddonRegistry';

const DEVICE_FRAME_OPTIONS: Array<{
  value: DeviceFrameType;
  label: string;
}> = [
  { value: 'browser', label: 'Browser window' },
  { value: 'macbook', label: 'Laptop' },
  { value: 'iphone', label: 'Phone' },
  { value: 'minimal-svg', label: 'Minimal outline' },
  { value: 'glass', label: 'Frosted glass' },
  { value: 'none', label: 'No mockup' },
];

const DEFAULT_FRAME: ClipDeviceFrame = {
  type: 'browser',
  color: '#303541',
  padding: 8,
};

function currentFrame(clip: StudioClipAddonDialogProps['clip']): ClipDeviceFrame {
  return clip.payload?.deviceFrame ?? DEFAULT_FRAME;
}

export function StudioDeviceMockupAddonDialog({
  open,
  clip,
  videoUrl,
  onOpenChange,
  onApply,
}: StudioClipAddonDialogProps) {
  const [frame, setFrame] = useState<ClipDeviceFrame>(() => currentFrame(clip));
  const clipDeviceFrame = clip.payload?.deviceFrame;
  const mediaAssetId = clip.payload?.mediaAssetId;
  const hasFrame = Boolean(clipDeviceFrame && clipDeviceFrame.type !== 'none');
  const previewUrl = mediaAssetId
    ? studioMediaAssetUrl(mediaAssetId)
    : videoUrl;

  useEffect(() => {
    if (open) setFrame(clipDeviceFrame ?? DEFAULT_FRAME);
  }, [open, clip.id, clipDeviceFrame]);

  const handleApply = () => {
    const deviceFrame = frame.type === 'none' ? undefined : frame;
    if (
      onApply({
        payload: {
          ...clip.payload,
          deviceFrame,
        },
      })
    ) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorIcon className="size-4 text-primary" />
            Add Device Mockup
          </DialogTitle>
          <DialogDescription>
            Apply a frame to{' '}
            <span className="font-medium text-foreground">{clip.name}</span>.
            The clip remains editable on the timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 p-8">
            <div className="w-full max-w-[440px]">
              <div
                className="relative aspect-video overflow-hidden rounded-md bg-muted"
                style={{
                  outline:
                    frame.type === 'none'
                      ? undefined
                      : `${Math.max(2, frame.padding ?? 8)}px solid ${frame.color ?? DEFAULT_FRAME.color}`,
                  outlineOffset: `${Math.max(2, frame.padding ?? 8)}px`,
                  borderRadius: frame.type === 'iphone' ? '1.2rem' : '0.5rem',
                }}
              >
                {previewUrl ? (
                  <video
                    key={previewUrl}
                    src={previewUrl}
                    muted
                    playsInline
                    loop
                    autoPlay
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/20 via-background to-muted text-muted-foreground">
                    {frame.type === 'iphone' ? (
                      <SmartphoneIcon className="size-8" />
                    ) : (
                      <MonitorIcon className="size-8" />
                    )}
                    <span className="text-xs">{clip.name}</span>
                  </div>
                )}
                {(frame.type === 'browser' || frame.type === 'macbook') && (
                  <div
                    className="absolute inset-x-0 top-0 h-3"
                    style={{
                      backgroundColor: frame.color ?? DEFAULT_FRAME.color,
                    }}
                    aria-hidden="true"
                  />
                )}
                {frame.type === 'iphone' && (
                  <div
                    className="absolute left-1/2 top-1.5 h-2 w-14 -translate-x-1/2 rounded-full"
                    style={{
                      backgroundColor: frame.color ?? DEFAULT_FRAME.color,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          </div>

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="studio-addon-device-frame">
                Mockup
              </FieldLabel>
              <Select
                value={frame.type}
                onValueChange={(value: DeviceFrameType) =>
                  setFrame((current) => ({ ...current, type: value }))
                }
              >
                <SelectTrigger
                  id="studio-addon-device-frame"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DEVICE_FRAME_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {frame.type !== 'none' && (
              <>
                <Field>
                  <FieldLabel htmlFor="studio-addon-frame-color">
                    Frame color
                  </FieldLabel>
                  <Input
                    id="studio-addon-frame-color"
                    type="color"
                    value={frame.color ?? DEFAULT_FRAME.color}
                    onChange={(event) =>
                      setFrame((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    className="h-9 cursor-pointer p-1"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="studio-addon-frame-padding">
                    Padding
                  </FieldLabel>
                  <Input
                    id="studio-addon-frame-padding"
                    type="number"
                    min={2}
                    max={24}
                    value={frame.padding ?? DEFAULT_FRAME.padding}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setFrame((current) => ({
                        ...current,
                        padding: Math.max(2, Math.min(24, value)),
                      }));
                    }}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        </div>

        <DialogFooter>
          {hasFrame && (
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto"
              onClick={() => {
                if (
                  onApply({
                    payload: {
                      ...clip.payload,
                      deviceFrame: undefined,
                    },
                  })
                ) {
                  onOpenChange(false);
                }
              }}
            >
              <XIcon data-icon="inline-start" />
              Remove frame
            </Button>
          )}
          <Button type="button" onClick={handleApply}>
            Apply to clip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
