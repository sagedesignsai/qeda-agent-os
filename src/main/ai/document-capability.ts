/**
 * ai/document-capability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document capability discovery service.
 * Turns a free-form query into grounded guidance derived from the live
 * PdfBlock union + template patterns — never hand-written prose that drifts.
 * Mirrors Motion discoverMotionCapability + Trace getTraceCapability.
 */

export interface DocumentCapabilityAnswer {
  query: string;
  patterns: Array<{ id: string; label: string; description: string; useWhen: string }>;
  blockTypes: Array<{ type: string; useWhen: string; keyProps: string[] }>;
  practices: string[];
  available: true;
}

const BLOCKS: Array<{ type: string; useWhen: string; keyProps: string[]; keywords: string[] }> = [
  {
    type: 'heading',
    useWhen: 'Section titles (level 1-4), bookmarks, badges. The skeleton of every professional document.',
    keyProps: ['level', 'text', 'subtitle?', 'align?', 'badge?', 'bookmark?'],
    keywords: ['heading', 'title', 'section', 'header', 'h1', 'outline'],
  },
  {
    type: 'paragraph',
    useWhen: 'Body prose. Content is the prose; align/size/lineHeight for tone.',
    keyProps: ['content', 'align?', 'fontSize?', 'bold?', 'italic?', 'color?', 'lineHeight?'],
    keywords: ['paragraph', 'body', 'prose', 'text', 'content'],
  },
  {
    type: 'columns',
    useWhen: 'Side-by-side layout (e.g. dates + details, two-column feature lists). columns: [{id, title?, widthRatio?, blocks[]}], gap.',
    keyProps: ['columns[]', 'gap'],
    keywords: ['column', 'columns', 'side', 'two', 'layout', 'grid', 'feature', 'list'],
  },
  {
    type: 'table',
    useWhen: 'Structured data. columns: [{id, header, widthPct, align?}] (widthPct sums to 100), rows: string[][].',
    keyProps: ['columns[]', 'rows[]', 'striped?', 'showBorders?', 'headerBg?'],
    keywords: ['table', 'data', 'rows', 'columns', 'grid', 'schedule', 'pricing', 'comparison'],
  },
  {
    type: 'callout',
    useWhen: 'Attention blocks: variant info|warning|success|note|quote + title? + text.',
    keyProps: ['variant', 'title?', 'text'],
    keywords: ['callout', 'note', 'warning', 'info', 'success', 'quote', 'highlight', 'attention'],
  },
  {
    type: 'metrics',
    useWhen: 'KPI cards: items: [{id, label, value, change?, isPositive?}], columns 2|3|4.',
    keyProps: ['items[]', 'columns?'],
    keywords: ['metrics', 'kpi', 'stats', 'numbers', 'dashboard', 'summary', 'cards'],
  },
  {
    type: 'divider',
    useWhen: 'Visual separator: thickness?, color?, style solid|dashed|dotted, spacing?.',
    keyProps: ['thickness?', 'color?', 'style?', 'spacing?'],
    keywords: ['divider', 'separator', 'line', 'rule'],
  },
  {
    type: 'page-break',
    useWhen: 'Force a page break before this block. No props.',
    keyProps: [],
    keywords: ['break', 'page', 'pagination', 'section'],
  },
  {
    type: 'signature',
    useWhen: 'Signature block: {signeeName, role?, date?, company?}.',
    keyProps: ['signeeName', 'role?', 'date?', 'company?'],
    keywords: ['signature', 'sign', 'approve', 'signee', 'execution'],
  },
  {
    type: 'image',
    useWhen: 'Embedded image: {src, height?, width?, align?, caption?}.',
    keyProps: ['src', 'height?', 'width?', 'align?', 'caption?'],
    keywords: ['image', 'picture', 'figure', 'diagram', 'photo', 'illustration'],
  },
];

const PATTERNS: Array<{ id: string; label: string; description: string; useWhen: string; keywords: string[] }> = [
  {
    id: 'proposal',
    label: 'Executive Proposal',
    description: 'Heading + metrics overview + columns (key facts) + table (scope/pricing) + callout (terms) + signature.',
    useWhen: 'Proposals, pitches, executive summaries.',
    keywords: ['proposal', 'pitch', 'executive', 'business'],
  },
  {
    id: 'memo',
    label: 'Memorandum',
    description: 'Heading + paragraph (subject/date block via columns) + body paragraphs + callout (action required).',
    useWhen: 'Internal memos, updates, notices.',
    keywords: ['memo', 'notice', 'update', 'internal', 'announcement'],
  },
  {
    id: 'letter',
    label: 'Formal Letter',
    description: 'Heading (recipient/date columns) + paragraphs + signature. No metrics/tables unless needed.',
    useWhen: 'Letters, correspondence, formal notices.',
    keywords: ['letter', 'formal', 'correspondence', 'notice'],
  },
  {
    id: 'policy-report',
    label: 'Policy / Report',
    description: 'Headings by section + tables (compliance matrices) + callouts (warnings) + metrics (KPIs).',
    useWhen: 'Policies, reports, technical specs, audits.',
    keywords: ['policy', 'report', 'spec', 'technical', 'audit', 'compliance'],
  },
  {
    id: 'invoice',
    label: 'Invoice',
    description: 'Heading + columns (bill-to/dates) + table (line items) + metrics (total) + signature.',
    useWhen: 'Invoices, quotes, estimates.',
    keywords: ['invoice', 'quote', 'estimate', 'billing', 'payment'],
  },
  {
    id: 'resume',
    label: 'Resume / CV',
    description: 'Heading + columns (contact/details) + sections + tables (experience) + metrics (skills).',
    useWhen: 'Resumes, CVs, profiles.',
    keywords: ['resume', 'cv', 'profile', 'experience', 'career'],
  },
];

const DESIGN_PRACTICES = [
  'Lead with the skeleton: heading level 1 for the title, then level 2 per section. Never paragraph-only.',
  'Use ONE callout per document for the single most important caveat — callouts lose value when overused.',
  'Prefer a table over a paragraph list for anything enumerable (scope, pricing, dates, requirements).',
  'Use columns for metadata (dates, parties, references) instead of burying them in prose.',
  'Add metrics only when real numbers exist — empty or invented metrics undermine trust.',
  'Divider + page-break judiciously: dividers between major sections, page-breaks before appendices/signatures.',
  'Sign-off order: body → divider → signature. Never signature mid-document.',
  'Align public-facing long documents left; centered only for titles/hero headings.',
];

function score(keywords: string[], q: string): number {
  return keywords.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0);
}

export function discoverDocumentCapability(query: string): DocumentCapabilityAnswer {
  const q = (query.trim() || 'professional document').toLowerCase();
  const scoredPatterns = PATTERNS.map((p) => ({ p, s: score(p.keywords, q) })).sort((a, b) => b.s - a.s);
  const topPatterns = scoredPatterns.filter((x) => x.s > 0).map((x) => x.p);
  const patterns = (topPatterns.length > 0 ? topPatterns : PATTERNS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    useWhen: p.useWhen,
  }));

  const scoredBlocks = BLOCKS.map((b) => ({ b, s: score(b.keywords, q) })).sort((a, b) => b.s - a.s);
  const topBlocks = scoredBlocks.filter((x) => x.s > 0).map((x) => x.b);
  const blockTypes = (topBlocks.length > 0 ? topBlocks : BLOCKS).map((b) => ({
    type: b.type,
    useWhen: b.useWhen,
    keyProps: b.keyProps,
  }));

  return { query: q, patterns, blockTypes, practices: DESIGN_PRACTICES, available: true };
}
