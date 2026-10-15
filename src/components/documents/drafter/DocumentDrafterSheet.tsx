/**
 * components/documents/drafter/DocumentDrafterSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Document Drafter — a slide-over where a person talks an agent into
 * writing a professional document, and then reads it.
 *
 * WHY THIS IS NOT THE OTHER DOCUMENT COPILOT SHEETS
 * ──────────────────────────────────────────────────
 * `AiDocumentAssistant` and `WordProcessorCopilotSheet` are one-shot block
 * generators: pick a block type, get one paragraph back, insert it. This panel
 * is an agent conversation with six real tools behind it
 * (`main/tools/documents-drafter.ts`), one of which is approval-gated because
 * it overwrites work that already exists. That difference drives every design
 * decision below:
 *
 *   - The empty state orients the user as a *drafter*, not a chatbot: what it
 *     produces, what it reads, and the one thing it can never do (send, file,
 *     or export anything) stated once, plainly, and not repeated as a warning
 *     on every turn.
 *   - A DRAFT LEDGER sits under the conversation, not inside it. The user needs
 *     to see "created → now editing blocks → saved" at a glance while the
 *     transcript scrolls, without the transcript becoming a tool log.
 *   - The approval moment gets its own pinned banner above the composer. It is
 *     the one instant where trust is decided, and it must not require scrolling
 *     back to find.
 *   - A run that exhausts the agent's step budget ends with `stream-done`
 *     like any other, so it would otherwise render as a clean finish. Because a
 *     half-written instrument that reads as complete is the worst thing this
 *     panel could do, truncation gets a pinned correctness notice beside the
 *     approval bar rather than a line in the transcript.
 *   - A created document gets an explicit handoff to the editor rather than
 *     hoping the user notices the sidebar refreshed.
 *
 * Structure is deliberately the same as `StudioCopilotSheet` (Sheet →
 * Conversation → MessageList → PromptInput) so a turn looks identical wherever
 * it happens. Only the parts that make drafting different are new.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileSignatureIcon,
  LandmarkIcon,
  ListTreeIcon,
  Loader2Icon,
  MinusCircleIcon,
  NotebookPenIcon,
  PenLineIcon,
  PlusIcon,
  ScaleIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { UIMessage } from 'ai';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { Tool, ToolContent } from '@/components/ai-elements/tool';
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import { Button } from '@/components/ui/button';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentDrafter } from '@/hooks/use-document-drafter';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useProjectScope } from '@/hooks/use-project-scope';
import { cn } from '@/lib/utils';
import type { PdfDocumentRecord } from '@/main/ipc/channels';

// ─── Starters ─────────────────────────────────────────────────────────────────

/**
 * Real documents, not marketing copy. Every prompt asks for the agent to leave
 * `[CONFIRM: …]` placeholders rather than invent statute numbers, figures or
 * party details — the behaviour the agent's instructions already require, made
 * explicit in the request so the user sees why it matters.
 */
const STARTERS: Array<{ icon: LucideIcon; label: string; prompt: string }> = [
  {
    icon: ScaleIcon,
    label: 'Letter of demand',
    prompt:
      'Draft a letter of demand to a client over unpaid invoices. State the amount owed, the dates, and what happens if it is not paid. Use a [CONFIRM: …] placeholder for any figure, date or address I have not given you, and list the open placeholders when you are done.',
  },
  {
    icon: LandmarkIcon,
    label: 'Formal complaint',
    prompt:
      'Draft a formal complaint: what happened, what it cost, what remedy I am asking for, and by when. Keep it factual and professional. Never invent dates, statutes or reference numbers — mark anything I have not confirmed as [CONFIRM: …].',
  },
  {
    icon: NotebookPenIcon,
    label: 'Client memo',
    prompt:
      'Draft a client memo on this project: what was asked, what I found, what I recommend, and what still needs their decision. Plain English, one page, no filler.',
  },
  {
    icon: FileSignatureIcon,
    label: 'Agreement summary',
    prompt:
      'Summarise the agreement as a plain-English memo: who is bound, the term, what each side owes, how it ends, and anything unusual. Quote clause numbers only where I have given you one.',
  },
  {
    icon: ListTreeIcon,
    label: 'Outline first',
    prompt:
      'Outline this first — section headings with one line of intent under each — and wait for my approval before you draft any prose.',
  },
];

// ─── Activity model ───────────────────────────────────────────────────────────

/** The six tools the drafter has. Anything else in the stream is not ours. */
type DrafterToolName =
  | 'createDocument'
  | 'readDocument'
  | 'getDocumentOutline'
  | 'appendBlocks'
  | 'insertBlocksAt'
  | 'replaceBlock';

const DRAFTER_TOOLS: readonly DrafterToolName[] = [
  'createDocument',
  'readDocument',
  'getDocumentOutline',
  'appendBlocks',
  'insertBlocksAt',
  'replaceBlock',
];

/**
 * Loosely-typed view of a `tool-*` UI part, matching MessageList's. Only the
 * fields this panel actually reads are declared — it reads `output`, never
 * `input`, because the ledger describes what landed, not what was requested.
 */
interface DrafterToolPart {
  toolCallId: string;
  toolName?: string;
  state?: string;
  output?: unknown;
  approval?: { id: string };
}

type ActivityStatus = 'running' | 'done' | 'failed' | 'skipped' | 'gated';

interface ActivityRow {
  key: string;
  status: ActivityStatus;
  label: string;
  detail?: string;
}

interface PendingApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  reason?: string;
}

interface DraftSummary {
  /** Mutations in call order. Reads are aggregated separately. */
  rows: ActivityRow[];
  readCount: number;
  /** True once any additive or destructive write has landed. */
  wrote: boolean;
  /** The document to hand off to, if we know of one. */
  handoff: { documentId: string; title: string } | null;
  pendingApproval: PendingApproval | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function statusOf(state: string | undefined): ActivityStatus {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return 'running';
    case 'output-error':
      return 'failed';
    case 'output-denied':
      return 'skipped';
    case 'approval-requested':
    case 'approval-responded':
      return 'gated';
    default:
      return 'done';
  }
}

/**
 * Read the conversation once and produce everything the panel needs to know
 * about the document: what it did, what it is doing, whether it needs a
 * decision, and which document to hand off.
 *
 * Reads are aggregated rather than listed — the agent reads a document several
 * times per turn and each of those is noise to a person reading a draft.
 */
function summariseDraft(messages: UIMessage[]): DraftSummary {
  const rows: ActivityRow[] = [];
  let readCount = 0;
  let wrote = false;
  let handoff: DraftSummary['handoff'] = null;
  let pendingApproval: PendingApproval | null = null;

  for (const message of messages) {
    for (const raw of message.parts) {
      if (!raw.type.startsWith('tool-')) continue;
      const part = raw as unknown as DrafterToolPart;
      if (typeof part.toolCallId !== 'string') continue;

      const toolName = part.toolName ?? '';
      if (!DRAFTER_TOOLS.includes(toolName as DrafterToolName)) continue;

      const status = statusOf(part.state);
      const out = asRecord(part.output);

      // Reads: counted, never listed.
      if (toolName === 'readDocument' || toolName === 'getDocumentOutline') {
        if (status === 'running') readCount += 1;
        continue;
      }

      if (
        part.state === 'approval-requested' &&
        part.approval?.id &&
        !pendingApproval
      ) {
        pendingApproval = {
          approvalId: part.approval.id,
          toolCallId: part.toolCallId,
          toolName,
          reason: asText(
            (part.approval as { requestReason?: unknown }).requestReason,
          ),
        };
      }

      const settled = status === 'done' || status === 'skipped';
      if (settled) wrote = true;

      switch (toolName) {
        case 'createDocument': {
          const id = asText(out?.documentId);
          const title = asText(out?.title) ?? 'Untitled document';
          const blocks = asCount(out?.blockCount);
          if (status === 'done' && id) handoff = { documentId: id, title };
          rows.push({
            key: part.toolCallId,
            status,
            label: `Created “${title}”`,
            detail: blocks !== undefined ? plural(blocks, 'block') : undefined,
          });
          break;
        }
        case 'appendBlocks': {
          const added = asCount(out?.added);
          rows.push({
            key: part.toolCallId,
            status,
            label: 'Appended blocks',
            detail: added !== undefined ? plural(added, 'block') : undefined,
          });
          break;
        }
        case 'insertBlocksAt': {
          const inserted = asCount(out?.inserted);
          const at = asCount(out?.insertedAt);
          rows.push({
            key: part.toolCallId,
            status,
            label: 'Inserted blocks',
            detail:
              inserted !== undefined
                ? `${plural(inserted, 'block')}${at !== undefined ? ` at ${at}` : ''}`
                : undefined,
          });
          break;
        }
        case 'replaceBlock': {
          const total = asCount(out?.totalBlocks);
          rows.push({
            key: part.toolCallId,
            status,
            label:
              status === 'skipped'
                ? 'Left a block unchanged'
                : status === 'gated'
                  ? 'Waiting to overwrite a block'
                  : 'Overwrote an existing block',
            detail:
              total !== undefined
                ? `${plural(total, 'block')} total`
                : undefined,
          });
          break;
        }
        default:
          break;
      }
    }
  }

  return { rows, readCount, wrote, handoff, pendingApproval };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DocumentDrafterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drafting inside this document rather than creating a new one. */
  documentId?: string;
  projectId?: string;
  /** Task the document is for. The agent reads it for intent, never writes to it. */
  taskId?: string;
  /** Shown in the context strip so the user can see what this is FOR. */
  taskTitle?: string;
  /** Auto-dispatched once when the sheet opens. */
  initialPrompt?: string;
  /** The handoff: the agent created a document, open it. */
  onDocumentCreated?: (documentId: string, title: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentDrafterSheet({
  open,
  onOpenChange,
  documentId,
  projectId,
  taskId,
  taskTitle,
  initialPrompt,
  onDocumentCreated,
}: DocumentDrafterSheetProps) {
  const navigate = useNavigate();
  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
    truncationNotice,
    clearTruncationNotice,
    plan,
  } = useDocumentDrafter({ documentId, projectId, taskId });

  const scope = useProjectScope();

  // The title of the document being drafted in place, refreshed on every
  // `documents:changed` so an in-place revision shows the live title.
  const [existingTitle, setExistingTitle] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const loadExistingTitle = useCallback(() => {
    if (!documentId) {
      setExistingTitle(null);
      return;
    }
    void window.electron.ipc
      .invoke<PdfDocumentRecord | null>('documents:get', { id: documentId })
      .then((record) => setExistingTitle(record?.title ?? null))
      .catch(() => setExistingTitle(null));
  }, [documentId]);

  useEffect(() => {
    if (open) loadExistingTitle();
  }, [open, loadExistingTitle]);

  // Main broadcasts this whenever the agent mutates a document. It is both the
  // "your draft is safe" signal and the cue to re-read a title, so the
  // dependency is the loader rather than a closed-over stale copy of it.
  useIpcEvent(
    'documents:changed',
    () => {
      setSavedAt(Date.now());
      loadExistingTitle();
    },
    [loadExistingTitle],
  );

  // Auto-dispatch the seeded prompt exactly once per distinct prompt, so a
  // re-render (or a re-open with the same seed) cannot double-fire a turn.
  const dispatchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !initialPrompt?.trim()) return;
    const text = initialPrompt.trim();
    if (dispatchedRef.current === text) return;
    dispatchedRef.current = text;
    sendMessage(text);
  }, [open, initialPrompt, sendMessage]);

  /**
   * Starting a new draft clears the truncation warning along with the
   * transcript. The warning belongs to a specific run and the document that run
   * was writing; leaving it over an empty conversation would be a claim about
   * a document that no longer exists on screen.
   *
   * (An approval response deliberately does NOT clear it — answering a gate
   * resumes the same half-finished draft, so the same warning is still true.)
   */
  const startNewDraft = useCallback(() => {
    clearTruncationNotice();
    clearMessages();
  }, [clearMessages, clearTruncationNotice]);

  const summary = useMemo(() => summariseDraft(messages), [messages]);
  const approval = summary.pendingApproval;

  const handoff = useMemo(() => {
    if (summary.handoff) return summary.handoff;
    // Revising in place: the document already exists, so the handoff is the
    // one we were pointed at, but only once we have actually changed it.
    if (documentId && summary.wrote) {
      return { documentId, title: existingTitle ?? 'this document' };
    }
    return null;
  }, [summary.handoff, summary.wrote, documentId, existingTitle]);

  const handleOpenDocument = useCallback(() => {
    if (!handoff) return;
    if (onDocumentCreated) {
      onDocumentCreated(handoff.documentId, handoff.title);
      return;
    }
    // No host callback: the editor route is the obvious fallback.
    navigate(`/documents/${handoff.documentId}`);
  }, [handoff, onDocumentCreated, navigate]);

  const effectiveProjectId = projectId ?? scope.activeProjectId;
  const projectLabel =
    scope.activeProjectId && scope.activeProjectId === effectiveProjectId
      ? scope.activeProjectName
      : null;

  const isStreaming = status === 'streaming';
  const showFirstPaint = messages.length === 0 && isStreaming;

  // ── Empty state: what this is, in four lines and five starters ──────────
  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-5 py-6 text-center select-none">
      <div className="rounded-xl border border-border/60 bg-card p-3 shadow-xs">
        <ScrollTextIcon className="size-5 text-primary" />
      </div>

      <div className="space-y-1.5">
        <h3 className="font-serif text-[15px] font-medium tracking-tight text-foreground">
          Draft it. Then read it.
        </h3>
        <p className="mx-auto max-w-[38ch] text-[11px] leading-relaxed text-muted-foreground">
          Describe the document you need — a letter of demand, a complaint, a
          client memo. The drafter works from this project&apos;s material and
          writes into your documents.
        </p>
      </div>

      {/* The one promise, stated once and not repeated all conversation. */}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80">
        <UserCheckIcon className="size-3.5 shrink-0" />
        <span>
          It cannot send, file or export anything. Every draft waits for you.
        </span>
      </p>

      <div className="w-full max-w-sm space-y-1.5 pt-1">
        <Suggestions>
          {STARTERS.map(({ icon: Icon, label, prompt }) => (
            <Suggestion
              key={label}
              suggestion={prompt}
              onClick={(text) => sendMessage(text)}
              title={prompt}
              variant="secondary"
              className="h-7 gap-1.5 bg-muted/40 px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-3.5 shrink-0 text-primary/70" />
              {label}
            </Suggestion>
          ))}
        </Suggestions>
      </div>
    </div>
  );

  // ── First paint: the turn has started but nothing has streamed yet ──────
  const firstPaint = (
    <div className="space-y-3 px-4 py-5" aria-live="polite">
      <Shimmer className="text-[11px] text-primary">
        Reading your project material, then drafting…
      </Shimmer>
      <div className="space-y-2 pt-1">
        <Skeleton className="h-2.5 w-2/5" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-4/5" />
        <Skeleton className="h-2.5 w-3/5" />
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 font-serif text-sm font-medium tracking-tight text-foreground">
              <PenLineIcon className="size-4 shrink-0 text-primary" />
              Document Drafter
            </SheetTitle>

            <div className="mr-6 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={startNewDraft}
                title="Start a new draft"
                disabled={messages.length === 0}
              >
                <PlusIcon className="size-3.5" />
                <span className="sr-only">Start a new draft</span>
              </Button>
            </div>
          </div>

          <SheetDescription className="text-[11px] leading-snug text-muted-foreground">
            Drafts agreements, notices and memos from your project material.
          </SheetDescription>

          {/* Context strip — one calm line, dashed so it reads as attached
              rather than filed. Never a wall of chips. */}
          {(taskTitle || existingTitle || documentId || projectLabel) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-dashed border-border/60 bg-muted/20 px-2 py-1 text-[11px]">
              {taskTitle && (
                <>
                  <span className="text-muted-foreground">Drafting for</span>
                  <span className="truncate font-medium text-foreground">
                    {taskTitle}
                  </span>
                </>
              )}
              {taskTitle && (existingTitle || projectLabel) && (
                <span className="text-muted-foreground/50">·</span>
              )}
              {existingTitle && (
                <>
                  <ScrollTextIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">
                    revising “{existingTitle}”
                  </span>
                </>
              )}
              {projectLabel && (
                <>
                  {(taskTitle || existingTitle) && (
                    <span className="text-muted-foreground/50">·</span>
                  )}
                  <span className="truncate text-muted-foreground">
                    {projectLabel}
                  </span>
                </>
              )}
            </div>
          )}
        </SheetHeader>

        {/* ── Conversation ─────────────────────────────────────────────────── */}
        <Conversation className="flex-1 overflow-hidden">
          <ConversationContent className="p-0">
            {plan && (
              <div className="sticky top-0 z-20 p-3 bg-background/80 backdrop-blur-xs border-b border-border/40">
                <PlanPanel
                  plan={plan}
                  isRunning={status === 'streaming'}
                  title="Drafter Plan"
                />
              </div>
            )}
            {showFirstPaint ? (
              firstPaint
            ) : (
              <MessageList
                messages={messages}
                status={status}
                error={error}
                onApproval={respondToApproval}
                emptyState={emptyState}
                onRetry={(text) => sendMessage(text)}
              />
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* ── Provider fallback ────────────────────────────────────────────── */}
        {fallbackNotice && (
          <div className="mx-3 mt-2 flex items-start justify-between gap-2 border-l-2 border-primary/50 bg-muted/30 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
            <span className="flex min-w-0 items-start gap-1.5">
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-primary" />
              <span>
                Drafting switched model —{' '}
                <strong className="font-medium text-foreground">
                  {fallbackNotice.fromModel}
                </strong>{' '}
                was unavailable, so{' '}
                <strong className="font-medium text-foreground">
                  {fallbackNotice.toModel}
                </strong>{' '}
                is writing this.{' '}
                <span className="text-muted-foreground/80">
                  A different model words clauses differently — read the whole
                  draft before relying on it.
                </span>
              </span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={dismissFallbackNotice}
            >
              <XIcon className="size-3" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        )}

        {/* ── Result handoff ──────────────────────────────────────────────── */}
        {handoff && (
          <div className="mx-3 mt-2 flex items-center justify-between gap-2 border border-border/60 bg-card px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <CircleCheckIcon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-serif text-xs text-foreground">
                  {handoff.title}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {savedAt
                    ? `Saved ${formatDistanceToNow(savedAt, { addSuffix: true })}`
                    : 'Draft written to your documents'}
                </p>
              </div>
            </div>
            <Button size="xs" onClick={handleOpenDocument} className="shrink-0">
              Open in editor
              <ArrowUpRightIcon />
            </Button>
          </div>
        )}

        {/* ── Draft ledger ────────────────────────────────────────────────── */}
        {summary.rows.length > 0 && (
          <Tool className="mt-2 mb-0 rounded-none border-0 border-t border-border/60">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
              <ScrollTextIcon className="size-3.5 shrink-0" />
              <span className="font-medium text-foreground">
                Draft activity
              </span>
              <span className="truncate">
                {plural(summary.rows.length, 'step')}
                {summary.readCount > 0
                  ? ` · ${plural(summary.readCount, 'read')}`
                  : ''}
              </span>
              <ChevronRightIcon className="ml-auto size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
            <ToolContent className="space-y-1 border-t border-border/40 px-3 py-2">
              {summary.rows.map((row) => (
                <ActivityLine key={row.key} row={row} />
              ))}
            </ToolContent>
          </Tool>
        )}

        {/* ── Truncated ───────────────────────────────────────────────────── */}
        {/*
          Placement: directly under the handoff card and directly above the
          approval bar. That makes a tight cluster in the reading order —
          "here is the document / it is incomplete / here is the decision you
          owe it" — so the caveat is never separated from the thing it is a
          caveat about. It sits in the pinned region, not the transcript: a
          truncated run ends with `stream-done`, so there is nothing further to
          scroll to and the warning would otherwise be buried under the very
          prose it is warning about.
        */}
        {truncationNotice && (
          <div
            role="status"
            className="mt-2 border-l-2 border-primary bg-primary/[0.06] px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <TriangleAlertIcon className="mt-px size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    This draft is incomplete
                  </p>
                  {/* Mono because these are diagnostics, not prose. */}
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-primary">
                    {truncationNotice.steps} / {truncationNotice.budget} steps
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  The drafter ran out of steps and stopped partway through, so
                  sections may be missing or end mid-sentence. Everything it did
                  write is saved — read what is there before relying on it, then
                  ask it to continue.
                </p>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                className="mt-px shrink-0 text-muted-foreground hover:text-foreground"
                onClick={clearTruncationNotice}
              >
                <XIcon className="size-3" />
                <span className="sr-only">Dismiss incomplete-draft notice</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── Approval ─────────────────────────────────────────────────────── */}
        {approval && (
          <div className="mt-2 border-l-2 border-destructive bg-destructive/[0.06] px-3 py-2">
            <div className="flex items-start gap-2">
              <ShieldAlertIcon className="mt-px size-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">
                  This will change existing work
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {approval.reason ??
                    `${approval.toolName} overwrites text that is already in the document. The current wording is not kept.`}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  respondToApproval({
                    approvalId: approval.approvalId,
                    toolCallId: approval.toolCallId,
                    approved: false,
                  })
                }
              >
                Keep current text
              </Button>
              <Button
                size="xs"
                variant="destructive"
                onClick={() =>
                  respondToApproval({
                    approvalId: approval.approvalId,
                    toolCallId: approval.toolCallId,
                    approved: true,
                  })
                }
              >
                <CheckIcon />
                Approve the change
              </Button>
            </div>
          </div>
        )}

        {/*
          Turn failure. Deliberately worded as the PAIR to the truncation
          notice above: same reassurance ("what is written is saved"), same
          instruction ("read it through"), different cause. A crashed run has
          no step count to report, so it says nothing about numbers — and it
          uses `destructive` where truncation uses `primary`, because one is a
          fault and the other is a budget.
        */}
        {error && (
          <div
            role="status"
            className="mt-2 flex items-start gap-2 border-l-2 border-destructive bg-destructive/[0.06] px-3 py-2"
          >
            <CircleXIcon className="mt-px size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                The turn failed partway
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                The draft may be incomplete. Everything written before the
                failure is saved — read it through, then ask for the rest.
              </p>
            </div>
          </div>
        )}

        {/* ── Composer ────────────────────────────────────────────────────── */}
        <div className="mt-auto border-t border-border/60 p-3">
          <PromptInput
            onSubmit={({ text }) => {
              const value = text.trim();
              if (value) sendMessage(value);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Describe the document you need, or what to change…"
                className="min-h-12 text-xs"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="truncate text-[10px] text-muted-foreground/70">
                  Drafts are reviewed by you
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={startNewDraft}
                  disabled={messages.length === 0}
                >
                  Clear
                </Button>
              </PromptInputTools>
              <PromptInputSubmit status={status} disabled={isStreaming} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<ActivityStatus, LucideIcon> = {
  running: Loader2Icon,
  done: CircleCheckIcon,
  failed: CircleXIcon,
  skipped: MinusCircleIcon,
  gated: ShieldAlertIcon,
};

const STATUS_TONE: Record<ActivityStatus, string> = {
  running: 'animate-spin text-primary',
  // A landed mutation is a settled fact, not an event: quiet, not celebratory.
  done: 'text-primary/70',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground',
  gated: 'text-destructive',
};

/** One ledger line. Successful mutations read as quiet, confident facts. */
function ActivityLine({ row }: { row: ActivityRow }) {
  const Icon = STATUS_ICON[row.status];
  return (
    <div className="flex items-start gap-2 text-[11px] leading-snug">
      <Icon className={cn('mt-px size-3 shrink-0', STATUS_TONE[row.status])} />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {row.label}
      </span>
      {row.detail && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {row.detail}
        </span>
      )}
    </div>
  );
}
