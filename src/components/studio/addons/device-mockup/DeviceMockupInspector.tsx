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
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ClipDeviceFrame, DeviceFrameType } from '@/lib/studio-types';
import {
  DEFAULT_CLIP_DEVICE_FRAME,
  DEVICE_FRAME_TYPE_OPTIONS,
} from './presets';

export interface DeviceMockupInspectorProps {
  frame: ClipDeviceFrame;
  onUpdateFrame: (
    updater: (current: ClipDeviceFrame) => ClipDeviceFrame,
  ) => void;
}

export function DeviceMockupInspector({
  frame,
  onUpdateFrame,
}: DeviceMockupInspectorProps) {
  const pad = frame.padding ?? DEFAULT_CLIP_DEVICE_FRAME.padding ?? 8;

  return (
    <ScrollArea className="border-t border-border/60 bg-card/30 md:max-h-[calc(88vh-132px)] md:border-l md:border-t-0">
      <div className="p-4">
        <FieldGroup className="gap-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hardware &amp; Frame
          </div>

          <Field>
            <FieldLabel htmlFor="studio-addon-device-frame">Mockup</FieldLabel>
            <Select
              value={frame.type}
              onValueChange={(value: DeviceFrameType) =>
                onUpdateFrame((current) => ({
                  ...current,
                  type: value,
                  presetId: undefined,
                }))
              }
            >
              <SelectTrigger
                id="studio-addon-device-frame"
                className="h-8 w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DEVICE_FRAME_TYPE_OPTIONS.map((option) => (
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
                <FieldLabel>Finish &amp; Theme</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={frame.theme ?? 'dark'}
                  onValueChange={(value) => {
                    if (!value) return;
                    const theme = value as 'dark' | 'light' | 'silver';
                    onUpdateFrame((current) => ({
                      ...current,
                      theme,
                      color:
                        theme === 'light'
                          ? '#e2e8f0'
                          : theme === 'silver'
                            ? '#94a3b8'
                            : '#1e2430',
                    }));
                  }}
                  className="grid w-full grid-cols-3"
                >
                  <ToggleGroupItem value="dark" className="h-7 text-[11px]">
                    Dark
                  </ToggleGroupItem>
                  <ToggleGroupItem value="silver" className="h-7 text-[11px]">
                    Silver
                  </ToggleGroupItem>
                  <ToggleGroupItem value="light" className="h-7 text-[11px]">
                    Light
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Separator />

              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bezel &amp; Polish
              </div>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="studio-addon-frame-padding">
                    Bezel thickness
                  </FieldLabel>
                  <span className="font-mono text-xs text-muted-foreground">
                    {pad}px
                  </span>
                </div>
                <Slider
                  min={2}
                  max={24}
                  step={1}
                  value={[pad]}
                  onValueChange={([value]) =>
                    onUpdateFrame((current) => ({
                      ...current,
                      padding: value ?? pad,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="studio-addon-frame-color">
                  Bezel color
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="studio-addon-frame-color"
                    type="color"
                    value={
                      frame.color?.startsWith('#')
                        ? frame.color
                        : DEFAULT_CLIP_DEVICE_FRAME.color
                    }
                    onChange={(event) =>
                      onUpdateFrame((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    className="h-8 w-10 shrink-0 cursor-pointer p-0.5"
                  />
                  <Input
                    aria-label="Bezel hex color"
                    value={frame.color ?? DEFAULT_CLIP_DEVICE_FRAME.color ?? '#303541'}
                    onChange={(event) =>
                      onUpdateFrame((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </Field>

              <Field>
                <label className="flex cursor-pointer items-center justify-between text-xs">
                  <FieldLabel className="cursor-pointer">Drop Shadow</FieldLabel>
                  <Switch
                    size="sm"
                    checked={frame.shadow !== false}
                    onCheckedChange={(checked) =>
                      onUpdateFrame((current) => ({
                        ...current,
                        shadow: checked,
                      }))
                    }
                  />
                </label>
              </Field>

              <Field>
                <label className="flex cursor-pointer items-center justify-between text-xs">
                  <FieldLabel className="cursor-pointer">
                    Glass Reflection
                  </FieldLabel>
                  <Switch
                    size="sm"
                    checked={Boolean(frame.glare)}
                    onCheckedChange={(checked) =>
                      onUpdateFrame((current) => ({
                        ...current,
                        glare: checked,
                      }))
                    }
                  />
                </label>
              </Field>

              {frame.type === 'browser' && (
                <>
                  <Separator />
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Window Chrome
                  </div>
                  {frame.presetId === 'macos-window' ? (
                    <Field>
                      <FieldLabel htmlFor="studio-addon-frame-title">
                        Window title
                      </FieldLabel>
                      <Input
                        id="studio-addon-frame-title"
                        value={frame.title ?? ''}
                        placeholder="Showcase Studio"
                        onChange={(event) =>
                          onUpdateFrame((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="studio-addon-frame-url">
                        Address bar URL
                      </FieldLabel>
                      <Input
                        id="studio-addon-frame-url"
                        value={frame.url ?? ''}
                        placeholder="qeda.app"
                        onChange={(event) =>
                          onUpdateFrame((current) => ({
                            ...current,
                            url: event.target.value,
                          }))
                        }
                        className="h-8 font-mono text-xs"
                      />
                    </Field>
                  )}
                </>
              )}
            </>
          )}
        </FieldGroup>
      </div>
    </ScrollArea>
  );
}
