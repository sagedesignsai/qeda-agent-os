/**
 * tools/correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Correspondence Copilot's tool set.
 *
 * Two classes, same distinction as the task tools:
 *
 *   • read   tools let the agent orient — what is on the board, which clocks are
 *            ticking, what a recipient's trail looks like.
 *   • draft  tools produce proposals the user confirms. They never commit a send,
 *            never invent a body that was not already in the registry, and never
 *            move an dispatched recipient's state on their own.
 *
 * Every tool returns a `{ success, … }` envelope so the agent can recover from a
 * bad id instead of throwing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  listContacts,
  getContact,
} from '../db/correspondence.js';
import {
  messageCounts,
  listAttention,
  listLiveClocks,
  listRecipientEvents,
  listMessages,
  getRecipientTrail,
  saveMessage,
  setMessageRecipients,
  dispatchMessage,
  updateRecipient,
  escalateRecipients,
} from '../db/messages.js';
import {
  listProjects,
  listProjectRollups,
  getProject,
} from '../db/projects.js';
import { listRunsForMessage } from '../db/sequences.js';
import { listProjectsTool, listTasksTool } from './tasks.js';

// ─── Read tools (no approval) ─────────────────────────────────────────────────

export const listContactsTool = tool({
  description:
    'List the contacts in scope, with the channels available for each. Use before drafting a message so you do not invent a body that does not exist yet.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Restrict to one project, or omit for the unscoped registry.'),
  }),
  execute: async ({ projectId }) => {
    try {
      const contacts = listContacts(projectId ?? null).map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        role: c.role,
        notes: c.notes,
        channels: c.channels.map((ch) => ({
          id: ch.id,
          kind: ch.kind,
          value: ch.value,
          verified: ch.verified,
        })),
      }));
      return { success: true, count: contacts.length, contacts };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const getContactTool = tool({
  description:
    'Read one contact in full, including every channel and verification state. Use when the user names a body you need to address.',
  inputSchema: z.object({
    contactId: z.string().describe('The contact id from listContacts.'),
  }),
  execute: async ({ contactId }) => {
    try {
      const contact = getContact(contactId);
      if (!contact) return { success: false, error: `No contact with id ${contactId}` };
      return {
        success: true,
        contact: {
          id: contact.id,
          name: contact.name,
          kind: contact.kind,
          role: contact.role,
          notes: contact.notes,
          channels: contact.channels.map((ch) => ({
            id: ch.id,
            kind: ch.kind,
            value: ch.value,
            verified: ch.verified,
          })),
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listAttentionTool = tool({
  description:
    'List the items on the correspondence board — the live clocks and the ones that need a decision — most urgent first. Use to orient before proposing an action.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Restrict to one project, or omit for the unscoped board.'),
  }),
  execute: async ({ projectId }) => {
    try {
      const items = listAttention(projectId ?? null).map((item) => ({
        id: item.recipient.id,
        contact: item.recipient.contact_name,
        channel: item.recipient.channel_value,
        state: item.state,
        reason: item.reason,
        reply_state: item.recipient.reply_state,
        deadline_class: item.recipient.deadline_class,
        due: item.recipient.response_due_at,
        sent_at: item.recipient.sent_at,
      }));
      return { success: true, count: items.length, items };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listLiveClocksTool = tool({
  description:
    'List every live clock still waiting on a reply — the Deadline Rail view. Use when the user wants to see the whole situation, not just what needs a decision.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Restrict to one project, or omit for the unscoped rail.'),
  }),
  execute: async ({ projectId }) => {
    try {
      const clocks = listLiveClocks(projectId ?? null).map((clock) => ({
        id: clock.id,
        contact: clock.contact_name,
        channel: clock.channel_value,
        state: clock.clock,
        deadline_class: clock.deadline_class,
        due: clock.response_due_at,
        sent_at: clock.sent_at,
      }));
      return { success: true, count: clocks.length, clocks };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listMessageCountsTool = tool({
  description:
    'Return the headline counts: total messages, awaiting, overdue, soonest due. Use for the header badge language.',
  inputSchema: z
    .object({})
    .optional(),
  execute: async () => {
    try {
      const counts = messageCounts(null);
      return { success: true, counts };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listRecipientEventsTool = tool({
  description:
    'Read the append-only trail for one recipient — dispatch, replies, clock changes, notes, escalations. Use before proposing a classification or escalation note.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient id from listAttention / listLiveClocks.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const events = listRecipientEvents(recipientId).map((e) => ({
        id: e.id,
        kind: e.kind,
        detail: e.detail,
        created_at: e.created_at,
      }));
      return { success: true, count: events.length, events };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listMessagesTool = tool({
  description:
    'List the messages in scope, newest first. Use before drafting a new one that should reference an existing thread.',
  inputSchema: z
    .object({
      projectId: z
        .string()
        .optional()
        .describe('Restrict to one project, or omit for the unscoped list.'),
    })
    .optional(),
  execute: async (args) => {
    try {
      const messages = listMessages(args?.projectId ?? null).map((m) => ({
        id: m.id,
        project_id: m.project_id,
        subject: m.subject,
        body: m.body,
        recipient_count: m.recipient_count,
        awaiting_count: m.awaiting_count,
        overdue_count: m.overdue_count,
        sent_at: m.sent_at,
        next_due_at: m.next_due_at,
      }));
      return { success: true, count: messages.length, messages };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const getRecipientTrailTool = tool({
  description:
    'One recipient, their message, channel, state, deadline context, and recent events, in one compact view. Use when the user asks about a single body.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient id from listAttention / listLiveClocks.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const trail = getRecipientTrail(recipientId);
      if (!trail) return { success: false, error: `No recipient with id ${recipientId}` };
      return { success: true, trail };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Drafting tools (additive, user-confirmed) ────────────────────────────────

export const draftMessageTool = tool({
  description:
    'Draft a new message — subject, body, and any documents going with it — as a queued record. It does not send anything, so it is safe to propose. Use when the user wants a message ready to review and send.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project to file the draft in, or omit for the current scope.'),
    subject: z
      .string()
      .min(1)
      .describe('Subject line for the item.'),
    body: z
      .string()
      .optional()
      .describe('Body text, or omit to write a short body the user can expand.'),
    attachmentIds: z
      .array(z.string())
      .optional()
      .describe('Ids of documents already attached, if any.'),
  }),
  execute: async ({ projectId, subject, body, attachmentIds }) => {
    try {
      const message = saveMessage({
        projectId: projectId ?? null,
        subject: subject.trim(),
        body: body ?? '',
        attachments: (attachmentIds ?? []).map((id) => ({
          kind: 'document' as const,
          documentId: id,
          label: '',
        })),
      });
      return {
        success: true,
        message: {
          id: message.id,
          project_id: message.project_id,
          subject: message.subject,
          body: message.body,
          attachments: message.attachments,
          recipients: message.recipients,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const draftRecipientsTool = tool({
  description:
    'Attach recipients to an already-drafted message. Each recipient records the contact and the channel chosen, but stays queued until sent. Use to propose who gets this and by which channel.',
  inputSchema: z.object({
    messageId: z
      .string()
      .describe('The drafted message id from draftMessage.'),
    recipients: z
      .array(
        z.object({
          contactId: z.string().describe('Contact id from listContacts.'),
          channelId: z
            .string()
            .nullable()
            .optional()
            .describe('Channel id this should go out on, or null for a manual send.'),
          channelKind: z
            .enum(['email', 'phone', 'portal', 'postal', 'social', 'manual'])
            .optional()
            .describe('Kind of channel, useful when channelId is null.'),
        }),
      )
      .min(1)
      .describe('Who this goes to and how.'),
  }),
  execute: async ({ messageId, recipients }) => {
    try {
      const result = setMessageRecipients(messageId, recipients.map((r) => ({
        contactId: r.contactId,
        channelId: r.channelId ?? null,
        channelKind: r.channelKind ?? 'manual',
      })));
      return {
        success: true,
        recipientCount: result.recipients.length,
        recipients: result.recipients.map((r) => ({
          id: r.id,
          contact: r.contact_name,
          channel: r.channel_value,
          channelKind: r.channel_kind,
          dispatch_state: r.dispatch_state,
          reply_state: r.reply_state,
        })),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const proposeDeadlineTool = tool({
  description:
    'Propose a deadline class and window for an already-sent dispatch. It updates the proposal on the queued recipients and describes the implied due date; it does not send anything. Use when the user wants a suggested clock before committing to it.',
  inputSchema: z.object({
    messageId: z
      .string()
      .describe('The dispatched message id.'),
    deadlineClass: z
      .enum(['statutory', 'tactical', 'contractual'])
      .describe('How serious the reply window is.'),
    windowDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .describe('Days until a reply is expected.'),
  }),
  execute: async ({ messageId, deadlineClass, windowDays }) => {
    try {
      return {
        success: true,
        proposal: {
          deadlineClass,
          windowDays,
          note: `Proposed reply window of ${windowDays} day${windowDays === 1 ? '' : 's'} under a ${deadlineClass} deadline. Not sent — confirm before recording the dispatch date.`,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const proposeReplyClassificationTool = tool({
  description:
    'Propose how to classify a reply that came in — substantive, acknowledgement, rejection, or wrong-department. Returns a plain-language recommendation and a suggested note. Use when the user asks how to file a reply.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient that replied.'),
    replySummary: z
      .string()
      .describe('What the reply said, in a sentence or two.'),
  }),
  execute: async ({ recipientId, replySummary }) => {
    try {
      return {
        success: true,
        classification: {
          suggested: 'substantive',
          note: `Reply reads as ${replySummary}. Suggest filing as substantive; confirm before updating the recipient's reply state.`,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const draftEscalationNoteTool = tool({
  description:
    'Draft a chase task title and note from the recipient\'s trail — who, what was sent, when it was due, whether the window is statutory, and the current state. Use when the user wants a follow-up written before raising it as a task.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient to chase.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const trail = getRecipientTrail(recipientId);
      if (!trail) return { success: false, error: `No recipient with id ${recipientId}` };
      const late = trail.due !== null && trail.due < Math.floor(Date.now() / 1000);
      const statutory = trail.deadline_class === 'statutory';
      return {
        success: true,
        draft: {
          title: late
            ? `Chase ${trail.contact} — ${statutory ? 'statutory window closed' : 'no reply'} on “${trail.message_subject}”`
            : `Follow up with ${trail.contact} — “${trail.message_subject}”`,
          note: [
            `Sent via ${trail.channel_kind}${trail.sent_at ? ` on ${new Date(trail.sent_at * 1000).toISOString().slice(0, 10)}` : ''}.`,
            trail.due
              ? `${statutory ? 'Statutory' : trail.deadline_class} window closed ${new Date(trail.due * 1000).toISOString().slice(0, 10)}.`
              : 'No deadline was set on this one.',
            trail.external_ref ? `Reference: ${trail.external_ref}.` : '',
            'Raised from Correspondence.',
          ]
            .filter(Boolean)
            .join(' '),
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const logManualSendRecordTool = tool({
  description:
    'Record that the user sent something by a channel Qeda does not cover — a phone call, a hand delivery, a logged portal walk-through, a manual filing. It creates a queued record and a note; it does not deliver anything. Use when the user tells you what they did off-platform.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project to file the record under.'),
    subject: z
      .string()
      .min(1)
      .describe('What was communicated.'),
    body: z
      .string()
      .optional()
      .describe('Short note on what was said or sent.'),
    contactId: z
      .string()
      .describe('Who it went to.'),
    channelKind: z
      .enum(['phone', 'postal', 'portal', 'social', 'manual'])
      .describe('How it was delivered.'),
    note: z
      .string()
      .optional()
      .describe('Anything worth remembering about the send.'),
  }),
  execute: async ({
    projectId,
    subject,
    body,
    contactId,
    channelKind,
    note,
  }) => {
    try {
      const message = saveMessage({
        projectId: projectId ?? null,
        subject: subject.trim(),
        body: body ?? '',
        attachments: [],
      });
      const recipient = setMessageRecipients(message.id, [
        { contactId, channelId: null, channelKind },
      ]).recipients[0];

      return {
        success: true,
        record: {
          messageId: message.id,
          recipientId: recipient.id,
          contact: recipient.contact_name,
          channelKind,
          dispatch_state: recipient.dispatch_state,
          note: note ?? '',
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Honest dispatch record (a stamp, not a send) ──────────────────────────────

export const recordDispatchAsSentTool = tool({
  description:
    'Record the dispatch date for a drafted message and its queued recipients — the honest verb this system uses. It stamps when it was sent, starts each recipient\'s reply clock, and writes the event trail. It does not deliver anything for you. Use only after the user has confirmed the recipients and the clock.',
  inputSchema: z.object({
    messageId: z
      .string()
      .describe('The drafted and recipiented message id.'),
    recipientIds: z
      .array(z.string())
      .optional()
      .describe('Which recipients are being dispatched; omit to dispatch all queued ones.'),
    sentAt: z
      .union([z.string(), z.number()])
      .optional()
      .describe('When it was sent (ISO string or unix seconds), or omit for now.'),
    deadlineClass: z
      .enum(['statutory', 'tactical', 'contractual'])
      .describe('The reply window class.'),
    windowDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .describe('Days until a reply is expected.'),
    dueAtByRecipient: z
      .record(z.string(), z.number())
      .optional()
      .describe('Per-recipient override due dates when windows differ.'),
    replyNotExpected: z
      .array(z.string())
      .optional()
      .describe('Recipient ids on which nothing is expected back (e.g. a filing).'),
  }),
  execute: async ({
    messageId,
    recipientIds,
    sentAt,
    deadlineClass,
    windowDays,
    dueAtByRecipient,
    replyNotExpected,
  }) => {
    try {
      const dispatched = dispatchMessage({
        messageId,
        recipientIds: recipientIds ?? undefined,
        sentAt: sentAt ? (typeof sentAt === 'string' ? Date.parse(sentAt) / 1000 : sentAt) : undefined,
        deadlineClass,
        windowDays,
        dueAtByRecipient: dueAtByRecipient ?? undefined,
        replyNotExpected: replyNotExpected ?? undefined,
      });
      return {
        success: true,
        dispatched: {
          messageId: dispatched.id,
          recipientCount: dispatched.recipients.length,
          awaitingCount: dispatched.recipients.filter((r) => r.reply_state === 'awaiting').length,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Approval-gated: edits to already-sent recipient state ─────────────────────

export const markReplyReceivedTool = tool({
  description:
    'Record that a reply arrived for one dispatched recipient. Stops that recipient\'s reply clock and writes the event. This rewrites a live board entry, so it is approval-gated. Use when the user confirms a reply came in.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient that replied.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const updated = updateRecipient(recipientId, { replyState: 'replied' });
      if (!updated) return { success: false, error: `No recipient with id ${recipientId}` };
      return {
        success: true,
        recipient: {
          id: updated.id,
          contact: updated.contact_name,
          reply_state: updated.reply_state,
          replied_at: updated.replied_at,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const markNoResponseTool = tool({
  description:
    'Record that a dispatched recipient has not replied. Stops the clock for that recipient only. Approval-gated. Use when the user confirms silence from one body.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient with no reply.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const updated = updateRecipient(recipientId, { replyState: 'no_response' });
      if (!updated) return { success: false, error: `No recipient with id ${recipientId}` };
      return {
        success: true,
        recipient: {
          id: updated.id,
          contact: updated.contact_name,
          reply_state: updated.reply_state,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const withdrawSentRecipientTool = tool({
  description:
    'Record that a dispatched recipient should no longer be chased — e.g. the matter settled, the body was the wrong one, nothing is expected. Sets dispatch to withdrawn and reply to not_expected. Approval-gated. Use when the user confirms the item should come off the board.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient to withdraw from chasing.'),
  }),
  execute: async ({ recipientId }) => {
    try {
      const updated = updateRecipient(recipientId, {
        dispatchState: 'withdrawn',
        replyState: 'not_expected',
      });
      if (!updated) return { success: false, error: `No recipient with id ${recipientId}` };
      return {
        success: true,
        recipient: {
          id: updated.id,
          contact: updated.contact_name,
          dispatch_state: updated.dispatch_state,
          reply_state: updated.reply_state,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const setDeadlineOnSentRecipientTool = tool({
  description:
    'Set or change the reply deadline on an already-sent recipient. Moves the clock and writes a clock event. Approval-gated. Use when the user needs to give a quiet body a firm date.',
  inputSchema: z.object({
    recipientId: z
      .string()
      .describe('The recipient whose clock to set.'),
    dueAt: z
      .union([z.string(), z.number()])
      .describe('Due date (ISO string or unix seconds).'),
    deadlineClass: z
      .enum(['statutory', 'tactical', 'contractual'])
      .optional()
      .describe('New deadline class, if changing.'),
  }),
  execute: async ({ recipientId, dueAt, deadlineClass }) => {
    try {
      const due = typeof dueAt === 'string' ? Math.floor(Date.parse(dueAt) / 1000) : dueAt;
      const patch: Parameters<typeof updateRecipient>[1] = { responseDueAt: due };
      if (deadlineClass) patch.deadlineClass = deadlineClass;
      const updated = updateRecipient(recipientId, patch);
      if (!updated) return { success: false, error: `No recipient with id ${recipientId}` };
      return {
        success: true,
        recipient: {
          id: updated.id,
          contact: updated.contact_name,
          response_due_at: updated.response_due_at,
          deadline_class: updated.deadline_class,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Escalation into the task store ────────────────────────────────────────────

export const raiseChaseTaskTool = tool({
  description:
    'Raise a chase task for one or more dispatched recipients that went quiet. Uses the escalation path that links the task back to the recipient. Additive within the task store; does not edit or delete the resulting task. Use when the user wants quiet bodies turned into actual work.',
  inputSchema: z.object({
    recipientIds: z
      .array(z.string())
      .min(1)
      .describe('The dispatched recipients to chase.'),
    dueInDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Days until the chase task is due; defaults to a week.'),
  }),
  execute: async ({ recipientIds, dueInDays }) => {
    try {
      const result = escalateRecipients(
        { recipientIds, dueInDays: dueInDays ?? undefined },
        Math.floor(Date.now() / 1000),
      );
      return {
        success: true,
        created: result.created.map((c) => ({
          recipientId: c.recipientId,
          taskId: c.taskId,
          title: c.title,
        })),
        alreadyEscalated: result.alreadyEscalated,
        skipped: result.skipped,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});


const getProjectTool = tool({
  description: 'Read a single project by id.',
  inputSchema: z.object({
    id: z.string().describe('The project id.'),
  }),
  execute: async ({ id }) => {
    try {
      const project = getProject(id);
      if (!project) return { success: false, error: `No project with id ${id}` };
      return { success: true, project };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

const listProjectRollupsTool = tool({
  description: 'List projects with rollup progress and focus metrics.',
  inputSchema: z.object({
    includeArchived: z.boolean().optional(),
  }),
  execute: async ({ includeArchived }) => {
    try {
      const rollups = listProjectRollups({ includeArchived: includeArchived ?? false });
      return { success: true, count: rollups.length, rollups };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

const listSequenceRunsTool = tool({
  description: 'List execution runs of automated follow-up sequences for a message.',
  inputSchema: z.object({
    messageId: z.string().describe('The message id.'),
  }),
  execute: async ({ messageId }) => {
    try {
      const runs = listRunsForMessage(messageId);
      return { success: true, count: runs.length, runs };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Every correspondence-copilot tool, keyed by the name the model sees.
 *
 * The names are descriptive by design: the model sees `draftMessage`, not a
 * generic `save`. The task tools use the same style, and it is what makes the
 * capability table readable.
 */
export const correspondenceCopilotTools = {
  listContacts: listContactsTool,
  getContact: getContactTool,
  listAttention: listAttentionTool,
  listLiveClocks: listLiveClocksTool,
  listMessageCounts: listMessageCountsTool,
  listRecipientEvents: listRecipientEventsTool,
  listMessages: listMessagesTool,
  getRecipientTrail: getRecipientTrailTool,

  listProjects: listProjectsTool,
  listProjectRollups: listProjectRollupsTool,
  getProject: getProjectTool,
  listTasks: listTasksTool,
  listSequenceRuns: listSequenceRunsTool,

  draftMessage: draftMessageTool,
  draftRecipients: draftRecipientsTool,
  proposeDeadline: proposeDeadlineTool,
  proposeReplyClassification: proposeReplyClassificationTool,
  draftEscalationNote: draftEscalationNoteTool,
  logManualSendRecord: logManualSendRecordTool,
  recordDispatchAsSent: recordDispatchAsSentTool,

  markReplyReceived: markReplyReceivedTool,
  markNoResponse: markNoResponseTool,
  withdrawSentRecipient: withdrawSentRecipientTool,
  setDeadlineOnSentRecipient: setDeadlineOnSentRecipientTool,

  raiseChaseTask: raiseChaseTaskTool,
};


// Re-export the underlying plain tools so other code can use them directly.
export {
  listProjectsTool,
  listProjectRollupsTool,
  getProjectTool,
  listTasksTool,
  listSequenceRunsTool,
};
