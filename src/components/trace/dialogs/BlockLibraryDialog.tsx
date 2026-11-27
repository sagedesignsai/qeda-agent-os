/**
 * components/trace/dialogs/BlockLibraryDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The searchable block library: pick a named visual, adjust the options its
 * builder actually reads, preview it on a representative frame, and insert it as
 * ordinary editable layers.
 *
 * The preview is generated from the same registry builder the insertion uses,
 * rendered through the shared serializer, so the card cannot advertise a
 * different visual from the one that lands on the canvas.
 */

import { useEffect, useMemo, useState } from 'react';
import { BlocksIcon, PlusIcon, SearchIcon, WallpaperIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RecipeFieldControl } from '@/components/trace/dialogs/RecipeSetupDialog';
import {
  BLOCK_CATEGORIES,
  blockDefaults,
  blockPreviewSvg,
  getBlock,
  instantiateBlock,
  searchBlocks,
} from '@/lib/trace/blocks';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

export type BlockLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the generative surface workspace from inside the library. */
  onGenerateSurface?: () => void;
};

export function BlockLibraryDialog({
  open,
  onOpenChange,
  onGenerateSurface,
}: BlockLibraryDialogProps) {
  const project = useTraceStore((state) => state.project);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>('title-card');
  const [values, setValues] = useState<Record<string, unknown>>({});

  const results = useMemo(
    () => searchBlocks(query, { limit: 60 }),
    [query],
  );

  const selected = selectedId ? (getBlock(selectedId) ?? null) : null;

  // Keep a valid selection as the query narrows.
  useEffect(() => {
    if (!open) return;
    const first = results[0];
    if (!first) return;
    if (!selectedId || !results.some((block) => block.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [open, results, selectedId]);

  // Re-seed the form whenever the selected block changes.
  useEffect(() => {
    const block = selectedId ? getBlock(selectedId) : null;
    if (block) setValues(blockDefaults(block));
  }, [selectedId]);

  const preview = useMemo(() => {
    if (!selected) return '';
    try {
      return blockPreviewSvg(
        selected,
        values,
        selected.previewTimeMs ?? 1400,
        project?.style,
      );
    } catch {
      return '';
    }
  }, [selected, values, project?.style]);

  const grouped = useMemo(() => {
    return BLOCK_CATEGORIES.map((category) => ({
      category,
      blocks: results.filter((block) => block.category === category),
    })).filter((group) => group.blocks.length > 0);
  }, [results]);

  const insert = () => {
    if (!project || !selected) return;
    try {
      const { fragment } = instantiateBlock(selected.id, values, {
        canvas: { width: project.width, height: project.height },
        ...(project.style ? { style: project.style } : {}),
      });
      const result = useTraceStore.getState().dispatch([
        {
          type: 'insertFragment',
          fragment,
          sceneId:
            project.storyboard?.activeSceneId ??
            project.storyboard?.scenes[0]?.id ??
            null,
          position: selected.layer === 'background' ? 'back' : 'front',
          suffix: `block-${Date.now().toString(36).slice(-5)}`,
        },
      ]);
      if (!result?.ok) {
        toast.error('The block could not be inserted.');
        return;
      }
      const rootId = result.diff.added[0];
      if (rootId) useTraceStore.getState().selectElement(rootId);
      toast.success(`Inserted ${selected.title}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-card text-foreground sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <BlocksIcon className="size-4 text-sky-400" />
            Block library
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Named visuals that insert as editable layers. Search by what you are
            making; adjust the options, then add it to the active scene.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)] gap-3">
          {/* Catalogue */}
          <div className="flex min-h-0 flex-col gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search blocks…"
                aria-label="Search blocks"
                spellCheck={false}
                className="h-7 bg-muted/20 pl-7 text-[11px]"
              />
            </div>
            <ScrollArea className="h-80 rounded-md border border-border bg-background/40">
              <div className="flex flex-col p-1">
                {grouped.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                    No blocks match “{query}”.
                  </p>
                ) : null}
                {grouped.map((group) => (
                  <div key={group.category} className="pb-1">
                    <p className="px-2 pb-1 pt-2 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                      {group.category}
                    </p>
                    {group.blocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(block.id);
                          setValues(blockDefaults(block));
                        }}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                          selectedId === block.id
                            ? 'bg-sky-500/15 text-sky-100'
                            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2 text-[11px] font-medium">
                          <span className="truncate">{block.title}</span>
                          {block.addonId ? (
                            <span className="shrink-0 rounded border border-sky-400/25 bg-sky-400/[0.06] px-1 py-px text-[8px] uppercase tracking-[0.12em] text-sky-300/80">
                              add-on
                            </span>
                          ) : null}
                        </span>
                        <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground/70">
                          {block.description}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Detail */}
          {selected ? (
            <div className="flex min-h-0 flex-col gap-2">
              <div
                className="aspect-video w-full overflow-hidden rounded-md border border-border bg-[#070b14] [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
              <div>
                <h3 className="text-[13px] font-medium">{selected.title}</h3>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {selected.description}
                </p>
              </div>

              {selected.fields.length > 0 ? (
                <ScrollArea className="max-h-52 rounded-md border border-border/60 bg-background/30 p-2">
                  <div className="flex flex-col gap-1.5">
                    {selected.fields.map((field) => (
                      <RecipeFieldControl
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.key]: value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : null}

              <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                {selected.layer === 'background'
                  ? 'Inserts at the back of the stack, behind existing art.'
                  : 'Inserts at the top of the active scene as an ordinary group — every layer, track and colour stays editable.'}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center text-[11px] text-muted-foreground">
              Pick a block to preview it.
            </div>
          )}
        </div>

        <DialogFooter>
          {onGenerateSurface ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mr-auto h-7 gap-1 text-[11px] text-sky-300/90 hover:bg-sky-400/10 hover:text-sky-200"
              onClick={() => {
                onOpenChange(false);
                onGenerateSurface();
              }}
            >
              <WallpaperIcon className="size-3.5" />
              Generate a custom surface…
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 bg-sky-500 text-[11px] text-slate-950 hover:bg-sky-400"
            disabled={!selected || !project}
            onClick={insert}
          >
            <PlusIcon className="size-3.5" />
            Add to canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}