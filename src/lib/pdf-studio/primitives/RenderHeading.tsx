/**
 * lib/pdf-studio/primitives/RenderHeading.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Heading block renderer with orphan prevention, PDF bookmarks, and inline text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text } from '@react-pdf/renderer';
import type { HeadingBlock, DocumentTheme, PdfBookmark } from '../types';
import type { PdfStyles } from '../styles';
import {
  renderInlineFormattedText,
  renderStructuredSpans,
} from '../inline-text';

const PdfText = Text as any;

interface RenderHeadingProps {
  block: HeadingBlock;
  styles: PdfStyles;
  theme: DocumentTheme;
}

export function RenderHeading({ block, styles, theme }: RenderHeadingProps) {
  const levelStyle =
    block.level === 1
      ? styles.heading1
      : block.level === 2
        ? styles.heading2
        : block.level === 3
          ? styles.heading3
          : styles.heading4;

  const textAlign = block.align || 'left';

  // Orphan/widow prevention: guarantee following content on the same page within n points
  const minPresenceAhead =
    block.minPresenceAhead ??
    (block.level === 1
      ? 35
      : block.level === 2
        ? 25
        : block.level === 3
          ? 20
          : 15);

  // PDF reader outline tree bookmark
  let bookmarkProp: PdfBookmark | undefined;
  if (block.bookmark === false) {
    bookmarkProp = undefined;
  } else if (
    typeof block.bookmark === 'string' ||
    typeof block.bookmark === 'object'
  ) {
    bookmarkProp = block.bookmark;
  } else if (
    block.bookmark === true ||
    (block.bookmark === undefined && (block.level === 1 || block.level === 2))
  ) {
    bookmarkProp = block.text;
  }

  const destinationId = block.anchorId || block.id;

  return (
    <View
      wrap={block.wrap ?? true}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.marginTop ?? 0,
        marginBottom: block.marginBottom ?? 8,
        textAlign,
      }}
    >
      {block.badge && (
        <View
          style={[
            styles.badge,
            textAlign === 'center'
              ? { alignSelf: 'center' }
              : textAlign === 'right'
                ? { alignSelf: 'flex-end' }
                : {},
          ]}
        >
          <Text style={styles.badgeText}>{block.badge}</Text>
        </View>
      )}
      <PdfText
        id={destinationId}
        style={levelStyle}
        minPresenceAhead={minPresenceAhead}
        hyphenationPenalty={block.hyphenationPenalty ?? 1000}
        wrap={block.wrap ?? true}
        bookmark={bookmarkProp}
      >
        {block.spans && block.spans.length > 0
          ? renderStructuredSpans(block.spans, theme, levelStyle)
          : renderInlineFormattedText(block.text, theme, levelStyle)}
      </PdfText>
      {block.subtitle && (
        <Text style={styles.headingSubtitle}>
          {renderInlineFormattedText(
            block.subtitle,
            theme,
            styles.headingSubtitle,
          )}
        </Text>
      )}
    </View>
  );
}
