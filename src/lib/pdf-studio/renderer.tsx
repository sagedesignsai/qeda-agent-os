/**
 * lib/pdf-studio/renderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The core @react-pdf/renderer document engine.
 *
 * Converts a pure PdfDocument schema into the native React-PDF primitive tree:
 *   <Document>
 *     <Page>
 *       <Header fixed />
 *       <ContentBlocks />
 *       <Footer fixed />
 *     </Page>
 *   </Document>
 *
 * Adheres to all @react-pdf/renderer layout rules:
 *   - Yoga flexbox semantics
 *   - Safe dynamic page numbering via Text render={({ pageNumber, totalPages }) => ...}
 *   - Unbreakable blocks via wrap={false}
 *   - Page breaks via break
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import type {
  PdfDocument,
  PdfBlock,
  HeadingBlock,
  ParagraphBlock,
  ColumnsBlock,
  TableBlock,
  CalloutBlock,
  MetricsBlock,
  DividerBlock,
  SignatureBlock,
  ImageBlock,
  DocumentTheme,
} from './types';

// Helper to generate dynamic StyleSheet based on active document theme
function createPdfStyles(theme: DocumentTheme) {
  return StyleSheet.create({
    page: {
      backgroundColor: theme.backgroundColor,
      color: theme.textColor,
      fontFamily: theme.fontFamily,
      display: 'flex',
      flexDirection: 'column',
    },
    headerContainer: {
      position: 'relative',
      paddingBottom: 8,
      marginBottom: 16,
    },
    headerRow: {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerText: {
      fontSize: 8,
      color: theme.mutedColor,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    headerDivider: {
      marginTop: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.borderColor,
    },
    footerContainer: {
      position: 'relative',
      marginTop: 'auto',
      paddingTop: 10,
    },
    footerRow: {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerText: {
      fontSize: 8,
      color: theme.mutedColor,
    },
    footerDivider: {
      marginBottom: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.borderColor,
    },
    // Heading
    heading1: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.primaryColor,
      lineHeight: 1.2,
    },
    heading2: {
      fontSize: 15,
      fontWeight: 'bold',
      color: theme.primaryColor,
      lineHeight: 1.25,
    },
    heading3: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.secondaryColor,
      lineHeight: 1.3,
    },
    heading4: {
      fontSize: 10,
      fontWeight: 'bold',
      color: theme.secondaryColor,
      lineHeight: 1.3,
    },
    headingSubtitle: {
      fontSize: 10,
      color: theme.mutedColor,
      marginTop: 2,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.surfaceColor,
      borderWidth: 0.5,
      borderColor: theme.accentColor,
      borderRadius: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 4,
    },
    badgeText: {
      fontSize: 7,
      fontWeight: 'bold',
      color: theme.accentColor,
      letterSpacing: 0.5,
    },
    // Paragraph
    paragraph: {
      fontSize: 10,
      color: theme.textColor,
      lineHeight: 1.45,
    },
    // Columns
    columnsRow: {
      display: 'flex',
      flexDirection: 'row',
    },
    columnItem: {
      display: 'flex',
      flexDirection: 'column',
    },
    columnTitle: {
      fontSize: 10,
      fontWeight: 'bold',
      color: theme.secondaryColor,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    // Table
    tableWrapper: {
      display: 'flex',
      flexDirection: 'column',
      borderWidth: 0.5,
      borderColor: theme.borderColor,
      borderRadius: 4,
      overflow: 'hidden',
    },
    tableRow: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 22,
    },
    tableHeaderRow: {
      backgroundColor: theme.surfaceColor,
      borderBottomWidth: 0.8,
      borderBottomColor: theme.borderColor,
    },
    tableCell: {
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    tableHeaderText: {
      fontSize: 8,
      fontWeight: 'bold',
      color: theme.primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    tableCellText: {
      fontSize: 9,
      color: theme.textColor,
    },
    // Callout
    calloutCard: {
      padding: 10,
      backgroundColor: theme.surfaceColor,
      borderRadius: 4,
      borderLeftWidth: 3,
      borderLeftColor: theme.accentColor,
      borderTopWidth: 0.5,
      borderTopColor: theme.borderColor,
      borderRightWidth: 0.5,
      borderRightColor: theme.borderColor,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.borderColor,
    },
    calloutTitle: {
      fontSize: 10,
      fontWeight: 'bold',
      marginBottom: 3,
      color: theme.primaryColor,
    },
    calloutText: {
      fontSize: 9,
      color: theme.textColor,
      lineHeight: 1.4,
    },
    // Metrics
    metricsGrid: {
      display: 'flex',
      flexDirection: 'row',
      gap: 8,
    },
    metricCard: {
      flex: 1,
      padding: 8,
      backgroundColor: theme.surfaceColor,
      borderWidth: 0.5,
      borderColor: theme.borderColor,
      borderRadius: 4,
    },
    metricValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.primaryColor,
    },
    metricLabel: {
      fontSize: 7.5,
      color: theme.mutedColor,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 2,
    },
    metricChange: {
      fontSize: 7,
      color: theme.accentColor,
      marginTop: 2,
    },
    // Signature
    signatureContainer: {
      display: 'flex',
      flexDirection: 'column',
      width: 180,
      marginTop: 8,
    },
    signatureLine: {
      borderBottomWidth: 0.8,
      borderBottomColor: theme.primaryColor,
      marginBottom: 4,
    },
    signeeName: {
      fontSize: 10,
      fontWeight: 'bold',
      color: theme.primaryColor,
    },
    signatureMeta: {
      fontSize: 8,
      color: theme.mutedColor,
      marginTop: 1,
    },
  });
}

// ─── Block Subcomponents ──────────────────────────────────────────────────────

function RenderHeading({
  block,
  styles,
}: {
  block: HeadingBlock;
  styles: ReturnType<typeof createPdfStyles>;
}) {
  const levelStyle =
    block.level === 1
      ? styles.heading1
      : block.level === 2
        ? styles.heading2
        : block.level === 3
          ? styles.heading3
          : styles.heading4;

  const textAlign = block.align || 'left';

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
      <Text style={levelStyle}>{block.text}</Text>
      {block.subtitle && (
        <Text style={styles.headingSubtitle}>{block.subtitle}</Text>
      )}
    </View>
  );
}

function RenderParagraph({
  block,
  styles,
}: {
  block: ParagraphBlock;
  styles: ReturnType<typeof createPdfStyles>;
}) {
  const textStyle: Record<string, unknown> = {
    ...styles.paragraph,
    textAlign: block.align || 'left',
  };

  if (block.fontSize) textStyle.fontSize = block.fontSize;
  if (block.color) textStyle.color = block.color;
  if (block.bold) textStyle.fontWeight = 'bold';
  if (block.italic) textStyle.fontStyle = 'italic';
  if (block.lineHeight) textStyle.lineHeight = block.lineHeight;

  return (
    <View
      wrap={block.wrap ?? true}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.marginTop ?? 0,
        marginBottom: block.marginBottom ?? 6,
      }}
    >
      <Text style={textStyle}>{block.content}</Text>
    </View>
  );
}

function RenderColumns({
  block,
  styles,
  theme,
}: {
  block: ColumnsBlock;
  styles: ReturnType<typeof createPdfStyles>;
  theme: DocumentTheme;
}) {
  return (
    <View
      wrap={block.wrap ?? true}
      break={block.breakBefore ?? false}
      style={[
        styles.columnsRow,
        {
          gap: block.gap || 12,
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.columns.map((col) => (
        <View
          key={col.id}
          style={[styles.columnItem, { flex: col.widthRatio || 1 }]}
        >
          {col.title && <Text style={styles.columnTitle}>{col.title}</Text>}
          {col.blocks.map((childBlock) => (
            <RenderBlock
              key={childBlock.id}
              block={childBlock}
              styles={styles}
              theme={theme}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function RenderTable({
  block,
  styles,
  theme,
}: {
  block: TableBlock;
  styles: ReturnType<typeof createPdfStyles>;
  theme: DocumentTheme;
}) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.tableWrapper,
        {
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 10,
          borderColor:
            block.showBorders === false ? 'transparent' : theme.borderColor,
        },
      ]}
    >
      {/* Table Header */}
      <View
        style={[
          styles.tableRow,
          styles.tableHeaderRow,
          block.headerBg ? { backgroundColor: block.headerBg } : {},
        ]}
      >
        {block.columns.map((col) => (
          <View
            key={col.id}
            style={[
              styles.tableCell,
              {
                width: `${col.widthPct}%`,
                textAlign: col.align || 'left',
              },
            ]}
          >
            <Text style={styles.tableHeaderText}>{col.header}</Text>
          </View>
        ))}
      </View>

      {/* Table Rows */}
      {block.rows.map((row, rIdx) => {
        const isStripe = block.striped && rIdx % 2 === 1;
        return (
          <View
            key={`row-${rIdx}`}
            style={[
              styles.tableRow,
              isStripe ? { backgroundColor: theme.surfaceColor } : {},
              rIdx < block.rows.length - 1 && block.showBorders !== false
                ? {
                    borderBottomWidth: 0.5,
                    borderBottomColor: theme.borderColor,
                  }
                : {},
            ]}
          >
            {block.columns.map((col, cIdx) => (
              <View
                key={`cell-${rIdx}-${cIdx}`}
                style={[
                  styles.tableCell,
                  {
                    width: `${col.widthPct}%`,
                    textAlign: col.align || 'left',
                  },
                ]}
              >
                <Text style={styles.tableCellText}>{row[cIdx] ?? ''}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function RenderCallout({
  block,
  styles,
  theme,
}: {
  block: CalloutBlock;
  styles: ReturnType<typeof createPdfStyles>;
  theme: DocumentTheme;
}) {
  const variantColor =
    block.variant === 'warning'
      ? '#d97706'
      : block.variant === 'success'
        ? '#059669'
        : block.variant === 'quote'
          ? theme.mutedColor
          : block.variant === 'note'
            ? theme.secondaryColor
            : theme.accentColor;

  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.calloutCard,
        {
          borderLeftColor: variantColor,
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.title && (
        <Text style={[styles.calloutTitle, { color: variantColor }]}>
          {block.title}
        </Text>
      )}
      <Text style={styles.calloutText}>{block.text}</Text>
    </View>
  );
}

function RenderMetrics({
  block,
  styles,
}: {
  block: MetricsBlock;
  styles: ReturnType<typeof createPdfStyles>;
}) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.metricsGrid,
        {
          marginTop: block.marginTop ?? 0,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      {block.items.map((item) => (
        <View key={item.id} style={styles.metricCard}>
          <Text style={styles.metricValue}>{item.value}</Text>
          <Text style={styles.metricLabel}>{item.label}</Text>
          {item.change && (
            <Text
              style={[
                styles.metricChange,
                item.isPositive !== undefined
                  ? { color: item.isPositive ? '#059669' : '#dc2626' }
                  : {},
              ]}
            >
              {item.change}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function RenderDivider({
  block,
  theme,
}: {
  block: DividerBlock;
  theme: DocumentTheme;
}) {
  return (
    <View
      wrap={false}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.spacing ?? 8,
        marginBottom: block.spacing ?? 8,
        borderBottomWidth: block.thickness ?? 0.5,
        borderBottomColor: block.color || theme.borderColor,
        borderBottomStyle: block.style || 'solid',
      }}
    />
  );
}

function RenderSignature({
  block,
  styles,
}: {
  block: SignatureBlock;
  styles: ReturnType<typeof createPdfStyles>;
}) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={[
        styles.signatureContainer,
        {
          marginTop: block.marginTop ?? 12,
          marginBottom: block.marginBottom ?? 8,
        },
      ]}
    >
      <View style={styles.signatureLine} />
      <Text style={styles.signeeName}>{block.signeeName}</Text>
      {block.role && <Text style={styles.signatureMeta}>{block.role}</Text>}
      {block.company && (
        <Text style={styles.signatureMeta}>{block.company}</Text>
      )}
      {block.date && <Text style={styles.signatureMeta}>{block.date}</Text>}
    </View>
  );
}

function RenderImageBlock({
  block,
  styles,
}: {
  block: ImageBlock;
  styles: ReturnType<typeof createPdfStyles>;
}) {
  return (
    <View
      wrap={block.wrap ?? false}
      break={block.breakBefore ?? false}
      style={{
        marginTop: block.marginTop ?? 0,
        marginBottom: block.marginBottom ?? 8,
        alignItems:
          block.align === 'center'
            ? 'center'
            : block.align === 'right'
              ? 'flex-end'
              : 'flex-start',
      }}
    >
      <Image
        src={block.src}
        style={{
          width: block.width || 200,
          height: block.height || 120,
          objectFit: 'contain',
        }}
      />
      {block.caption && (
        <Text
          style={[
            styles.paragraph,
            { fontSize: 8, color: '#64748b', marginTop: 2 },
          ]}
        >
          {block.caption}
        </Text>
      )}
    </View>
  );
}

function RenderBlock({
  block,
  styles,
  theme,
}: {
  block: PdfBlock;
  styles: ReturnType<typeof createPdfStyles>;
  theme: DocumentTheme;
}) {
  switch (block.type) {
    case 'heading':
      return <RenderHeading block={block} styles={styles} />;
    case 'paragraph':
      return <RenderParagraph block={block} styles={styles} />;
    case 'columns':
      return <RenderColumns block={block} styles={styles} theme={theme} />;
    case 'table':
      return <RenderTable block={block} styles={styles} theme={theme} />;
    case 'callout':
      return <RenderCallout block={block} styles={styles} theme={theme} />;
    case 'metrics':
      return <RenderMetrics block={block} styles={styles} />;
    case 'divider':
      return <RenderDivider block={block} theme={theme} />;
    case 'page-break':
      return <View break />;
    case 'signature':
      return <RenderSignature block={block} styles={styles} />;
    case 'image':
      return <RenderImageBlock block={block} styles={styles} />;
    default:
      return null;
  }
}

// ─── Main Document View ───────────────────────────────────────────────────────

export function PdfDocumentView({ doc }: { doc: PdfDocument }) {
  const { settings, blocks } = doc;
  const { theme, margins, header, footer } = settings;
  const styles = React.useMemo(() => createPdfStyles(theme), [theme]);

  return (
    <Document
      title={doc.title}
      author="Docugent Document Studio"
      subject={doc.description}
      creator="Docugent Local Agent OS"
      producer="@react-pdf/renderer"
    >
      <Page
        size={settings.pageSize}
        orientation={settings.orientation}
        style={[
          styles.page,
          {
            paddingTop: margins.top,
            paddingRight: margins.right,
            paddingBottom: margins.bottom,
            paddingLeft: margins.left,
          },
        ]}
      >
        {/* Dynamic Header */}
        {header.enabled && (
          <View fixed style={styles.headerContainer}>
            <View style={styles.headerRow}>
              <Text style={styles.headerText}>{header.leftText || ''}</Text>
              <Text style={styles.headerText}>{header.rightText || ''}</Text>
            </View>
            {header.showDivider !== false && (
              <View style={styles.headerDivider} />
            )}
          </View>
        )}

        {/* Content Blocks */}
        {blocks.map((block) => (
          <RenderBlock
            key={block.id}
            block={block}
            styles={styles}
            theme={theme}
          />
        ))}

        {/* Dynamic Footer with Page Numbers */}
        {footer.enabled && (
          <View fixed style={styles.footerContainer}>
            {footer.showDivider !== false && (
              <View style={styles.footerDivider} />
            )}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{footer.leftText || ''}</Text>
              <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }) => {
                  if (footer.pageNumberFormat === 'simple') {
                    return `${pageNumber}`;
                  }
                  return `Page ${pageNumber} of ${totalPages}`;
                }}
              />
              <Text style={styles.footerText}>{footer.rightText || ''}</Text>
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
