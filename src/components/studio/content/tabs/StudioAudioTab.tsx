/**
 * components/studio/content/tabs/StudioAudioTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Audio Tab for Studio Content Panel:
 *   - Bundled UI Sound Effects (Whoosh, Pop, Chime, Click, Ding, Camera Shutter)
 *   - Real-time Web Audio API sound preview playback
 *   - Custom audio soundtrack / voiceover file import
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { SearchIcon, Volume2Icon, UploadCloudIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';
import { toast } from 'sonner';

interface StudioAudioTabProps {
  onAddClip: (clip: ContentItemPayload) => void;
}

interface SfxPreset {
  id: string;
  title: string;
  category: string;
  durationMs: number;
  playSynth: () => void;
}

// Lightweight Web Audio API synthesizer for instant zero-dependency sound previews
function playSynthSound(type: 'whoosh' | 'pop' | 'chime' | 'click' | 'ding') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'pop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'whoosh') {
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.3);
    } else if (type === 'chime' || type === 'ding') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'ding' ? 1200 : 880, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
    }
  } catch {
    // Ignore audio context errors in restricted test environments
  }
}

const SFX_PRESETS: SfxPreset[] = [
  {
    id: 'sfx-whoosh',
    title: 'Fast Whoosh',
    category: 'Transitions',
    durationMs: 600,
    playSynth: () => playSynthSound('whoosh'),
  },
  {
    id: 'sfx-pop',
    title: 'Bubble Pop',
    category: 'UI Cues',
    durationMs: 400,
    playSynth: () => playSynthSound('pop'),
  },
  {
    id: 'sfx-chime',
    title: 'Success Chime',
    category: 'Melodic',
    durationMs: 1200,
    playSynth: () => playSynthSound('chime'),
  },
  {
    id: 'sfx-click',
    title: 'Tactile Click',
    category: 'UI Cues',
    durationMs: 300,
    playSynth: () => playSynthSound('click'),
  },
  {
    id: 'sfx-ding',
    title: 'Clean Bell Ding',
    category: 'Melodic',
    durationMs: 800,
    playSynth: () => playSynthSound('ding'),
  },
];

export function StudioAudioTab({ onAddClip }: StudioAudioTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handlePreview = (sfx: SfxPreset) => {
    setPreviewingId(sfx.id);
    sfx.playSynth();
    setTimeout(() => {
      setPreviewingId(null);
    }, sfx.durationMs);
  };

  const handleImportAudio = async () => {
    try {
      const res = await window.electron.ipc.invoke<{
        canceled: boolean;
        files: Array<{
          name: string;
          path: string;
          sizeBytes: number;
          type: string;
        }>;
      }>('studio:import-media', {
        types: ['audio'],
      });

      if (!res.canceled && res.files.length > 0) {
        const file = res.files[0];
        onAddClip({
          trackType: 'audio',
          name: file.name,
          durationMs: 10000,
          color: '#0f766e',
          payload: {
            filePath: file.path,
            mediaUrl: file.path,
            volume: 1.0,
          },
        });
        toast.success(`Added ${file.name} to Audio track`);
      }
    } catch {
      toast.error('Failed to import audio track');
    }
  };

  const filtered = SFX_PRESETS.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full gap-3 overflow-y-auto overflow-x-hidden pr-1">
      {/* Search Bar */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sound effects..."
          className="h-8 pl-8 text-xs bg-secondary/30 border-border/40 focus-visible:ring-1"
        />
      </div>

      {/* Import Audio CTA Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportAudio}
        className="w-full h-8 text-xs gap-1.5 border-border/60 hover:bg-card/60"
      >
        <UploadCloudIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span>Import Custom Soundtrack / Voiceover</span>
      </Button>

      {/* SFX Presets Grid */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          Bundled Sound Effects ({filtered.length})
        </div>
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((sfx) => (
            <ContentCardItem
              key={sfx.id}
              id={sfx.id}
              title={sfx.title}
              subtitle={sfx.category}
              badge={`${(sfx.durationMs / 1000).toFixed(1)}s`}
              previewNode={<Volume2Icon className="w-6 h-6 text-teal-400" />}
              itemData={{
                trackType: 'audio',
                name: sfx.title,
                durationMs: sfx.durationMs,
                color: '#0f766e',
                payload: {
                  volume: 1.0,
                },
              }}
              onAdd={onAddClip}
              onPreview={() => handlePreview(sfx)}
              isPlayingPreview={previewingId === sfx.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
