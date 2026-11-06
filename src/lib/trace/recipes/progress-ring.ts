import type { TraceElement } from '../types';
import type { ProgressRingRecipeOptions, RecipeCompiler } from './types';

export const compileProgressRingRecipe: RecipeCompiler<
  ProgressRingRecipeOptions
> = (options, idFactory) => {
  const rootId = idFactory('progress-ring');
  const trackId = `${rootId}-track`;
  const indicatorId = `${rootId}-indicator`;
  const labelId = `${rootId}-label`;

  const x = options.x ?? 100;
  const y = options.y ?? 100;
  const radius = options.radius ?? 50;
  const thickness = options.thickness ?? 8;
  const progress = Math.max(0, Math.min(100, options.progress ?? 75));
  const progressColor = options.progressColor ?? '#38bdf8';
  const trackColor = options.trackColor ?? '#1e293b';
  const showLabel = options.showPercentageLabel !== false;
  const sceneId = options.sceneId ?? null;

  const size = radius * 2 + thickness;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - progress / 100);

  const childrenIds = [trackId, indicatorId];
  if (showLabel) childrenIds.push(labelId);

  const root: TraceElement = {
    id: rootId,
    name: options.name ?? 'Progress Ring',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x, y },
    attributes: { x, y, width: size, height: size },
    tracks: [],
    childrenIds,
  };

  const track: TraceElement = {
    id: trackId,
    name: 'Ring Track',
    type: 'circle',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: size / 2, y: size / 2 },
    attributes: {
      x: 0,
      y: 0,
      width: size,
      height: size,
      radius,
      fill: 'none',
      stroke: trackColor,
      strokeWidth: thickness,
      opacity: 1,
    },
    tracks: [],
  };

  const indicator: TraceElement = {
    id: indicatorId,
    name: 'Ring Indicator',
    type: 'circle',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: size / 2, y: size / 2 },
    attributes: {
      x: 0,
      y: 0,
      width: size,
      height: size,
      radius,
      rotation: -90,
      fill: 'none',
      stroke: progressColor,
      strokeWidth: thickness,
      strokeLinecap: 'round',
      strokeDasharray: String(circumference),
      strokeDashoffset: circumference,
      opacity: 1,
    },
    tracks: [
      {
        id: `${indicatorId}-offset`,
        property: 'strokeDashoffset',
        label: 'Progress',
        keyframes: [
          {
            id: `${indicatorId}-off-1`,
            timeMs: 300,
            value: circumference,
            easing: 'power2.out',
          },
          {
            id: `${indicatorId}-off-2`,
            timeMs: 1800,
            value: targetOffset,
            easing: 'power2.out',
          },
        ],
      },
    ],
  };

  const children: TraceElement[] = [track, indicator];

  if (showLabel) {
    const label: TraceElement = {
      id: labelId,
      name: 'Percentage Label',
      type: 'text',
      visible: true,
      locked: false,
      sceneId,
      parentId: rootId,
      origin: { x: size / 2, y: size / 2 },
      attributes: {
        x: size / 2,
        y: size / 2,
        text: `${Math.round(progress)}%`,
        fontSize: Math.max(14, Math.round(radius * 0.45)),
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        fill: '#f8fafc',
        textAnchor: 'middle',
        dominantBaseline: 'middle',
        opacity: 1,
      },
      tracks: [
        {
          id: `${labelId}-opacity`,
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: `${labelId}-op-1`,
              timeMs: 300,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: `${labelId}-op-2`,
              timeMs: 800,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
      ],
    };
    children.push(label);
  }

  return { rootId, root, children };
};
