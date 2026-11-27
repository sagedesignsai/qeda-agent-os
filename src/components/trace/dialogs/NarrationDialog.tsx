/**
 * components/trace/dialogs/NarrationDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Narration & voiceover workspace.
 *
 * The workflow is deliberately ordered: write the lines, generate the voice,
 * then let the measured durations re-time the storyboard ("voices before
 * pictures"). Durations come back from the TTS core — this dialog never
 * estimates them, and the timeline is never stretched to fit a guess.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AudioLinesIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useIpcEvent } from '@/hooks/use-ipc';
import { ttsClient } from '@/lib/tts/client';
import type { TtsCapabilities, TtsProviderId } from '@/lib/tts/types';
import { generateTraceNarrationVoice } from '@/lib/trace/narration-client';
import type { NarrationVoiceLine } from '@/lib/trace/narration-client';
import type { TraceNarration } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';

const NO_SCENE = '__none__';

export type NarrationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NarrationDialog({ open, onOpenChange }: NarrationDialogProps) {
  const project = useTraceStore((state) => state.project);
  const narration = project?.narration;
  const scenes = project?.storyboard?.scenes ?? [];

  const addNarrationLine = useTraceStore((state) => state.addNarrationLine);
  const updateNarrationLine = useTraceStore((state) => state.updateNarrationLine);
  const removeNarrationLine = useTraceStore((state) => state.removeNarrationLine);
  const setNarration = useTraceStore((state) => state.setNarration);
  const fitNarrationTiming = useTraceStore((state) => state.fitNarrationTiming);

  const [providers, setProviders] = useState<TtsCapabilities[]>([]);
  const [provider, setProvider] = useState<TtsProviderId | null>(null);
  const [voiceId, setVoiceId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Capabilities once per open; default to the first configured provider.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setError(null);
    ttsClient
      .capabilities()
      .then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setProviders(result.value);
        setProvider((current) => current ?? result.value[0]?.provider ?? null);
      })
      .catch(() => {
        if (alive) setError('Could not load speech providers.');
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useIpcEvent('trace:narration-progress', (payload: unknown) => {
    const value = payload as { completed?: number; total?: number } | undefined;
    if (typeof value?.completed !== 'number' || typeof value.total !== 'number') return;
    setProgress({ completed: value.completed, total: value.total });
  });

  const lines = narration?.lines ?? [];
  const totalMeasuredMs = useMemo(
    () => lines.reduce((sum, line) => sum + (line.durationMs ?? 0), 0),
    [lines],
  );
  const untimedCount = lines.filter(
    (line) => typeof line.durationMs !== 'number' || line.durationMs <= 0,
  ).length;

  const draftFor = (id: string, text: string) => drafts[id] ?? text;

  const commitDrafts = () => {
    for (const [id, text] of Object.entries(drafts)) {
      const line = lines.find((entry) => entry.id === id);
      if (line && line.text !== text) updateNarrationLine(id, { text });
    }
  };

  const handleAdd = () => {
    commitDrafts();
    addNarrationLine({ sceneId: scenes[0]?.id ?? null });
  };

  const handleRemove = (id: string) => {
    removeNarrationLine(id);
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!narration || lines.length === 0) {
      toast.error('Add at least one narration line first.');
      return;
    }
    commitDrafts();
    const pending = lines
      .map((line) => ({ line, text: draftFor(line.id, line.text).trim() }))
      .filter((entry) => entry.text.length > 0);
    if (pending.length === 0) {
      toast.error('Write some text before generating voice.');
      return;
    }

    setBusy(true);
    setError(null);
    setProgress({ completed: 0, total: pending.length });

    try {
      const response = await generateTraceNarrationVoice({
        lines: pending.map((entry) => ({
          id: entry.line.id,
          text: entry.text,
        })),
        ...(provider ? { provider } : {}),
        ...(voiceId.trim() ? { voiceId: voiceId.trim() } : {}),
        ...(project?.id ? { projectId: project.id } : {}),
      });

      if ('error' in response) {
        setError(response.error);
        toast.error(response.error);
        return;
      }
      if (response.warnings.length > 0) {
        toast.message(response.warnings.join(' '));
      }

      const measured = new Map(
        response.lines
          .filter(
            (line): line is NarrationVoiceLine & { id: string } =>
              Boolean(line.id),
          )
          .map((line) => [line.id, line]),
      );

      const merged: TraceNarration = {
        ...narration,
        provider: response.provider,
        ...(voiceId.trim() ? { voiceId: voiceId.trim() } : {}),
        lines: lines.map((line) => {
          const text = draftFor(line.id, line.text).trim();
          const got = measured.get(line.id);
          return {
            ...line,
            text,
            ...(got
              ? { durationMs: got.durationMs, ttsAssetId: got.ttsAssetId }
              : {}),
          };
        }),
      };

      setNarration(merged);
      setDrafts({});

      const fitted = fitNarrationTiming();
      if (fitted && fitted.untimedLineIds.length === 0) {
        toast.success('Voice generated; timeline fitted to the narration.');
      } else if (fitted) {
        toast.message(
          `${fitted.untimedLineIds.length} line(s) still have no measured audio.`,
        );
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Voice generation failed.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleFit = () => {
    commitDrafts();
    const fitted = fitNarrationTiming();
    if (!fitted) {
      toast.error('Add narration lines before fitting the timeline.');
      return;
    }
    if (fitted.untimedLineIds.length > 0) {
      toast.message(
        `${fitted.untimedLineIds.length} line(s) still need audio; fit the rest anyway.`,
      );
    } else {
      toast.success('Timeline fitted to the measured voice.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AudioLinesIcon className="size-4 text-indigo-400" />
            Narration & voiceover
          </DialogTitle>
          <DialogDescription>
            Write the script, generate the voice, then fit the storyboard to the
            measured durations. Scenes and beats follow the voice — never the
            other way round.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Provider
            </Label>
            <Select
              value={provider ?? ''}
              onValueChange={(value) => setProvider(value as TtsProviderId)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="No provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((entry) => (
                  <SelectItem key={entry.provider} value={entry.provider}>
                    {entry.provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Voice id (optional)
            </Label>
            <Input
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              placeholder="Provider default voice"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-background/60 px-2 py-1 font-mono">
              {(totalMeasuredMs / 1000).toFixed(2)}s measured
            </span>
            {untimedCount > 0 && (
              <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-400">
                {untimedCount} without audio
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <ScrollArea className="max-h-[48vh] pr-2">
          <div className="flex flex-col gap-2">
            {lines.length === 0 && (
              <div className="rounded-md border border-dashed border-border/70 px-4 py-8 text-center text-xs text-muted-foreground">
                No narration yet. Add the first spoken line.
              </div>
            )}

            {lines.map((line, index) => (
              <div
                key={line.id}
                className="rounded-md border border-border/60 bg-background/40 p-2"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <Textarea
                    value={draftFor(line.id, line.text)}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [line.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      const draft = drafts[line.id];
                      if (draft !== undefined && draft !== line.text) {
                        updateNarrationLine(line.id, { text: draft });
                      }
                    }}
                    placeholder="One spoken sentence or phrase…"
                    className="min-h-[52px] flex-1 resize-y text-xs"
                  />
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={
                        'rounded px-1.5 py-0.5 font-mono text-[10px] ' +
                        (typeof line.durationMs === 'number' && line.durationMs > 0
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-muted text-muted-foreground')
                      }
                    >
                      {typeof line.durationMs === 'number' && line.durationMs > 0
                        ? `${(line.durationMs / 1000).toFixed(2)}s`
                        : 'no audio'}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(line.id)}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2 pl-7">
                  <Label className="text-[10px] text-muted-foreground">
                    Scene
                  </Label>
                  <Select
                    value={line.sceneId ?? NO_SCENE}
                    onValueChange={(value) =>
                      updateNarrationLine(line.id, {
                        sceneId: value === NO_SCENE ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-56 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SCENE}>Unassigned</SelectItem>
                      {scenes.map((scene) => (
                        <SelectItem key={scene.id} value={scene.id}>
                          {scene.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={handleAdd}
            disabled={busy}
          >
            <PlusIcon className="size-3.5" />
            Add line
          </Button>

          <div className="flex items-center gap-2">
            {busy && progress && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                {progress.completed}/{progress.total}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={handleFit}
              disabled={busy || lines.length === 0}
              title="Re-time scenes and the canvas to the measured voice durations"
            >
              <WandSparklesIcon className="size-3.5" />
              Fit timeline
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleGenerate}
              disabled={busy || lines.length === 0 || !provider}
            >
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              Generate voice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}