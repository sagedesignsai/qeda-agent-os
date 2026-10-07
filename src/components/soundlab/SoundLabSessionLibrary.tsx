/**
 * components/soundlab/SoundLabSessionLibrary.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing screen shown when no session is open. Displays a grid of saved
 * sessions and a "New Session" dialog with goal-oriented starter templates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BrainCircuitIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  MusicIcon,
  ZapIcon,
  MoonIcon,
  FlameIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  SESSION_TEMPLATES,
  BRAINWAVE_BAND_META,
  type SoundLabSession,
  type BrainwaveBand,
} from '@/lib/soundlab-types';

// ── Template icons ────────────────────────────────────────────────────────────

const TEMPLATE_ICONS = {
  'deep-focus':      MusicIcon,
  'creative-flow':   SparklesIcon,
  'sleep-induction': MoonIcon,
  'high-cognition':  FlameIcon,
  'blank':           ZapIcon,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts < 1e11 ? ts * 1000 : ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function BandPill({ band }: { band: BrainwaveBand }) {
  const meta = BRAINWAVE_BAND_META[band];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}
    >
      {meta.label} · {meta.hz} Hz
    </span>
  );
}

// ── Template picker dialog ────────────────────────────────────────────────────

interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string, band: BrainwaveBand, bpm: number) => void;
}

function TemplateDialog({ open, onClose, onSelect }: TemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[640px] max-w-[95vw] gap-0 p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BrainCircuitIcon className="size-4 text-violet-400" />
            New SoundLab Session
          </DialogTitle>
          <DialogDescription>
            Choose a brain state goal or start from scratch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          {SESSION_TEMPLATES.map((tpl) => {
            const Icon = TEMPLATE_ICONS[tpl.id as keyof typeof TEMPLATE_ICONS] ?? ZapIcon;
            const meta = BRAINWAVE_BAND_META[tpl.band];
            return (
              <button
                key={tpl.id}
                onClick={() => onSelect(tpl.id, tpl.band, tpl.bpm)}
                className={cn(
                  'group relative flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-4',
                  'hover:border-border hover:bg-card/80 hover:shadow-md',
                  'text-left transition-all duration-150',
                  tpl.id === 'blank' && 'border-dashed',
                )}
              >
                {/* Color accent bar */}
                <div
                  className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl opacity-70 transition-opacity group-hover:opacity-100"
                  style={{ background: meta.color }}
                />

                <div className="flex items-start justify-between">
                  <div
                    className="flex size-8 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color}22` }}
                  >
                    <Icon className="size-4" style={{ color: meta.color }} />
                  </div>
                  {tpl.id !== 'blank' && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                    >
                      {tpl.bpm} BPM
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                    {tpl.description}
                  </p>
                </div>

                {tpl.id !== 'blank' && (
                  <BandPill band={tpl.band} />
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SoundLabSession;
  onOpen: () => void;
  onDelete: () => void;
}

function SessionCard({ session, onOpen, onDelete }: SessionCardProps) {
  const meta = BRAINWAVE_BAND_META[session.targetBand];

  return (
    <div
      className="group relative flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-4 cursor-pointer hover:border-border hover:bg-card/80 hover:shadow-md transition-all duration-150"
      onClick={onOpen}
    >
      {/* Top accent */}
      <div
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
        style={{ background: meta.color }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${meta.color}22` }}
          >
            <BrainCircuitIcon className="size-3.5" style={{ color: meta.color }} />
          </div>
          <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={(e) => e.stopPropagation()}
            >
              <TrashIcon className="size-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{session.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the session and all its tracks. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex items-center justify-between gap-2">
        <BandPill band={session.targetBand} />
        <span className="text-[10px] text-muted-foreground font-mono">{session.bpm} BPM</span>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <ClockIcon className="size-3" />
        <span>{formatDate(session.updatedAt)}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SoundLabSessionLibraryProps {
  sessions: SoundLabSession[];
  onCreate: (templateId: string, band: BrainwaveBand, bpm: number) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
}

export function SoundLabSessionLibrary({
  sessions,
  onCreate,
  onDelete,
}: SoundLabSessionLibraryProps) {
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSelect = async (
    templateId: string,
    band: BrainwaveBand,
    bpm: number,
  ) => {
    setCreating(true);
    try {
      const id = await onCreate(templateId, band, bpm);
      setShowNew(false);
      navigate(`/soundlab/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border/50 bg-card/30 px-8 py-10">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-cyan-500/3 to-transparent" />
        <div className="relative flex items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
              <BrainCircuitIcon className="size-6 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">SoundLab</h1>
              <p className="text-sm text-muted-foreground">
                Brain entrainment DAW · Compose · Experiment · Flow
              </p>
            </div>
          </div>

          <Button
            onClick={() => setShowNew(true)}
            disabled={creating}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white"
          >
            <PlusIcon className="size-4" />
            New Session
          </Button>
        </div>
      </div>

      {/* Sessions grid */}
      <div className="flex-1 p-8">
        {sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-dashed border-border bg-card/30">
              <BrainCircuitIcon className="size-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No sessions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first entrainment session to get started
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowNew(true)}
              className="gap-2"
            >
              <PlusIcon className="size-4" />
              Create first session
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onOpen={() => navigate(`/soundlab/${s.id}`)}
                  onDelete={() => void onDelete(s.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <TemplateDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onSelect={(t, b, bpm) => void handleSelect(t, b, bpm)}
      />
    </div>
  );
}
