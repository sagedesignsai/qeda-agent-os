/**
 * components/trace/inspector/instance.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Source panel for `<use>` layers.
 *
 * A `use` element is only an SVG reference, so it needs a `href` and nothing
 * else — without one it draws nothing at all, which is why every instance used
 * to be a permanently blank layer. The picker writes the same fragment id the
 * serializer gives each layer's group (`#trace-elem-<id>`), so the instance is
 * a live, animated copy of that layer at the playhead. A free-text field stays
 * available for references this editor cannot enumerate (a `#symbol` inside
 * imported defs).
 *
 * Self, ancestor and descendant targets are filtered out: SVG ignores a `use`
 * that references a container it lives in, so offering them would only produce
 * a blank layer.
 */

import { useState } from 'react';
import { AlertTriangleIcon, CopyIcon, Link2Icon } from 'lucide-react';

import { FieldRow } from '@/components/trace/inspector/fields';
import { PanelSection } from '@/components/trace/inspector/section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TraceElement } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

const NONE = '__none__';
const CUSTOM = '__custom__';

/** Fragment id the serializer assigns to a layer's group. */
export function elementFragment(id: string): string {
  return `#trace-elem-${id}`;
}

function collectDescendants(
  element: TraceElement,
  elements: Record<string, TraceElement>,
): Set<string> {
  const found = new Set<string>();
  const queue = [...(element.childrenIds ?? [])];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (found.has(id)) continue;
    found.add(id);
    queue.push(...(elements[id]?.childrenIds ?? []));
  }
  return found;
}

function collectAncestors(
  element: TraceElement,
  elements: Record<string, TraceElement>,
): Set<string> {
  const found = new Set<string>();
  let parentId = element.parentId ?? null;
  while (parentId && !found.has(parentId)) {
    found.add(parentId);
    parentId = elements[parentId]?.parentId ?? null;
  }
  return found;
}

export function InstanceSection({ element }: { element: TraceElement }) {
  const project = useTraceStore((state) => state.project);
  const updateAttributes = useTraceStore((state) => state.updateAttributes);

  const reference = String(element.attributes.href ?? '');
  const [draft, setDraft] = useState(reference);
  const [lastReference, setLastReference] = useState(reference);
  if (reference !== lastReference) {
    setLastReference(reference);
    setDraft(reference);
  }

  if (element.type !== 'use' || !project) return null;

  const elements = project.elements;
  const blocked = collectDescendants(element, elements);
  const blockedAncestors = collectAncestors(element, elements);
  const candidates = Object.values(elements).filter(
    (candidate) =>
      candidate.id !== element.id &&
      !blocked.has(candidate.id) &&
      !blockedAncestors.has(candidate.id),
  );

  const byFragment = new Map(
    candidates.map((candidate) => [elementFragment(candidate.id), candidate]),
  );
  const target = byFragment.get(reference);
  const isCustom = reference !== '' && !target;
  // A layer-fragment id that matches nothing means the target was deleted or
  // excluded (a self/ancestor reference); anything else is a foreign id.
  const unresolved = isCustom && reference.startsWith('#trace-elem-');

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === reference) return;
    updateAttributes(element.id, { href: trimmed });
  };

  return (
    <PanelSection title="Instance">
      <Select
        value={reference === '' ? NONE : target ? reference : CUSTOM}
        onValueChange={(next) => {
          if (next === NONE) commit('');
          else if (next === CUSTOM) return;
          else commit(next);
        }}
      >
        <SelectTrigger aria-label="Referenced layer" className="h-7 bg-muted/20 text-[11px]">
          <SelectValue placeholder="Nothing referenced" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nothing</SelectItem>
          {candidates.map((candidate) => (
            <SelectItem
              key={candidate.id}
              value={elementFragment(candidate.id)}
              title={candidate.name}
            >
              {candidate.name}
              <span className="ml-1.5 text-muted-foreground">
                {candidate.type}
              </span>
            </SelectItem>
          ))}
          {isCustom ? (
            <SelectItem value={CUSTOM} disabled>
              Custom reference
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <FieldRow label="Reference" wide>
        <div className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-input bg-muted/20 px-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <Link2Icon className="size-3 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setDraft(reference);
                event.currentTarget.blur();
              }
            }}
            placeholder="#trace-elem-… or #symbol"
            aria-label="Instance reference"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </FieldRow>

      <p
        className={cn(
          'flex items-start gap-1.5 text-[10px] leading-relaxed',
          target || (reference && !unresolved)
            ? 'text-muted-foreground'
            : 'text-amber-400/90',
        )}
      >
        {target ? (
          <CopyIcon className="mt-0.5 size-3 shrink-0" />
        ) : (
          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
        )}
        <span className="min-w-0">
          {target
            ? `Live copy of ${target.name} — animations included.`
            : reference === ''
              ? 'Nothing referenced, so this layer draws nothing.'
              : unresolved
                ? 'No layer has that id.'
                : 'External reference — resolved when the document is viewed.'}
        </span>
      </p>
    </PanelSection>
  );
}
