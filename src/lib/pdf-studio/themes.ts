/**
 * lib/pdf-studio/themes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated color themes and typography defaults for PDF generation.
 * All colors are tested for crisp contrast on standard 72 DPI PDF renderers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DocumentTheme } from './types';

export const DOCUMENT_THEMES: Record<string, DocumentTheme> = {
  navy: {
    name: 'Executive Navy',
    primaryColor: '#0f172a',
    secondaryColor: '#1e3a8a',
    accentColor: '#2563eb',
    backgroundColor: '#ffffff',
    surfaceColor: '#f8fafc',
    textColor: '#1e293b',
    mutedColor: '#64748b',
    borderColor: '#e2e8f0',
    fontFamily: 'Helvetica',
  },
  emerald: {
    name: 'Emerald Slate',
    primaryColor: '#064e3b',
    secondaryColor: '#047857',
    accentColor: '#10b981',
    backgroundColor: '#ffffff',
    surfaceColor: '#f0fdf4',
    textColor: '#1f2937',
    mutedColor: '#6b7280',
    borderColor: '#e5e7eb',
    fontFamily: 'Helvetica',
  },
  indigo: {
    name: 'Indigo Modern',
    primaryColor: '#312e81',
    secondaryColor: '#4338ca',
    accentColor: '#6366f1',
    backgroundColor: '#ffffff',
    surfaceColor: '#faf5ff',
    textColor: '#18181b',
    mutedColor: '#71717a',
    borderColor: '#e4e4e7',
    fontFamily: 'Helvetica',
  },
  crimson: {
    name: 'Crimson Slate',
    primaryColor: '#881337',
    secondaryColor: '#be123c',
    accentColor: '#e11d48',
    backgroundColor: '#ffffff',
    surfaceColor: '#fff1f2',
    textColor: '#292524',
    mutedColor: '#78716c',
    borderColor: '#e7e5e4',
    fontFamily: 'Times-Roman',
  },
  monochrome: {
    name: 'Monochrome Minimal',
    primaryColor: '#18181b',
    secondaryColor: '#27272a',
    accentColor: '#52525b',
    backgroundColor: '#ffffff',
    surfaceColor: '#f4f4f5',
    textColor: '#09090b',
    mutedColor: '#71717a',
    borderColor: '#e4e4e7',
    fontFamily: 'Helvetica',
  },
};

export const DEFAULT_THEME: DocumentTheme = DOCUMENT_THEMES.navy;
