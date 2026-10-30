/**
 * components/motion/scene/create-motion-screen-artwork.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Draws a high-resolution starter dashboard for the first textured device
 * surface. This render-only artwork is separate from the WebGL-free document
 * model and will be replaced by imported screen assets in the media phase.
 */

const WIDTH = 1600;
const HEIGHT = 900;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 400,
): void {
  context.fillStyle = color;
  context.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText(value, x, y);
}

function card(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  roundedRect(context, x, y, width, height, 18);
  context.fillStyle = '#191e29';
  context.fill();
  context.strokeStyle = '#2c3341';
  context.lineWidth = 2;
  context.stroke();
}

export function createMotionScreenArtwork(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create the Motion starter screen artwork.');
  }

  context.fillStyle = '#10131b';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#151a24';
  context.fillRect(0, 0, 252, HEIGHT);
  context.strokeStyle = '#282f3c';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(252, 0);
  context.lineTo(252, HEIGHT);
  context.stroke();

  roundedRect(context, 34, 30, 42, 42, 12);
  context.fillStyle = '#5885f7';
  context.fill();
  text(context, 'Q', 48, 60, 25, '#ffffff', 700);
  text(context, 'qeda', 88, 59, 24, '#f1f3f8', 650);

  text(context, 'WORKSPACE', 36, 124, 13, '#828b9c', 600);
  const navItems = ['Overview', 'Conversations', 'Tasks', 'Knowledge'];
  navItems.forEach((item, index) => {
    const y = 148 + index * 46;
    if (index === 0) {
      roundedRect(context, 24, y, 204, 36, 9);
      context.fillStyle = '#283550';
      context.fill();
    }
    text(context, item, 44, y + 24, 16, index === 0 ? '#dce6ff' : '#a2aab8', index === 0 ? 600 : 400);
  });

  roundedRect(context, 26, 800, 200, 66, 10);
  context.fillStyle = '#1b202b';
  context.fill();
  text(context, 'ACTIVE PROJECT', 40, 824, 11, '#8a93a3', 600);
  text(context, 'Launch campaign', 40, 849, 15, '#e3e7ed', 500);

  text(context, 'MONDAY, OCTOBER 26', 300, 75, 12, '#8992a2', 550);
  text(context, 'Make the next move.', 300, 124, 38, '#f1f3f8', 650);
  text(context, 'Your work, gathered around the outcomes that matter.', 300, 157, 17, '#a3aab7');

  const metrics = [
    { title: 'Open tasks', value: '12', detail: 'Across 3 projects' },
    { title: 'In progress', value: '04', detail: 'Moving this week' },
    { title: 'Completed', value: '28', detail: 'This month' },
  ];
  const metricY = 205;
  const metricWidth = 388;
  metrics.forEach((metric, index) => {
    const x = 300 + index * (metricWidth + 18);
    card(context, x, metricY, metricWidth, 154);
    text(context, metric.title, x + 24, metricY + 36, 15, '#a0a8b7');
    text(context, metric.value, x + 24, metricY + 91, 39, '#f3f5f8', 650);
    text(context, metric.detail, x + 24, metricY + 125, 13, '#818a9b');
  });

  card(context, 300, 384, 800, 320);
  text(context, 'Project momentum', 328, 424, 16, '#e9ecf2', 550);
  text(context, 'Last 6 weeks', 970, 424, 12, '#8790a0');
  context.strokeStyle = '#303746';
  context.lineWidth = 1;
  context.setLineDash([5, 8]);
  [470, 526, 582, 638].forEach((y) => {
    context.beginPath();
    context.moveTo(332, y);
    context.lineTo(1068, y);
    context.stroke();
  });
  context.setLineDash([]);

  const points = [
    [340, 622],
    [424, 600],
    [506, 612],
    [590, 543],
    [674, 565],
    [758, 508],
    [842, 526],
    [926, 474],
    [1008, 491],
    [1060, 450],
  ] as const;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y], index) => {
    const [previousX, previousY] = points[index];
    const middle = (previousX + x) / 2;
    context.bezierCurveTo(middle, previousY, middle, y, x, y);
  });
  context.strokeStyle = '#7294ff';
  context.lineWidth = 4;
  context.stroke();

  card(context, 1120, 384, 400, 320);
  text(context, 'Next milestone', 1148, 424, 16, '#e9ecf2', 550);
  context.beginPath();
  context.arc(1192, 504, 37, 0, Math.PI * 2);
  context.strokeStyle = '#303746';
  context.lineWidth = 7;
  context.stroke();
  context.beginPath();
  context.arc(1192, 504, 37, -Math.PI / 2, Math.PI * 0.86);
  context.strokeStyle = '#7294ff';
  context.lineWidth = 7;
  context.stroke();
  text(context, '68%', 1172, 510, 15, '#eaf0ff', 650);
  text(context, 'Product launch', 1148, 578, 18, '#e9ecf2', 550);
  text(context, 'Due in 12 days', 1148, 606, 13, '#8992a2');

  card(context, 300, 730, 1220, 124);
  text(context, 'Recent activity', 328, 769, 16, '#e9ecf2', 550);
  const activityItems = [
    ['Workspace review', 'Design systems', '#7498ff'],
    ['Launch checklist', 'Product launch', '#a88cf7'],
    ['Onboarding flow', 'Qeda desktop', '#59c7a6'],
  ];
  activityItems.forEach(([titleValue, project, color], index) => {
    const x = 328 + index * 390;
    roundedRect(context, x, 788, 10, 10, 5);
    context.fillStyle = color;
    context.fill();
    text(context, titleValue, x + 22, 800, 14, '#dfe3eb', 500);
    text(context, project, x + 22, 824, 12, '#8992a2');
  });

  return canvas;
}
