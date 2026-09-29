/**
 * lib/pdf-studio/export-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure service for compiling React-PDF documents to Blobs in the background
 * and exporting them directly to the native file system or print preview.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { toast } from 'sonner';
import type { PdfDocument } from './types';
import { PdfDocumentView } from './renderer';

export interface ExportResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Compiles a PdfDocument into a native PDF Blob in the background.
 */
export async function compilePdfBlob(doc: PdfDocument): Promise<Blob> {
  const element = React.createElement(PdfDocumentView, { doc });
  const instance = pdf(element as any);
  return await instance.toBlob();
}

/**
 * Converts a Blob to a Base64 string for IPC transport.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Compiles and triggers the native Electron save dialog to write the PDF to disk.
 */
export async function exportDocumentToDisk(
  doc: PdfDocument,
): Promise<ExportResult> {
  try {
    const toastId = toast.loading('Compiling PDF for export...');
    const blob = await compilePdfBlob(doc);
    const base64 = await blobToBase64(blob);

    const safeTitle = (doc.title || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const filename = `${safeTitle}.pdf`;

    const res = await window.electron.ipc.invoke<ExportResult>(
      'documents:export-file',
      {
        id: doc.id,
        format: 'pdf',
        filename,
        pdfBase64: base64,
      },
    );

    toast.dismiss(toastId);

    if (res.ok && res.filePath) {
      toast.success(`Exported PDF: ${res.filePath}`);
    } else if (res.error && res.error !== 'User canceled export') {
      toast.error(`Export failed: ${res.error}`);
    }

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to export PDF:', err);
    toast.error(`Export failed: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Compiles the PDF and opens it in a browser print window.
 */
export async function printDocument(doc: PdfDocument): Promise<void> {
  try {
    const toastId = toast.loading('Preparing document for print...');
    const blob = await compilePdfBlob(doc);
    const url = URL.createObjectURL(blob);
    toast.dismiss(toastId);

    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  } catch (err) {
    console.error('Failed to print document:', err);
    toast.error('Failed to launch print preview');
  }
}
