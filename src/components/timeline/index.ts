/**
 * components/timeline/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface of the reusable timeline kit. Import from here, not from the
 * individual files, so the kit can be re-arranged without touching consumers.
 */

export { CanvasTimeline, TIMELINE_ROW_HEIGHT, TIMELINE_RULER_HEIGHT } from './CanvasTimeline';
export type { CanvasTimelineProps } from './CanvasTimeline';
export { TimelineRowHeaders } from './TimelineRowHeaders';
export type { TimelineRowHeadersProps } from './TimelineRowHeaders';
export { TimelineTransport } from './TimelineTransport';
export type { TimelineTransportProps } from './TimelineTransport';
