/**
 * components/trace/renderer/TraceRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Store-free SVG renderer for a Trace document.
 *
 * It renders the *structure* once per document/playhead commit; per-frame values
 * are written straight into the mounted nodes by `lib/trace/runtime/dom-renderer`.
 * Element bodies come from the same serializer the exporters use, so the editor,
 * the animated SVG and the generated GSAP code can never drift apart.
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import {
  elementBodyMarkup,
  gradientsToDefs,
} from '@/lib/trace/serialize/svg-markup';
import { elementDomId } from '@/lib/trace/runtime/dom-renderer';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import type { TraceElement, TraceProject } from '@/lib/trace/types';

export const TRACE_STAGE_SVG_ID = 'trace-main-svg';

export type TraceRendererProps = {
  project: TraceProject;
  timeMs: number;
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  /** Extra attributes for the root SVG (export/poster use the serializers instead). */
  className?: string;
  style?: CSSProperties;
  /** Attach per-element pointer handlers; off in read-only players. */
  interactive?: boolean;
  /** Force a background paint for posters. */
  background?: string;
};

type ElementNodeProps = Omit<TraceRendererProps, 'project'> & {
  project: TraceProject;
  element: TraceElement;
};

function transformStyle(element: TraceElement, timeMs: number): CSSProperties {
  const { transform } = resolveElementAtTime(element, timeMs);
  const origin = element.origin ?? { x: 0, y: 0 };
  return {
    transformOrigin: `${origin.x}px ${origin.y}px`,
    transformBox: 'view-box',
    transform: `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
    opacity: transform ? undefined : undefined,
  } as CSSProperties;
}

function ElementNode({
  project,
  element,
  timeMs,
  selectedElementId,
  onSelectElement,
  interactive = true,
}: ElementNodeProps) {
  if (!element.visible) return null;

  const resolved = resolveElementAtTime(element, timeMs);
  const body = elementBodyMarkup(element, resolved.attributes);
  const children = (element.childrenIds ?? [])
    .map((childId) => project.elements[childId])
    .filter((child): child is TraceElement => Boolean(child));

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>) => {
    if (!interactive || element.locked) return;
    event.stopPropagation();
    onSelectElement?.(element.id);
  };

  return (
    <g
      id={elementDomId(element.id)}
      data-trace-id={element.id}
      data-trace-type={element.type}
      style={transformStyle(element, timeMs)}
      opacity={resolved.attributes.opacity ?? 1}
      onPointerDown={handlePointerDown}
      className={
        element.locked
          ? 'cursor-default'
          : interactive
            ? 'cursor-pointer'
            : undefined
      }
    >
      {/* Bodies are serialized SVG, shared with the exporters. */}
      <g dangerouslySetInnerHTML={{ __html: body }} />
      {children.map((child) => (
        <ElementNode
          key={child.id}
          project={project}
          element={child}
          timeMs={timeMs}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          interactive={interactive}
        />
      ))}
    </g>
  );
}

export function TraceRenderer({
  project,
  timeMs,
  selectedElementId,
  onSelectElement,
  className,
  style,
  interactive = true,
  background,
}: TraceRendererProps) {
  const defs = `${gradientsToDefs(project.gradients)}${project.defs ?? ''}`;
  const roots = project.rootElementIds
    .map((elementId) => project.elements[elementId])
    .filter((element): element is TraceElement => Boolean(element));

  return (
    <svg
      id={TRACE_STAGE_SVG_ID}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${project.width} ${project.height}`}
      width="100%"
      height="100%"
      className={className}
      style={style}
      role="img"
      aria-label={project.name}
      onPointerDown={() => {
        if (interactive) onSelectElement?.(null);
      }}
    >
      <title>{project.name}</title>
      {defs ? <defs dangerouslySetInnerHTML={{ __html: defs }} /> : null}
      {background ? (
        <rect
          x={0}
          y={0}
          width={project.width}
          height={project.height}
          fill={background}
        />
      ) : null}
      {roots.map((element) => (
        <ElementNode
          key={element.id}
          project={project}
          element={element}
          timeMs={timeMs}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          interactive={interactive}
        />
      ))}
    </svg>
  );
}
