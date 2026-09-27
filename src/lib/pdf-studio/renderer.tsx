/**
 * lib/pdf-studio/renderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The core @react-pdf/renderer document engine coordinator.
 *
 * Converts a pure PdfDocument schema into the native React-PDF primitive tree:
 *   <Document>
 *     <Page>
 *       <DocumentHeader fixed />
 *       <RenderBlock key={block.id} />
 *       <DocumentFooter fixed />
 *     </Page>
 *   </Document>
 *
 * Subcomponents and block primitives are modularized under ./primitives:
 *   - DocumentHeader, DocumentFooter
 *   - RenderHeading, RenderParagraph, RenderColumns, RenderTable
 *   - RenderCallout, RenderMetrics, RenderDivider, RenderSignature, RenderImageBlock
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Document, Page } from '@react-pdf/renderer';
import type { PdfDocument } from './types';
import { createPdfStyles } from './styles';
import { DocumentHeader, DocumentFooter, RenderBlock } from './primitives';

export { createPdfStyles } from './styles';
export type { PdfStyles } from './styles';
export * from './primitives';

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
        <DocumentHeader header={header} styles={styles} />

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
        <DocumentFooter footer={footer} styles={styles} />
      </Page>
    </Document>
  );
}
