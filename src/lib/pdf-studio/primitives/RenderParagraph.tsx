/**
 * lib/pdf-studio/primitives/RenderParagraph.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Paragraph block renderer with dynamic tokens, orphans/widows, and inline text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { ParagraphBlock, DocumentTheme } from '../types';
import type { PdfStyles } from '../styles';
import {
  renderInlineFormattedText,
  renderStructuredSpans,
} from '../inline-text';

const PdfText = Text as any;

interface RenderParagraphProps {
  block: ParagraphBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderParagraph({
  block,
  styles,
  theme,
}: RenderParagraphProps) {
  const textStyle: Record<string, unknown> = {
    ...styles.paragraph,
    textAlign: block.align || 'left',
  };

  if (block.fontSize) textStyle.fontSize = block.fontSize;
  if (block.color) textStyle.color = block.color;
  if (block.bold) textStyle.fontWeight = 'bold';
  if (block.italic) textStyle.fontStyle = 'italic';
  if (block.underline) textStyle.textDecoration = 'underline';
  if (block.strike) textStyle.textDecoration = 'line-through';
  if (block.lineHeight) textStyle.lineHeight = block.lineHeight;

  const destinationId = block.anchorId || block.id;
  const bookmarkProp =
    typeof block.bookmark === 'string' || typeof block.bookmark === 'object'
      ? block.bookmark
      : block.bookmark === true
        ? block.content.slice(0, 40)
        : undefined;

  const hasDynamicPageTokens =
    block.renderDynamic ||
    block.content.includes('{{pageNumber}}') ||
    block.content.includes('{{totalPages}}');

  return (
    <View
      wrap={block.wrap ?? true}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.marginTop ?? 0,
        marginBottom: block.marginBottom ?? 6,
      }}
    >
      {hasDynamicPageTokens ? (
        <PdfText
          id={destinationId}
          style={textStyle}
          wrap={block.wrap ?? true}
          minPresenceAhead={block.minPresenceAhead ?? 0}
          orphans={block.orphans ?? 2}
          widows={block.widows ?? 2}
          hyphenationPenalty={block.hyphenationPenalty}
          bookmark={bookmarkProp}
          render={({
            pageNumber,
            totalPages,
            subPageNumber,
            subPageTotalPages,
          }: any) => {
            const resolved = block.content
              .replace(/\{\{pageNumber\}\}/g, String(pageNumber))
              .replace(/\{\{totalPages\}\}/g, String(totalPages))
              .replace(
                /\{\{subPageNumber\}\}/g,
                String(subPageNumber ?? pageNumber),
              )
              .replace(
                /\{\{subPageTotalPages\}\}/g,
                String(subPageTotalPages ?? totalPages),
              );
            return renderInlineFormattedText(resolved, theme, textStyle);
          }}
        />
      ) : (
        <PdfText
          id={destinationId}
          style={textStyle}
          wrap={block.wrap ?? true}
          minPresenceAhead={block.minPresenceAhead ?? 0}
          orphans={block.orphans ?? 2}
          widows={block.widows ?? 2}
          hyphenationPenalty={block.hyphenationPenalty}
          bookmark={bookmarkProp}
        >
          {block.spans && block.spans.length > 0
            ? renderStructuredSpans(block.spans, theme, textStyle)
            : renderInlineFormattedText(block.content, theme, textStyle)}
        </PdfText>
      )}
    </View>
  );
}
