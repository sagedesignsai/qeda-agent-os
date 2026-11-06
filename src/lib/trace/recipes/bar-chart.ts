import type { TraceElement } from '../types';
import type { BarChartRecipeOptions, RecipeCompiler } from './types';

export const compileBarChartRecipe: RecipeCompiler<BarChartRecipeOptions> = (
  options,
  idFactory,
) => {
  const rootId = idFactory('bar-chart');
  const x = options.x ?? 100;
  const y = options.y ?? 100;
  const width = options.width ?? 480;
  const height = options.height ?? 260;
  const barSpacing = options.barSpacing ?? 16;
  const barRadius = options.barRadius ?? 4;
  const orientation = options.orientation ?? 'vertical';
  const sceneId = options.sceneId ?? null;

  const defaultBars = [
    { id: 'a', label: 'Q1', value: 45, color: '#38bdf8' },
    { id: 'b', label: 'Q2', value: 78, color: '#22d3ee' },
    { id: 'c', label: 'Q3', value: 62, color: '#818cf8' },
    { id: 'd', label: 'Q4', value: 95, color: '#c084fc' },
  ];
  const bars = options.bars && options.bars.length > 0 ? options.bars : defaultBars;

  const maxVal = options.maxVal ?? Math.max(1, ...bars.map((b) => b.value));
  const count = bars.length;
  const totalSpacing = barSpacing * (count - 1);
  const barWidth = Math.max(
    8,
    ((orientation === 'vertical' ? width : height) - totalSpacing) / count,
  );

  const children: TraceElement[] = [];
  const childrenIds: string[] = [];

  bars.forEach((bar, index) => {
    const barId = `${rootId}-bar-${index}`;
    const labelId = `${rootId}-label-${index}`;
    childrenIds.push(barId, labelId);

    const barLength = Math.max(
      4,
      Math.round(
        (bar.value / maxVal) *
          (orientation === 'vertical' ? height - 30 : width - 30),
      ),
    );
    const barX =
      orientation === 'vertical' ? index * (barWidth + barSpacing) : 0;
    const barY =
      orientation === 'vertical'
        ? height - 20 - barLength
        : index * (barWidth + barSpacing);
    const baseline = orientation === 'vertical' ? height - 20 : 0;
    const baseColor = bar.color ?? '#38bdf8';
    const delay = 200 + index * 100;

    const barElem: TraceElement = {
      id: barId,
      name: `Bar ${bar.label}`,
      type: 'rect',
      visible: true,
      locked: false,
      sceneId,
      parentId: rootId,
      origin: { x: barX, y: height - 20 },
      attributes: {
        x: barX,
        y: barY,
        width: orientation === 'vertical' ? barWidth : barLength,
        height: orientation === 'vertical' ? barLength : barWidth,
        rx: barRadius,
        ry: barRadius,
        fill: baseColor,
        stroke: 'none',
        opacity: 1,
      },
      tracks: [
        {
          id: `${barId}-height`,
          property: orientation === 'vertical' ? 'height' : 'width',
          label: orientation === 'vertical' ? 'Height' : 'Width',
          keyframes: [
            { id: `${barId}-length-1`, timeMs: delay, value: 0, easing: 'power2.out' },
            { id: `${barId}-length-2`, timeMs: delay + 600, value: barLength, easing: 'power2.out' },
          ],
        },
        {
          id: `${barId}-${orientation === 'vertical' ? 'y' : 'x'}`,
          property: orientation === 'vertical' ? 'y' : 'x',
          label: orientation === 'vertical' ? 'Y' : 'X',
          keyframes: [
            { id: `${barId}-pos-1`, timeMs: delay, value: baseline, easing: 'power2.out' },
            { id: `${barId}-pos-2`, timeMs: delay + 600, value: orientation === 'vertical' ? barY : 0, easing: 'power2.out' },
          ],
        },
      ],
    };

    const labelElem: TraceElement = {
      id: labelId,
      name: `Label ${bar.label}`,
      type: 'text',
      visible: true,
      locked: false,
      sceneId,
      parentId: rootId,
      origin:
        orientation === 'vertical'
          ? { x: barX + barWidth / 2, y: height }
          : { x: barLength, y: barY + barWidth / 2 },
      attributes: {
        x:
          orientation === 'vertical'
            ? barX + barWidth / 2
            : barLength + 8,
        y:
          orientation === 'vertical'
            ? height
            : barY + barWidth / 2,
        text: bar.label,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        fill: '#94a3b8',
        textAnchor: orientation === 'vertical' ? 'middle' : 'start',
        dominantBaseline: orientation === 'vertical' ? 'hanging' : 'middle',
        opacity: 1,
      },
      tracks: [
        {
          id: `${labelId}-opacity`,
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            { id: `${labelId}-op-1`, timeMs: delay + 100, value: 0, easing: 'power2.out' },
            { id: `${labelId}-op-2`, timeMs: delay + 500, value: 1, easing: 'power2.out' },
          ],
        },
      ],
    };

    children.push(barElem, labelElem);
  });

  const root: TraceElement = {
    id: rootId,
    name: options.name ?? 'Bar Chart',
    type: 'group',
    visible: true,
    locked: false,
    sceneId,
    origin: { x, y },
    attributes: { x, y, width, height },
    tracks: [],
    childrenIds,
  };

  return { rootId, root, children };
};
