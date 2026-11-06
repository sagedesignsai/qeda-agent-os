import type { Keyframe, TraceElement } from '../types';
import type { CounterRecipeOptions, RecipeCompiler } from './types';

export const compileCounterRecipe: RecipeCompiler<CounterRecipeOptions> = (
  options,
  idFactory,
) => {
  const rootId = idFactory('counter');
  const valueId = `${rootId}-value`;
  const captionId = `${rootId}-caption`;

  const x = options.x ?? 100;
  const y = options.y ?? 100;
  const startVal = options.startVal ?? 0;
  const endVal = options.endVal ?? 100;
  const prefix = options.prefix ?? '';
  const suffix = options.suffix ?? '';
  const decimals = options.decimals ?? 0;
  const caption = options.caption ?? options.text ?? '';
  const fontSize = options.fontSize ?? 48;
  const fill = options.fill ?? '#f8fafc';
  const durationMs = options.durationMs ?? 1800;
  const sceneId = options.sceneId ?? null;

  const childrenIds = [valueId];
  if (caption) childrenIds.push(captionId);

  // Generate stepped text keyframes across duration
  const steps = 12;
  const startTime = 300;
  const keyframes: Keyframe<string>[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    // quadratic ease-out interpolation
    const easeT = 1 - Math.pow(1 - t, 2);
    const currentNum = startVal + (endVal - startVal) * easeT;
    const formattedNum =
      decimals > 0
        ? currentNum.toFixed(decimals)
        : Math.round(currentNum).toLocaleString();
    const timeMs = Math.round(startTime + t * durationMs);

    keyframes.push({
      id: `${valueId}-val-${step}`,
      timeMs,
      value: `${prefix}${formattedNum}${suffix}`,
      easing: 'linear',
    });
  }

  const initialNum =
    decimals > 0 ? startVal.toFixed(decimals) : startVal.toLocaleString();

  const valueElem: TraceElement = {
    id: valueId,
    name: 'Counter Value',
    type: 'text',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: 0, y: 0 },
    attributes: {
      x: 0,
      y: 0,
      text: `${prefix}${initialNum}${suffix}`,
      fontSize,
      fontWeight: 800,
      fontFamily: 'Inter, sans-serif',
      fill,
      dominantBaseline: 'middle',
      opacity: 1,
    },
    tracks: [
      {
        id: `${valueId}-text`,
        property: 'text',
        label: 'Value',
        keyframes,
      },
    ],
  };

  const children: TraceElement[] = [valueElem];

  if (caption) {
    const captionElem: TraceElement = {
      id: captionId,
      name: 'Counter Caption',
      type: 'text',
      visible: true,
      locked: false,
      sceneId,
      parentId: rootId,
      origin: { x: 0, y: fontSize * 0.75 + 4 },
      attributes: {
        x: 0,
        y: fontSize * 0.75 + 4,
        text: caption,
        fontSize: Math.max(12, Math.round(fontSize * 0.28)),
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        fill: '#94a3b8',
        dominantBaseline: 'hanging',
        opacity: 1,
      },
      tracks: [
        {
          id: `${captionId}-opacity`,
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: `${captionId}-op-1`,
              timeMs: 200,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: `${captionId}-op-2`,
              timeMs: 600,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
      ],
    };
    children.push(captionElem);
  }

  const root: TraceElement = {
    id: rootId,
    name: options.name ?? 'KPI Counter',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x, y },
    attributes: { x, y, width: fontSize * 4, height: fontSize * 1.5 },
    tracks: [],
    childrenIds,
  };

  return { rootId, root, children };
};
