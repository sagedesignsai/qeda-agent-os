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

import { filtersToDefs } from '@/lib/trace/filters/serialize';
import { scrubDangerousSvgMarkup } from '@/lib/trace/parser/svg-scrub';
import {
  elementBodyMarkup,
  gradientsToDefs,
} from '@/lib/trace/serialize/svg-markup';
import { elementDomId } from '@/lib/trace/runtime/dom-renderer';
import {
  cameraDomId,
  cameraTransformString,
  isCameraIdentity,
  resolveCameraAtTime,
} from '@/lib/trace/runtime/camera';
import {
  DEFAULT_SCENE_BACKGROUND,
  sceneBackgroundAtTime,
  sceneBackgroundDomId,
  sceneVeilAtTime,
  sceneVeilDomId,
} from '@/lib/trace/runtime/scenes';
import {
  TRACE_SUBTITLE_BG_ID,
  TRACE_SUBTITLE_GROUP_ID,
  TRACE_SUBTITLE_TEXT_ID,
} from '@/lib/trace/runtime/subtitles';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import type { TraceElement, TraceProject } from '@/lib/trace/types';

export const TRACE_STAGE_SVG_ID = 'trace-main-svg';

export type TraceRendererProps = {
  project: TraceProject;
  timeMs: number;
  /** Unique root ID for embedded previews of the same composition. */
  svgId?: string;
  /** Prefix element IDs when rendering an embedded preview. */
  elementIdPrefix?: string;
  selectedElementId?: string | null;
  onSelectElement?: (
    elementId: string | null,
    options?: { additive?: boolean },
  ) => void;
  onDoubleClickElement?: (elementId: string) => void;
  /** Extra attributes for the root SVG (export/poster use the serializers instead). */
  className?: string;
  style?: CSSProperties;
  /** Attach per-element pointer handlers; off in read-only players. */
  interactive?: boolean;
  /** Force a background paint for posters. */
  background?: string;
  /** Draw the engine-owned subtitle layer (default true for narrated projects). */
  showSubtitles?: boolean;
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
  elementIdPrefix,
  selectedElementId,
  onSelectElement,
  onDoubleClickElement,
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
    onSelectElement?.(element.id, {
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    });
  };

  const handleDoubleClick = (event: React.MouseEvent<SVGGElement>) => {
    if (!interactive || element.locked) return;
    event.stopPropagation();
    onDoubleClickElement?.(element.id);
  };

  return (
    <g
      id={elementDomId(element.id, elementIdPrefix)}
      data-trace-id={element.id}
      data-trace-type={element.type}
      style={transformStyle(element, timeMs)}
      opacity={resolved.attributes.opacity ?? 1}
      filter={resolved.attributes.filter}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
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
          elementIdPrefix={elementIdPrefix}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onDoubleClickElement={onDoubleClickElement}
          interactive={interactive}
        />
      ))}
    </g>
  );
}

export function TraceRenderer({
  project,
  timeMs,
  svgId,
  elementIdPrefix,
  selectedElementId,
  onSelectElement,
  onDoubleClickElement,
  className,
  style,
  interactive = true,
  background,
  showSubtitles = true,
}: TraceRendererProps) {
  const defs = `${gradientsToDefs(project.gradients)}${filtersToDefs(Object.values(project.filters ?? {}))}${scrubDangerousSvgMarkup(project.defs ?? '')}`;
  const roots = project.rootElementIds
    .map((elementId) => project.elements[elementId])
    .filter((element): element is TraceElement => Boolean(element));
  const hasSubtitles = showSubtitles && (project.narration?.lines.length ?? 0) > 0;
  const sceneFallbackFill =
    sceneBackgroundAtTime(project, 0)?.fill ?? DEFAULT_SCENE_BACKGROUND;
  const veil = background ? null : sceneVeilAtTime(project, timeMs, sceneFallbackFill);
  const camera = resolveCameraAtTime(project, timeMs);
  const cameraActive = !isCameraIdentity(camera, project);

  return (
    <svg
      id={svgId ?? TRACE_STAGE_SVG_ID}
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
      ) : (
        // Scene backgrounds paint behind the graph; the runtime rewrites the
        // fill when the storyboard crosses a scene boundary.
        <rect
          id={sceneBackgroundDomId(elementIdPrefix ?? 'trace-elem')}
          data-trace-scene-background="true"
          x={0}
          y={0}
          width={project.width}
          height={project.height}
          fill={sceneBackgroundAtTime(project, timeMs)?.fill ?? 'none'}
        />
      )}
      {/* The camera frames the element graph only: backgrounds, veils and
          subtitles are screen-space and live outside this group. */}
      <g
        id={cameraDomId(elementIdPrefix ?? 'trace-elem')}
        data-trace-camera="true"
        transform={
          cameraActive
            ? cameraTransformString(project, camera)
            : undefined
        }
      >
        {roots.map((element) => {
          return (
            <ElementNode
              key={element.id}
              project={project}
              element={element}
              timeMs={timeMs}
              elementIdPrefix={elementIdPrefix}
              selectedElementId={selectedElementId}
              onSelectElement={onSelectElement}
              onDoubleClickElement={onDoubleClickElement}
              interactive={interactive}
            />
          );
        })}
      </g>
      {background ? null : (
        // The scene entrance veil lives above the graph and below subtitles.
        // It is always mounted so the runtime can find it across boundaries.
        <rect
          id={sceneVeilDomId(elementIdPrefix ?? 'trace-elem')}
          data-trace-scene-veil="true"
          x={0}
          y={0}
          width={project.width}
          height={project.height}
          fill={veil?.fill ?? 'none'}
          opacity={veil?.opacity ?? 0}
          transform={
            veil && veil.translateX
              ? `translate(${veil.translateX} 0)`
              : undefined
          }
          pointerEvents="none"
        />
      )}
      {hasSubtitles ? (
        <g id={TRACE_SUBTITLE_GROUP_ID} pointerEvents="none" opacity={0}>
          <rect
            id={TRACE_SUBTITLE_BG_ID}
            x={0}
            y={0}
            width={0}
            height={0}
            rx={10}
            fill="rgba(2, 6, 23, 0.72)"
          />
          <text
            id={TRACE_SUBTITLE_TEXT_ID}
            x={project.width / 2}
            y={Math.round(project.height * 0.91)}
            textAnchor="middle"
            fill="#f8fafc"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={600}
            fontSize={Math.max(14, Math.round(project.height * 0.03))}
          />
        </g>
      ) : null}
    </svg>
  );
}
