import type { TraceElement } from '../types';
import type { LowerThirdRecipeOptions, RecipeCompiler } from './types';

export const compileLowerThirdRecipe: RecipeCompiler<
  LowerThirdRecipeOptions
> = (options, idFactory) => {
  const rootId = idFactory('lower-third');
  const cardId = `${rootId}-card`;
  const accentId = `${rootId}-accent`;
  const titleId = `${rootId}-title`;
  const subtitleId = `${rootId}-subtitle`;

  const x = options.x ?? 96;
  const y = options.y ?? 540;
  const width = options.width ?? 460;
  const height = options.height ?? 64;
  const title = options.title ?? 'Speaker Name';
  const subtitle = options.subtitle ?? 'Role — Organisation';
  const accentColor = options.accentColor ?? '#38bdf8';
  const cardBg = options.cardBg ?? 'rgba(12, 18, 32, 0.9)';
  const sceneId = options.sceneId ?? null;

  const root: TraceElement = {
    id: rootId,
    name: options.name ?? 'Lower Third',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x, y },
    attributes: { x, y, width, height },
    tracks: [],
    childrenIds: [cardId, accentId, titleId, subtitleId],
  };

  const card: TraceElement = {
    id: cardId,
    name: 'Card Background',
    type: 'rect',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: 0, y: 0 },
    attributes: {
      x: 0,
      y: 0,
      width,
      height,
      rx: 8,
      ry: 8,
      fill: cardBg,
      stroke: 'rgba(148, 163, 184, 0.22)',
      strokeWidth: 1,
      opacity: 1,
    },
    tracks: [
      {
        id: `${cardId}-opacity`,
        property: 'opacity',
        label: 'Opacity',
        keyframes: [
          { id: `${cardId}-op-1`, timeMs: 200, value: 0, easing: 'power2.out' },
          { id: `${cardId}-op-2`, timeMs: 600, value: 1, easing: 'power2.out' },
        ],
      },
    ],
  };

  const accent: TraceElement = {
    id: accentId,
    name: 'Accent Bar',
    type: 'rect',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: 0, y: 0 },
    attributes: {
      x: 0,
      y: 0,
      width: 4,
      height,
      rx: 2,
      ry: 2,
      fill: accentColor,
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1,
    },
    tracks: [
      {
        id: `${accentId}-height`,
        property: 'height',
        label: 'Height',
        keyframes: [
          {
            id: `${accentId}-h-1`,
            timeMs: 400,
            value: 0,
            easing: 'power3.out',
          },
          {
            id: `${accentId}-h-2`,
            timeMs: 1100,
            value: height,
            easing: 'power3.out',
          },
        ],
      },
    ],
  };

  const titleElem: TraceElement = {
    id: titleId,
    name: 'Title Text',
    type: 'text',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: 22, y: height / 2 - 8 },
    attributes: {
      x: 22,
      y: height / 2 - 8,
      text: title,
      fontSize: 18,
      fontWeight: 700,
      fontFamily: 'Inter, sans-serif',
      fill: '#f8fafc',
      dominantBaseline: 'middle',
      opacity: 1,
    },
    tracks: [
      {
        id: `${titleId}-opacity`,
        property: 'opacity',
        label: 'Opacity',
        keyframes: [
          {
            id: `${titleId}-op-1`,
            timeMs: 500,
            value: 0,
            easing: 'power2.out',
          },
          {
            id: `${titleId}-op-2`,
            timeMs: 1000,
            value: 1,
            easing: 'power2.out',
          },
        ],
      },
      {
        id: `${titleId}-x`,
        property: 'x',
        label: 'X',
        keyframes: [
          {
            id: `${titleId}-x-1`,
            timeMs: 500,
            value: 10,
            easing: 'power2.out',
          },
          {
            id: `${titleId}-x-2`,
            timeMs: 1000,
            value: 22,
            easing: 'power2.out',
          },
        ],
      },
    ],
  };

  const subtitleElem: TraceElement = {
    id: subtitleId,
    name: 'Subtitle Text',
    type: 'text',
    visible: true,
    locked: false,
    sceneId,
    parentId: rootId,
    origin: { x: 22, y: height / 2 + 12 },
    attributes: {
      x: 22,
      y: height / 2 + 12,
      text: subtitle,
      fontSize: 12,
      fontWeight: 400,
      fontFamily: 'Inter, sans-serif',
      fill: '#94a3b8',
      dominantBaseline: 'middle',
      opacity: 1,
    },
    tracks: [
      {
        id: `${subtitleId}-opacity`,
        property: 'opacity',
        label: 'Opacity',
        keyframes: [
          {
            id: `${subtitleId}-op-1`,
            timeMs: 700,
            value: 0,
            easing: 'power2.out',
          },
          {
            id: `${subtitleId}-op-2`,
            timeMs: 1200,
            value: 1,
            easing: 'power2.out',
          },
        ],
      },
    ],
  };

  return {
    rootId,
    root,
    children: [card, accent, titleElem, subtitleElem],
  };
};
