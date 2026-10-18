/**
 * components/correspondence/MessageComposer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compose one item, pick the bodies it goes to, and decide what to watch for.
 *
 * THE THREE DECISIONS THIS SCREEN MAKES THE USER MAKE
 *   1. **What it is.** A subject, a body, and which documents go with it.
 *   2. **Who it goes to, and by which channel.** Every recipient carries its own way
 *      of being reached, because one letter to seven bodies is not seven of the same
 *      thing: one has an email, one has a postal address, one only accepts a portal
 *      submission. Selecting a contact with no channel is allowed and recorded as a
 *      logged/manual send — that is the phone-call and hand-delivery reality of the
 *      founding use case, not an edge case.
 *   3. **What clock starts.** The deadline class is three buttons with the
 *      consequence written underneath, not a dropdown labelled "type": a statutory
 *      window and a follow-up nudge are different promises, and the window days are
 *      an explicit number the user can change.
 *
 * WHAT IT DOES NOT DO
 * It does not send anything. "Record as sent" is the honest verb — it writes the
 * date, starts each recipient's clock, and states in the UI that the actual sending
 * is the user's. That is decision D2 held at the UI layer, and it is why a press of
 * this button on a legal letter is safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import {
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  SendIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABELS,
  DEADLINE_CLASSES,
  DEADLINE_DESCRIPTIONS,
  DEADLINE_LABELS,
  DEFAULT_RESPONSE_DAYS,
  addDays,
  type ContactChannelKind,
  type DeadlineClass,
} from '@/lib/correspondence';
import type { RecipientPick } from '@/main/ipc/channels';
import { useContacts, useMessageActions } from '@/hooks/use-correspondence';

interface DocumentOption {
  id: string;
  title: string;
}

export interface MessageComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  /** Prefilled when arriving from a document's "Send this…" action. */
  initialDocumentId?: string | null;
  initialSubject?: string;
}

export function MessageComposer({
  open,
  onOpenChange,
  projectId,
  initialDocumentId = null,
  initialSubject = '',
}: MessageComposerProps) {
  const { contacts } = useContacts(projectId);
  const actions = useMessageActions();

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState<
    Record<string, { channelId: string | null; channelKind: ContactChannelKind }>
  >({});
  const [attachments, setAttachments] = useState<string[]>(
    initialDocumentId ? [initialDocumentId] : [],
  );
  const [deadlineClass, setDeadlineClass] = useState<DeadlineClass>('statutory');
  const [windowDays, setWindowDays] = useState(
    DEFAULT_RESPONSE_DAYS.statutory,
  );
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [busy, setBusy] = useState<'draft' | 'sent' | null>(null);

  // Documents for the attachment picker. Read on open, not cached: `documents:changed`
  // is the only invalidation for that store and a composer is short-lived.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const list = await window.electron.ipc.invoke<DocumentOption[]>(
          'documents:list',
          { projectId },
        );
        if (cancelled) return;
        const documents = Array.isArray(list) ? list : [];
        setDocuments(documents);
        // Arriving from "Send this…": name the message after the document it
        // carries. Only while the subject is still untouched, so it is a default
        // rather than something that overwrites what the user typed.
        if (initialDocumentId) {
          const attached = documents.find(
            (candidate) => candidate.id === initialDocumentId,
          );
          if (attached?.title) {
            setSubject((previous) =>
              previous.trim() ? previous : attached.title,
            );
          }
        }
      } catch {
        if (!cancelled) setDocuments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, initialDocumentId]);

  // The pre-attached document is added, never forced: the composer keeps whatever
  // the user had already put together when they reopen it.
  useEffect(() => {
    if (!open || !initialDocumentId) return;
    setAttachments((previous) =>
      previous.includes(initialDocumentId)
        ? previous
        : [...previous, initialDocumentId],
    );
  }, [open, initialDocumentId]);

  // The clock choices reset on every open (they are about this send, not a draft),
  // while a supplied subject only fills a blank — an in-progress draft survives the
  // sheet being closed to go and look something up.
  useEffect(() => {
    if (!open) return;
    setDeadlineClass('statutory');
    setWindowDays(DEFAULT_RESPONSE_DAYS.statutory);
    if (initialSubject) {
      setSubject((previous) => (previous.trim() ? previous : initialSubject));
    }
  }, [open, initialSubject]);

  const picks: RecipientPick[] = useMemo(
    () =>
      Object.entries(selected).map(([contactId, pick]) => ({
        contactId,
        channelId: pick.channelId,
        channelKind: pick.channelKind,
      })),
    [selected],
  );

  const duePreview = new Date(
    addDays(Math.floor(Date.now() / 1000), windowDays) * 1000,
  ).toLocaleDateString();

  const toggleContact = (contactId: string, channels: Array<{ id: string; kind: ContactChannelKind }>) => {
    setSelected((previous) => {
      const next = { ...previous };
      if (next[contactId]) {
        delete next[contactId];
        return next;
      }
      // Default to the first channel this contact actually has; a contact with none
      // is selectable and recorded as a manual send.
      const first = channels[0];
      next[contactId] = {
        channelId: first?.id ?? null,
        channelKind: first?.kind ?? 'manual',
      };
      return next;
    });
  };

  const reset = () => {
    setSubject('');
    setBody('');
    setSelected({});
    setAttachments([]);
  };

  /** Persist the message, then either leave it queued or start the clocks. */
  const submit = async (mode: 'draft' | 'sent') => {
    if (!subject.trim() && !body.trim()) return;
    setBusy(mode);
    try {
      const message = await actions.save({
        projectId,
        subject: subject.trim(),
        body,
        attachments: attachments.map((id) => ({
          kind: 'document' as const,
          documentId: id,
          label: documents.find((doc) => doc.id === id)?.title ?? '',
        })),
      });

      const withRecipients = await actions.setRecipients(message.id, picks);

      if (mode === 'sent') {
        const queuedIds = withRecipients.recipients
          .filter((recipient) => recipient.dispatch_state === 'queued')
          .map((recipient) => recipient.id);
        await actions.dispatch({
          messageId: message.id,
          recipientIds: queuedIds,
          deadlineClass,
          windowDays,
        });
      }

      reset();
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <SendIcon className="size-4 shrink-0 text-primary" />
            Compose
          </SheetTitle>
          <SheetDescription className="text-[11px] leading-snug text-muted-foreground">
            One item, many recipients, each with its own clock. Recording it as sent
            starts those clocks — it does not deliver anything for you.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            {/* ── What ─────────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject — Letter of demand, CCMA referral, status query…"
                aria-label="Subject"
                className="h-7 text-xs"
              />
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What are you telling them? Or attach a document you already wrote and keep this short."
                aria-label="Body"
                className="min-h-32 text-xs"
              />
            </div>

            {/* ── Attachments ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium">Going with it</p>
              {documents.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No documents in this project yet. Compose it in Documents first and
                  attach it here.
                </p>
              ) : (
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {documents.map((document) => {
                    const active = attachments.includes(document.id);
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() =>
                          setAttachments((previous) =>
                            active
                              ? previous.filter((id) => id !== document.id)
                              : [...previous, document.id],
                          )
                        }
                        className={cn(
                          'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                          active
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border/60 hover:bg-muted/50',
                        )}
                      >
                        <FileTextIcon className="size-3" />
                        <span className="max-w-48 truncate">
                          {document.title || 'Untitled'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Who ──────────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium">
                Going to{' '}
                <span className="font-normal text-muted-foreground">
                  {picks.length === 0
                    ? 'nobody yet'
                    : `${picks.length} recipient${picks.length === 1 ? '' : 's'}`}
                </span>
              </p>

              {contacts.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No contacts yet — harvest them first, then compose.
                </p>
              )}

              <ul className="flex flex-col gap-1">
                {contacts.map((contact) => {
                  const pick = selected[contact.id];
                  return (
                    <li
                      key={contact.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2 py-1.5',
                        pick ? 'border-primary/40 bg-primary/5' : 'border-border/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(pick)}
                        onChange={() =>
                          toggleContact(
                            contact.id,
                            contact.channels.map((channel) => ({
                              id: channel.id,
                              kind: channel.kind,
                            })),
                          )
                        }
                        aria-label={`Send to ${contact.name}`}
                        className="size-3.5 shrink-0"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">
                          {contact.name}
                        </span>
                        {contact.channels.length === 0 && (
                          <span className="block text-[11px] text-muted-foreground">
                            No address on file — recorded as a manual send
                          </span>
                        )}
                      </span>

                      {pick && contact.channels.length > 0 && (
                        <NativeSelect
                          size="sm"
                          className="w-44 shrink-0"
                          value={pick.channelId ?? ''}
                          aria-label={`Channel for ${contact.name}`}
                          onChange={(event) => {
                            const channel = contact.channels.find(
                              (candidate) => candidate.id === event.target.value,
                            );
                            if (!channel) return;
                            setSelected((previous) => ({
                              ...previous,
                              [contact.id]: {
                                channelId: channel.id,
                                channelKind: channel.kind,
                              },
                            }));
                          }}
                        >
                          {contact.channels.map((channel) => (
                            <NativeSelectOption key={channel.id} value={channel.id}>
                              {CHANNEL_LABELS[channel.kind]}: {channel.value}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ── What clock starts ────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium">What happens if they stay quiet</p>
              <div className="flex gap-1.5">
                {DEADLINE_CLASSES.map((option) => (
                  <Button
                    key={option}
                    variant={deadlineClass === option ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-7 flex-1 text-xs',
                      deadlineClass !== option && 'text-muted-foreground',
                    )}
                    onClick={() => {
                      setDeadlineClass(option);
                      setWindowDays(DEFAULT_RESPONSE_DAYS[option]);
                    }}
                  >
                    {DEADLINE_LABELS[option]}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {DEADLINE_DESCRIPTIONS[deadlineClass]}
              </p>

              <div className="flex items-center gap-2">
                <label
                  className="text-[11px] text-muted-foreground"
                  htmlFor="composer-window"
                >
                  Reply expected within
                </label>
                <Input
                  id="composer-window"
                  type="number"
                  min={1}
                  max={365}
                  value={windowDays}
                  onChange={(event) =>
                    setWindowDays(Math.max(1, Number(event.target.value) || 1))
                  }
                  className="h-7 w-16 text-xs"
                />
                <span className="text-[11px] text-muted-foreground">
                  days — clocks close {duePreview}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground">
                The date is stored, not the duration, so it still means the same
                thing if Qeda is closed for a week.
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <MailIcon className="size-2.5" />
            Qeda does not send this
          </Badge>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              disabled={busy !== null || (!subject.trim() && !body.trim())}
              onClick={() => void submit('draft')}
            >
              {busy === 'draft' && <Loader2Icon className="size-3.5 animate-spin" />}
              Save queued
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={busy !== null || (!subject.trim() && !body.trim())}
              onClick={() => void submit('sent')}
            >
              {busy === 'sent' ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SendIcon className="size-3.5" />
              )}
              Record as sent
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
