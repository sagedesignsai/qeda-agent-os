import type { TraceElement } from '../types';
import type { KineticTextRecipeOptions, RecipeCompiler } from './types';

export const compileKineticTextRecipe: RecipeCompiler<
  KineticTextRecipeOptions
> = (options, idFactory) => {
  const rootId = idFactory('kinetic-text');
  const x = options.x ?? 100;
  const y = options.y ?? 200;
  const rawText = options.text ?? 'KINETIC TYPOGRAPHY';
  const fontSize = options.fontSize ?? 48;
  const fontWeight = options.fontWeight ?? 800;
  const fontFamily = options.fontFamily ?? 'Inter, sans-serif';
  const fill = options.fill ?? '#f8fafc';
  const staggerMs = options.staggerMs ?? 90;
  const sceneId = options.sceneId ?? null;

  const words = rawText.split(/\s+/).filter(Boolean);
  const approxCharWidth = fontSize * 0.58;
  const spaceWidth = fontSize * 0.35;

  const children: TraceElement[] = [];
  const childrenIds: string[] = [];

  let currentX = 0;

  words.forEach((word, index) => {
    const wordId = `${rootId}-word-${index}`;
    childrenIds.push(wordId);

    const wordWidth = word.length * approxCharWidth;
    const startDelay = 200 + index * staggerMs;

    const wordElem: TraceElement = {
      id: wordId,
      name: `Word "${word}"`,
      type: 'text',
      visible: true,
      locked: false,
      sceneId,
      parentId: rootId,
      origin: { x: currentX, y: 0 },
      attributes: {
        x: currentX,
        y: 0,
        text: word,
        fontSize,
        fontWeight,
        fontFamily,
        fill,
        dominantBaseline: 'middle',
        opacity: 1,
      },
      tracks: [
        {
          id: `${wordId}-opacity`,
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: `${wordId}-op-1`,
              timeMs: startDelay,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: `${wordId}-op-2`,
              timeMs: startDelay + 400,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
        {
          id: `${wordId}-y`,
          property: 'y',
          label: 'Y',
          keyframes: [
            {
              id: `${wordId}-y-1`,
              timeMs: startDelay,
              value: 24,
              easing: 'power3.out',
            },
            {
              id: `${wordId}-y-2`,
              timeMs: startDelay + 450,
              value: 0,
              easing: 'power3.out',
            },
          ],
        },
      ],
    };

    children.push(wordElem);
    currentX += wordWidth + spaceWidth;
  });

  const root: TraceElement = {
    id: rootId,
    name: options.name ?? 'Kinetic Text',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x, y },
    attributes: { x, y, width: currentX, height: fontSize * 1.2 },
    tracks: [],
    childrenIds,
  };

  return { rootId, root, children };
};
