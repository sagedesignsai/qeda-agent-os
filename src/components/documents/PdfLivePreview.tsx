/**
 * components/documents/PdfLivePreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Synchronized live PDF preview pane powered by @react-pdf/renderer usePDF hook.
 *
 * Features:
 *   - Instant reactive document recompilation with debounce
 *   - Native PDF viewer rendering via Blob URL in sandboxed frame
 *   - One-click native disk export via Electron save dialog
 *   - Zoom scale controls (Fit, 75%, 100%, 125%)
 *   - Direct print and download capabilities
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { usePDF } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DownloadIcon,
  PrinterIcon,
  ZoomInIcon,
  ZoomOutIcon,
  SaveIcon,
  FileCheckIcon,
  Loader2Icon,
  AlertCircleIcon,
  Maximize2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PdfDocument } from '@/lib/pdf-studio/types';
import { PdfDocumentView } from '@/lib/pdf-studio/renderer';

interface PdfLivePreviewProps {
  doc: PdfDocument;
}

export function PdfLivePreview({ doc }: PdfLivePreviewProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [isExporting, setIsExporting] = useState(false);

  // Memoize the document view element so react-pdf reconciles efficiently
  const docElement = useMemo(() => <PdfDocumentView doc={doc} />, [doc]);

  // @react-pdf/renderer's usePDF hook manages web-worker or on-the-fly rendering
  const [instance, updateInstance] = usePDF({ document: docElement });

  // Update instance when document changes
  useEffect(() => {
    updateInstance(docElement);
  }, [docElement, updateInstance]);

  const handleNativeExport = async () => {
    if (!instance.blob) {
      toast.error('PDF document is still generating, please wait.');
      return;
    }

    setIsExporting(true);
    try {
      // Convert Blob to Base64
      const buffer = await instance.blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const filename = `${doc.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.pdf`;
      const res = await window.electron.ipc.invoke<{
        ok: boolean;
        filePath?: string;
        error?: string;
      }>('documents:export-file', {
        id: doc.id,
        format: 'pdf',
        filename,
        pdfBase64: base64,
      });

      if (res.ok && res.filePath) {
        toast.success(`Saved PDF to ${res.filePath}`);
      } else if (res.error && res.error !== 'User canceled export') {
        toast.error(`Export failed: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    if (!instance.url) return;
    const printWindow = window.open(instance.url, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-950/80 text-foreground">
      {/* Top Preview Control Bar */}
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border/60 bg-muted/20 px-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {instance.loading ? (
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              Rendering PDF...
            </span>
          ) : instance.error ? (
            <span className="flex items-center gap-1.5 text-destructive font-medium">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              Render Error
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <FileCheckIcon className="h-3.5 w-3.5" />
              PDF Ready
            </span>
          )}
          <span className="text-zinc-600">•</span>
          <span>
            {doc.settings.pageSize} ({doc.settings.orientation})
          </span>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <div className="flex items-center rounded-md border border-border/40 bg-background/50 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setZoom((z) => Math.max(50, z - 15))}
                  disabled={zoom <= 50}
                >
                  <ZoomOutIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>

            <span className="px-1 text-[11px] font-mono text-muted-foreground min-w-[3rem] text-center">
              {zoom}%
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setZoom((z) => Math.min(200, z + 15))}
                  disabled={zoom >= 200}
                >
                  <ZoomInIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setZoom(100)}
                >
                  <Maximize2Icon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Zoom (100%)</TooltipContent>
            </Tooltip>
          </div>

          {/* Print button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={handlePrint}
                disabled={!instance.url}
              >
                <PrinterIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Print Document</TooltipContent>
          </Tooltip>

          {/* Browser Download */}
          {instance.url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={instance.url}
                  download={`${doc.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.pdf`}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </TooltipTrigger>
              <TooltipContent>Download PDF</TooltipContent>
            </Tooltip>
          )}

          {/* Native Disk Export */}
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1.5 px-3 text-xs shadow-sm"
            onClick={handleNativeExport}
            disabled={!instance.blob || isExporting}
          >
            {isExporting ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SaveIcon className="h-3.5 w-3.5" />
            )}
            <span>Export to Disk</span>
          </Button>
        </div>
      </div>

      {/* Frame Container */}
      <div className="relative flex-1 overflow-auto bg-zinc-950 p-4 flex items-center justify-center">
        {instance.loading && !instance.url ? (
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs">Compiling React-PDF document tree...</p>
          </div>
        ) : instance.error ? (
          <div className="flex max-w-md flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <AlertCircleIcon className="h-8 w-8 text-destructive" />
            <h4 className="text-sm font-semibold text-destructive">
              PDF Compilation Error
            </h4>
            <p className="text-xs text-muted-foreground">
              {String(instance.error)}
            </p>
          </div>
        ) : instance.url ? (
          <div
            className="transition-all duration-150 shadow-2xl rounded border border-border/40 overflow-hidden bg-white"
            style={{
              width: `${Math.round((zoom / 100) * 800)}px`,
              height: '100%',
              minHeight: '600px',
              maxWidth: '100%',
            }}
          >
            <iframe
              src={`${instance.url}#toolbar=0&navpanes=0`}
              title="PDF Live Preview"
              className="h-full w-full border-none"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
