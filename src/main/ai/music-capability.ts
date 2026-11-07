/**
 * ai/music-capability.ts — Music capability discovery (registry-derived).
 */

export interface MusicCapabilityAnswer {
  query: string;
  patterns: Array<{ id: string; label: string; description: string; useWhen: string }>;
  practices: string[];
  available: true;
}

const PATTERNS = [
  { id: 'deep-work-set', label: 'Deep Work Set', description: '8–20 instrumental/low-vocal tracks with rise/plateau/close arc. For focus sessions.', keywords: ['focus', 'deep', 'work', 'instrumental', 'set'] },
  { id: 'playlist', label: 'Saved Playlist', description: 'Persist via createPlaylist for reuse; play via track ids. For keepable sets.', keywords: ['playlist', 'save', 'keep', 'collection'] },
  { id: 'ambience', label: 'Ambience Scene', description: 'Rain/forest/late-night scenes via setAmbience. For room atmosphere.', keywords: ['ambience', 'rain', 'forest', 'night', 'room', 'atmosphere', 'scene'] },
  { id: 'levels', label: 'Levels & Transport', description: 'setLevels + controlPlayback for loudness/pause/skip. For now-playing control.', keywords: ['volume', 'loud', 'quiet', 'pause', 'skip', 'levels', 'play'] },
  { id: 'focus-pair', label: 'Focus Pairing', description: 'Pair a set with the most urgent task via startFocusSession. For task scoring.', keywords: ['task', 'focus', 'score', 'urgent'] },
];

const PRACTICES = [
  'Ground every choice in library search — never invent track ids.',
  'Build sets (8–20, rise/plateau/close), not random lists.',
  'Instrumental/low-vocal for deep work unless asked otherwise.',
  'Save as playlist only when the user wants to keep it.',
];

export function discoverMusicCapability(query: string): MusicCapabilityAnswer {
  const q = (query.trim() || 'music set').toLowerCase();
  const scored = PATTERNS.map((p) => ({ p, s: p.keywords.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0) })).sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).map((x) => x.p);
  return {
    query: q,
    patterns: (top.length > 0 ? top : PATTERNS).map((p) => ({ id: p.id, label: p.label, description: p.description, useWhen: p.description })),
    practices: PRACTICES,
    available: true,
  };
}
