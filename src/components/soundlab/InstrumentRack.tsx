/**
 * components/soundlab/InstrumentRack.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left-panel instrument rack: scrollable list of track cards with an
 * "Add Track" dropdown at the bottom.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { soundLabStore, useSoundLabTracks, useSoundLabState } from '@/hooks/use-soundlab-store';
import { InstrumentTrackCard } from './InstrumentTrackCard';
import { EntrainmentTrackCard } from './EntrainmentTrackCard';
import { DrumTrackCard } from './DrumTrackCard';
import { NoiseTrackCard } from './NoiseTrackCard';
import { EffectsChainPanel } from './EffectsChainPanel';
import { BRAINWAVE_BAND_META, type SoundLabTrack } from '@/lib/soundlab-types';

function nanoid6() {
  return Math.random().toString(36).slice(2, 8);
}

const TRACK_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#ef4444', '#10b981', '#f472b6', '#64748b',
];

function nextColor(tracks: SoundLabTrack[]): string {
  return TRACK_COLORS[tracks.length % TRACK_COLORS.length] ?? '#6366f1';
}

export function InstrumentRack() {
  const tracks = useSoundLabTracks();
  const { selectedTrackId, session } = useSoundLabState();

  const addTrack = (type: SoundLabTrack['type']) => {
    if (!session) return;
    const id = `t-${nanoid6()}`;
    const color = nextColor(tracks);
    const base = {
      id,
      sessionId: session.id,
      sortOrder: tracks.length,
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0.0,
      color,
      patterns: [],
      clips: [],
      automation: [],
    };

    let track: SoundLabTrack;
    switch (type) {
      case 'instrument':
        track = { ...base, type, name: 'Instrument', config: { preset: 'warm-pad', waveform: 'triangle', attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.5 } };
        break;
      case 'entrainment': {
        const band = session.targetBand;
        track = { ...base, type, name: `${BRAINWAVE_BAND_META[band].label} Entrainment`, color: BRAINWAVE_BAND_META[band].color, config: { mode: 'binaural', targetBand: band, carrierHz: 220, beatHz: BRAINWAVE_BAND_META[band].hz, amDepth: 0.8 } };
        break;
      }
      case 'drums':
        track = { ...base, type, name: '808 Drums', color: '#ef4444', config: {} };
        break;
      case 'noise':
        track = { ...base, type, name: 'Brown Noise', color: '#78716c', config: { noiseType: 'brown' } };
        break;
    }

    soundLabStore.addTrack(track);
  };

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Tracks
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-foreground">
              <PlusIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Add Track
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => addTrack('instrument')}>
              <span className="size-2 rounded-full bg-indigo-400" />
              Instrument
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => addTrack('entrainment')}>
              <span className="size-2 rounded-full bg-cyan-400" />
              Entrainment
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => addTrack('drums')}>
              <span className="size-2 rounded-full bg-red-400" />
              Drum Machine
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => addTrack('noise')}>
              <span className="size-2 rounded-full bg-stone-400" />
              Noise
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Track list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {tracks.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground/50">
              No tracks yet
            </div>
          )}
          {tracks.map((track) => {
            const isSelected = track.id === selectedTrackId;
            const card = (() => {
              switch (track.type) {
                case 'instrument':  return <InstrumentTrackCard  key={track.id} track={track} isSelected={isSelected} />;
                case 'entrainment': return <EntrainmentTrackCard key={track.id} track={track} isSelected={isSelected} />;
                case 'drums':       return <DrumTrackCard        key={track.id} track={track} isSelected={isSelected} />;
                case 'noise':       return <NoiseTrackCard       key={track.id} track={track} isSelected={isSelected} />;
              }
            })();

            return (
              <div key={track.id} className="flex flex-col">
                {card}
                {/* Effects strip — shown for instrument + noise tracks */}
                {(track.type === 'instrument' || track.type === 'noise') && (
                  <EffectsChainPanel track={track} />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
