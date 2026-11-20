/**
 * src/lib/studio/shapes/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native SVG shape preset generators for timeline clips.
 *
 * These functions create pathData strings for common shapes (rect, circle, arrow,
 * callout) that can be used as ShapeClipPayload inputs. All shapes are centered
 * at (0, 0) and sized to fit a unit bounding box.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Rectangle with optional rounded corners.
 * @param width Box width
 * @param height Box height
 * @param radius Corner radius (0 for sharp corners)
 * @returns SVG path data
 */
export function createRectShape(
  width: number = 100,
  height: number = 100,
  radius: number = 0,
): string {
  const w = width / 2;
  const h = height / 2;

  if (radius <= 0) {
    // Sharp rectangle
    return `M ${-w} ${-h} L ${w} ${-h} L ${w} ${h} L ${-w} ${h} Z`;
  }

  // Rounded rectangle
  const r = Math.min(radius, w, h);
  return `M ${-w + r} ${-h} L ${w - r} ${-h} Q ${w} ${-h} ${w} ${-h + r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${-w + r} ${h} Q ${-w} ${h} ${-w} ${h - r} L ${-w} ${-h + r} Q ${-w} ${-h} ${-w + r} ${-h} Z`;
}

/**
 * Circle or ellipse.
 * @param radiusX Horizontal radius
 * @param radiusY Vertical radius (if omitted, creates a circle)
 * @returns SVG path data
 */
export function createCircleShape(radiusX: number = 50, radiusY?: number): string {
  const rx = radiusX;
  const ry = radiusY ?? radiusX;

  if (rx === ry) {
    // Circle (use arc commands for efficiency)
    return `M ${-rx} 0 A ${rx} ${rx} 0 0 1 ${rx} 0 A ${rx} ${rx} 0 0 1 ${-rx} 0`;
  }

  // Ellipse
  return `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0 A ${rx} ${ry} 0 0 1 ${-rx} 0`;
}

/**
 * Arrow shape pointing right.
 * @param length Arrow length (head to tail)
 * @param width Arrow width at widest point
 * @param headLength Length of arrowhead
 * @returns SVG path data
 */
export function createArrowShape(
  length: number = 100,
  width: number = 40,
  headLength: number = 30,
): string {
  const l = length / 2;
  const w = width / 2;
  const hl = headLength / 2;

  // Tail x position
  const tailX = -l;
  // Arrowhead tip
  const tipX = l;
  // Where arrowhead starts
  const headBaseX = l - headLength;

  return (
    `M ${tailX} ${-w}` + // top-left of tail
    ` L ${headBaseX} ${-w}` + // top-left of head base
    ` L ${headBaseX} ${-hl}` + // top inner point
    ` L ${tipX} 0` + // arrow tip
    ` L ${headBaseX} ${hl}` + // bottom inner point
    ` L ${headBaseX} ${w}` + // bottom-left of head base
    ` L ${tailX} ${w}` + // bottom-left of tail
    ` Z` // close path
  );
}

/**
 * Callout shape (speech bubble) pointing right.
 * @param width Box width
 * @param height Box height
 * @param cornerRadius Rounded corner radius
 * @param tailSize Size of the pointer tail
 * @returns SVG path data
 */
export function createCalloutShape(
  width: number = 100,
  height: number = 60,
  cornerRadius: number = 8,
  tailSize: number = 15,
): string {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(cornerRadius, w, h);

  // Tail attachment point (middle-right)
  const tailX = w + tailSize;
  const tailTop = h / 3;
  const tailBase = -h / 3;

  return (
    `M ${-w + r} ${-h}` + // top-left
    ` L ${w - r} ${-h}` + // top-right
    ` Q ${w} ${-h} ${w} ${-h + r}` + // top-right corner
    ` L ${w} ${tailTop}` + // right side up to tail
    ` L ${tailX} 0` + // tail point (right)
    ` L ${w} ${tailBase}` + // right side down from tail
    ` L ${w} ${h - r}` + // bottom-right
    ` Q ${w} ${h} ${w - r} ${h}` + // bottom-right corner
    ` L ${-w + r} ${h}` + // bottom-left
    ` Q ${-w} ${h} ${-w} ${h - r}` + // bottom-left corner
    ` L ${-w} ${-h + r}` + // left side
    ` Q ${-w} ${-h} ${-w + r} ${-h}` + // top-left corner
    ` Z` // close path
  );
}

/**
 * Star shape with given number of points.
 * @param points Number of points (default 5)
 * @param outerRadius Distance from center to point tip
 * @param innerRadius Distance from center to inner point
 * @returns SVG path data
 */
export function createStarShape(
  points: number = 5,
  outerRadius: number = 50,
  innerRadius: number = 20,
): string {
  let path = '';
  const step = (Math.PI * 2) / (points * 2);

  for (let i = 0; i < points * 2; i++) {
    const angle = i * step - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (i === 0) {
      path = `M ${x} ${y}`;
    } else {
      path += ` L ${x} ${y}`;
    }
  }

  return path + ' Z';
}

/**
 * Diamond/rhombus shape.
 * @param width Horizontal extent
 * @param height Vertical extent
 * @returns SVG path data
 */
export function createDiamondShape(width: number = 100, height: number = 100): string {
  const w = width / 2;
  const h = height / 2;
  return `M 0 ${-h} L ${w} 0 L 0 ${h} L ${-w} 0 Z`;
}

/**
 * Heart shape (left-facing, centered at origin).
 * @param size Overall dimensions
 * @returns SVG path data
 */
export function createHeartShape(size: number = 100): string {
  const s = size / 2;
  // Approximate heart using two rounded bumps + triangle
  return (
    `M 0 ${-s * 0.4}` +
    ` C ${-s * 0.5} ${-s * 0.8} ${-s} ${-s * 0.5} ${-s} 0` +
    ` C ${-s} ${s * 0.3} ${-s * 0.5} ${s * 0.6} 0 ${s}` +
    ` C ${s * 0.5} ${s * 0.6} ${s} ${s * 0.3} ${s} 0` +
    ` C ${s} ${-s * 0.5} ${s * 0.5} ${-s * 0.8} 0 ${-s * 0.4}` +
    ` Z`
  );
}
