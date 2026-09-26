/**
 * lib/markdown-blocks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, dependency-free codec between a markdown document and a list of typed
 * blocks — the data model behind Vellum's block editor.
 *
 * Design rules:
 *   • Deterministic: the same document always parses to the same blocks, and
 *     round-tripping (parse → serialize) is stable enough to diff.
 *   • Pure: no Electron, no React, no I/O — trivially unit-testable and safe
 *     for both processes.
 *   • Editor-neutral: blocks map 1:1 to editor rows; markdown stays the
 *     source of truth so documents remain portable and greppable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulleted-list'
  | 'numbered-list'
  | 'todo'
  | 'quote'
  | 'code'
  | 'image'
  | 'divider';

/** Every valid BlockType, for runtime validation of untrusted input. */
export const BLOCK_TYPES: readonly BlockType[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulleted-list',
  'numbered-list',
  'todo',
  'quote',
  'code',
  'image',
  'divider',
];

/** Narrows an unknown value to a BlockType. Use when validating IPC input. */
export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

export interface Block {
  /** Stable id, reused across edits so React keys and backlinks survive. */
  id: string;
  type: BlockType;
  text: string;
  /** Extra state: todo checked state, code fence language. */
  checked?: boolean;
  language?: string;
}

/** Blocks whose text participates in outline / backlink extraction. */
export const CONTAINER_BLOCK_TYPES: ReadonlySet<BlockType> = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulleted-list',
  'numbered-list',
  'todo',
  'quote',
]);

// ─── Ids ──────────────────────────────────────────────────────────────────────

let idCounter = 0;

/** Stable-per-process block id. Unique enough for editor rows and tests. */
export function newBlockId(): string {
  idCounter += 1;
  return `b${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// ─── Parse: markdown → blocks ────────────────────────────────────────────────

const HEADING_PREFIX: Record<string, BlockType> = {
  '#': 'heading1',
  '##': 'heading2',
  '###': 'heading3',
};

const FENCE_RE = /^```(\S*)\s*$/;
const TODO_RE = /^(?:[-*+]\s+)?\[( |x|X)\]\s*(.*)$/;
/** A whole line that is a single markdown image: `![alt](url)` (optional title). */
export const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;

function classify(
  line: string,
): { type: BlockType; text: string; checked?: boolean; language?: string } | null {
  const trimmed = line.trim();

  if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
    return { type: 'divider', text: '' };
  }

  const fence = FENCE_RE.exec(trimmed);
  if (fence) return { type: 'code', text: '', language: fence[1] || undefined };

  const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
  if (heading) return { type: HEADING_PREFIX[heading[1]], text: heading[2] };

  // Only an empty '#' is a bare heading marker; otherwise treat as text.
  if (/^#{1,3}$/.test(trimmed)) return { type: HEADING_PREFIX[trimmed], text: '' };

  if (IMAGE_RE.test(trimmed)) return { type: 'image', text: trimmed };

  const todo = TODO_RE.exec(trimmed);
  if (todo) {
    return { type: 'todo', text: todo[2], checked: todo[1].toLowerCase() === 'x' };
  }

  if (/^[-*+]\s+/.test(trimmed)) {
    return { type: 'bulleted-list', text: trimmed.replace(/^[-*+]\s+/, '') };
  }

  if (/^\d+[.)]\s+/.test(trimmed)) {
    return { type: 'numbered-list', text: trimmed.replace(/^\d+[.)]\s+/, '') };
  }

  if (/^>\s?/.test(trimmed)) {
    return { type: 'quote', text: trimmed.replace(/^>\s?/, '') };
  }

  if (trimmed === '') return { type: 'paragraph', text: '' };

  return { type: 'paragraph', text: line };
}

/**
 * Parse a markdown document into blocks.
 *
 * Unfenced `#`/`>` lines inside code blocks are always treated as code — the
 * fence state machine runs before any other classification.
 */
export function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank separator lines produce no blocks — serializeBlocksToMarkdown
    // re-inserts them between blocks, which keeps the round trip stable.
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line.trim());

    if (fence) {
      const language = fence[1] || undefined;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence (or EOF)
      blocks.push({
        id: newBlockId(),
        type: 'code',
        text: codeLines.join('\n'),
        language,
      });
      continue;
    }

    const info = classify(line);
    if (!info) {
      i += 1;
      continue;
    }

    if (info.type === 'code') {
      // Opening fence without body handled above; a bare '```' classify hit
      // cannot happen because the fence branch already consumed it.
      blocks.push({ id: newBlockId(), type: 'code', text: '', language: undefined });
      i += 1;
      continue;
    }

    blocks.push({ id: newBlockId(), ...info });
    i += 1;
  }

  if (blocks.length === 0) {
    blocks.push({ id: newBlockId(), type: 'paragraph', text: '' });
  }

  return blocks;
}

// ─── Serialize: blocks → markdown ────────────────────────────────────────────

const HEADING_MARK: Partial<Record<BlockType, string>> = {
  heading1: '#',
  heading2: '##',
  heading3: '###',
};

function serializeBlock(block: Block): string {
  switch (block.type) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return `${HEADING_MARK[block.type]} ${block.text}`.trimEnd();
    case 'bulleted-list':
      return `- ${block.text}`;
    case 'numbered-list':
      return `1. ${block.text}`;
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
    case 'quote':
      return `> ${block.text}`;
    case 'code':
      return ['```' + (block.language ?? ''), block.text, '```'].join('\n');
    case 'image':
      // The block text already holds the full markdown image.
      return block.text.trim();
    case 'divider':
      return '---';
    case 'paragraph':
    default:
      return block.text;
  }
}

/**
 * Serialize blocks back to a markdown document.
 *
 * Adjacent list items stay contiguous (as markdown lists require) and blank
 * lines are inserted between every other pair of blocks, so the round trip is
 * stable: `parse(serialize(parse(doc)))` equals `parse(doc)`.
 */
export function serializeBlocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const prev = blocks[i - 1];

    out.push(serializeBlock(block));

    const listy = (b?: Block) =>
      b?.type === 'bulleted-list' || b?.type === 'numbered-list' || b?.type === 'todo';

    if (i < blocks.length - 1) {
      const isListItem = listy(block) && listy(blocks[i + 1]);
      if (!isListItem) out.push('');
    }
  }

  return out.join('\n');
}

// ─── Transforms (immutable — every helper returns a new array) ───────────────

export function updateBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
}

export function insertBlockAfter(blocks: Block[], afterId: string | null, block?: Block): { blocks: Block[]; id: string } {
  const fresh = block ?? { id: newBlockId(), type: 'paragraph' as const, text: '' };
  if (afterId === null) {
    return { blocks: [fresh, ...blocks], id: fresh.id };
  }
  const index = blocks.findIndex((b) => b.id === afterId);
  const at = index >= 0 ? index + 1 : blocks.length;
  const next = blocks.slice();
  next.splice(at, 0, fresh);
  return { blocks: next, id: fresh.id };
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  const filtered = blocks.filter((b) => b.id !== id);
  return filtered.length > 0
    ? filtered
    : [{ id: newBlockId(), type: 'paragraph', text: '' }];
}

/** Enter on a todo/list row splits it; on any row starts a fresh paragraph. */
export function splitBlock(blocks: Block[], id: string): { blocks: Block[]; newId: string } {
  const index = blocks.findIndex((b) => b.id === id);
  if (index < 0) return { blocks, newId: id };

  const block = blocks[index];
  const fresh: Block = { id: newBlockId(), type: 'paragraph', text: '' };

  if (block.type === 'todo') {
    fresh.type = 'todo';
    fresh.checked = false;
  } else if (block.type === 'bulleted-list' || block.type === 'numbered-list') {
    fresh.type = block.type;
  }

  const next = blocks.slice();
  next.splice(index + 1, 0, fresh);
  return { blocks: next, newId: fresh.id };
}

/**
 * Tab / Shift-Tab behaviour: cycle heading ↔ indented paragraph. Code and
 * divider rows are structural and do not participate.
 */
export function indentBlock(blocks: Block[], id: string, direction: 1 | -1): Block[] {
  return blocks.map((b) => {
    if (b.id !== id || b.type === 'code' || b.type === 'image' || b.type === 'divider') return b;
    if (direction === 1) {
      if (b.type === 'paragraph') return { ...b, type: 'heading3' as const };
      if (b.type === 'heading3') return { ...b, type: 'heading2' as const };
      if (b.type === 'heading2') return { ...b, type: 'heading1' as const };
      return b;
    }
    // Shift-Tab walks the same cycle back down: h1 → h2 → h3 → paragraph.
    if (b.type === 'heading1') return { ...b, type: 'heading2' as const };
    if (b.type === 'heading2') return { ...b, type: 'heading3' as const };
    if (b.type === 'heading3') return { ...b, type: 'paragraph' as const };
    return b;
  });
}

/** Move a row up/down with Alt+Arrow. */
export function moveBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const index = blocks.findIndex((b) => b.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= blocks.length) return blocks;

  const next = blocks.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function setBlockType(blocks: Block[], id: string, type: BlockType): Block[] {
  return blocks.map((b) => {
    if (b.id !== id) return b;
    const next: Block = { ...b, type };
    if (type === 'todo' && next.checked === undefined) next.checked = false;
    return next;
  });
}

// ─── Links, tags & wiki links ────────────────────────────────────────────────

/**
 * True when pasted text should become new blocks rather than inline text.
 *
 * Multi-line text always qualifies; a single line qualifies only if it is a
 * non-paragraph construct (heading, list, quote, code fence, image, divider) or
 * contains a markdown inline construct like a link. Plain prose and bare URLs
 * do not, so they paste inline as the user expects.
 */
export function isBlockLevelMarkdown(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1) return true;
  const line = (lines[0] ?? '').trim();
  if (line === '') return false;
  const info = classify(line);
  return info !== null && info.type !== 'paragraph';
}

/**
 * Insert pasted markdown as typed blocks at the caret, splitting the target
 * block into `before` + parsed blocks + `after`.
 *
 * Returns null when the caller should fall back to the default paste: the
 * target is a code block, the paste is not block-level, or the block is gone.
 */
export function insertParsedBlocksAt(
  blocks: Block[],
  blockId: string,
  pasted: string,
  caretStart: number,
  caretEnd: number,
): { blocks: Block[]; focusId: string } | null {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return null;
  const current = blocks[index];
  if (current.type === 'code') return null;
  if (!isBlockLevelMarkdown(pasted)) return null;

  const text = current.text;
  const start = Math.max(0, Math.min(caretStart, text.length));
  const end = Math.max(start, Math.min(caretEnd, text.length));
  const before = text.slice(0, start);
  const after = text.slice(end);

  // parseMarkdownToBlocks mints its own ids; re-key them so they cannot clash
  // with blocks already on the page.
  const inserted = parseMarkdownToBlocks(pasted).map((block) => ({
    ...block,
    id: newBlockId(),
  }));

  // Content that followed the caret rejoins the paste: fold it into a trailing
  // paragraph (or add one) so nothing is lost.
  if (after) {
    const last = inserted[inserted.length - 1];
    if (last && last.type === 'paragraph') {
      last.text = `${last.text}${after}`;
    } else {
      inserted.push({ id: newBlockId(), type: 'paragraph', text: after });
    }
  }

  const head = before
    ? [...blocks.slice(0, index), { ...current, text: before }]
    : blocks.slice(0, index);
  const next = [...head, ...inserted, ...blocks.slice(index + 1)];
  return { blocks: next, focusId: inserted[0]?.id ?? current.id };
}

/** Extract the alt text and URL from a markdown image block's text. */
export function parseImageMarkdown(text: string): { alt: string; url: string } | null {
  const match = IMAGE_RE.exec(text.trim());
  if (!match) return null;
  return { alt: match[1] ?? '', url: match[2] };
}

/** `[label](target)` — target may be an http(s) URL or a `doc:` page id. */
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
/** `[[Page name]]` wiki links — resolved against page titles, not ids. */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
/** `#tag` — not inside a word, not a markdown heading anchor. */
const TAG_RE = /(^|[\s(])#([A-Za-z][\w/-]*)/g;

export interface ExtractedLink {
  label: string;
  /** http(s) URL or doc:<pageId> reference. */
  target: string;
  kind: 'web' | 'doc';
}

export function extractLinks(text: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[2];
    links.push({
      label: match[1],
      target,
      kind: target.startsWith('doc:') ? 'doc' : 'web',
    });
  }

  for (const match of text.matchAll(WIKI_LINK_RE)) {
    const name = match[1].trim();
    if (name) links.push({ label: match[2]?.trim() || name, target: `wiki:${name}`, kind: 'doc' });
  }

  return links;
}

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(TAG_RE)) {
    tags.add(match[2].toLowerCase());
  }
  return [...tags];
}

export interface BlockOutline {
  id: string;
  type: BlockType;
  text: string;
}

/** Heading-level outline of a document, for the page info panel. */
export function extractOutline(blocks: Block[]): BlockOutline[] {
  return blocks
    .filter((b) => b.type.startsWith('heading'))
    .map(({ id, type, text }) => ({ id, type, text }));
}

/** All links found across a block list (backlink/graph building blocks). */
export function extractDocLinks(blocks: Block[]): ExtractedLink[] {
  return blocks.flatMap((b) => (CONTAINER_BLOCK_TYPES.has(b.type) ? extractLinks(b.text) : []));
}

export function extractDocTags(blocks: Block[]): string[] {
  const tags = new Set<string>();
  for (const block of blocks) {
    if (!CONTAINER_BLOCK_TYPES.has(block.type)) continue;
    for (const tag of extractTags(block.text)) tags.add(tag);
  }
  return [...tags].sort();
}
