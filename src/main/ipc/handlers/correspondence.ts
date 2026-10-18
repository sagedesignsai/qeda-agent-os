/**
 * ipc/handlers/correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC for the Correspondence system: the contact registry, and Harvest — the
 * extraction path that decides whether anyone ever gets past the first screen.
 *
 * WHY HARVEST IS TWO PASSES
 * Harvest is the one place in this system where a model does real work, and it is
 * deliberately the *second* pass. `lib/harvest.ts` reads the source with no model
 * involved, so its output can only contain text that is actually there. The model
 * then runs on top and may only ADD — a value the text already contained is never
 * replaced — and everything it contributes is flagged `inferred` so the review
 * grid marks it as a guess.
 *
 * A model that is unconfigured, rate-limited or wrong therefore degrades Harvest
 * to "less thorough" rather than to "invented". That is why the model failure is
 * caught and reported in `agentError` while the deterministic scan is still
 * returned, and why nothing here writes to the database: the only write path is
 * `harvest-import`, and its input is the user's edited grid.
 *
 * NOTE ON SCOPE: there is no send channel, by design (see the contract in
 * `ipc/channels.ts`). v1 records intent; delivery is Phase 6.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  contactCounts,
  deleteChannel,
  deleteContact,
  importHarvestRows,
  listContacts,
  saveChannel,
  saveContact,
  setChannelVerified,
} from '../../db/correspondence.js';
import {
  deleteMessage,
  dispatchMessage,
  escalateRecipients,
  getMessageDetail,
  listRecipientEvents,
  listAttention,
  listLiveClocks,
  listMessages,
  messageCounts,
  saveMessage,
  setMessageRecipients,
  updateRecipient,
} from '../../db/messages.js';
import {
  advanceRun,
  createSequence,
  getRunDetail,
  getSequence,
  listRunsForMessage,
  listSequences,
  stalledRuns,
  startRun,
  stopRun,
} from '../../db/sequences.js';
import { getDocument } from '../../db/documents.js';
import { getPage, loadPageMarkdown } from '../../db/workspace.js';
import { getSettings } from '../../ai/settings.js';
import { resolveModel } from '../../ai/provider.js';
import {
  mergeAgentRows,
  scanTextForContacts,
  type HarvestScanResult,
} from '../../../lib/harvest.js';
import type {
  ChannelVerification,
  ContactChannelKind,
  ContactKind,
  ContactSource,
} from '../../../lib/correspondence.js';
import type {
  DispatchInput,
  EscalationInput,
  RecipientPatch,
  RecipientPick,
  SaveMessageInput,
} from '../../db/messages.js';

/**
 * How much of a source the model pass sees.
 *
 * The deterministic scan always runs over the whole text; only the model is
 * capped, because a notebook page can be far larger than a prompt and the tail of
 * one is rarely where the contact block lives. Truncation is reported to the user
 * through the result's `stats`, which counts the lines that were actually read.
 */
const AGENT_TEXT_LIMIT = 12_000;

// ─── Source resolution ────────────────────────────────────────────────────────

/**
 * Flatten a composed document's block tree to text the scanner can read.
 *
 * Documents are stored as a block tree, not markdown, and a `Label: value` line
 * inside a paragraph is how the contact blocks in real documents actually look.
 * So the walker keeps the two things the scanner keys on: block boundaries become
 * newlines, and a heading-ish block becomes a markdown heading so its section is
 * attributed to the right organisation instead of to whatever preceded it.
 *
 * Deliberately shape-agnostic — it reads keys rather than switching on a block
 * type union, because the block catalogue is large and grows.
 */
function blockTextFor(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 8) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => blockTextFor(entry, depth + 1)).join('\n');
  }
  if (typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  const isHeading = /heading|title|section/i.test(type);

  const parts: string[] = [];
  for (const key of ['text', 'content', 'value', 'label', 'name', 'title']) {
    const field = record[key];
    if (typeof field === 'string' && field.trim()) parts.push(field);
  }
  if (Array.isArray(record.items)) parts.push(blockTextFor(record.items, depth + 1));
  if (Array.isArray(record.rows)) parts.push(blockTextFor(record.rows, depth + 1));

  const body = parts.join('\n');
  if (isHeading && body) return `## ${record.title ?? body}`;
  return body;
}

interface ResolvedSource {
  kind: 'page' | 'document' | 'text';
  label: string;
  detail: string;
  text: string;
  /** The project the source belongs to, when it has one. */
  projectId: string | null;
}

function resolveSource(source: {
  kind: 'page' | 'document' | 'text';
  pageId?: string;
  documentId?: string;
  text?: string;
  label?: string;
}): ResolvedSource {
  if (source.kind === 'page') {
    const page = getPage(source.pageId!);
    if (!page) throw new Error('That page no longer exists');
    const text = loadPageMarkdown(page.id);
    return {
      kind: 'page',
      label: page.title || 'Untitled page',
      detail: `${text.split('\n').length} lines`,
      text,
      projectId: page.project_id,
    };
  }

  if (source.kind === 'document') {
    const document = getDocument(source.documentId!);
    if (!document) throw new Error('That document no longer exists');
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(document.data_json);
    } catch {
      parsed = null;
    }
    const text = parsed ? blockTextFor(parsed) : '';
    return {
      kind: 'document',
      label: document.title || 'Untitled document',
      detail: `${text.split('\n').length} lines`,
      text,
      projectId: document.project_id,
    };
  }

  const text = source.text ?? '';
  return {
    kind: 'text',
    label: source.label ?? 'Pasted text',
    detail: `${text.length} characters`,
    text,
    projectId: null,
  };
}

// ─── Model pass ───────────────────────────────────────────────────────────────

/**
 * What the model is allowed to return. Every field is optional except the name,
 * and the prompt forbids inventing an address — but the schema is the enforcement:
 * a value it cannot read is simply absent, and an absent field cannot be mistaken
 * for a checked one.
 */
const AGENT_SCHEMA = z.object({
  rows: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['organisation', 'person']).optional(),
      role: z.string().optional(),
      notes: z.string().optional(),
      channels: z
        .array(
          z.object({
            kind: z.enum([
              'email',
              'phone',
              'portal',
              'postal',
              'social',
              'manual',
            ]),
            value: z.string(),
            label: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});

const AGENT_PROMPT = `You are reading a document to find organisations and people a user corresponds with, and the ways of reaching them.

Rules, in order of importance:
1. Report ONLY what is written in the text. Never invent, complete, guess or "correct" an email address, phone number, postal address or URL. A plausible-looking address that is not in the text is a serious error.
2. If a value is ambiguous or partial, omit it entirely rather than guessing. Omission is always safe.
3. Do not report generic section headings ("Overview", "Key Documents", "Next Steps") as organisations.
4. Report the organisation's name as written. Do not normalise spelling or add legal suffixes that are not present.
5. For each organisation, list every way of reaching it that appears: email, phone, portal/form URL, postal address, social profile. Leave out anything you cannot read exactly.
6. Use "manual" only when the text says contact happens in a way with no address (in person, by phone call to an unnamed switchboard).

Text to read:
---
`;

async function runAgentPass(
  text: string,
): Promise<{ rows: z.infer<typeof AGENT_SCHEMA>['rows'] } | { error: string }> {
  try {
    const settings = getSettings();
    const model = resolveModel(settings.activeProvider, settings.activeModel);
    const { object } = await generateObject({
      model,
      schema: AGENT_SCHEMA,
      prompt: `${AGENT_PROMPT}${text.slice(0, AGENT_TEXT_LIMIT)}\n---`,
    });
    return { rows: object.rows };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'The model pass failed',
    };
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerCorrespondenceHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('correspondence:changed');
    }
  };

  // ── Registry ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'correspondence:contacts-list',
    (_e, req?: { projectId?: string | null }) => {
      return listContacts(req?.projectId ?? null);
    },
  );

  ipcMain.handle(
    'correspondence:contact-save',
    (
      _e,
      req: {
        id?: string;
        projectId?: string | null;
        kind?: ContactKind;
        name: string;
        role?: string;
        parentId?: string | null;
        notes?: string;
      },
    ) => {
      const contact = saveContact(req);
      broadcastChanged();
      return contact;
    },
  );

  ipcMain.handle('correspondence:contact-delete', (_e, { id }: { id: string }) => {
    const deleted = deleteContact(id);
    if (deleted) broadcastChanged();
    return deleted;
  });

  ipcMain.handle(
    'correspondence:channel-save',
    (
      _e,
      req: {
        id?: string;
        contactId: string;
        kind: ContactChannelKind;
        value: string;
        label?: string;
        source?: ContactSource;
        confidence?: number | null;
      },
    ) => {
      const channel = saveChannel(req);
      broadcastChanged();
      return channel;
    },
  );

  ipcMain.handle('correspondence:channel-delete', (_e, { id }: { id: string }) => {
    const deleted = deleteChannel(id);
    if (deleted) broadcastChanged();
    return deleted;
  });

  ipcMain.handle(
    'correspondence:channel-set-verified',
    (
      _e,
      { id, verified }: { id: string; verified: ChannelVerification },
    ) => {
      const channel = setChannelVerified(id, verified);
      broadcastChanged();
      return channel;
    },
  );

  ipcMain.handle(
    'correspondence:counts',
    (_e, req?: { projectId?: string | null }) => {
      return contactCounts(req?.projectId ?? null);
    },
  );

  // ── Harvest ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'correspondence:harvest-scan',
    async (
      _e,
      req: {
        projectId?: string | null;
        source: {
          kind: 'page' | 'document' | 'text';
          pageId?: string;
          documentId?: string;
          text?: string;
          label?: string;
        };
        useAgent?: boolean;
      },
    ): Promise<HarvestScanResult> => {
      const resolved = resolveSource(req.source);
      // Scope for duplicate detection: an explicit project wins, otherwise the
      // source's own project, so harvest from a scoped page knows what is already
      // in that project's registry.
      const scope = req.projectId ?? resolved.projectId ?? null;

      const base = scanTextForContacts(resolved.text);

      let scan = base;
      let agentUsed = false;
      let agentError: string | undefined;

      if (req.useAgent !== false && resolved.text.trim()) {
        const result = await runAgentPass(resolved.text);
        if ('error' in result) {
          agentError = result.error;
        } else {
          scan = mergeAgentRows(base, result.rows);
          agentUsed = true;
        }
      }

      return {
        source: {
          kind: resolved.kind,
          label: resolved.label,
          detail: resolved.detail,
        },
        rows: scan.rows,
        looseChannels: scan.looseChannels,
        stats: scan.stats,
        agentUsed,
        agentError,
        knownContactNames: listContacts(scope).map((c) => c.name),
      };
    },
  );

  ipcMain.handle(
    'correspondence:harvest-import',
    (
      _e,
      req: {
        projectId: string | null;
        rows: Parameters<typeof importHarvestRows>[0]['rows'];
      },
    ) => {
      const result = importHarvestRows({
        projectId: req.projectId ?? null,
        rows: req.rows ?? [],
      });
      if (result.createdContacts > 0 || result.createdChannels > 0) {
        broadcastChanged();
      }
      return result;
    },
  );

  // ── Messages and recipients ───────────────────────────────────────────────

  ipcMain.handle(
    'correspondence:messages-list',
    (_e, req?: { projectId?: string | null }) => listMessages(req?.projectId ?? null),
  );

  ipcMain.handle('correspondence:message-get', (_e, { id }: { id: string }) =>
    getMessageDetail(id),
  );

  ipcMain.handle(
    'correspondence:message-save',
    (_e, req: SaveMessageInput) => {
      const message = saveMessage(req);
      broadcastChanged();
      return message;
    },
  );

  ipcMain.handle('correspondence:message-delete', (_e, { id }: { id: string }) => {
    const deleted = deleteMessage(id);
    if (deleted) broadcastChanged();
    return deleted;
  });

  ipcMain.handle(
    'correspondence:message-set-recipients',
    (_e, req: { messageId: string; picks: RecipientPick[] }) => {
      const message = setMessageRecipients(req.messageId, req.picks ?? []);
      broadcastChanged();
      return message;
    },
  );

  ipcMain.handle(
    'correspondence:message-dispatch',
    (_e, req: DispatchInput) => {
      const message = dispatchMessage(req);
      broadcastChanged();
      return message;
    },
  );

  ipcMain.handle(
    'correspondence:recipient-update',
    (_e, req: { id: string; patch: RecipientPatch }) => {
      const recipient = updateRecipient(req.id, req.patch ?? {});
      broadcastChanged();
      return recipient;
    },
  );

  ipcMain.handle(
    'correspondence:attention-list',
    (_e, req?: { projectId?: string | null }) =>
      listAttention(req?.projectId ?? null),
  );

  ipcMain.handle(
    'correspondence:recipient-escalate',
    (_e, req: EscalationInput) => {
      const result = escalateRecipients({
        recipientIds: req.recipientIds ?? [],
        dueInDays: req.dueInDays,
      });
      // Tasks were created, so the task board has to know as well as this system.
      if (result.created.length > 0 && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tasks:changed');
      }
      broadcastChanged();
      return result;
    },
  );

  ipcMain.handle(
    'correspondence:recipient-events',
    (_e, { id }: { id: string }) => listRecipientEvents(id),
  );

  // ── Sequences ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'correspondence:sequences-list',
    (_e, req?: { projectId?: string | null }) =>
      listSequences(req?.projectId ?? null),
  );

  ipcMain.handle(
    'correspondence:sequence-create',
    (
      _e,
      req: Parameters<typeof createSequence>[0],
    ) => {
      const sequence = createSequence(req);
      broadcastChanged();
      return sequence;
    },
  );

  ipcMain.handle('correspondence:sequence-get', (_e, { id }: { id: string }) =>
    getSequence(id),
  );

  ipcMain.handle(
    'correspondence:sequence-start',
    (
      _e,
      req: { sequenceId: string; messageId: string; projectId?: string | null },
    ) => {
      const run = startRun(req);
      broadcastChanged();
      return run;
    },
  );

  ipcMain.handle('correspondence:sequence-run', (_e, { runId }: { runId: string }) =>
    getRunDetail(runId),
  );

  ipcMain.handle(
    'correspondence:sequence-runs-for-message',
    (_e, { messageId }: { messageId: string }) =>
      listRunsForMessage(messageId),
  );

  ipcMain.handle(
    'correspondence:sequence-advance',
    (_e, req: { runId: string; fireStepId?: string }) => {
      const result = advanceRun(req.runId, { fireStepId: req.fireStepId });
      // An escalate or task step creates real tasks, so the task board is stale too.
      if (result.fired.some((step) => step.kind === 'escalate' || step.kind === 'task')) {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tasks:changed');
        }
      }
      broadcastChanged();
      return result;
    },
  );

  ipcMain.handle(
    'correspondence:sequence-stop',
    (_e, { runId }: { runId: string }) => {
      stopRun(runId);
      broadcastChanged();
    },
  );

  ipcMain.handle(
    'correspondence:sequence-stalled',
    (_e, req?: { projectId?: string | null }) =>
      stalledRuns(req?.projectId ?? null),
  );

  ipcMain.handle(
    'correspondence:clocks',
    (_e, req?: { projectId?: string | null }) =>
      listLiveClocks(req?.projectId ?? null),
  );

  ipcMain.handle(
    'correspondence:message-counts',
    (_e, req?: { projectId?: string | null }) =>
      messageCounts(req?.projectId ?? null),
  );
}
