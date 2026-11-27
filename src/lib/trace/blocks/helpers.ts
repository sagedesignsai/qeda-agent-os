/**
 * lib/trace/blocks/helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Small pure builders shared by the registry blocks. Everything here produces
 * plain Trace elements/tracks — no rendering, no store.
 */

import type { TraceAssetFragment } from '../assets/types';
import type {
  ExpandedRecipe,
} from '../recipes/types';
import type {
  PropertyTrack,
  TraceElement,
} from '../types';

export const BLOCK_FONT = 'Inter, system-ui, sans-serif';

export function blockElement(
  input: Partial<TraceElement> & Pick<TraceElement, 'id' | 'name' | 'type'>,
): TraceElement {
  return {
    visible: true,
    locked: false,
    sceneId: null,
    attributes: {},
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...input,
  };
}

export function blockTrack(
  id: string,
  property: PropertyTrack['property'],
  label: string,
  keyframes: Array<{
    timeMs: number;
    value: number | string;
    easing?: string;
  }>,
): PropertyTrack {
  return {
    id,
    property,
    label,
    keyframes: keyframes.map((keyframe, index) => ({
      id: `${id}-k${index}`,
      timeMs: Math.max(0, Math.round(keyframe.timeMs)),
      value: keyframe.value,
      easing: keyframe.easing ?? 'power2.out',
    })),
  };
}

export function optionText(
  options: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = options[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function optionNumber(
  options: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(options[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function optionColor(
  options: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = options[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function optionLines(
  options: Record<string, unknown>,
  key: string,
  fallback: string[],
  max: number,
): string[] {
  const value = options[key];
  const source = typeof value === 'string' ? value : fallback.join('\n');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
  return lines.length > 0 ? lines : fallback;
}

/** Hex → rgba so glow fills can stay parameterised by a single colour. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/);
  if (!hex) return color;
  const value = parseInt(hex[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Wrap a sentence into `maxChars`-ish lines without cutting words. */
export function wrapLines(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** Turn a recipe expansion into an insertable fragment. */
export function fragmentFromExpanded(
  expanded: ExpandedRecipe,
  width: number,
  height: number,
): TraceAssetFragment {
  const elements: Record<string, TraceElement> = {
    [expanded.rootId]: expanded.root,
  };
  for (const child of expanded.children) elements[child.id] = child;
  return {
    width,
    height,
    elements,
    rootElementIds: [expanded.rootId],
  };
}

/** Default id factory. `insertFragment` suffixes on collision, so a short seed is enough. */
export function createBlockIdFactory(): (prefix: string) => string {
  let counter = 0;
  const seed =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 6)
      : Date.now().toString(36).slice(-6);
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${seed}-${counter}`;
  };
}