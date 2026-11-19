import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type {
  StudioAspectRatio,
  StudioCompositionLayer,
  StudioCompositionTransitionType,
  StudioLayerLayout,
} from '@/lib/studio/types';
import type { StudioCompositionLayerPatch } from '@/lib/studio/composition';

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span className="block">{label}</span>
      <span className="flex items-center rounded-md border border-border/60 bg-background px-2 focus-within:ring-2 focus-within:ring-ring">
        <input
          key={`${label}-${value}`}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onBlur={(event) => {
            const nextValue = Number(event.currentTarget.value);
            if (!Number.isFinite(nextValue)) return;
            if (Math.abs(nextValue - value) < 0.0001) return;
            onCommit(Math.max(min, Math.min(max, nextValue)));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none disabled:opacity-60"
        />
        {suffix && <span className="pl-1 text-[10px]">{suffix}</span>}
      </span>
    </label>
  );
}

const TRANSITION_OPTIONS: Array<{
  value: StudioCompositionTransitionType;
  enterLabel: string;
  exitLabel: string;
}> = [
  { value: 'none', enterLabel: 'None', exitLabel: 'None' },
  { value: 'fade', enterLabel: 'Fade in', exitLabel: 'Fade out' },
  {
    value: 'slide-left',
    enterLabel: 'Slide from left',
    exitLabel: 'Slide left',
  },
  {
    value: 'slide-right',
    enterLabel: 'Slide from right',
    exitLabel: 'Slide right',
  },
  {
    value: 'slide-up',
    enterLabel: 'Slide from top',
    exitLabel: 'Slide up',
  },
  {
    value: 'slide-down',
    enterLabel: 'Slide from bottom',
    exitLabel: 'Slide down',
  },
  { value: 'scale', enterLabel: 'Scale up', exitLabel: 'Scale down' },
];

export function StudioCompositionInspector({
  layer,
  aspectRatio,
  durationMs,
  disabled,
  onCommit,
}: {
  layer: StudioCompositionLayer | null;
  aspectRatio: StudioAspectRatio;
  durationMs: number;
  disabled: boolean;
  onCommit: (patch: StudioCompositionLayerPatch) => Promise<boolean>;
}) {
  if (!layer) {
    return (
      <div className="flex min-h-32 items-center justify-center border-t border-border/50 p-4 text-center text-xs text-muted-foreground">
        Select a layer to edit its position, timing, and appearance.
      </div>
    );
  }

  const layout = layer.layouts[aspectRatio];
  const commitLayout = (patch: Partial<StudioLayerLayout>) => {
    void onCommit({ layout: patch });
  };
  const commitTime = (field: 'startMs' | 'endMs', seconds: number) => {
    void onCommit({ [field]: seconds * 1000 });
  };
  const transitionDurationMaxMs = Math.min(
    5000,
    layer.endMs - layer.startMs,
  );
  const commitTransitionType = (
    field: 'transitionIn' | 'transitionOut',
    type: StudioCompositionTransitionType,
  ) => {
    const transition = layer[field];
    const durationMs =
      type !== 'none' && transition.durationMs === 0
        ? Math.min(400, transitionDurationMaxMs)
        : Math.min(transition.durationMs, transitionDurationMaxMs);
    void onCommit({ [field]: { type, durationMs } });
  };

  return (
    <div className="space-y-4 border-t border-border/50 p-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{layer.name}</p>
        <p className="text-[10px] capitalize text-muted-foreground">
          {layer.kind} · {aspectRatio} layout
        </p>
      </div>

      {layer.kind === 'text' && (
        <section aria-label="Text content" className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Text
            <Textarea
              key={`${layer.id}-${layer.text}`}
              defaultValue={layer.text}
              maxLength={4000}
              disabled={disabled}
              className="min-h-20 resize-y text-xs"
              onBlur={(event) => {
                if (event.currentTarget.value !== layer.text) {
                  void onCommit({ text: event.currentTarget.value });
                }
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Font size"
              value={layer.fontSize}
              min={8}
              max={240}
              step={1}
              suffix="px"
              disabled={disabled}
              onCommit={(value) => void onCommit({ fontSize: value })}
            />
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Alignment
              <select
                value={layer.textAlign}
                disabled={disabled}
                onChange={(event) =>
                  void onCommit({
                    textAlign: event.currentTarget.value as typeof layer.textAlign,
                  })
                }
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Weight
              <select
                value={layer.fontWeight}
                disabled={disabled}
                onChange={(event) =>
                  void onCommit({
                    fontWeight: event.currentTarget.value as typeof layer.fontWeight,
                  })
                }
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Text color
              <Input
                type="color"
                value={layer.color}
                disabled={disabled}
                onChange={(event) => void onCommit({ color: event.currentTarget.value })}
                className="h-8 w-full p-1"
              />
            </label>
          </div>
        </section>
      )}

      <section aria-label="Layer layout">
        <h3 className="mb-2 text-[11px] font-medium text-muted-foreground">
          Position and size
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X"
            value={Number((layout.x * 100).toFixed(1))}
            min={0}
            max={Number(((1 - layout.width) * 100).toFixed(1))}
            step={0.5}
            suffix="%"
            disabled={disabled}
            onCommit={(value) => commitLayout({ x: value / 100 })}
          />
          <NumberField
            label="Y"
            value={Number((layout.y * 100).toFixed(1))}
            min={0}
            max={Number(((1 - layout.height) * 100).toFixed(1))}
            step={0.5}
            suffix="%"
            disabled={disabled}
            onCommit={(value) => commitLayout({ y: value / 100 })}
          />
          <NumberField
            label="Width"
            value={Number((layout.width * 100).toFixed(1))}
            min={4}
            max={Number(((1 - layout.x) * 100).toFixed(1))}
            step={0.5}
            suffix="%"
            disabled={disabled}
            onCommit={(value) => commitLayout({ width: value / 100 })}
          />
          <NumberField
            label="Height"
            value={Number((layout.height * 100).toFixed(1))}
            min={4}
            max={Number(((1 - layout.y) * 100).toFixed(1))}
            step={0.5}
            suffix="%"
            disabled={disabled}
            onCommit={(value) => commitLayout({ height: value / 100 })}
          />
        </div>
      </section>

      <section aria-label="Layer appearance">
        <h3 className="mb-2 text-[11px] font-medium text-muted-foreground">
          Appearance
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Opacity"
            value={Number((layer.opacity * 100).toFixed(0))}
            min={0}
            max={100}
            step={1}
            suffix="%"
            disabled={disabled}
            onCommit={(value) => void onCommit({ opacity: value / 100 })}
          />
          <NumberField
            label="Corner radius"
            value={Number(layout.cornerRadius.toFixed(0))}
            min={0}
            max={128}
            step={1}
            suffix="px"
            disabled={disabled}
            onCommit={(value) => commitLayout({ cornerRadius: value })}
          />
        </div>
        <label className="mt-2 block space-y-1 text-[11px] text-muted-foreground">
          <span className="block">Fit</span>
          <select
            value={layout.fit}
            disabled={disabled}
            onChange={(event) => {
              const fit =
                event.currentTarget.value === 'contain' ? 'contain' : 'cover';
              commitLayout({ fit });
            }}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="cover">Fill frame</option>
            <option value="contain">Fit inside</option>
          </select>
        </label>
      </section>

      <section aria-label="Layer timing">
        <h3 className="mb-2 text-[11px] font-medium text-muted-foreground">
          Timing
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Start"
            value={Number((layer.startMs / 1000).toFixed(2))}
            min={0}
            max={Number((Math.max(0, layer.endMs - 1) / 1000).toFixed(2))}
            step={0.1}
            suffix="sec"
            disabled={disabled}
            onCommit={(value) => commitTime('startMs', value)}
          />
          <NumberField
            label="End"
            value={Number((layer.endMs / 1000).toFixed(2))}
            min={Number(
              (Math.min(durationMs, layer.startMs + 1) / 1000).toFixed(2),
            )}
            max={Number((durationMs / 1000).toFixed(2))}
            step={0.1}
            suffix="sec"
            disabled={disabled}
            onCommit={(value) => commitTime('endMs', value)}
          />
          {layer.kind === 'video' && (
            <NumberField
              label="Source in"
              value={Number((layer.sourceInMs / 1000).toFixed(2))}
              min={0}
              max={Number(((layer.sourceDurationMs - 1) / 1000).toFixed(2))}
              step={0.1}
              suffix="sec"
              disabled={disabled}
              onCommit={(value) =>
                void onCommit({ sourceInMs: value * 1000 })
              }
            />
          )}
        </div>
      </section>

      <section aria-label="Layer motion">
        <h3 className="mb-2 text-[11px] font-medium text-muted-foreground">
          Motion
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['transitionIn', 'Enter', 'enterLabel'],
              ['transitionOut', 'Exit', 'exitLabel'],
            ] as const
          ).map(([field, label, labelKey]) => {
            const transition = layer[field];
            return (
              <div
                key={field}
                className="space-y-1 text-[11px] text-muted-foreground"
              >
                <span className="block">{label}</span>
                <select
                  aria-label={`${label} transition`}
                  value={transition.type}
                  disabled={disabled}
                  onChange={(event) => {
                    const selected = TRANSITION_OPTIONS.find(
                      (option) => option.value === event.currentTarget.value,
                    );
                    if (selected) {
                      commitTransitionType(field, selected.value);
                    }
                  }}
                  className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TRANSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option[labelKey]}
                    </option>
                  ))}
                </select>
                <NumberField
                  label={`${label} duration`}
                  value={Number(
                    (
                      Math.min(
                        transition.durationMs,
                        transitionDurationMaxMs,
                      ) / 1000
                    ).toFixed(2),
                  )}
                  min={0}
                  max={Number((transitionDurationMaxMs / 1000).toFixed(2))}
                  step={0.05}
                  suffix="sec"
                  disabled={disabled || transition.type === 'none'}
                  onCommit={(value) =>
                    void onCommit({
                      [field]: {
                        ...transition,
                        durationMs: value * 1000,
                      },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
