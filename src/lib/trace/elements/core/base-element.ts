import type { Point, PropertyTrack } from '../../types';

/**
 * Fields every Trace element carries, regardless of its concrete type.
 *
 * Concrete element interfaces narrow `type` and `attributes`; this base keeps
 * the graph/hierarchy/animation contract in one place.
 */
export interface BaseTraceElement {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  /** Storyboard scene this element belongs to (or null for global). */
  sceneId?: string | null;
  origin: Point;
  tracks: PropertyTrack[];
  parentId?: string | null;
  childrenIds?: string[];
}
