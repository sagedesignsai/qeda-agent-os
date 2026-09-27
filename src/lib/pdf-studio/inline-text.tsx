/**
 * lib/pdf-studio/inline-text.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Parser and renderer for rich inline text within @react-pdf/renderer.
 *
 * Implements nested <Text> and <Link> hierarchies supporting:
 *   - Bold: **bold**
 *   - Italic: *italic* or _italic_
 *   - Bold + Italic: ***bold italic***
 *   - Underline: __underline__
 *   - Strikethrough: ~~strikethrough~~
 *   - Inline Code: `const code = true;`
 *   - Hyperlinks & Internal Destinations: [label](https://...) or [label](#anchor)
 *   - Semantic and Hex Colors: {color:#e11d48}rose{/color} or {color:primary}text{/color}
 *   - Structured InlineTextSpan[] arrays
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Text, Link } from '@react-pdf/renderer';
import type { DocumentTheme, InlineTextSpan } from './types';

/**
 * Tokenizes markdown and inline styling syntax into a normalized list of InlineTextSpans.
 * Supports arbitrary composition (e.g. bold link, colored italic text).
 */
export function parseInlineSpans(
  input: string,
  parentStyles: Partial<InlineTextSpan> = {},
): InlineTextSpan[] {
  if (!input) return [];

  // Match:
  // [1,2,3]: [link](url)
  // [4,5]:   {color:val}text{/color}
  // [6]:     ***bold-italic***
  // [7]:     **bold**
  // [8]:     __underline__
  // [9]:     ~~strike~~
  // [10]:    `code`
  // [11]:    *italic*
  // [12]:    _italic_
  const TOKEN_REGEX =
    /(\[([^\]]+)\]\(([^)]+)\)|\{color:([#a-zA-Z0-9_-]+)\}(.+?)\{\/color\}|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

  const result: InlineTextSpan[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      result.push({
        text: input.substring(lastIndex, match.index),
        ...parentStyles,
      });
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith('[')) {
      const linkText = match[2];
      const href = match[3];
      const inner = parseInlineSpans(linkText, { ...parentStyles, href });
      result.push(...inner);
    } else if (fullMatch.startsWith('{color:')) {
      const colorVal = match[4];
      const coloredText = match[5];
      const inner = parseInlineSpans(coloredText, {
        ...parentStyles,
        color: colorVal,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('***')) {
      const inner = parseInlineSpans(match[6], {
        ...parentStyles,
        bold: true,
        italic: true,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('**')) {
      const inner = parseInlineSpans(match[7], {
        ...parentStyles,
        bold: true,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('__')) {
      const inner = parseInlineSpans(match[8], {
        ...parentStyles,
        underline: true,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('~~')) {
      const inner = parseInlineSpans(match[9], {
        ...parentStyles,
        strike: true,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('`')) {
      result.push({
        text: match[10],
        ...parentStyles,
        code: true,
      });
    } else if (fullMatch.startsWith('*')) {
      const inner = parseInlineSpans(match[11], {
        ...parentStyles,
        italic: true,
      });
      result.push(...inner);
    } else if (fullMatch.startsWith('_')) {
      const inner = parseInlineSpans(match[12], {
        ...parentStyles,
        italic: true,
      });
      result.push(...inner);
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < input.length) {
    result.push({
      text: input.substring(lastIndex),
      ...parentStyles,
    });
  }

  return result;
}

/**
 * Resolves semantic color names ('primary', 'secondary', 'accent', 'muted') to theme values.
 */
function resolveColor(
  color: string | undefined,
  theme: DocumentTheme,
): string | undefined {
  if (!color) return undefined;
  switch (color.toLowerCase()) {
    case 'primary':
      return theme.primaryColor;
    case 'secondary':
      return theme.secondaryColor;
    case 'accent':
      return theme.accentColor;
    case 'muted':
      return theme.mutedColor;
    default:
      return color;
  }
}

/**
 * Converts structured spans into native @react-pdf/renderer <Text> and <Link> elements.
 */
export function renderStructuredSpans(
  spans: InlineTextSpan[],
  theme: DocumentTheme,
  baseStyle?: Record<string, unknown>,
): React.ReactNode {
  return spans.map((span, idx) => {
    const key = `span-${idx}-${span.text.slice(0, 10)}`;

    const style: Record<string, unknown> = {
      ...(baseStyle || {}),
    };

    if (span.bold) style.fontWeight = 'bold';
    if (span.italic) style.fontStyle = 'italic';
    if (span.underline) style.textDecoration = 'underline';
    if (span.strike) style.textDecoration = 'line-through';
    if (span.color) style.color = resolveColor(span.color, theme);
    if (span.backgroundColor) style.backgroundColor = span.backgroundColor;

    if (span.code) {
      style.fontFamily = 'Courier';
      style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      style.fontSize =
        typeof style.fontSize === 'number' ? style.fontSize * 0.9 : 8.5;
    }

    const hasSpecialStyle =
      span.bold ||
      span.italic ||
      span.underline ||
      span.strike ||
      span.code ||
      span.color ||
      span.backgroundColor;

    // Hyperlink handling (external or internal anchor #id)
    if (span.href) {
      const linkStyle: Record<string, unknown> = {
        color: theme.accentColor,
        textDecoration: 'underline',
      };

      if (hasSpecialStyle) {
        return (
          <Link key={key} src={span.href} style={linkStyle as any}>
            <Text style={style as any}>{span.text}</Text>
          </Link>
        );
      }

      return (
        <Link key={key} src={span.href} style={linkStyle as any}>
          {span.text}
        </Link>
      );
    }

    if (hasSpecialStyle) {
      return (
        <Text key={key} style={style as any}>
          {span.text}
        </Text>
      );
    }

    return <React.Fragment key={key}>{span.text}</React.Fragment>;
  });
}

/**
 * Parses markdown inline formatted text and renders nested @react-pdf/renderer elements.
 */
export function renderInlineFormattedText(
  content: string,
  theme: DocumentTheme,
  baseStyle?: Record<string, unknown>,
): React.ReactNode {
  if (!content) return null;

  // Fast path: if no markdown or color tags are present, return plain string
  const hasFormatting = /[*_`~[\]{}]/.test(content);
  if (!hasFormatting) {
    return content;
  }

  const spans = parseInlineSpans(content);
  return renderStructuredSpans(spans, theme, baseStyle);
}
