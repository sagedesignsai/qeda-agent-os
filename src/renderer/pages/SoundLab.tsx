/**
 * renderer/pages/SoundLab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Entrainment Studio DAW — route /soundlab and /soundlab/:sessionId.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  SoundLabTransportBar (full width)     │
 *   ├──────────────┬─────────────────────────┤
 *   │              │   Arrangement Timeline  │
 *   │ Instrument   │   (clips + playhead)    │
 *   │ Rack         ├─────────────────────────┤
 *   │ (track cards)│   Piano Roll / Step Seq │
 *   │              │   (collapsible drawer)  │
 *   └──────────────┴─────────────────────────┘
 *
 * The SoundLabSessionLibrary is shown when no session is open.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon, DrumIcon, PianoIcon } from 'lucide-react';
import { useSoundLab } from '@/hooks/use-soundlab';
import { soundLabStore, useSoundLabState, useSelectedPattern } from '@/hooks/use-soundlab-store';
import { SoundLabTransportBar } from '@/components/soundlab/SoundLabTransportBar';
import { InstrumentRack } from '@/components/soundlab/InstrumentRack';
import { SoundLabTimeline } from '@/components/soundlab/timeline/SoundLabTimeline';
import { SoundLabSessionLibrary } from '@/components/soundlab/SoundLabSessionLibrary';
import { PianoRollCanvas } from '@/components/soundlab/pianoroll/PianoRollCanvas';
import { StepSequencer } from '@/components/soundlab/pianoroll/StepSequencer';
import { SoundLabCopilotSheet } from '@/components/soundlab/copilot';

// ── Bottom drawer tab type ────────────────────────────────────────────────────

type DrawerTab = 'pianoroll' | 'stepseq';

// ── SoundLab page ─────────────────────────────────────────────────────────────

export default function SoundLab() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { saveStatus, sessions, createSession, deleteSession, play, pause, stop, reloadSession } =
    useSoundLab(sessionId);

  const state = useSoundLabState();
  const selectedPattern = useSelectedPattern();

  // Bottom drawer state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('pianoroll');

  // Copilot sheet state
  const [copilotOpen, setCopilotOpen] = useState(false);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.isPlaying) pause();
        else void play();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        soundLabStore.setPlayMode(state.playMode === 'song' ? 'pattern' : 'song');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) soundLabStore.redo();
        else soundLabStore.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyY') {
        e.preventDefault();
        soundLabStore.redo();
        return;
      }
      if ((e.code === 'Backspace' || e.code === 'Delete') && state.selectedClipId) {
        e.preventDefault();
        const track = state.tracks.find((t) =>
          t.clips.some((c) => c.id === state.selectedClipId),
        );
        if (track && state.selectedClipId) {
          soundLabStore.removeClip(track.id, state.selectedClipId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.isPlaying, state.playMode, state.selectedClipId, state.tracks, play, pause]);

  // ── Render ────────────────────────────────────────────────────────────────

  // No session open → show library
  if (!sessionId || !state.session) {
    return (
      <div className="flex h-full flex-col bg-background">
        <SoundLabSessionLibrary
          sessions={sessions}
          onCreate={createSession}
          onDelete={deleteSession}
        />
      </div>
    );
  }

  // Active session → show full DAW layout
  const selectedTrackType = state.tracks.find((t) => t.id === state.selectedTrackId)?.type;
  const showStepSeq = selectedTrackType === 'drums';

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Transport bar — fixed top strip */}
      <SoundLabTransportBar
        saveStatus={saveStatus}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((o) => !o)}
      />

      {/* Main three-panel body */}
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1">

          {/* Left: instrument rack */}
          <ResizablePanel defaultSize={"22%"} minSize={"16%"} maxSize={"35%"}>
            <div className="flex h-full flex-col border-r border-border/50">
              <InstrumentRack />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: timeline + bottom drawer */}
          <ResizablePanel defaultSize={"78%"}>
            <ResizablePanelGroup orientation="vertical">

              {/* Timeline */}
              <ResizablePanel defaultSize={drawerOpen ? "60%" : "100%"} minSize={"30%"}>
                <SoundLabTimeline />
              </ResizablePanel>

              {/* Drawer toggle bar */}
              <div className="flex items-center gap-1 border-t border-border/50 bg-card/40 px-2 py-0.5 select-none">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1 text-left hover:text-foreground transition-colors"
                  onClick={() => setDrawerOpen((o) => !o)}
                >
                  <PianoIcon className="size-3 text-muted-foreground" />
                  <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {drawerOpen ? 'Piano Roll / Step Sequencer' : 'Open Piano Roll'}
                  </span>
                </button>
                {/* Tab toggles only visible when open */}
                {drawerOpen && (
                  <div className="flex items-center gap-0.5 mr-2">
                    <Button
                      size="icon-sm"
                      variant={drawerTab === 'pianoroll' ? 'secondary' : 'ghost'}
                      className="h-5 px-2 text-[10px]"
                      onClick={() => setDrawerTab('pianoroll')}
                    >
                      <PianoIcon className="size-3 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant={drawerTab === 'stepseq' ? 'secondary' : 'ghost'}
                      className="h-5 px-2 text-[10px]"
                      onClick={() => setDrawerTab('stepseq')}
                    >
                      <DrumIcon className="size-3 text-muted-foreground" />
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  className="p-0.5 hover:text-foreground transition-colors"
                  onClick={() => setDrawerOpen((o) => !o)}
                  aria-label={drawerOpen ? 'Collapse drawer' : 'Expand drawer'}
                >
                  {drawerOpen ? (
                    <ChevronDownIcon className="size-3 text-muted-foreground" />
                  ) : (
                    <ChevronUpIcon className="size-3 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* Bottom drawer panel */}
              {drawerOpen && (
                <ResizablePanel defaultSize={"40%"} minSize={"20%"} maxSize={"70%"}>
                  <div className="flex h-full flex-col overflow-hidden bg-card/20">
                    {drawerTab === 'pianoroll' || !showStepSeq ? (
                      <PianoRollCanvas
                        track={state.tracks.find((t) => t.id === state.selectedTrackId) ?? null}
                        pattern={selectedPattern?.pattern ?? null}
                      />
                    ) : (
                      <StepSequencer
                        track={state.tracks.find((t) => t.id === state.selectedTrackId) ?? null}
                        pattern={selectedPattern?.pattern ?? null}
                      />
                    )}
                  </div>
                </ResizablePanel>
              )}

            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Copilot assistant sliding sheet */}
      {state.session && (
        <SoundLabCopilotSheet
          open={copilotOpen}
          onOpenChange={setCopilotOpen}
          activeSession={state.session}
          currentBeat={state.playheadBeat}
          onChanged={() => void reloadSession()}
        />
      )}
    </div>
  );
}
