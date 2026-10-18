/**
 * components/correspondence/HarvestSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Harvest as a three-step flow in a side sheet: choose a source → review what was
 * found → import.
 *
 * WHY A SHEET AND WHY THREE STEPS
 * The plan's adoption surface is "fall into it from work you already did", so the
 * first screen the system ever shows a new user is this one, arriving from a
 * document or a notebook page. A sheet keeps that source visible behind it rather
 * than navigating away from the thing being read.
 *
 * The three steps are separate for one reason: the scan must be visibly
 * non-committal. Step 1 reads (writes nothing), step 2 is the user's edit (still
 * nothing written), and only the button in the footer of step 2 calls
 * `correspondence:harvest-import`. There is no path where a scan result reaches the
 * database without a rendered grid in between, and no "import all" shortcut that
 * skips the review — which is the property the whole extraction design rests on.
 *
 * The model pass is reported honestly rather than hidden: when it ran, a line says
 * so, and when it failed, the failure is shown while the deterministic results
 * stay on screen. A user whose provider is unconfigured should see a degraded
 * harvest, not an empty one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon,
  FileTextIcon,
  Loader2Icon,
  NotebookIcon,
  SearchIcon,
  SendIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CHANNEL_LABELS } from '@/lib/correspondence';
import type { HarvestRowDraft } from '@/lib/harvest';
import {
  useHarvest,
  useHarvestSources,
  type HarvestSourceRequest,
} from '@/hooks/use-correspondence';
import { HarvestReviewGrid } from './HarvestReviewGrid';

type Step = 'source' | 'review' | 'done';

/** Which source door is open on step 1. */
type SourceDoor = 'page' | 'document' | 'text';

export interface HarvestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  /** Open straight onto the paste door — the "Paste a list" entry point. */
  initialDoor?: SourceDoor;
}

export function HarvestSheet({
  open,
  onOpenChange,
  projectId,
  initialDoor = 'page',
}: HarvestSheetProps) {
  const [step, setStep] = useState<Step>('source');
  const [door, setDoor] = useState<SourceDoor>(initialDoor);
  const [pageQuery, setPageQuery] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [rows, setRows] = useState<HarvestRowDraft[]>([]);
  const [summary, setSummary] = useState<{
    created: number;
    merged: number;
    channels: number;
    skipped: number;
  } | null>(null);

  const { scanning, scan, error, importing, runScan, importRows, reset } =
    useHarvest();
  const sources = useHarvestSources(open);

  // Each open starts clean: a stale grid from a previous source would be the one
  // way a user could import the wrong page's contacts.
  useEffect(() => {
    if (!open) return;
    setStep('source');
    setDoor(initialDoor);
    setRows([]);
    setSummary(null);
    setPastedText('');
    reset();
  }, [open, initialDoor, reset]);

  const filteredPages = useMemo(() => {
    const query = pageQuery.trim().toLowerCase();
    if (!query) return sources.pages;
    return sources.pages.filter(
      (option) =>
        option.page.title.toLowerCase().includes(query) ||
        option.notebookTitle.toLowerCase().includes(query),
    );
  }, [sources.pages, pageQuery]);

  const startScan = async (source: HarvestSourceRequest) => {
    const result = await runScan(source, projectId);
    if (!result) return;
    setRows(result.rows);
    setStep('review');
  };

  const handleImport = async () => {
    const result = await importRows(
      projectId,
      rows.filter((row) => row.name.trim().length > 0),
    );
    if (!result) return;
    setSummary({
      created: result.createdContacts,
      merged: result.mergedContacts,
      channels: result.createdChannels,
      skipped: result.skippedChannels,
    });
    setStep('done');
  };

  const namedRowCount = rows.filter((row) => row.name.trim()).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <SendIcon className="size-4 shrink-0 text-primary" />
            Harvest contacts
          </SheetTitle>
          <SheetDescription className="text-[11px] leading-snug text-muted-foreground">
            Reads something you already have and proposes the organisations in it.
            Nothing is saved until you import the reviewed list.
          </SheetDescription>
        </SheetHeader>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {step === 'source' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1.5">
                <DoorButton
                  icon={<NotebookIcon className="size-3.5" />}
                  label="Notebook page"
                  active={door === 'page'}
                  onClick={() => setDoor('page')}
                />
                <DoorButton
                  icon={<FileTextIcon className="size-3.5" />}
                  label="Document"
                  active={door === 'document'}
                  onClick={() => setDoor('document')}
                />
                <DoorButton
                  icon={<SearchIcon className="size-3.5" />}
                  label="Paste text"
                  active={door === 'text'}
                  onClick={() => setDoor('text')}
                />
              </div>

              {door === 'page' && (
                <>
                  <Input
                    value={pageQuery}
                    onChange={(e) => setPageQuery(e.target.value)}
                    placeholder="Filter pages"
                    aria-label="Filter pages"
                    className="h-7 text-xs"
                  />
                  <div className="flex flex-col gap-1">
                    {sources.loading && (
                      <p className="px-1 py-2 text-[11px] text-muted-foreground">
                        <Loader2Icon className="mr-1 inline size-3 animate-spin" />
                        Loading pages…
                      </p>
                    )}
                    {!sources.loading && filteredPages.length === 0 && (
                      <p className="px-1 py-2 text-[11px] text-muted-foreground">
                        No pages found. Paste the text instead.
                      </p>
                    )}
                    {filteredPages.map((option) => (
                      <button
                        key={option.page.id}
                        type="button"
                        onClick={() =>
                          void startScan({ kind: 'page', pageId: option.page.id })
                        }
                        className="flex flex-col items-start gap-0.5 rounded-md border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="w-full truncate text-xs font-medium">
                          {option.page.title || 'Untitled'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {option.notebookTitle}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {door === 'document' && (
                <div className="flex flex-col gap-1">
                  {sources.documentTitles.length === 0 && (
                    <p className="px-1 py-2 text-[11px] text-muted-foreground">
                      No documents yet. Paste the text instead.
                    </p>
                  )}
                  {sources.documentTitles.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() =>
                        void startScan({ kind: 'document', documentId: doc.id })
                      }
                      className="w-full truncate rounded-md border border-border/60 px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/50"
                    >
                      {doc.title || 'Untitled document'}
                    </button>
                  ))}
                </div>
              )}

              {door === 'text' && (
                <>
                  <Textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={
                      'Paste a list of organisations with their emails, phones or addresses.\n\nCommission for Conciliation, Mediation and Arbitration\nEmail: info@example.org.za\nPhone: +27 11 000 0000'
                    }
                    aria-label="Text to read"
                    className="min-h-48 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-7 w-fit gap-1.5 text-xs"
                    disabled={!pastedText.trim() || scanning}
                    onClick={() =>
                      void startScan({ kind: 'text', text: pastedText })
                    }
                  >
                    {scanning ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SearchIcon className="size-3.5" />
                    )}
                    Read this text
                  </Button>
                </>
              )}

              {scanning && door !== 'text' && (
                <p className="text-[11px] text-muted-foreground">
                  <Loader2Icon className="mr-1 inline size-3 animate-spin" />
                  Reading… the model pass can take a few seconds.
                </p>
              )}

              {error && (
                <p className="text-[11px] text-destructive">{error}</p>
              )}
            </div>
          )}

          {step === 'review' && scan && (
            <div className="flex flex-col gap-3">
              {/* What was read, and how. Hard evidence beats a claim. */}
              <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                <p className="text-[11px] font-medium">
                  Read {scan.source.label}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {scan.source.detail}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {scan.stats.sections} sections · {scan.stats.emails} email
                  {scan.stats.emails === 1 ? '' : 's'} · {scan.stats.phones} phone
                  {scan.stats.phones === 1 ? '' : 's'} · {scan.rows.length}{' '}
                  proposed
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {scan.agentUsed
                    ? 'A model pass also read this text; anything it added is marked NEW and was not in the source verbatim.'
                    : scan.agentError
                      ? `Model pass unavailable (${scan.agentError}). Showing only what was read directly from the text.`
                      : 'Read directly from the text — no model involved.'}
                </p>
              </div>

              {scan.looseChannels.length > 0 && (
                <div className="rounded-md border border-dashed px-2.5 py-2">
                  <p className="text-[11px] font-medium">
                    {scan.looseChannels.length} detail
                    {scan.looseChannels.length === 1 ? '' : 's'} with no
                    organisation above them
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {scan.looseChannels.map((channel, index) => (
                      <li key={index} className="text-[11px] text-muted-foreground">
                        {CHANNEL_LABELS[channel.kind]}: {channel.value}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Not imported automatically — add a contact below if one of
                    these matters.
                  </p>
                </div>
              )}

              <HarvestReviewGrid
                rows={rows}
                onChange={setRows}
                knownNames={scan.knownContactNames}
              />
            </div>
          )}

          {step === 'done' && summary && (
            <div className="flex flex-col items-start gap-2">
              <CheckIcon className="size-5 text-primary" />
              <p className="text-sm font-medium">
                {summary.created + summary.merged} contact
                {summary.created + summary.merged === 1 ? '' : 's'} in the
                registry
              </p>
              <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                <li>{summary.created} added</li>
                {summary.merged > 0 && (
                  <li>
                    {summary.merged} already existed and were merged rather than
                    duplicated
                  </li>
                )}
                <li>
                  {summary.channels} way{summary.channels === 1 ? '' : 's'} to
                  reach them
                </li>
                {summary.skipped > 0 && (
                  <li>
                    {summary.skipped} address
                    {summary.skipped === 1 ? '' : 'es'} already in the registry
                    were skipped
                  </li>
                )}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Every one of these starts unverified — checking them is a real
                task, not a checkbox.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          {step === 'review' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setStep('source')}
              >
                Back
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={namedRowCount === 0 || importing}
                onClick={() => void handleImport()}
              >
                {importing && <Loader2Icon className="size-3.5 animate-spin" />}
                Import {namedRowCount} contact
                {namedRowCount === 1 ? '' : 's'}
              </Button>
            </>
          ) : step === 'done' ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                {projectId ? 'Filed under this project' : 'Filed with no project'}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">
                Scanning writes nothing.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One of the three source doors. */
function DoorButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={cn(
        'h-7 flex-1 gap-1.5 text-xs',
        !active && 'text-muted-foreground',
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}
