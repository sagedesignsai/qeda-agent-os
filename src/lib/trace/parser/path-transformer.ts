/**
 * lib/trace/parser/path-transformer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Translates SVG path coordinates and extracts transform offsets.
 *
 * Ported from sagedesigns-os lib/motion/parser/path-transformer.ts.
 */

/**
 * Translates all absolute coordinates in an SVG path string by (dx, dy).
 * Relative commands (c, l, h, v, s, q, t, a, z) remain unchanged.
 */
export function translateSvgPath(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d

  const commandRegex = /([a-df-z])([^a-df-z]*)/gi
  let match: RegExpExecArray | null
  let result = ''
  let isFirstM = true

  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1]
    const argsStr = match[2].trim()
    if (!argsStr) {
      result += cmd + ' '
      continue
    }

    const numbers = argsStr.match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi)?.map(Number) || []

    if (cmd === 'm' && isFirstM) {
      isFirstM = false
      if (numbers.length >= 2) {
        const firstX = Number((numbers[0] + dx).toFixed(2))
        const firstY = Number((numbers[1] + dy).toFixed(2))
        result += `M ${firstX} ${firstY} `
        if (numbers.length > 2) {
          result += `l ${numbers.slice(2).join(' ')} `
        }
      } else {
        result += `m ${argsStr} `
      }
    } else if (cmd === 'M') {
      isFirstM = false
      const translated: number[] = []
      for (let i = 0; i < numbers.length; i += 2) {
        translated.push(Number((numbers[i] + dx).toFixed(2)))
        if (i + 1 < numbers.length) {
          translated.push(Number((numbers[i + 1] + dy).toFixed(2)))
        }
      }
      result += 'M ' + translated.join(' ') + ' '
    } else if (cmd === 'L' || cmd === 'C' || cmd === 'S' || cmd === 'Q') {
      const translated: number[] = []
      for (let i = 0; i < numbers.length; i += 2) {
        translated.push(Number((numbers[i] + dx).toFixed(2)))
        if (i + 1 < numbers.length) {
          translated.push(Number((numbers[i + 1] + dy).toFixed(2)))
        }
      }
      result += cmd + ' ' + translated.join(' ') + ' '
    } else if (cmd === 'H') {
      const translated = numbers.map((n) => Number((n + dx).toFixed(2)))
      result += cmd + ' ' + translated.join(' ') + ' '
    } else if (cmd === 'V') {
      const translated = numbers.map((n) => Number((n + dy).toFixed(2)))
      result += cmd + ' ' + translated.join(' ') + ' '
    } else {
      // Relative commands (c, l, h, v, s, q, t, a, z) keep relative deltas
      result += cmd + ' ' + argsStr + ' '
    }
  }

  return result.trim()
}

/**
 * Extracts translation offsets from an SVG transform string (e.g. translate(-122.77, -155.51) or matrix(...))
 */
export function parseTransformTranslation(transformStr: string): { x: number; y: number } {
  if (!transformStr) return { x: 0, y: 0 }

  const translateMatch = /translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/i.exec(transformStr)
  if (translateMatch) {
    return {
      x: parseFloat(translateMatch[1]) || 0,
      y: translateMatch[2] ? parseFloat(translateMatch[2]) : 0,
    }
  }

  const matrixMatch = /matrix\(\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*\)/i.exec(transformStr)
  if (matrixMatch) {
    return {
      x: parseFloat(matrixMatch[5]) || 0,
      y: parseFloat(matrixMatch[6]) || 0,
    }
  }

  return { x: 0, y: 0 }
}
