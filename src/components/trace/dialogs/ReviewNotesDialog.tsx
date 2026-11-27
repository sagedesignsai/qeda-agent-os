/**
 * components/trace/dialogs/ReviewNotesDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Timestamped review notes for the composition.
 *
 * A note points at a moment (and optionally the selected layer); clicking it
 * seeks there. Resolution is a flag, never a delete, so the copilot can still
 * see what was asked. Notes are ordinary document state (setReviewNotes), so
 * every action is undoable.
 */

import { useMemo, useState } from 'react';
import {
  CheckIcon,
  MessageSquarePlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTraceTimecode } from '@/lib/trace/runtime/resolve-element';
import { seekTracePlayback } from '@/lib/trace/runtime/playback-driver';
import {
  addReviewNote,
  removeReviewNote,
  sortReviewNotes,
  updateReviewNote,
} from '@/lib/trace/review';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

export type ReviewNotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewNotesDialog({
  open,
  onOpenChange,
}: ReviewNotesDialogProps) {
  const project = useTraceStore((state) => state.project);
  const playback = useTraceStore((state) => state.playback);
  const selection = useTraceStore((state) => state.selection);
  const [draft, setDraft] = useState('');

  const notes = useMemo(
    () => sortReviewNotes(project?.reviewNotes ?? []),
    [project?.reviewNotes],
  );

  if (!project) return null;

  const activeSceneId =
    project.storyboard?.activeSceneId ??
    project.storyboard?.scenes[0]?.id ??
    null;
  const selectedElementId = selection.selectedElementId;

  const commit = (next: typeof notes) => {
    useTraceStore.getState().dispatch([{ type: 'setReviewNotes', notes: next }]);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    commit(
      addReviewNote(project.reviewNotes, {
        text,
        timeMs: playback.currentTimeMs,
        ...(activeSceneId ? { sceneId: activeSceneId } : {}),
        ...(selectedElementId ? { elementId: selectedElementId } : {}),
      }),
    );
    setDraft('');
  };

  const toggleResolved = (id: string, resolved: boolean) => {
    commit(updateReviewNote(project.reviewNotes, id, { resolved }));
  };

  const remove = (id: string) => {
    commit(removeReviewNote(project.reviewNotes, id));
  };

  const seek = (timeMs: number) => {
    seekTracePlayback(timeMs, { commit: true });
    useTraceStore.getState().setPlayhead(timeMs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border bg-card text-foreground sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <MessageSquarePlusIcon className="size-4 text-amber-300" />
            Review notes
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Timestamped comments the copilot reads before editing. Resolving a
            note keeps it in the document; deleting is explicit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-border/60 bg-background/40 p-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  add();
                }
              }}
              rows={2}
              placeholder={`Note at ${formatTraceTimecode(playback.currentTimeMs)}…`}
              aria-label="New review note"
              className="min-h-14 w-full resize-y rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTraceTimecode(playback.currentTimeMs)}
                {selectedElementId
                  ? ` · ${project.elements[selectedElementId]?.name ?? 'layer'}`
                  : ''}
              </span>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 bg-amber-400 text-[11px] text-slate-950 hover:bg-amber-300"
                onClick={add}
                disabled={!draft.trim()}
              >
                <MessageSquarePlusIcon className="size-3.5" />
                Add note
              </Button>
            </div>
          </div>

          <ScrollArea className="h-64 rounded-md border border-border/60 bg-background/30">
            {notes.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
                No notes yet. Add one at the playhead.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {notes.map((note) => {
                  const scene = project.storyboard?.scenes.find(
                    (entry) => entry.id === note.sceneId,
                  );
                  const element = note.elementId
                    ? project.elements[note.elementId]
                    : null;
                  return (
                    <div
                      key={note.id}
                      className={cn(
                        'flex items-start gap-2 px-2 py-2',
                        note.resolved && 'opacity-60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => seek(note.timeMs)}
                        className="mt-0.5 shrink-0 rounded bg-accent/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                        title="Seek to this note"
                      >
                        {formatTraceTimecode(note.timeMs)}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'whitespace-pre-wrap text-[11px] leading-snug',
                            note.resolved
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground',
                          )}
                        >
                          {note.text}
                        </p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground/70">
                          {[
                            scene?.name,
                            element?.name,
                            note.resolved ? 'resolved' : 'open',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            toggleResolved(note.id, !note.resolved)
                          }
                          title={note.resolved ? 'Reopen note' : 'Mark resolved'}
                          aria-label={
                            note.resolved ? 'Reopen note' : 'Mark resolved'
                          }
                          className={cn(
                            'flex size-6 items-center justify-center rounded',
                            note.resolved
                              ? 'text-emerald-400/70 hover:bg-emerald-500/10 hover:text-emerald-300'
                              : 'text-muted-foreground/60 hover:bg-emerald-500/10 hover:text-emerald-300',
                          )}
                        >
                          <CheckIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(note.id)}
                          title="Delete note"
                          aria-label="Delete note"
                          className="flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}