/**
 * hooks/use-correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side state and transport for the Correspondence system.
 *
 * READS GO THROUGH `useDbResource`, WRITES DO NOT
 * Every read here is a `useDbResource` subscription, which is what makes the
 * invalidation impossible to forget: main broadcasts `correspondence:changed`
 * after any mutation, the resource refetches, and the UI cannot silently disagree
 * with the database. Writes are plain invokes that deliberately do NOT patch local
 * state — the database is authoritative, and a local write would create a second
 * source of truth that drifts the first time an import merges instead of creates.
 *
 * WHY SCOPING IS FILTERED HERE
 * `useDbResource` is contracted to `req: void | {}` channels, and the registry list
 * is one read for the whole app rather than one per project. So the hook loads the
 * registry once and applies the project lens in memory. That is also why the
 * project scope fetches on scope change only through the filter: switching scopes
 * is instant, and the registry is small by nature (tens of bodies, not millions).
 *
 * HARVEST IS A THREE-STEP FLOW, SO IT LIVES IN ITS OWN HOOK
 * scan → review → import. The scan is read-only, the review is local state, and
 * only the import writes. `useHarvest` owns exactly that sequence so a component
 * never has to remember which of the three steps is allowed to mutate anything.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDbResource } from './use-db-resource';
import type {
  AdvanceResult,
  AttentionRow,
  ChannelVerification,
  ContactChannel,
  ContactChannelKind,
  ContactKind,
  ContactSource,
  ContactWithChannels,
  CorrespondenceEvent,
  DispatchInput,
  EscalationResult,
  HarvestImportResult,
  HarvestRowDraft,
  HarvestScanResult,
  MessageDetail,
  MessageSummary,
  Notebook,
  Page,
  RecipientPatch,
  RecipientPick,
  RecipientWithContact,
  SaveMessageInput,
  Sequence,
  SequenceDetail,
  SequenceRunDetail,
} from '@/main/ipc/channels';

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface ContactMutationInput {
  id?: string;
  projectId?: string | null;
  kind?: ContactKind;
  name: string;
  role?: string;
  parentId?: string | null;
  notes?: string;
}

export interface ChannelMutationInput {
  id?: string;
  contactId: string;
  kind: ContactChannelKind;
  value: string;
  label?: string;
  source?: ContactSource;
  confidence?: number | null;
}

export interface UseContacts {
  /** The registry as the current project lens sees it. */
  contacts: ContactWithChannels[];
  /** Every contact, regardless of scope — used for duplicate warnings. */
  all: ContactWithChannels[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveContact: (input: ContactMutationInput) => Promise<ContactWithChannels>;
  deleteContact: (id: string) => Promise<boolean>;
  saveChannel: (input: ChannelMutationInput) => Promise<ContactChannel>;
  deleteChannel: (id: string) => Promise<boolean>;
  setChannelVerified: (
    id: string,
    verified: ChannelVerification,
  ) => Promise<ContactChannel | null>;
}

export function useContacts(projectId: string | null): UseContacts {
  const { data, loading, error, refresh } = useDbResource<ContactWithChannels[]>(
    {
      channel: 'correspondence:contacts-list',
      event: 'correspondence:changed',
      select: (raw) => (Array.isArray(raw) ? (raw as ContactWithChannels[]) : []),
    },
  );

  const all = data ?? [];

  const contacts = useMemo(
    () =>
      projectId
        ? all.filter((contact) => contact.project_id === projectId)
        : all,
    [all, projectId],
  );

  const saveContact = useCallback(
    (input: ContactMutationInput) =>
      window.electron.ipc.invoke<ContactWithChannels>(
        'correspondence:contact-save',
        input,
      ),
    [],
  );

  const deleteContact = useCallback(
    (id: string) =>
      window.electron.ipc.invoke<boolean>('correspondence:contact-delete', { id }),
    [],
  );

  const saveChannel = useCallback(
    (input: ChannelMutationInput) =>
      window.electron.ipc.invoke<ContactChannel>(
        'correspondence:channel-save',
        input,
      ),
    [],
  );

  const deleteChannel = useCallback(
    (id: string) =>
      window.electron.ipc.invoke<boolean>('correspondence:channel-delete', { id }),
    [],
  );

  const setChannelVerified = useCallback(
    (id: string, verified: ChannelVerification) =>
      window.electron.ipc.invoke<ContactChannel | null>(
        'correspondence:channel-set-verified',
        { id, verified },
      ),
    [],
  );

  return {
    contacts,
    all,
    loading,
    error,
    refresh,
    saveContact,
    deleteContact,
    saveChannel,
    deleteChannel,
    setChannelVerified,
  };
}

/** Registry totals for the header readout. */
export function useCorrespondenceCounts(projectId: string | null) {
  return useDbResource<{ contacts: number; channels: number; unverified: number }>(
    {
      channel: 'correspondence:counts',
      event: 'correspondence:changed',
      resourceKey: projectId ?? 'all',
      select: (raw) =>
        (raw as { contacts: number; channels: number; unverified: number }) ?? {
          contacts: 0,
          channels: 0,
          unverified: 0,
        },
    },
  );
}

// ─── Messages and attention ───────────────────────────────────────────────────

/**
 * The board's only read: everything waiting on the user, most urgent first.
 *
 * Ranked in main (`lib/correspondence.ts`) rather than here, so the board and the
 * Deadline Rail — and any future background runner — cannot disagree about what
 * "overdue" means. The scope is applied client-side for the same reason the
 * registry is: `useDbResource` reads `req: void` channels, and a per-project
 * refetch would make switching scopes a round trip for a list this small.
 */
export function useAttention(projectId: string | null) {
  const resource = useDbResource<AttentionRow[]>({
    channel: 'correspondence:attention-list',
    event: 'correspondence:changed',
    select: (raw) => (Array.isArray(raw) ? (raw as AttentionRow[]) : []),
  });

  const items = useMemo(
    () =>
      projectId
        ? (resource.data ?? []).filter(
            (row) => row.recipient.project_id === projectId,
          )
        : (resource.data ?? []),
    [resource.data, projectId],
  );

  return { items, loading: resource.loading, error: resource.error };
}

/**
 * Every running deadline for the rail, including comfortable ones.
 *
 * The rail shows the whole situation rather than only the parts needing a decision,
 * which is why this is a separate read from `useAttention`.
 */
export function useLiveClocks(projectId: string | null) {
  const resource = useDbResource<RecipientWithContact[]>({
    channel: 'correspondence:clocks',
    event: 'correspondence:changed',
    select: (raw) => (Array.isArray(raw) ? (raw as RecipientWithContact[]) : []),
  });

  const clocks = useMemo(
    () =>
      projectId
        ? (resource.data ?? []).filter((row) => row.project_id === projectId)
        : (resource.data ?? []),
    [resource.data, projectId],
  );

  return { clocks, loading: resource.loading };
}

/** Sent and logged items, with the counts the list renders. */
export function useMessages(projectId: string | null) {
  const resource = useDbResource<MessageSummary[]>({
    channel: 'correspondence:messages-list',
    event: 'correspondence:changed',
    select: (raw) => (Array.isArray(raw) ? (raw as MessageSummary[]) : []),
  });

  const messages = useMemo(
    () =>
      projectId
        ? (resource.data ?? []).filter(
            (message) => message.project_id === projectId,
          )
        : (resource.data ?? []),
    [resource.data, projectId],
  );

  return { messages, loading: resource.loading, error: resource.error };
}

/** Header totals for the current scope. */
export function useMessageCounts(projectId: string | null) {
  const resource = useDbResource<{
    messages: number;
    awaiting: number;
    overdue: number;
    nextDueAt: number | null;
  }>({
    channel: 'correspondence:message-counts',
    event: 'correspondence:changed',
    resourceKey: projectId ?? 'all',
    select: (raw) =>
      (raw as {
        messages: number;
        awaiting: number;
        overdue: number;
        nextDueAt: number | null;
      }) ?? { messages: 0, awaiting: 0, overdue: 0, nextDueAt: null },
  });

  return { counts: resource.data, loading: resource.loading };
}

/**
 * One message, with its recipients, attachments and event trail.
 *
 * Not `useDbResource`: that hook reads `req: void` channels, and this read is
 * identified by an id. The shape mirrors `usePageDetail` — invoke on id change,
 * reload on the change broadcast — so a dispatch or a logged reply lands here
 * without the caller refetching by hand.
 */
export function useMessageDetail(messageId: string | null) {
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await window.electron.ipc.invoke<MessageDetail | null>(
        'correspondence:message-get',
        { id },
      );
      setDetail(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!messageId) {
      setDetail(null);
      return undefined;
    }
    void reload(messageId);
    return window.electron.ipc.on('correspondence:changed', () => {
      void reload(messageId);
    });
  }, [messageId, reload]);

  return { detail, loading, reload };
}

/**
 * Every write in the correspondence system, in one place.
 *
 * They deliberately do not patch local state: the database is authoritative and
 * main broadcasts `correspondence:changed` after each of these, which is what the
 * read hooks subscribe to. A local write would create a second source of truth that
 * drifts the first time an import merges instead of creating.
 */
export function useMessageActions() {
  const save = useCallback(
    (input: SaveMessageInput) =>
      window.electron.ipc.invoke<MessageDetail>(
        'correspondence:message-save',
        input,
      ),
    [],
  );

  const setRecipients = useCallback(
    (messageId: string, picks: RecipientPick[]) =>
      window.electron.ipc.invoke<MessageDetail>(
        'correspondence:message-set-recipients',
        { messageId, picks },
      ),
    [],
  );

  const dispatch = useCallback(
    (input: DispatchInput) =>
      window.electron.ipc.invoke<MessageDetail>(
        'correspondence:message-dispatch',
        input,
      ),
    [],
  );

  const updateRecipient = useCallback(
    (id: string, patch: RecipientPatch) =>
      window.electron.ipc.invoke<RecipientWithContact | null>(
        'correspondence:recipient-update',
        { id, patch },
      ),
    [],
  );

  const deleteMessage = useCallback(
    (id: string) =>
      window.electron.ipc.invoke<boolean>('correspondence:message-delete', { id }),
    [],
  );

  /**
   * Create one chase task per recipient that went quiet. Idempotent in main, so a
   * double-click cannot produce two tasks for the same body.
   */
  const escalate = useCallback(
    (recipientIds: string[], dueInDays?: number) =>
      window.electron.ipc.invoke<EscalationResult>(
        'correspondence:recipient-escalate',
        { recipientIds, dueInDays },
      ),
    [],
  );

  return {
    save,
    setRecipients,
    dispatch,
    updateRecipient,
    deleteMessage,
    escalate,
  };
}

/**
 * One recipient's history, loaded on demand.
 *
 * Read lazily rather than with the lane: most lanes are never expanded, and the log
 * for a long-running dispute can be long. Reloads on the change broadcast so an
 * action taken from the lane appears in its own trail immediately.
 */
export function useRecipientEvents(recipientId: string | null) {
  const [events, setEvents] = useState<CorrespondenceEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recipientId) {
      setEvents([]);
      return undefined;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await window.electron.ipc.invoke<CorrespondenceEvent[]>(
          'correspondence:recipient-events',
          { id: recipientId },
        );
        if (!cancelled) setEvents(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const unsubscribe = window.electron.ipc.on('correspondence:changed', () => {
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recipientId]);

  return { events, loading };
}

// ─── Sequences ────────────────────────────────────────────────────────────────

/** Plans defined for the scope. */
export function useSequences(projectId: string | null) {
  const resource = useDbResource<Sequence[]>({
    channel: 'correspondence:sequences-list',
    event: 'correspondence:changed',
    select: (raw) => (Array.isArray(raw) ? (raw as Sequence[]) : []),
  });

  const sequences = useMemo(
    () =>
      projectId
        ? (resource.data ?? []).filter((s) => s.project_id === projectId)
        : (resource.data ?? []),
    [resource.data, projectId],
  );

  return { sequences, loading: resource.loading };
}

/**
 * The plans attached to one message, with their step outlooks.
 *
 * Loaded per expanded message rather than preloaded for every message in the log:
 * a run's analysis needs its steps and step-runs, and the sent log is mostly history
 * nobody expands.
 */
export function useMessageRuns(messageId: string | null) {
  const [runs, setRuns] = useState<SequenceRunDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!messageId) {
      setRuns([]);
      return undefined;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await window.electron.ipc.invoke<SequenceRunDetail[]>(
          'correspondence:sequence-runs-for-message',
          { messageId },
        );
        if (!cancelled) setRuns(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const unsubscribe = window.electron.ipc.on('correspondence:changed', () => {
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [messageId]);

  return { runs, loading };
}

/** Plans whose window elapsed while the app was closed — read once per launch. */
export function useStalledRuns(projectId: string | null) {
  const resource = useDbResource<SequenceRunDetail[]>({
    channel: 'correspondence:sequence-stalled',
    event: 'correspondence:changed',
    select: (raw) => (Array.isArray(raw) ? (raw as SequenceRunDetail[]) : []),
  });

  const stalled = useMemo(
    () =>
      projectId
        ? (resource.data ?? []).filter(
            (detail) => detail.run.project_id === projectId,
          )
        : (resource.data ?? []),
    [resource.data, projectId],
  );

  return { stalled, loading: resource.loading };
}

/** Plan writes. Same rule as everything else here: no local state patching. */
export function useSequenceActions() {
  const create = useCallback(
    (input: {
      projectId?: string | null;
      name: string;
      description?: string;
      steps: Array<{
        kind: 'wait' | 'branch' | 'escalate' | 'task' | 'stop';
        title: string;
        config?: Record<string, unknown>;
      }>;
    }) =>
      window.electron.ipc.invoke<SequenceDetail>(
        'correspondence:sequence-create',
        input,
      ),
    [],
  );

  const start = useCallback(
    (sequenceId: string, messageId: string, projectId: string | null) =>
      window.electron.ipc.invoke<SequenceRunDetail>(
        'correspondence:sequence-start',
        { sequenceId, messageId, projectId },
      ),
    [],
  );

  /**
   * Fire exactly the named step. Omit the id to ask where the plan stands without
   * moving it — the runner fires nothing on its own.
   */
  const advance = useCallback(
    (runId: string, fireStepId?: string) =>
      window.electron.ipc.invoke<AdvanceResult>(
        'correspondence:sequence-advance',
        { runId, fireStepId },
      ),
    [],
  );

  const stop = useCallback(
    (runId: string) =>
      window.electron.ipc.invoke<void>('correspondence:sequence-stop', { runId }),
    [],
  );

  return { create, start, advance, stop };
}

// ─── Harvest ──────────────────────────────────────────────────────────────────

export type HarvestSourceRequest =
  | { kind: 'page'; pageId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'text'; text: string; label?: string };

export interface UseHarvest {
  scanning: boolean;
  /** The last scan, held until the user imports it or discards it. */
  scan: HarvestScanResult | null;
  /** Set when the scan call itself failed (bad source, no such page). */
  error: string | null;
  importing: boolean;
  runScan: (
    source: HarvestSourceRequest,
    projectId: string | null,
    useAgent?: boolean,
  ) => Promise<HarvestScanResult | null>;
  /**
   * Import a grid. Takes the *edited* rows, so the review step cannot be skipped
   * by calling this with the scan's own output — the caller has to have one.
   */
  importRows: (
    projectId: string | null,
    rows: HarvestRowDraft[],
  ) => Promise<HarvestImportResult | null>;
  reset: () => void;
}

export function useHarvest(): UseHarvest {
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<HarvestScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const runScan = useCallback(
    async (
      source: HarvestSourceRequest,
      projectId: string | null,
      useAgent = true,
    ) => {
      setScanning(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<HarvestScanResult>(
          'correspondence:harvest-scan',
          { source, projectId, useAgent },
        );
        setScan(result);
        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not read that source',
        );
        setScan(null);
        return null;
      } finally {
        setScanning(false);
      }
    },
    [],
  );

  const importRows = useCallback(
    async (projectId: string | null, rows: HarvestRowDraft[]) => {
      setImporting(true);
      try {
        return await window.electron.ipc.invoke<HarvestImportResult>(
          'correspondence:harvest-import',
          { projectId, rows },
        );
      } finally {
        setImporting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setScan(null);
    setError(null);
  }, []);

  return { scanning, scan, error, importing, runScan, importRows, reset };
}

// ─── Harvest sources ──────────────────────────────────────────────────────────

export interface PageSourceOption {
  page: Page;
  notebookTitle: string;
}

export interface HarvestSources {
  loading: boolean;
  pages: PageSourceOption[];
  documentTitles: Array<{ id: string; title: string }>;
}

/**
 * The things Harvest can read.
 *
 * Loaded fresh each time the picker opens rather than cached: the knowledge layer
 * broadcasts no change event (its handlers take no window), and a short-lived
 * dialog that reads once on open cannot go stale in a way the user would notice —
 * the same reasoning `ProjectDialog` uses for its notebook list.
 */
export function useHarvestSources(enabled: boolean): HarvestSources {
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<PageSourceOption[]>([]);
  const [documentTitles, setDocumentTitles] = useState<
    Array<{ id: string; title: string }>
  >([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [notebooks, allPages, documents] = await Promise.all([
          window.electron.ipc.invoke<Notebook[]>('notebooks:list'),
          window.electron.ipc.invoke<Page[]>('pages:list', {}),
          window.electron.ipc.invoke<Array<{ id: string; title: string }>>(
            'documents:list',
          ),
        ]);
        if (cancelled) return;

        const titleById = new Map(notebooks.map((n) => [n.id, n.title]));
        setPages(
          allPages.map((page) => ({
            page,
            notebookTitle: titleById.get(page.notebook_id) ?? 'Notebook',
          })),
        );
        setDocumentTitles(
          documents.map((doc) => ({ id: doc.id, title: doc.title })),
        );
      } catch {
        // Best-effort: the picker falls back to pasting text, which needs no read.
        if (!cancelled) {
          setPages([]);
          setDocumentTitles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { loading, pages, documentTitles };
}
