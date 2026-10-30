/**
 * lib/timeline/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The neutral timeline model.
 *
 * The timeline UI is a **reusable kit**, not a Motion feature. It knows about
 * rows, items and keys — never about Motion documents, tracks, clips or
 * keyframe easing. Any feature that needs a scrubbable, zoomable, editable time
 * canvas (Showcase Studio's edit lane, SoundLab's arrangement, a future
 * automation editor) supplies an adapter that projects its own document into
 * this model and handles the edit intents the kit emits.
 *
 * Two consequences worth keeping:
 *   - The kit never stores document state. It paints a model and calls back.
 *   - Ids are opaque strings. Uniqueness is the adapter's job, because only the
 *     adapter knows how to compose a stable id from its own entities.
 *
 * Time is in seconds at every level. Frames exist only in `fps`, for labels.
 */

export type TimelineView = {
  /** Horizontal scale. Zoom lives here so a resize never reflows time. */
  pxPerSecond: number;
  /** Left edge of the viewport in seconds — scroll is in time, not pixels. */
  scrollSeconds: number;
};

export type TimelineLoopRange = { start: number; end: number };

export type TimelineRow = {
  id: string;
  name: string;
  muted?: boolean;
  locked?: boolean;
};

/** Visual tone, mapped to design tokens by the painter. */
export type TimelineTone = 'primary' | 'accent' | 'info' | 'muted' | 'warn';

export type TimelineKey = {
  id: string;
  /** Document time in seconds. */
  time: number;
  /** Optional channel the key belongs to, for adapters that group keys. */
  channelId?: string;
};

export type TimelineChannel = {
  id: string;
  label: string;
  keys: TimelineKey[];
};

export type TimelineItem = {
  id: string;
  rowId: string;
  label: string;
  /** Document time in seconds. */
  start: number;
  duration: number;
  tone?: TimelineTone;
  locked?: boolean;
  dimmed?: boolean;
  trimmedKeyCount?: number;
  /** Optional per-property key rows drawn inside the item. */
  channels?: TimelineChannel[];
};

export type TimelineModel = {
  duration: number;
  fps?: number;
  rows: TimelineRow[];
  items: TimelineItem[];
  loop?: TimelineLoopRange | null;
};

/**
 * Selection is a plain bag of ids rather than a discriminated union, so the kit
 * can represent "a key inside an item" without knowing the domain's nesting.
 */
export type TimelineSelection = {
  rowId?: string;
  itemId?: string;
  keyId?: string;
} | null;

/**
 * A read-only clock handle. The kit paints the playhead from `getTime()` inside
 * its own animation frame and re-paints on `subscribe`, so advancing time never
 * causes a React render.
 */
export type TimelineClock = {
  getTime(): number;
  isPlaying(): boolean;
  /** Play/pause. A transport needs control, not just a read handle. */
  toggle(): void;
  subscribe(listener: () => void): () => void;
};

export type TimelineEditHandlers = {
  onScrub?(time: number): void;
  onSelect?(selection: TimelineSelection): void;
  /** Called once per drag, on pointer-up — one undo entry, no per-move clones. */
  onMoveItem?(itemId: string, start: number, rowId: string): void;
  onMoveKey?(keyId: string, time: number): void;
  onLoopChange?(range: TimelineLoopRange): void;
  onZoomChange?(view: TimelineView): void;
  onScrollChange?(scrollSeconds: number): void;
  /** Vertical wheel delta in pixels — the kit does not own row scroll state. */
  onScrollRows?(deltaPixels: number): void;
};
