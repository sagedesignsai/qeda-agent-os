import { useEffect, useState } from 'react';
import { CheckIcon, MonitorIcon, XIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ClipDeviceFrame } from '@/lib/studio-types';
import { studioMediaAssetUrl } from '@/lib/studio/media';
import type { StudioClipAddonDialogProps } from './StudioAddonRegistry';
import { DeviceMockupInspector } from './device-mockup/DeviceMockupInspector';
import { DeviceMockupPreviewStage } from './device-mockup/DeviceMockupPreviewStage';
import {
  DEFAULT_CLIP_DEVICE_FRAME,
  DEVICE_MOCKUP_PRESETS,
  type MockupPresetCategory,
} from './device-mockup/presets';

function currentFrame(clip: StudioClipAddonDialogProps['clip']): ClipDeviceFrame {
  return clip.payload?.deviceFrame ?? DEFAULT_CLIP_DEVICE_FRAME;
}

export function StudioDeviceMockupAddonDialog({
  open,
  clip,
  videoUrl,
  onOpenChange,
  onApply,
}: StudioClipAddonDialogProps) {
  const [frame, setFrame] = useState<ClipDeviceFrame>(() => currentFrame(clip));
  const [category, setCategory] = useState<MockupPresetCategory>('all');
  const clipDeviceFrame = clip.payload?.deviceFrame;
  const mediaAssetId = clip.payload?.mediaAssetId;
  const hasFrame = Boolean(clipDeviceFrame && clipDeviceFrame.type !== 'none');
  const previewUrl = mediaAssetId
    ? studioMediaAssetUrl(mediaAssetId)
    : videoUrl;

  useEffect(() => {
    if (open) setFrame(clipDeviceFrame ?? DEFAULT_CLIP_DEVICE_FRAME);
  }, [open, clip.id, clipDeviceFrame]);

  const filteredPresets =
    category === 'all'
      ? DEVICE_MOCKUP_PRESETS
      : DEVICE_MOCKUP_PRESETS.filter((preset) => preset.category === category);

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
      <DialogContent className="flex max-h-[88vh] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MonitorIcon className="size-4 text-primary" />
            Add Device Mockup
            <Badge variant="secondary" className="text-[10px] font-medium">
              Realistic Hardware &amp; Windows
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Wrap{' '}
            <span className="font-medium text-foreground">{clip.name}</span> in
            a realistic browser, macOS window, MacBook, iPhone, or glass frame.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_280px] md:overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 p-4 md:min-h-0 md:overflow-y-auto">
            <DeviceMockupPreviewStage
              frame={frame}
              clipName={clip.name}
              previewUrl={previewUrl}
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Mockup Presets
                </span>
                <Tabs
                  value={category}
                  onValueChange={(val) =>
                    setCategory(val as MockupPresetCategory)
                  }
                >
                  <TabsList className="h-7">
                    <TabsTrigger value="all" className="px-2.5 text-[11px]">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="window" className="px-2.5 text-[11px]">
                      Window
                    </TabsTrigger>
                    <TabsTrigger value="device" className="px-2.5 text-[11px]">
                      Devices
                    </TabsTrigger>
                    <TabsTrigger value="minimal" className="px-2.5 text-[11px]">
                      Minimal
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <ScrollArea className="h-[156px] pr-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {filteredPresets.map((preset) => {
                    const isSelected = frame.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.description}
                        aria-label={preset.name}
                        aria-pressed={isSelected}
                        onClick={() => setFrame({ ...preset.frame })}
                        className={`group flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                            : 'border-border/60 bg-card/40 hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] font-medium text-foreground">
                            {preset.name}
                          </span>
                          {isSelected && (
                            <CheckIcon className="size-3.5 shrink-0 text-primary" />
                          )}
                        </div>
                        <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                          {preset.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DeviceMockupInspector frame={frame} onUpdateFrame={setFrame} />
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/20 px-5 py-3">
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply to clip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
