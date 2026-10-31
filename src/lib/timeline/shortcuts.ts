/**
 * lib/timeline/shortcuts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Transport keyboard map for the neutral timeline. Keeping the decision pure
 * means the shortcut list is testable without mounting a canvas, and every
 * consumer (Motion now, other features later) spells them the same way.
 */

export type TimelineShortcutCommand =
  | { type: 'toggle-play' }
  | { type: 'play-from-start' }
  | { type: 'step'; direction: -1 | 1 }
  | { type: 'go-to-start' }
  | { type: 'go-to-end' }
  | null;

export type TimelineShortcutEvent = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export type TimelineShortcutContext = {
  /** True when focus is inside a text field, where Space and arrows mean typing. */
  editable?: boolean;
};

export function resolveTimelineShortcut(
  event: TimelineShortcutEvent,
  context: TimelineShortcutContext = {},
): TimelineShortcutCommand {
  if (context.editable) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  switch (event.key) {
    case ' ':
      return event.shiftKey ? { type: 'play-from-start' } : { type: 'toggle-play' };
    case ',':
      return { type: 'step', direction: -1 };
    case '.':
      return { type: 'step', direction: 1 };
    case 'Home':
      return { type: 'go-to-start' };
    case 'End':
      return { type: 'go-to-end' };
    default:
      return null;
  }
}
