/**
 * lib/trace/animation/stagger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Staggered keyframe generation across multiple elements.
 *
 * Adapted from sagedesigns-os lib/motion/animation/stagger.ts for Nova Trace.
 */

import type { PropertyTrack } from '../types';

export function staggerKeyframes(
  elementIds: string[],
  property: string,
  baseTimeMs: number,
  staggerMs: number,
  value: number,
  easing: string = 'power2.out',
): Record<string, PropertyTrack> {
  const tracks: Record<string, PropertyTrack> = {};
  elementIds.forEach((id, index) => {
    tracks[id] = {
      id: `tr-${property}-${index}`,
      property: property as any,
      label: property.charAt(0).toUpperCase() + property.slice(1),
      keyframes: [
        {
          id: `kf-${id}-start`,
          timeMs: baseTimeMs + index * staggerMs,
          value,
          easing,
        },
      ],
    };
  });
  return tracks;
}
