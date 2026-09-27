/**
 * lib/pdf-studio/styles.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic StyleSheet creator for @react-pdf/renderer based on active theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { StyleSheet } from '@react-pdf/renderer';
import type { DocumentTheme } from './types';

export function createPdfStyles(theme: DocumentTheme) {
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

export type PdfStyles = ReturnType<typeof createPdfStyles>;
