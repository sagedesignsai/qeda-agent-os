/**
 * components/documents/word-processor/PageSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Single physical paper sheet presentation for the Word Processor:
 *   - Authentic page dimensions (A4, Letter) and aspect ratio
 *   - LibreOffice-style corner margin crop mark brackets
 *   - Running header and footer with dynamic page numbering
 *   - Dark Canvas inverted styling support
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type {
  DocumentSettings,
  DocumentTheme,
  PageSize,
  PageOrientation,
} from '@/lib/pdf-studio/types';

interface PageSheetProps {
  pageNumber: number;
  totalPages: number;
  settings: DocumentSettings;
  theme: DocumentTheme;
  darkCanvas: boolean;
  children: React.ReactNode;
}

// Convert paper sizes to pixels (at ~96 DPI screen preview)
export function getPageDimensions(
  pageSize: PageSize,
  orientation: PageOrientation,
): { width: number; height: number } {
  let w = 794;
  let h = 1123;

  switch (pageSize) {
    case 'LETTER':
      w = 816;
      h = 1056;
      break;
    case 'LEGAL':
      w = 816;
      h = 1344;
      break;
    case 'TABLOID':
      w = 1056;
      h = 1632;
      break;
    case 'A4':
    default:
      w = 794;
      h = 1123;
      break;
  }

  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

export function PageSheet({
  pageNumber,
  totalPages,
  settings,
  theme,
  darkCanvas,
  children,
}: PageSheetProps) {
  const { width, height } = getPageDimensions(settings.pageSize, settings.orientation);
  const { margins, header, footer } = settings;

  // Scale points to pixels (~1.33 px per pt)
  const ptToPx = width / (settings.orientation === 'landscape' ? 841.89 : 595.28);
  const padTop = Math.round(margins.top * ptToPx);
  const padBottom = Math.round(margins.bottom * ptToPx);
  const padLeft = Math.round(margins.left * ptToPx);
  const padRight = Math.round(margins.right * ptToPx);

  return (
    <div
      className={`relative mx-auto my-6 transition-all duration-200 select-text ${
        darkCanvas
          ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-[0_10px_35px_rgba(0,0,0,0.8)]'
          : 'bg-white text-zinc-900 shadow-[0_12px_40px_rgba(0,0,0,0.4)]'
      }`}
      style={{
        width: `${width}px`,
        minHeight: `${height}px`,
        fontFamily: theme.fontFamily === 'Courier' ? 'monospace' : theme.fontFamily,
      }}
    >
      {/* ─── LibreOffice Signature Margin Crop Marks ──────────────────────── */}
      {/* Top-Left Bracket */}
      <div
        className="absolute w-3 h-3 pointer-events-none opacity-40"
        style={{
          top: `${padTop - 12}px`,
          left: `${padLeft - 12}px`,
          borderRight: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
          borderBottom: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
        }}
      />
      {/* Top-Right Bracket */}
      <div
        className="absolute w-3 h-3 pointer-events-none opacity-40"
        style={{
          top: `${padTop - 12}px`,
          right: `${padRight - 12}px`,
          borderLeft: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
          borderBottom: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
        }}
      />
      {/* Bottom-Left Bracket */}
      <div
        className="absolute w-3 h-3 pointer-events-none opacity-40"
        style={{
          bottom: `${padBottom - 12}px`,
          left: `${padLeft - 12}px`,
          borderRight: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
          borderTop: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
        }}
      />
      {/* Bottom-Right Bracket */}
      <div
        className="absolute w-3 h-3 pointer-events-none opacity-40"
        style={{
          bottom: `${padBottom - 12}px`,
          right: `${padRight - 12}px`,
          borderLeft: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
          borderTop: `1px solid ${darkCanvas ? '#71717a' : '#a1a1aa'}`,
        }}
      />

      {/* ─── Running Header ───────────────────────────────────────────────── */}
      {header.enabled && (
        <div
          className="absolute left-0 right-0 top-0 select-none text-[10px] text-zinc-400"
          style={{
            paddingTop: `${Math.max(12, padTop - 28)}px`,
            paddingLeft: `${padLeft}px`,
            paddingRight: `${padRight}px`,
          }}
        >
          <div className="flex items-center justify-between pb-1">
            <span>{header.leftText || ''}</span>
            <span>{header.rightText || ''}</span>
          </div>
          {header.showDivider && (
            <div className={`h-[1px] w-full ${darkCanvas ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          )}
        </div>
      )}

      {/* ─── Page Body Content ────────────────────────────────────────────── */}
      <div
        className="flex flex-col"
        style={{
          paddingTop: `${padTop}px`,
          paddingBottom: `${padBottom}px`,
          paddingLeft: `${padLeft}px`,
          paddingRight: `${padRight}px`,
          minHeight: `${height}px`,
        }}
      >
        {children}
      </div>

      {/* ─── Running Footer ───────────────────────────────────────────────── */}
      {footer.enabled && (
        <div
          className="absolute left-0 right-0 bottom-0 select-none text-[10px] text-zinc-400"
          style={{
            paddingBottom: `${Math.max(12, padBottom - 28)}px`,
            paddingLeft: `${padLeft}px`,
            paddingRight: `${padRight}px`,
          }}
        >
          {footer.showDivider && (
            <div className={`h-[1px] w-full mb-1 ${darkCanvas ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          )}
          <div className="flex items-center justify-between">
            <span>{footer.leftText || ''}</span>
            <span>
              {footer.pageNumberFormat === 'simple'
                ? `${pageNumber}`
                : `Page ${pageNumber} of ${totalPages}`}
            </span>
            <span>{footer.rightText || ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
