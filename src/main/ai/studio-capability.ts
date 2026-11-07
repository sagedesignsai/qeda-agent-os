/**
 * ai/studio-capability.ts — Studio capability discovery (registry-derived).
 */

export interface StudioCapabilityAnswer {
  query: string;
  patterns: Array<{ id: string; label: string; description: string; useWhen: string }>;
  practices: string[];
  available: true;
}

const PATTERNS = [
  { id: 'kinetic-zoom', label: 'Kinetic Zoom', description: 'Zoom-ins on moments that matter; cuts dead air. Use when a demo needs emphasis.', keywords: ['zoom', 'focus', 'emphasis', 'highlight', 'kinetic'] },
  { id: 'dead-air-cut', label: 'Dead-Air Cut', description: 'Trim pauses/silences; tighten pacing. Use when recording drags.', keywords: ['cut', 'trim', 'pause', 'silence', 'pacing', 'tighten'] },
  { id: 'subtitles', label: 'Subtitles', description: 'Burned-in captions from transcript segments. Use when accessibility matters.', keywords: ['subtitle', 'caption', 'accessibility', 'text'] },
  { id: 'marketing-kit', label: 'Marketing Kit', description: 'Tweets, changelogs, LinkedIn posts from the take. Use when shipping a demo.', keywords: ['tweet', 'changelog', 'linkedin', 'post', 'ship', 'announce'] },
  { id: 'framing', label: 'Framing & Style', description: 'Crop/zoom framing, effects, highlights. Use for polish pass.', keywords: ['frame', 'crop', 'style', 'effect', 'highlight', 'polish'] },
];

const PRACTICES = [
  'Ground every edit in take metadata — never invent timestamps.',
  'Cut dead air first, then zoom, then style. Order matters for pacing.',
  'Keep zooms short (0.5–1.5s) and eased; jittery zooms distract.',
  'Subtitles last — they depend on final cut points.',
];

export function discoverStudioCapability(query: string): StudioCapabilityAnswer {
  const q = (query.trim() || 'video edit').toLowerCase();
  const scored = PATTERNS.map((p) => ({ p, s: p.keywords.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0) })).sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).map((x) => x.p);
  return {
    query: q,
    patterns: (top.length > 0 ? top : PATTERNS).map((p) => ({ id: p.id, label: p.label, description: p.description, useWhen: p.description })),
    practices: PRACTICES,
    available: true,
  };
}
