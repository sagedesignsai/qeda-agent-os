/**
 * lib/harvest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Harvest: reading organisations, people and ways of reaching them out of text
 * the user already wrote, so nobody has to type 147 cells into a contact form.
 *
 * WHY DETERMINISTIC FIRST
 * The plan's rule for this system is that AI proposes and code decides, and
 * Harvest is where that rule earns its keep: a model asked to "find the
 * organisations" will happily invent a plausible email for one. So the baseline
 * is a plain line-oriented scanner with no model in it at all — it can only ever
 * report what is literally in the text — and a model pass is *merged on top*
 * afterwards, with every value it contributes flagged `inferred` so the review
 * grid can mark it as a guess. Nothing here writes: it returns drafts, and the
 * user's edited grid is what gets stored.
 *
 * WHAT SHAPES IT HANDLES
 * The realistic inputs are a research notebook page ("## 3. Commission for
 * Conciliation…" followed by labelled lines), a document, or pasted prose. So the
 * scanner is line-oriented and recognises four kinds of line: a markdown heading,
 * a numbered item, a bold-only line, and a `Label: value` field. Anything else is
 * prose that may still contain an email or a phone number, attributed to whatever
 * section it is under.
 *
 * Deliberately NOT here: file reading, IPC, persistence, and any notion of a
 * project. This module takes a string and returns drafts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  canonicalChannelValue,
  channelDedupeKey,
  contactNameDedupeKey,
  type ContactChannelKind,
  type ContactKind,
} from './correspondence';

// ─── Output shapes ────────────────────────────────────────────────────────────

export interface HarvestChannelDraft {
  kind: ContactChannelKind;
  value: string;
  /** Free-text qualifier shown in the grid ("Main line", "Referral form"). */
  label: string;
  /** 0–1. Drives the grid's tint: low-confidence cells are the ones to check. */
  confidence: number;
  /** True when a model proposed this rather than the text containing it. */
  inferred: boolean;
}

/** Where a row's name came from — a heading is a much stronger signal than prose. */
export type HarvestNameOrigin =
  | 'heading'
  | 'numbered-line'
  | 'bold-line'
  | 'agent'
  /** Typed by the user in the review grid — the one origin that is not a guess. */
  | 'manual';

export interface HarvestRowDraft {
  /** Stable within one scan; the review grid's row key. */
  id: string;
  kind: ContactKind;
  name: string;
  role: string;
  notes: string;
  /** 0–1, describing whether this looks like a reachable organisation. */
  confidence: number;
  nameOrigin: HarvestNameOrigin;
  /** True when a model proposed the row itself, not just a field on it. */
  inferred: boolean;
  channels: HarvestChannelDraft[];
}

export interface HarvestScan {
  rows: HarvestRowDraft[];
  /**
   * Contact details that appeared with no organisation above them. Surfaced
   * rather than dropped: silently discarding half a page is how a user concludes
   * the feature does not work.
   */
  looseChannels: HarvestChannelDraft[];
  stats: {
    lines: number;
    emails: number;
    phones: number;
    sections: number;
  };
}

/**
 * What one scan returns across the IPC boundary.
 *
 * Declared here rather than in `ipc/channels.ts` so it can be built and asserted
 * without Electron, and so the renderer's review grid and the handler agree on
 * one shape.
 */
export interface HarvestScanResult {
  /** Where the text came from, shown back to the user as evidence of what was read. */
  source: {
    kind: 'page' | 'document' | 'text';
    label: string;
    /** One line of detail — a page title, a character count. */
    detail: string;
  };
  rows: HarvestRowDraft[];
  looseChannels: HarvestChannelDraft[];
  stats: HarvestScan['stats'];
  /** True when the model pass ran and was merged in. */
  agentUsed: boolean;
  /**
   * Set when the model pass failed. The deterministic scan is still returned and
   * still valid — an unavailable model must not make Harvest look broken.
   */
  agentError?: string;
  /**
   * Names already in the registry within this scope, so the grid can flag a
   * probable duplicate before the user imports it a second time.
   */
  knownContactNames: string[];
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/;
const NUMBERED_RE = /^\s{0,3}(\d{1,2})\s*[.)]\s+(.*\S)\s*$/;
const BOLD_ONLY_RE = /^\s{0,3}\*\*(.+?)\*\*\s*[:：]?\s*$/;

/**
 * A `Label: value` field, in the three forms that actually turn up.
 *
 * The middle one — `**Email:** hr@x.example`, colon *inside* the bold — is what
 * notebooks and documents in this app write, and leaving it out meant no labelled
 * field was ever read as a field: every channel was found by token shape instead, so
 * anything without a recognisable shape (a postal address, a place that only takes
 * portal submissions) was silently lost. Order matters: the bold forms are tried
 * before the bare one, and a match with an empty value falls through in the scanner
 * rather than consuming the line.
 */
const FIELD_RE =
  /^\s{0,3}(?:[-*+]\s+)?\*\*(.{1,40}?)\s*[:：]\s*\*\*\s*(.+)$|^\s{0,3}(?:[-*+]\s+)?\*\*(.{1,40}?)\*\*\s*[:：]\s*(.+)$|^\s{0,3}(?:[-*+]\s+)?([A-Za-z][A-Za-z /&'-]{1,30}?)\s*[:：]\s+(.+)$/;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s)>,;"']+/gi;
/** At least 9 digits, allowing the punctuation people actually type. */
const PHONE_RE = /\+?\d[\d\s()\-.]{7,}\d/g;

/** Social hosts, so a bare profile URL lands on the right channel. */
const SOCIAL_HOSTS = /(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|t\.me)/i;

/**
 * Labels that name a way of reaching someone. Anything else labelled becomes a
 * note, so "Process: submit a referral" does not turn into a contact channel.
 */
const FIELD_KINDS: ReadonlyArray<{ kind: ContactChannelKind; re: RegExp }> = [
  { kind: 'email', re: /^(e-?mail|email address|mail)$/i },
  {
    kind: 'phone',
    re: /^(phone|telephone|tel|cell|cellphone|mobile|contact number|fax)$/i,
  },
  {
    kind: 'postal',
    re: /^(address|postal address|postal|physical address|post address|post to)$/i,
  },
  {
    kind: 'portal',
    re: /^(portal|form|referral form|online|online form|upload|website|web|site|url|submit)$/i,
  },
  {
    kind: 'social',
    re: /^(linkedin|twitter|x|facebook|instagram|social|profile)$/i,
  },
];

const ROLE_LABELS = /^(role|position|title|designation|function)$/i;

/**
 * Headings that structure a document rather than name a counterparty. A section
 * under one of these is only kept if it actually contains contact details —
 * otherwise "Key Documents" would arrive in the grid as an organisation.
 */
const STRUCTURAL_HEADING =
  /^(overview|summary|introduction|background|context|key documents|next steps|action plan|phases?|phase \d|communication channels|notes?|appendix|timeline|deadlines?|contacts?|findings|recommendations?|sources|references|evidence)\b/i;

/** A heading longer than this is a sentence, not a name. */
const MAX_NAME_LENGTH = 120;

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Strip the numbering and emphasis a heading or list item arrives wrapped in. */
function cleanName(raw: string): string {
  return raw
    .replace(/^\s*\d{1,2}\s*[.)]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^[-–—:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Enough digits and a plausible shape to be a phone number rather than a date. */
function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return false;
  // "1992-11-30" is a date; a phone number is not all short groups.
  return true;
}

function urlKindFor(url: string, label: string): ContactChannelKind {
  if (SOCIAL_HOSTS.test(url)) return 'social';
  if (/form|portal|referral|submit|upload/i.test(label)) return 'portal';
  return 'portal';
}

/** Which channel a field label denotes, or null when it is not a channel. */
function kindForFieldLabel(label: string): ContactChannelKind | null {
  const cleaned = label.trim().replace(/[:：]\s*$/, '');
  for (const entry of FIELD_KINDS) {
    if (entry.re.test(cleaned)) return entry.kind;
  }
  return null;
}

/**
 * Token-level extraction, used for every line regardless of how it was
 * classified. Emails are matched first and removed before the phone scan, because
 * a digit-heavy domain is a common false positive for a number.
 */
function tokensIn(
  text: string,
): Array<{ kind: ContactChannelKind; value: string }> {
  const found: Array<{ kind: ContactChannelKind; value: string }> = [];

  const withoutEmails = text.replace(EMAIL_RE, (match) => {
    found.push({ kind: 'email', value: match });
    return ' ';
  });

  for (const url of withoutEmails.match(URL_RE) ?? []) {
    found.push({ kind: urlKindFor(url, text), value: url.replace(/[.,;]$/, '') });
  }

  // Remove URLs before hunting numbers so a phone-like path segment is ignored.
  const withoutUrls = withoutEmails.replace(URL_RE, ' ');
  for (const phone of withoutUrls.match(PHONE_RE) ?? []) {
    if (looksLikePhone(phone)) {
      found.push({ kind: 'phone', value: phone.trim() });
    }
  }

  return found;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

/** Mutable accumulator for the row currently being built. */
interface OpenRow {
  kind: ContactKind;
  name: string;
  role: string;
  notes: string[];
  nameOrigin: HarvestNameOrigin;
  inferred: boolean;
  channels: HarvestChannelDraft[];
  /** True once any contact detail was found under this section. */
  hasChannels: boolean;
  /**
   * The first heading of the page — the page's own title, which is what a notebook
   * page or document is named after, not a counterparty. Kept only if something
   * reachable sits under it.
   */
  isDocumentTitle: boolean;
}

function pushChannel(
  target: HarvestChannelDraft[],
  channel: HarvestChannelDraft,
): void {
  // Merge by identity, keeping the highest confidence: "info@x.org.za" read from
  // an `Email:` field and again from prose is one channel, not two.
  const key = channelDedupeKey(channel.kind, channel.value);
  const existing = target.find(
    (c) => channelDedupeKey(c.kind, c.value) === key,
  );
  if (!existing) {
    target.push(channel);
    return;
  }
  if (channel.confidence > existing.confidence) {
    existing.confidence = channel.confidence;
    existing.label = existing.label || channel.label;
  }
}

function closeRow(
  open: OpenRow | null,
  rows: HarvestRowDraft[],
  counter: { n: number },
): void {
  if (!open) return;
  const name = cleanName(open.name);
  const hasDirect = open.channels.some(
    (c) => c.kind === 'email' || c.kind === 'phone',
  );

  // A heading with nothing reachable under it is a section of the document, not a
  // counterparty — which covers both the page's own title and the sections named in
  // `STRUCTURAL_HEADING`.
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH ||
    (!open.hasChannels &&
      (open.isDocumentTitle || STRUCTURAL_HEADING.test(name)))
  ) {
    return;
  }

  counter.n += 1;
  rows.push({
    id: `row-${counter.n}`,
    kind: open.kind,
    name,
    role: open.role.trim(),
    notes: open.notes.join('\n').trim(),
    confidence: hasDirect ? 0.9 : open.channels.length > 0 ? 0.7 : 0.5,
    nameOrigin: open.nameOrigin,
    inferred: open.inferred,
    channels: open.channels,
  });
}

/**
 * Scan text for contacts.
 *
 * Pure and synchronous: same input, same output, no model and no I/O — which is
 * what makes the review grid's promise (nothing is written that you did not see)
 * something that can be tested rather than asserted.
 */
export function scanTextForContacts(text: string): HarvestScan {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const rows: HarvestRowDraft[] = [];
  const looseChannels: HarvestChannelDraft[] = [];
  const counter = { n: 0 };
  let open: OpenRow | null = null;
  let emails = 0;
  let phones = 0;
  let sections = 0;

  const note = (openRow: OpenRow | null, line: string) => {
    if (openRow && line.trim()) openRow.notes.push(line.trim());
  };

  /** Attribute every token on a line, given the channel a field label implied. */
  const absorbTokens = (line: string, expected: ContactChannelKind | null) => {
    for (const token of tokensIn(line)) {
      const confidence =
        expected === token.kind ? 0.95 : expected ? 0.7 : 0.6;
      const draft: HarvestChannelDraft = {
        kind: token.kind,
        value: canonicalChannelValue(token.kind, token.value),
        label: '',
        confidence,
        inferred: false,
      };
      if (token.kind === 'email') emails += 1;
      if (token.kind === 'phone') phones += 1;

      if (open) {
        pushChannel(open.channels, draft);
        open.hasChannels = true;
      } else {
        pushChannel(looseChannels, { ...draft, confidence: 0.5 });
      }
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const heading = HEADING_RE.exec(line);
    if (heading) {
      closeRow(open, rows, counter);
      // The first heading in the text is the page's title. `pages.title` is what
      // Harvest is usually pointed at, so treating it as an organisation put
      // "Stakeholders & Communication Plan" in the grid as a body to write to.
      const isDocumentTitle = sections === 0;
      sections += 1;
      open = {
        kind: 'organisation',
        name: heading[2],
        role: '',
        notes: [],
        nameOrigin: 'heading',
        inferred: false,
        channels: [],
        hasChannels: false,
        isDocumentTitle,
      };
      absorbTokens(heading[2], null);
      continue;
    }

    const field = FIELD_RE.exec(line);
    const label = (field?.[1] ?? field?.[3] ?? field?.[5] ?? '').trim();
    const fieldValue = (field?.[2] ?? field?.[4] ?? field?.[6] ?? '').trim();

    // Only a field with a value is a field. An empty one falls through to the
    // branches below, so `**De Beers Group**` alone on a line stays a bold-line name
    // rather than becoming a label whose value went missing.
    if (field && fieldValue) {
      const value = fieldValue;
      const kind = kindForFieldLabel(label);

      if (kind) {
        // A labelled channel with a value that is not a token of that type is
        // still taken at face value — "Phone: +27 11 646 0335" often has no
        // punctuation the generic scanner can be sure of.
        if (kind === 'email' || kind === 'phone' || kind === 'postal') {
          const direct: HarvestChannelDraft = {
            kind,
            value: canonicalChannelValue(kind, value),
            label,
            confidence: 0.95,
            inferred: false,
          };
          if (open) {
            pushChannel(open.channels, direct);
            open.hasChannels = true;
          } else {
            pushChannel(looseChannels, { ...direct, confidence: 0.5 });
          }
        }
        absorbTokens(value, kind);
      } else if (ROLE_LABELS.test(label)) {
        if (open && !open.role) open.role = value;
      } else if (value) {
        note(open, `${label}: ${value}`);
      }
      continue;
    }

    // A numbered line is an organisation unless it is a `**Label**: value` field
    // wearing a number — `cleanName` drops the `1. ` prefix, so this check is on the
    // plain words before the colon.
    const numbered = NUMBERED_RE.exec(line);
    if (numbered) {
      const numberedLine = cleanName(numbered[2]);
      if (kindForFieldLabel(numberedLine.split(/[:：]/)[0])) {
        // Field-redirected below, where the value and the label are processed
        // together rather than as a new organisation.
        absorbTokens(numberedLine, null);
        if (!tokensIn(numberedLine).length) note(open, line);
        continue;
      }

      closeRow(open, rows, counter);
      sections += 1;
      open = {
        kind: 'organisation',
        name: numberedLine,
        role: '',
        notes: [],
        nameOrigin: 'numbered-line',
        inferred: false,
        channels: [],
        hasChannels: false,
        isDocumentTitle: false,
      };
      absorbTokens(numberedLine, null);
      continue;
    }

    const boldOnly = BOLD_ONLY_RE.exec(line);
    if (boldOnly && !boldOnly[1].includes(':')) {
      closeRow(open, rows, counter);
      sections += 1;
      open = {
        kind: 'organisation',
        name: boldOnly[1],
        role: '',
        notes: [],
        nameOrigin: 'bold-line',
        inferred: false,
        channels: [],
        hasChannels: false,
        isDocumentTitle: false,
      };
      absorbTokens(boldOnly[1], null);
      continue;
    }

    absorbTokens(line, null);
    if (!tokensIn(line).length) note(open, line);
  }

  closeRow(open, rows, counter);

  return {
    rows: mergeDuplicateRows(rows),
    looseChannels,
    stats: { lines: lines.length, emails, phones, sections },
  };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Fold rows that name the same body into one.
 *
 * A page that mentions an organisation in an overview and again in a section
 * would otherwise arrive as two contacts that look identical to the user, which
 * is the fastest way to make a registry untrustworthy.
 */
export function mergeDuplicateRows(rows: HarvestRowDraft[]): HarvestRowDraft[] {
  const byKey = new Map<string, HarvestRowDraft>();
  const order: string[] = [];

  for (const row of rows) {
    const key = contactNameDedupeKey(row.name) || row.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, channels: [...row.channels] });
      order.push(key);
      continue;
    }
    existing.confidence = Math.max(existing.confidence, row.confidence);
    if (!existing.role) existing.role = row.role;
    if (row.notes && !existing.notes.includes(row.notes)) {
      existing.notes = existing.notes
        ? `${existing.notes}\n${row.notes}`
        : row.notes;
    }
    for (const channel of row.channels) pushChannel(existing.channels, channel);
  }

  return order.map((key) => byKey.get(key)!);
}

/** A row proposed by a model, before merge. Every field here is a guess. */
export interface HarvestAgentRow {
  name: string;
  kind?: ContactKind;
  role?: string;
  notes?: string;
  channels?: Array<{
    kind: ContactChannelKind;
    value: string;
    label?: string;
  }>;
}

/**
 * Merge model-proposed rows into a deterministic scan.
 *
 * Two rules, and they are the whole point:
 *   • A value the text already contained is never replaced by a model's version —
 *     the existing channel wins, because it can be pointed at in the source.
 *   • Everything the model contributes is marked `inferred`, so the grid can show
 *     it as a guess (the NEW chip) and the user knows which cells to check.
 *
 * Rows whose name matches nothing in the scan are appended as new organisations,
 * also inferred. A model can therefore add a body the scanner missed, but it can
 * never make the scan look like it read something it did not.
 */
export function mergeAgentRows(
  scan: HarvestScan,
  agentRows: HarvestAgentRow[],
): HarvestScan {
  const rows = scan.rows.map((row) => ({
    ...row,
    channels: row.channels.map((c) => ({ ...c })),
  }));
  let counter = rows.length;

  for (const agentRow of agentRows) {
    const name = cleanName(agentRow.name ?? '');
    if (!name) continue;
    const key = contactNameDedupeKey(name);
    let target = rows.find(
      (row) => contactNameDedupeKey(row.name) === key && key.length > 0,
    );

    if (!target) {
      counter += 1;
      target = {
        id: `row-${counter}`,
        kind: agentRow.kind ?? 'organisation',
        name,
        role: agentRow.role ?? '',
        notes: agentRow.notes ?? '',
        confidence: 0.5,
        nameOrigin: 'agent',
        inferred: true,
        channels: [],
      };
      rows.push(target);
    } else {
      if (!target.role && agentRow.role) {
        target.role = `${agentRow.role}`;
      }
      if (agentRow.notes && !target.notes.includes(agentRow.notes)) {
        target.notes = target.notes
          ? `${target.notes}\n${agentRow.notes}`
          : agentRow.notes;
      }
    }

    for (const channel of agentRow.channels ?? []) {
      const value = canonicalChannelValue(channel.kind, channel.value);
      if (!value) continue;
      const key2 = channelDedupeKey(channel.kind, value);
      // The deterministic read of the same address always wins.
      const already = target.channels.find(
        (c) => channelDedupeKey(c.kind, c.value) === key2,
      );
      if (already) continue;
      target.channels.push({
        kind: channel.kind,
        value,
        label: channel.label ?? '',
        confidence: 0.5,
        inferred: true,
      });
    }
  }

  return { ...scan, rows };
}
