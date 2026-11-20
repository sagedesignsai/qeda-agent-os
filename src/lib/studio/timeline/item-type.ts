import type { StudioClipPayload, TimelineItemType, TrackType } from '../types';

/** Infer an item's semantic kind when loading an older untagged timeline. */
export function inferTimelineItemType(
  trackType: TrackType,
  payload?: StudioClipPayload,
  sourceKind?: 'video' | 'audio' | 'image',
): TimelineItemType {
  switch (trackType) {
    case 'audio':
      return 'audio';
    case 'effects':
      return 'effect';
    case 'transitions':
      return 'transition';
    case 'captions':
      return 'text';
    case 'overlays':
      return 'overlay';
    case 'video':
      if (sourceKind === 'image' || payload?.kind === 'image') return 'image';
      return 'video';
  }
}

/** Return an explicit persisted kind, falling back for older project data. */
export function resolveTimelineItemType(
  trackType: TrackType,
  itemType: TimelineItemType | undefined,
  payload?: StudioClipPayload,
  sourceKind?: 'video' | 'audio' | 'image',
): TimelineItemType {
  return itemType ?? inferTimelineItemType(trackType, payload, sourceKind);
}
