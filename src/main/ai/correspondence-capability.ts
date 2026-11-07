/**
 * ai/correspondence-capability.ts — Correspondence capability discovery.
 */

export interface CorrespondenceCapabilityAnswer {
  query: string;
  patterns: Array<{ id: string; label: string; description: string; useWhen: string }>;
  practices: string[];
  available: true;
}

const PATTERNS = [
  { id: 'draft-message', label: 'Draft Message', description: 'Propose body + recipients on channels that exist in the registry. You confirm.', keywords: ['draft', 'message', 'write', 'compose', 'email'] },
  { id: 'deadline-class', label: 'Deadline Class', description: 'Propose the deadline class/window that starts when sent. For chase timing.', keywords: ['deadline', 'window', 'timing', 'due', 'chase'] },
  { id: 'reply-classification', label: 'Reply Classification', description: 'Draft reply class + escalation note before raising a chase task.', keywords: ['reply', 'classify', 'escalation', 'chase', 'follow'] },
  { id: 'dispatch-stamp', label: 'Dispatch Stamp', description: 'Record dispatch as a date stamp starting clocks — never a send.', keywords: ['dispatch', 'stamp', 'record', 'sent', 'log'] },
  { id: 'manual-send', label: 'Manual Send Log', description: 'Log sends on channels Qeda does not cover.', keywords: ['manual', 'external', 'portal', 'phone'] },
];

const PRACTICES = [
  'Never invent a body, channel, or external ref — propose drafts for confirmation.',
  'Nothing here delivers; the honest "send" verb is a stamp.',
  'Moving a dispatched recipient state is approval-gated — propose, don\'t commit.',
  'Read the board/rail/trail first to orient; never guess recipient state.',
];

export function discoverCorrespondenceCapability(query: string): CorrespondenceCapabilityAnswer {
  const q = (query.trim() || 'correspondence').toLowerCase();
  const scored = PATTERNS.map((p) => ({ p, s: p.keywords.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0) })).sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).map((x) => x.p);
  return {
    query: q,
    patterns: (top.length > 0 ? top : PATTERNS).map((p) => ({ id: p.id, label: p.label, description: p.description, useWhen: p.description })),
    practices: PRACTICES,
    available: true,
  };
}
