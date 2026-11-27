/**
 * lib/trace/parser/path-transformer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Affine transforms for imported SVG geometry and translations for SVG path
 * coordinate lists.
 *
 * The importer bakes each element's transform chain (translate / scale /
 * rotate / skew / matrix) into its geometry. Baking keeps imported art
 * pixel-identical without relying on renderer transform-order semantics, and it
 * means a fragment inserted into any project looks the same everywhere.
 *
 * Ported from sagedesigns-os lib/motion/parser/path-transformer.ts, extended
 * with full affine support.
 */

import { parsePathData, serializePathData } from '../path/model';

/** SVG affine matrix in the same layout as `matrix(a b c d e f)`. */
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_MATRIX: AffineMatrix = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
});

const EPSILON = 1e-6;

export function identityMatrix(): AffineMatrix {
  return { ...IDENTITY_MATRIX };
}

export function translationMatrix(x: number, y: number): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function scaleMatrix(x: number, y: number = x): AffineMatrix {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

export function rotationMatrix(degrees: number): AffineMatrix {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Compose two matrices: the result applies `right`, then `left`. */
export function multiplyMatrices(
  left: AffineMatrix,
  right: AffineMatrix,
): AffineMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function applyMatrixToPoint(
  matrix: AffineMatrix,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

export function matrixIsIdentity(matrix: AffineMatrix): boolean {
  return (
    near(matrix.a, 1) &&
    near(matrix.b, 0) &&
    near(matrix.c, 0) &&
    near(matrix.d, 1) &&
    near(matrix.e, 0) &&
    near(matrix.f, 0)
  );
}

/** True when the matrix only moves geometry (no rotation, scale or skew). */
export function matrixIsTranslationOnly(matrix: AffineMatrix): boolean {
  return (
    near(matrix.a, 1) &&
    near(matrix.b, 0) &&
    near(matrix.c, 0) &&
    near(matrix.d, 1)
  );
}

/** True for scale-only matrices (including non-uniform axis-aligned scale). */
export function matrixIsAxisAlignedScale(matrix: AffineMatrix): boolean {
  return near(matrix.b, 0) && near(matrix.c, 0);
}

/**
 * True for rotation + uniform scale (a similarity transform). Circles stay
 * circles, ellipses stay ellipses and text keeps a representable orientation.
 */
export function matrixIsSimilarity(matrix: AffineMatrix): boolean {
  return near(matrix.a, matrix.d) && near(matrix.b, -matrix.c);
}

/** Average linear scale, used to scale stroke widths with baked geometry. */
export function matrixScale(matrix: AffineMatrix): number {
  const determinant = Math.abs(matrix.a * matrix.d - matrix.b * matrix.c);
  return Math.sqrt(determinant);
}

/** Rotation angle in degrees encoded by the matrix's linear part. */
export function matrixRotation(matrix: AffineMatrix): number {
  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}

function numbersIn(value: string): number[] {
  return (
    value
      .match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi)
      ?.map(Number) ?? []
  );
}

/**
 * Parse an SVG `transform` attribute into a single matrix.
 *
 * A transform list applies left-to-right, so `translate(10) scale(2)` maps a
 * point to `translate(10 * scale(2 * p))`.
 */
export function parseSvgTransform(transformStr: string | null | undefined): AffineMatrix {
  if (!transformStr || !transformStr.trim()) return identityMatrix();

  let result = identityMatrix();
  const transformRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = transformRegex.exec(transformStr)) !== null) {
    const name = match[1].toLowerCase();
    const values = numbersIn(match[2]);
    let next: AffineMatrix | null = null;

    switch (name) {
      case 'translate':
        next = translationMatrix(values[0] ?? 0, values[1] ?? 0);
        break;
      case 'scale':
        next = scaleMatrix(values[0] ?? 1, values[1] ?? values[0] ?? 1);
        break;
      case 'rotate': {
        const angle = values[0] ?? 0;
        const rotation = rotationMatrix(angle);
        if (values.length >= 3) {
          const cx = values[1];
          const cy = values[2];
          next = multiplyMatrices(
            multiplyMatrices(
              translationMatrix(cx, cy),
              rotation,
            ),
            translationMatrix(-cx, -cy),
          );
        } else {
          next = rotation;
        }
        break;
      }
      case 'skewx':
        next = {
          a: 1,
          b: 0,
          c: Math.tan(((values[0] ?? 0) * Math.PI) / 180),
          d: 1,
          e: 0,
          f: 0,
        };
        break;
      case 'skewy':
        next = {
          a: 1,
          b: Math.tan(((values[0] ?? 0) * Math.PI) / 180),
          c: 0,
          d: 1,
          e: 0,
          f: 0,
        };
        break;
      case 'matrix':
        if (values.length >= 6) {
          next = {
            a: values[0],
            b: values[1],
            c: values[2],
            d: values[3],
            e: values[4],
            f: values[5],
          };
        }
        break;
      default:
        break;
    }

    if (next) result = multiplyMatrices(result, next);
  }

  return result;
}

/**
 * Translate all absolute coordinates in an SVG path string by (dx, dy).
 * Relative commands (c, l, h, v, s, q, t, a, z) remain unchanged.
 *
 * Kept for callers that only need a translation and want to preserve arc
 * commands verbatim.
 */
export function translateSvgPath(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d;

  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;
  let result = '';
  let isFirstM = true;

  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    if (!argsStr) {
      result += cmd + ' ';
      continue;
    }

    const numbers =
      argsStr
        .match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi)
        ?.map(Number) ?? [];

    if (cmd === 'm' && isFirstM) {
      isFirstM = false;
      if (numbers.length >= 2) {
        const firstX = Number((numbers[0] + dx).toFixed(2));
        const firstY = Number((numbers[1] + dy).toFixed(2));
        result += `M ${firstX} ${firstY} `;
        if (numbers.length > 2) {
          result += `l ${numbers.slice(2).join(' ')} `;
        }
      } else {
        result += `m ${argsStr} `;
      }
    } else if (cmd === 'M') {
      isFirstM = false;
      const translated: number[] = [];
      for (let i = 0; i < numbers.length; i += 2) {
        translated.push(Number((numbers[i] + dx).toFixed(2)));
        if (i + 1 < numbers.length) {
          translated.push(Number((numbers[i + 1] + dy).toFixed(2)));
        }
      }
      result += 'M ' + translated.join(' ') + ' ';
    } else if (cmd === 'L' || cmd === 'C' || cmd === 'S' || cmd === 'Q') {
      const translated: number[] = [];
      for (let i = 0; i < numbers.length; i += 2) {
        translated.push(Number((numbers[i] + dx).toFixed(2)));
        if (i + 1 < numbers.length) {
          translated.push(Number((numbers[i + 1] + dy).toFixed(2)));
        }
      }
      result += cmd + ' ' + translated.join(' ') + ' ';
    } else if (cmd === 'H') {
      const translated = numbers.map((n) => Number((n + dx).toFixed(2)));
      result += cmd + ' ' + translated.join(' ') + ' ';
    } else if (cmd === 'V') {
      const translated = numbers.map((n) => Number((n + dy).toFixed(2)));
      result += cmd + ' ' + translated.join(' ') + ' ';
    } else if (cmd === 'A') {
      // rx ry rotation large-arc sweep x y: only the endpoint moves.
      if (numbers.length >= 7) {
        const translated = [...numbers];
        for (let i = 0; i + 6 < translated.length; i += 7) {
          translated[i + 5] = Number((translated[i + 5] + dx).toFixed(2));
          translated[i + 6] = Number((translated[i + 6] + dy).toFixed(2));
        }
        result += cmd + ' ' + translated.join(' ') + ' ';
      } else {
        result += cmd + ' ' + argsStr + ' ';
      }
    } else {
      // Relative commands (c, l, h, v, s, q, t, a, z) keep relative deltas.
      result += cmd + ' ' + argsStr + ' ';
    }
  }

  return result.trim();
}

/**
 * Apply an arbitrary affine matrix to path data.
 *
 * Parsing through the editable path model normalises arcs and quadratic
 * commands into absolute cubics, which makes the transform exact for rotation,
 * scale and skew instead of approximating arc endpoints.
 */
export function transformPathData(d: string, matrix: AffineMatrix): string {
  if (!d || matrixIsIdentity(matrix)) return d;

  const model = parsePathData(d);
  for (const subpath of model.subpaths) {
    for (const node of subpath.nodes) {
      node.point = applyMatrixToPoint(matrix, node.point);
      node.handleIn = applyMatrixToPoint(matrix, node.handleIn);
      node.handleOut = applyMatrixToPoint(matrix, node.handleOut);
    }
  }
  return serializePathData(model);
}

/**
 * Extracts translation offsets from an SVG transform string (legacy helper).
 */
export function parseTransformTranslation(transformStr: string): { x: number; y: number } {
  if (!transformStr) return { x: 0, y: 0 };

  const translateMatch = /translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/i.exec(
    transformStr,
  );
  if (translateMatch) {
    return {
      x: parseFloat(translateMatch[1]) || 0,
      y: translateMatch[2] ? parseFloat(translateMatch[2]) : 0,
    };
  }

  const matrix = parseSvgTransform(transformStr);
  return { x: matrix.e, y: matrix.f };
}