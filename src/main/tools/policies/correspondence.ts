/**
 * tools/policies/correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the Correspondence Copilot
 * (`createCorrespondenceCopilotAgent`).
 *
 * The agent works against the correspondence store: contacts, channels,
 * messages, recipients, events, and (through escalation) the task store. The
 * safety boundary has one source of truth, and it is the message that already
 * exists in this repo: the app does not send anything for you, it records what
 * was sent and starts clocks. So this agent can:
 *
 *   - read the board, the rail, the registry, a recipient's history
 *   - draft a message and its recipients as queued
 *   - propose the deadline class / window that should start when sent
 *   - draft a reply classification and an escalation note
 *   - record a dispatch as the honest verb — a date stamp, not a send
 *
 * And it must never:
 *
 *   - deliver anything: there is no mail / network / portal / terminal-send
 *     tool in this set (and no path by which one could be added without a new
 *     tool being the actual check)
 *   - invent facts about a body it has not read: proposed recipients, channels,
 *     and external refs are drafts the user confirms, not stored as fact
 *   - move an dispatched recipient's state without the user's confirmation:
 *     marking replied / no_response / withdrawing a sent recipient rewrites a
 *     truth the board already presents, so those are approval-gated
 *
 * Classification is derived by `createApprovalPolicy` the same way as copilot
 * and drafter. Anything not here fails closed at runtime rather than passing
 * silently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability.js';

/** Shorthand so the table below reads as a classification, not boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
): ToolPolicyMap[string] => ({ capability });

export const correspondenceToolPolicies: ToolPolicyMap = {
  // ── Orientation: read-only over the correspondence store ───────────────────
  listContacts: t('read'),
  getContact: t('read'),
  listMessageCounts: t('read'),
  listAttention: t('read'),
  listLiveClocks: t('read'),
  listRecipientEvents: t('read'),
  listMessages: t('read'),
  getRecipientTrail: t('read'),

  // ── Read across the other stores the board's job touches ───────────────────
  listProjects: t('read'),
  listProjectRollups: t('read'),
  getProject: t('read'),
  listTasks: t('read'),
  listSequenceRuns: t('read'),

  // ── Drafting: additive, never rewrites existing dispatch truth ─────────────
  draftMessage: t('write-local'),
  draftRecipients: t('write-local'),
  proposeDeadline: t('write-local'),
  proposeReplyClassification: t('write-local'),
  draftEscalationNote: t('write-local'),
  logManualSendRecord: t('write-local'),

  // ── The honest record of sending — a date stamp, not a delivery ────────────
  // This is not a "send" tool. It records that the user sent something, which is
  // the verb this system already uses. It is additive to the dispatch timeline and
  // starts the recipient clocks; it does not touch email, phone, postal, portal,
  // or any external channel.
  recordDispatchAsSent: t('write-local'),

  // ── Authorship-gated: edits to already-sent recipient state ────────────────
  // Once something left the building, changing its reply_state / dispatch_state is
  // a rewrite of a live board entry. Those are the only approval-gated calls here.
  markReplyReceived: t('destructive'),
  markNoResponse: t('destructive'),
  withdrawSentRecipient: t('destructive'),
  setDeadlineOnSentRecipient: t('destructive'),

  // ── Escalation into the task store ─────────────────────────────────────────
  // Creating a chase task is additive within the task store and linked back from
  // the recipient, which is the pattern escalation already uses. Editing or
  // deleting the resulting task is left to the task board, not the copilot.
  raiseChaseTask: t('write-local'),

  // ─── What is deliberately absent (the actual safety boundary) ──────────────
  //
  // - No network or external-channel tools of any kind: no mail, no fetch, no
  //   portal submission, no terminal commands. There is no path by which a prompt
  //   in a contact name or a message body could issue a filing, an email, or a
  //   portal submission, because there is no tool that can.
  //
  // - No send / deliery verb. The only "send" in this set is `recordDispatchAsSent`,
  //   which is a stamp. That is the same honesty constraint the composer enforces.
  //
  // - No filesystem, no shell, no repo tools: the correspondence module does not
  //   read arbitrary files from disk, and the copilot should not gain that from
  //   this policy.
  //
  // - No deletion of messages, recipients, contacts, or events. Cleanup is a
  //   user action with its own affordance, not an agent verb.
};
