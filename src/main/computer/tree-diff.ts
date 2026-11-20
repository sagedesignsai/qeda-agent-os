/**
 * computer/tree-diff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Maintains a baseline accessibility snapshot and emits compact subtree diffs
 * between turns so the model sees only what changed instead of the full tree.
 */

export interface SemanticElement {
  ref: string; // e.g. "@e1"
  role?: string;
  name?: string;
  description?: string;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  actions?: string[];
  states?: string[];
  children?: string[];
  windowId?: string;
  app?: string;
  path?: string;
}

export interface SemanticSnapshot {
  at: number;
  app?: string;
  windowId?: string;
  title?: string;
  elements: Record<string, SemanticElement>;
  roots: string[];
}

export interface TreeDiff {
  added: SemanticElement[];
  changed: SemanticElement[];
  removed: string[];
  unchanged: number;
  baseline: boolean;
}

function stableKey(el: SemanticElement): string {
  return [
    el.role ?? '',
    el.name ?? '',
    el.description ?? '',
    el.value ?? '',
    JSON.stringify(el.bounds ?? null),
    (el.actions ?? []).join(','),
    (el.states ?? []).join(','),
    (el.children ?? []).join(','),
    el.windowId ?? '',
    el.app ?? '',
  ].join('|');
}

export class TreeDiffer {
  private previous: SemanticSnapshot | null = null;

  reset(): void {
    this.previous = null;
  }

  getPrevious(): SemanticSnapshot | null {
    return this.previous;
  }

  diff(next: SemanticSnapshot): TreeDiff {
    const prev = this.previous;
    this.previous = next;

    if (!prev) {
      return {
        added: Object.values(next.elements),
        changed: [],
        removed: [],
        unchanged: 0,
        baseline: true,
      };
    }

    const added: SemanticElement[] = [];
    const changed: SemanticElement[] = [];
    let unchanged = 0;

    for (const [ref, el] of Object.entries(next.elements)) {
      const before = prev.elements[ref];
      if (!before) {
        added.push(el);
      } else if (stableKey(before) !== stableKey(el)) {
        changed.push(el);
      } else {
        unchanged += 1;
      }
    }

    const removed = Object.keys(prev.elements).filter((ref) => !next.elements[ref]);

    return { added, changed, removed, unchanged, baseline: false };
  }

  /**
   * Compact text representation for LLM consumption. Falls back to full tree
   * on baseline or when most nodes changed.
   */
  format(next: SemanticSnapshot, diff: TreeDiff, opts?: { maxLines?: number }): string {
    const maxLines = opts?.maxLines ?? 400;
    const header = [
      `app=${next.app ?? 'unknown'}`,
      next.title ? `title="${next.title}"` : '',
      next.windowId ? `window=${next.windowId}` : '',
      `elements=${Object.keys(next.elements).length}`,
    ]
      .filter(Boolean)
      .join(' ');

    const lines: string[] = [header];
    if (diff.baseline) {
      lines.push('baseline=true');
      for (const el of Object.values(next.elements)) {
        lines.push(formatElement(el));
        if (lines.length >= maxLines) break;
      }
    } else {
      lines.push(
        `delta added=${diff.added.length} changed=${diff.changed.length} removed=${diff.removed.length} unchanged=${diff.unchanged}`,
      );
      if (diff.removed.length) {
        lines.push(`removed: ${diff.removed.join(', ')}`);
      }
      for (const el of [...diff.changed, ...diff.added]) {
        const prefix = diff.added.includes(el) ? '+' : '~';
        lines.push(`${prefix} ${formatElement(el)}`);
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) {
        lines.push('… (truncated; call getAppState again for more)');
      }
    }
    return lines.join('\n');
  }
}

export function formatElement(el: SemanticElement): string {
  const parts = [el.ref, el.role ?? 'unknown'];
  if (el.name) parts.push(`name="${truncate(el.name, 120)}"`);
  if (el.value) parts.push(`value="${truncate(el.value, 80)}"`);
  if (el.description) parts.push(`desc="${truncate(el.description, 80)}"`);
  if (el.bounds) {
    const b = el.bounds;
    parts.push(`bounds=[${b.x},${b.y},${b.width},${b.height}]`);
  }
  if (el.actions?.length) parts.push(`actions=[${el.actions.join(',')}]`);
  if (el.states?.length) parts.push(`states=[${el.states.join(',')}]`);
  return parts.join(' ');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
