/**
 * components/trace/TraceInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Descriptor-driven property inspector.
 *
 * Fields read the value resolved at the playhead (so an animated property shows
 * the frame you are looking at) and write through `updateAttributes`, which
 * auto-keyframes when a track already exists. The stopwatch on each row creates
 * or removes that track — the same interaction model as a desktop motion editor.
 */

import { ClockIcon, DiamondIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getAnimatableProperties,
  getPropertyDescriptor,
  type PropertyDescriptor,
} from '@/lib/trace/elements/registry';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import { getElementPosition, positionPatch } from '@/lib/trace/resolve';
import type {
  AnimatableProperty,
  Keyframe,
  TraceElement,
} from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';

const EASINGS = [
  'linear',
  'power1.out',
  'power2.out',
  'power2.in',
  'power2.inOut',
  'power3.out',
  'expo.out',
  'sine.out',
  'sine.inOut',
  'circ.out',
  'back.out',
  'back.inOut',
  'elastic.out',
  'bounce.out',
];

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-b border-white/8 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {title}
        </p>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  children,
  hasTrack,
  onToggleTrack,
}: {
  label: string;
  children: React.ReactNode;
  hasTrack?: boolean;
  onToggleTrack?: () => void;
}) {
  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-2">
      <label className="flex min-w-0 items-center gap-1 text-[11px] text-slate-400">
        <button
          type="button"
          onClick={onToggleTrack}
          disabled={!onToggleTrack}
          title={hasTrack ? 'Remove animation track' : 'Animate this property'}
          className={
            'flex size-4 shrink-0 items-center justify-center rounded ' +
            (hasTrack
              ? 'text-sky-300'
              : 'text-slate-700 opacity-0 hover:text-slate-300 group-hover:opacity-100 disabled:hidden')
          }
          aria-label={hasTrack ? `Remove ${label} track` : `Animate ${label}`}
        >
          <ClockIcon className="size-3" />
        </button>
        <span className="truncate">{label}</span>
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  step = 1,
  onChange,
}: {
  value: number | string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={Number.isFinite(Number(value)) ? Number(value) : 0}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      className="h-7 w-full border-white/10 bg-white/[0.04] text-right font-mono text-[11px] text-slate-200 focus-visible:ring-sky-400/40"
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const isPlainColor = /^#[0-9a-f]{3,8}$/i.test(value);
  return (
    <div className="flex items-center gap-1">
      <input
        type="color"
        value={isPlainColor ? value : '#38bdf8'}
        onChange={(event) => onChange(event.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
        aria-label="Pick color"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 border-white/10 bg-white/[0.04] font-mono text-[10px] text-slate-200 focus-visible:ring-sky-400/40"
      />
    </div>
  );
}

function propertyValue(
  element: TraceElement,
  property: AnimatableProperty,
  timeMs: number,
): string | number {
  if (property === 'x' || property === 'y') {
    const position = getElementPosition(element, timeMs);
    return Math.round(property === 'x' ? position.x : position.y);
  }
  const descriptor = getPropertyDescriptor(element.type, property);
  if (element.tracks.some((track) => track.property === property)) {
    return resolveElementAtTime(element, timeMs).attributes[
      descriptor?.attribute ?? property
    ];
  }
  const raw = element.attributes?.[descriptor?.attribute ?? property];
  if (raw !== undefined && raw !== null) return raw;
  return descriptor?.kind === 'color' ? '#ffffff' : '';
}

function PropertyField({
  element,
  descriptor,
}: {
  element: TraceElement;
  descriptor: PropertyDescriptor;
}) {
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const togglePropertyTrack = useTraceStore(
    (state) => state.togglePropertyTrack,
  );
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const hasTrack = element.tracks.some(
    (track) => track.property === descriptor.property,
  );
  const value = propertyValue(element, descriptor.property, timeMs);

  const set = (next: number | string) => {
    if (descriptor.property === 'x' || descriptor.property === 'y') {
      const position = getElementPosition(element, timeMs);
      const target =
        descriptor.property === 'x'
          ? { x: Number(next), y: position.y }
          : { x: position.x, y: Number(next) };
      updateAttributes(element.id, positionPatch(element, target, timeMs));
      return;
    }
    updateAttributes(element.id, { [descriptor.property]: next });
  };

  let control: React.ReactNode;
  if (descriptor.kind === 'color') {
    control = <ColorInput value={String(value ?? '#ffffff')} onChange={set} />;
  } else if (descriptor.kind === 'text') {
    control = (
      <textarea
        value={String(value ?? '')}
        onChange={(event) => set(event.target.value)}
        rows={2}
        className="w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-sky-400/40"
      />
    );
  } else if (descriptor.kind === 'percent' && descriptor.max === 1) {
    control = (
      <NumberInput
        value={Math.round(Number(value ?? 0) * 100)}
        step={1}
        onChange={(next) => set(Math.max(0, Math.min(1, next / 100)))}
      />
    );
  } else {
    control = (
      <NumberInput
        value={value as number}
        step={descriptor.step ?? 1}
        onChange={(next) => {
          const min = descriptor.min ?? -Infinity;
          const max = descriptor.max ?? Infinity;
          set(Math.min(max, Math.max(min, next)));
        }}
      />
    );
  }

  return (
    <FieldRow
      label={descriptor.label}
      hasTrack={hasTrack}
      onToggleTrack={() => togglePropertyTrack(element.id, descriptor.property)}
    >
      {control}
    </FieldRow>
  );
}

function nearestKeyframe(
  element: TraceElement,
  property: AnimatableProperty,
): {
  trackId: string;
  keyframe: Keyframe;
} | null {
  const timeMs = useTraceStore.getState().playback.currentTimeMs;
  const track = element.tracks.find((entry) => entry.property === property);
  if (!track || track.keyframes.length === 0) return null;
  const nearest = track.keyframes.reduce((best, keyframe) =>
    Math.abs(keyframe.timeMs - timeMs) < Math.abs(best.timeMs - timeMs)
      ? keyframe
      : best,
  );
  return { trackId: track.id, keyframe: nearest };
}

function TrackRows({ element }: { element: TraceElement }) {
  const updateKeyframe = useTraceStore((state) => state.updateKeyframe);
  const deleteKeyframe = useTraceStore((state) => state.deleteKeyframe);
  const addKeyframe = useTraceStore((state) => state.addKeyframe);
  const removePropertyTrack = useTraceStore(
    (state) => state.removePropertyTrack,
  );
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);

  if (element.tracks.length === 0) {
    return (
      <p className="text-[10px] leading-relaxed text-slate-600">
        No animation yet. Click a stopwatch beside any property to start a track
        at the playhead.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {element.tracks.map((track) => {
        const nearest = nearestKeyframe(element, track.property);
        return (
          <div
            key={track.id}
            className="rounded-md border border-white/8 bg-white/[0.02] p-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-slate-300">
                {getPropertyDescriptor(element.type, track.property)?.label ??
                  track.label}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-slate-500 hover:bg-white/10 hover:text-sky-300"
                  onClick={() => addKeyframe(element.id, track.property)}
                  aria-label="Add keyframe at playhead"
                >
                  <DiamondIcon className="size-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                  onClick={() =>
                    removePropertyTrack(element.id, track.property)
                  }
                  aria-label="Remove track"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            </div>

            {nearest ? (
              <div className="mt-1 flex items-center gap-1">
                <span className="w-14 shrink-0 font-mono text-[9px] text-slate-500">
                  {Math.round(nearest.keyframe.timeMs)}ms
                </span>
                <select
                  value={String(nearest.keyframe.easing)}
                  onChange={(event) =>
                    updateKeyframe(
                      element.id,
                      track.property,
                      nearest.keyframe.id,
                      {
                        easing: event.target.value,
                      },
                    )
                  }
                  className="h-6 min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-1 text-[10px] text-slate-300 outline-none"
                  aria-label="Keyframe easing"
                >
                  {EASINGS.map((easing) => (
                    <option
                      key={easing}
                      value={easing}
                      className="bg-slate-900"
                    >
                      {easing}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-slate-600 hover:bg-rose-500/15 hover:text-rose-300"
                  onClick={() =>
                    deleteKeyframe(
                      element.id,
                      track.property,
                      nearest.keyframe.id,
                    )
                  }
                  aria-label="Delete nearest keyframe"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            ) : null}

            <div className="mt-1 flex flex-wrap gap-0.5">
              {track.keyframes.map((keyframe) => (
                <span
                  key={keyframe.id}
                  className={
                    'size-1.5 rotate-45 rounded-[1px] ' +
                    (Math.abs(keyframe.timeMs - timeMs) <= 10
                      ? 'bg-sky-300'
                      : 'bg-slate-600')
                  }
                  title={`${Math.round(keyframe.timeMs)}ms`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CanvasInspector() {
  const project = useTraceStore((state) => state.project);
  const setCanvas = useTraceStore((state) => state.setCanvas);
  if (!project) return null;

  return (
    <>
      <Section title="Artboard">
        <FieldRow label="Width">
          <NumberInput
            value={project.width}
            step={2}
            onChange={(width) =>
              setCanvas({ width: Math.max(16, Math.round(width)) })
            }
          />
        </FieldRow>
        <FieldRow label="Height">
          <NumberInput
            value={project.height}
            step={2}
            onChange={(height) =>
              setCanvas({ height: Math.max(16, Math.round(height)) })
            }
          />
        </FieldRow>
        <FieldRow label="Duration (ms)">
          <NumberInput
            value={project.durationMs}
            step={100}
            onChange={(durationMs) =>
              setCanvas({ durationMs: Math.max(100, Math.round(durationMs)) })
            }
          />
        </FieldRow>
        <FieldRow label="Frame rate">
          <NumberInput
            value={project.fps}
            step={1}
            onChange={(fps) =>
              setCanvas({ fps: Math.max(1, Math.min(120, Math.round(fps))) })
            }
          />
        </FieldRow>
      </Section>

      <Section title="Document">
        <dl className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-slate-500">Layers</dt>
            <dd className="font-mono text-slate-300">
              {Object.keys(project.elements).length}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tracks</dt>
            <dd className="font-mono text-slate-300">
              {Object.values(project.elements).reduce(
                (sum, element) => sum + element.tracks.length,
                0,
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Scenes</dt>
            <dd className="font-mono text-slate-300">
              {project.storyboard?.scenes.length ?? 0}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Gradients</dt>
            <dd className="font-mono text-slate-300">
              {Object.keys(project.gradients ?? {}).length}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Shortcuts">
        <ul className="space-y-1 text-[10px] text-slate-500">
          <li>
            <span className="font-mono text-slate-400">Space</span> play / pause
          </li>
          <li>
            <span className="font-mono text-slate-400">⌘/Ctrl+Z</span> undo
          </li>
          <li>
            <span className="font-mono text-slate-400">⌘/Ctrl+S</span> save
          </li>
          <li>
            <span className="font-mono text-slate-400">⌘/Ctrl+D</span> duplicate
            layer
          </li>
          <li>
            <span className="font-mono text-slate-400">Delete</span> remove
            layer / keyframe
          </li>
          <li>
            <span className="font-mono text-slate-400">← →</span> step 1 frame
          </li>
        </ul>
      </Section>
    </>
  );
}

export function TraceInspector() {
  const project = useTraceStore((state) => state.project);
  const selectedElementId = useTraceStore(
    (state) => state.selection.selectedElementId,
  );
  const element = selectedElementId
    ? (project?.elements[selectedElementId] ?? null)
    : null;

  const groups = element
    ? (['transform', 'appearance', 'geometry', 'text', 'content'] as const)
    : [];

  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-white/10 bg-[#080e1a] text-slate-200">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {element ? 'Properties' : 'Composition'}
        </p>
        {element ? (
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
            {element.type}
          </span>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!element ? (
          <CanvasInspector />
        ) : (
          <>
            <Section title="Layer">
              <Input
                key={element.id}
                defaultValue={element.name}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== element.name) {
                    useTraceStore
                      .getState()
                      .dispatch([
                        { type: 'updateElement', id: element.id, name: next },
                      ]);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className="h-7 border-white/10 bg-white/[0.04] text-[11px] text-slate-200 focus-visible:ring-sky-400/40"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    useTraceStore.getState().dispatch([
                      {
                        type: 'duplicateElement',
                        id: element.id,
                        offset: { x: 20, y: 20 },
                      },
                    ])
                  }
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                  onClick={() =>
                    useTraceStore
                      .getState()
                      .dispatch([{ type: 'deleteElement', id: element.id }])
                  }
                >
                  Delete
                </Button>
              </div>
            </Section>

            {groups.map((group) => {
              const fields = getAnimatableProperties(element.type).filter(
                (descriptor) => descriptor.group === group,
              );
              if (fields.length === 0) return null;
              return (
                <Section key={group} title={group}>
                  {fields.map((descriptor) => (
                    <PropertyField
                      key={descriptor.property}
                      element={element}
                      descriptor={descriptor}
                    />
                  ))}
                </Section>
              );
            })}

            <Section title="Animation">
              <TrackRows element={element} />
            </Section>
          </>
        )}
      </ScrollArea>

      <div className="border-t border-white/10 px-3 py-1.5">
        <p className="truncate font-mono text-[9px] text-slate-600">
          {element?.id ?? project?.id}
        </p>
      </div>
    </aside>
  );
}
