/**
 * lib/timeline/selection.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pointer modifiers for keyframe multi-selection. The canvas supplies visible
 * time order for Shift ranges; this function owns only selection semantics.
 */

export type TimelineKeySelection = {
  primaryKeyId: string | null;
  keyIds: string[];
  anchorKeyId: string | null;
};

export function resolveTimelineKeySelection(input: {
  clickedKeyId: string;
  orderedKeyIds: readonly string[];
  currentKeyId?: string;
  currentKeyIds?: readonly string[];
  anchorKeyId?: string | null;
  shiftKey?: boolean;
  toggleKey?: boolean;
}): TimelineKeySelection {
  const current = [...(input.currentKeyIds ?? (input.currentKeyId ? [input.currentKeyId] : []))];
  if (input.shiftKey) {
    const anchorKeyId = input.anchorKeyId ?? input.currentKeyId ?? input.clickedKeyId;
    const anchor = input.orderedKeyIds.indexOf(anchorKeyId);
    const clicked = input.orderedKeyIds.indexOf(input.clickedKeyId);
    if (anchor >= 0 && clicked >= 0) {
      const low = Math.min(anchor, clicked);
      const high = Math.max(anchor, clicked);
      return {
        primaryKeyId: input.clickedKeyId,
        keyIds: input.orderedKeyIds.slice(low, high + 1),
        anchorKeyId,
      };
    }
  }

  if (input.toggleKey) {
    const next = new Set(current);
    if (next.has(input.clickedKeyId)) next.delete(input.clickedKeyId);
    else next.add(input.clickedKeyId);
    const keyIds = [...next];
    const primaryKeyId = next.has(input.clickedKeyId)
      ? input.clickedKeyId
      : input.currentKeyId && next.has(input.currentKeyId)
        ? input.currentKeyId
        : keyIds.at(-1) ?? null;
    return { primaryKeyId, keyIds, anchorKeyId: input.clickedKeyId };
  }

  if (current.length > 1 && current.includes(input.clickedKeyId)) {
    return {
      primaryKeyId: input.currentKeyId ?? input.clickedKeyId,
      keyIds: current,
      anchorKeyId: input.anchorKeyId ?? input.currentKeyId ?? input.clickedKeyId,
    };
  }
  return {
    primaryKeyId: input.clickedKeyId,
    keyIds: [input.clickedKeyId],
    anchorKeyId: input.clickedKeyId,
  };
}
