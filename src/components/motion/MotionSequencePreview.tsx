import { useEffect, useMemo, useRef, useState } from 'react';
import { ClapperboardIcon, PauseIcon, PlayIcon, XIcon } from 'lucide-react';

import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import { Button } from '@/components/ui/button';
import { resolveMotionSequence, sampleMotionSequence } from '@/lib/motion/sequence';
import { selectMotionScene } from '@/lib/motion/scene-select';
import type { MotionDocument } from '@/lib/motion/types';
import { PlaybackClock } from '@/lib/timeline/clock';

export function MotionSequencePreview({ doc, onClose }: { doc: MotionDocument; onClose: () => void }) {
  const sequence = useMemo(() => resolveMotionSequence(doc), [doc]);
  const firstSceneId = sequence.items[0]?.sceneId ?? doc.activeSceneId;
  const secondSceneId = doc.scenes.find((scene) => scene.id !== firstSceneId)?.id ?? firstSceneId;
  const sceneDuration = Math.max(0, ...doc.scenes.map((scene) => scene.timeline.duration));
  const sequenceClock = useMemo(() => new PlaybackClock({ duration: () => sequence.duration }), [sequence.duration]);
  const clockA = useMemo(() => new PlaybackClock({ duration: () => sceneDuration }), [sceneDuration]);
  const clockB = useMemo(() => new PlaybackClock({ duration: () => sceneDuration }), [sceneDuration]);
  const [time, setTime] = useState(0);
  const [sceneDocs, setSceneDocs] = useState(() => [
    selectMotionScene(doc, firstSceneId),
    selectMotionScene(doc, secondSceneId),
  ]);
  const slotSceneIds = useRef<[string, string]>([firstSceneId, secondSceneId]);
  const slots = useMemo(() => {
    const frame = sampleMotionSequence(doc, sequence, time);
    const assigned: Array<{ slot: 0 | 1; sceneId: string; sceneTime: number }> = [];
    const used = new Set<number>();
    for (const layer of frame.layers.slice(-2)) {
      let slot = slotSceneIds.current.indexOf(layer.scene.id) as 0 | 1 | -1;
      if (slot < 0 || used.has(slot)) slot = used.has(0) ? 1 : 0;
      used.add(slot);
      slotSceneIds.current[slot] = layer.scene.id;
      assigned.push({ slot, sceneId: layer.scene.id, sceneTime: layer.sceneTime });
    }
    return { frame, assigned };
  }, [doc, sequence, time]);

  useEffect(() => {
    const unsubscribe = sequenceClock.subscribe(() => setTime(sequenceClock.getTime()));
    sequenceClock.play();
    return () => {
      unsubscribe();
      sequenceClock.dispose();
      clockA.dispose();
      clockB.dispose();
    };
  }, [sequenceClock, clockA, clockB]);

  useEffect(() => {
    for (const assignment of slots.assigned) {
      const current = sceneDocs[assignment.slot];
      if (current.activeSceneId !== assignment.sceneId) {
        setSceneDocs((previous) => {
          const next = [...previous];
          next[assignment.slot] = selectMotionScene(doc, assignment.sceneId);
          return next;
        });
      }
      const clock = assignment.slot === 0 ? clockA : clockB;
      clock.seek(assignment.sceneTime);
    }
  }, [clockA, clockB, doc, sceneDocs, slots]);

  const progress = sequence.duration > 0 ? time / sequence.duration : 0;
  const crossfade = slots.frame.transition?.type === 'crossfade';
  const dip = slots.frame.transition?.type === 'dip';
  const outgoingSlot = slots.assigned[0]?.slot;
  const incomingSlot = slots.assigned[1]?.slot;
  const alphaA = slots.assigned.length < 2
    ? (slots.assigned[0]?.slot === 0 ? 1 : 0)
    : crossfade
      ? (slots.assigned[0].slot === 0 ? 1 - slots.frame.transition!.progress : slots.frame.transition!.progress)
      : dip
        ? (slots.assigned[0].slot === 0 ? (slots.frame.transition!.progress < 0.5 ? 1 : 0) : (slots.frame.transition!.progress >= 0.5 ? 1 : 0))
        : 0;
  const alphaB = slots.assigned.length < 2
    ? (slots.assigned[0]?.slot === 1 ? 1 : 0)
    : crossfade
      ? (slots.assigned[0].slot === 1 ? 1 - slots.frame.transition!.progress : slots.frame.transition!.progress)
      : dip
        ? (slots.assigned[0].slot === 1 ? (slots.frame.transition!.progress < 0.5 ? 1 : 0) : (slots.frame.transition!.progress >= 0.5 ? 1 : 0))
        : 0;
  const dipOpacity = dip
    ? (slots.frame.transition!.progress < 0.5 ? slots.frame.transition!.progress * 2 : (1 - slots.frame.transition!.progress) * 2)
    : 0;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2">
        <ClapperboardIcon className="size-3.5 text-primary" />
        <span className="text-[11px] font-medium">Sequence preview</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{sequence.items.length} shots · {time.toFixed(2)} / {sequence.duration.toFixed(2)}s</span>
        <div className="flex-1" />
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={sequenceClock.isPlaying() ? 'Pause sequence' : 'Play sequence'} onClick={() => sequenceClock.toggle()}>
          {sequenceClock.isPlaying() ? <PauseIcon data-icon /> : <PlayIcon data-icon />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Close sequence preview" onClick={onClose}><XIcon data-icon /></Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: doc.brand.colors.background }}>
        <div className="absolute inset-0" style={{ opacity: alphaA }}>
          <MotionSceneCanvas doc={sceneDocs[0]} clock={clockA} viewMode="perspective" stageColor={doc.brand.colors.background} gridVisible={false} zoom={1} showEditorStage={false} dpr={1.25} />
        </div>
        <div className="absolute inset-0" style={{ opacity: alphaB }}>
          <MotionSceneCanvas doc={sceneDocs[1]} clock={clockB} viewMode="perspective" stageColor={doc.brand.colors.background} gridVisible={false} zoom={1} showEditorStage={false} dpr={1.25} />
        </div>
        {dip && <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: slots.frame.transition?.color ?? '#000000', opacity: dipOpacity }} />}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border/60 px-3">
        <input
          aria-label="Sequence playhead"
          type="range"
          min={0}
          max={sequence.duration}
          step={1 / (doc.meta.output.fps || 30)}
          value={time}
          onChange={(event) => sequenceClock.seek(Number(event.target.value))}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-20 text-right text-[9px] tabular-nums text-muted-foreground">
          {outgoingSlot === undefined ? 'Gap' : `Shot ${sequence.items.findIndex((item) => item.sceneId === slots.assigned[0]?.sceneId) + 1}`}
          {incomingSlot !== undefined && ` → ${sequence.items.findIndex((item) => item.sceneId === slots.assigned[1]?.sceneId) + 1}`}
        </span>
      </div>
    </div>
  );
}
