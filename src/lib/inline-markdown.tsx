/**
 * lib/inline-markdown.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Parse and render inline markdown: **bold**, *italic*, `code`, [link](url),
 * [[wiki-link]] and [[page|alias]].
 *
 * Exported as React elements for the Workspace block renderers. This is a
 * deliberately small parser (no full markdown library) that covers the inline
 * constructs Qeda writes into block text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: InlineToken[] }
  | { type: 'italic'; content: InlineToken[] }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'wiki-link'; page: string; label: string };

const isWordChar = (char: string | undefined): boolean =>
  Boolean(char && /[A-Za-z0-9]/.test(char));

/** Only http(s), mailto and app-relative/doc links become anchors. */
function isSafeUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (/^(https?:|mailto:|doc:)/i.test(value)) return true;
  // Relative links and same-page anchors are fine; other schemes are not.
  return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * Parse inline markdown text into a token tree.
 *
 * Supported formats:
 *   - **bold** / __bold__
 *   - *italic* / _italic_
 *   - `code`
 *   - [link text](https://url)
 *   - [[wiki-link]] / [[wiki-link|alias]]
 *   - backslash escapes (`\*` stays literal)
 *
 * Emphasis may nest: **bold with *italic* inside**.
 */
export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let plain = '';
  let i = 0;

  const flush = () => {
    if (plain) {
      tokens.push({ type: 'text', content: plain });
      plain = '';
    }
  };

  while (i < text.length) {
    const char = text[i];

    // Backslash escape: the next character is literal text.
    if (char === '\\' && i + 1 < text.length) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    // Wiki link: [[page]] or [[page|alias]]
    if (char === '[' && text[i + 1] === '[') {
      const end = text.indexOf(']]', i + 2);
      if (end !== -1) {
        const raw = text.slice(i + 2, end);
        const [pagePart, aliasPart] = raw.split('|');
        const page = pagePart.trim();
        if (page) {
          flush();
          tokens.push({
            type: 'wiki-link',
            page,
            label: aliasPart?.trim() || page,
          });
          i = end + 2;
          continue;
        }
      }
    }

    // Link: [text](url)
    if (char === '[') {
      const closeText = text.indexOf(']', i + 1);
      if (closeText !== -1 && text[closeText + 1] === '(') {
        const closeUrl = text.indexOf(')', closeText + 2);
        if (closeUrl !== -1) {
          const label = text.slice(i + 1, closeText);
          const url = text.slice(closeText + 2, closeUrl).trim();
          if (label) {
            flush();
            tokens.push({ type: 'link', text: label, url });
            i = closeUrl + 1;
            continue;
          }
        }
      }
    }

    // Code span: `text` (contents are literal, never emphasis-parsed).
    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ type: 'code', content: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Bold: **text** or __text__
    if (
      (char === '*' || char === '_') &&
      text[i + 1] === char &&
      !(char === '_' && isWordChar(text[i - 1]))
    ) {
      const start = i + 2;
      const end = text.indexOf(char + char, start);
      if (end > start) {
        // Keep snake_case (e.g. `foo__bar`) from starting emphasis mid-word.
        if (char !== '_' || !isWordChar(text[end + 2])) {
          flush();
          tokens.push({
            type: 'bold',
            content: parseInlineMarkdown(text.slice(start, end)),
          });
          i = end + 2;
          continue;
        }
      }
    }

    // Italic: *text* or _text_
    if (char === '*' || char === '_') {
      // `_` must sit on a word boundary at both ends; `*` only needs a close.
      const boundaryOk = char !== '_' || !isWordChar(text[i - 1]);
      const end = text.indexOf(char, i + 1);
      if (
        boundaryOk &&
        end > i + 1 &&
        !(char === '*' && text[end + 1] === '*') &&
        !(char === '_' && isWordChar(text[end + 1]))
      ) {
        flush();
        tokens.push({
          type: 'italic',
          content: parseInlineMarkdown(text.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    plain += char;
    i += 1;
  }

  flush();
  return tokens;
}

/**
 * Render inline tokens as React elements.
 */
export function renderInlineTokens(tokens: InlineToken[]): React.ReactNode {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'text':
        return <React.Fragment key={idx}>{token.content}</React.Fragment>;

      case 'bold':
        return <strong key={idx}>{renderInlineTokens(token.content)}</strong>;

      case 'italic':
        return <em key={idx}>{renderInlineTokens(token.content)}</em>;

      case 'code':
        return (
          <code
            key={idx}
            className="bg-muted px-1 py-0.5 rounded text-sm font-mono"
          >
            {token.content}
          </code>
        );

      case 'link':
        if (!isSafeUrl(token.url)) {
          return (
            <React.Fragment key={idx}>
              {token.text} ({token.url})
            </React.Fragment>
          );
        }
        return (
          <a
            key={idx}
            href={token.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {token.text}
          </a>
        );

      case 'wiki-link':
        // Resolving the title to a page needs notebook context the inline
        // renderer does not have; render a clearly internal reference instead
        // of linking to a route that cannot be resolved.
        return (
          <span
            key={idx}
            title={`Wiki link: ${token.page}`}
            className="text-primary underline decoration-dotted underline-offset-2"
          >
            {token.label}
          </span>
        );

      default:
        return null;
    }
  });
}

/**
 * Simple utility: extract plain text from tokens.
 */
export function tokensToPlainText(tokens: InlineToken[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
          return token.content;
        case 'bold':
        case 'italic':
          return tokensToPlainText(token.content);
        case 'code':
          return token.content;
        case 'link':
          return token.text;
        case 'wiki-link':
          return token.label;
        default:
          return '';
      }
    })
    .join('');
}
