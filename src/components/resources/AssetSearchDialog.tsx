/**
 * components/resources/AssetSearchDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for searching and downloading web assets via Serper:
 *   - Transparent PNGs (mockups, logos, cutouts)
 *   - SVG vectors & icons
 *   - High-res photos (JPG/WEBP)
 *
 * Supports checkerboard previews for transparency and context-aware downloading
 * to workspace project assets or Studio video take directories.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SearchIcon,
  DownloadIcon,
  Loader2Icon,
  CheckIcon,
  ExternalLinkIcon,
  SparklesIcon,
  ImageIcon,
  LayersIcon,
  FileCodeIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  SerperImage,
  ImageFormatFilter,
  DownloadResourceResult,
} from '@/main/ipc/channels';

interface AssetSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  studioTakeId?: string | null;
  initialQuery?: string;
  initialFormat?: ImageFormatFilter;
  onAssetDownloaded?: (result: DownloadResourceResult) => void;
}

const FORMAT_FILTERS: Array<{
  id: ImageFormatFilter;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'all', label: 'All Images', icon: <ImageIcon className="size-3.5" /> },
  {
    id: 'png',
    label: 'PNG / Transparent',
    icon: <LayersIcon className="size-3.5" />,
  },
  {
    id: 'svg',
    label: 'SVG / Vector',
    icon: <FileCodeIcon className="size-3.5" />,
  },
  { id: 'jpg', label: 'Photos / JPG', icon: <ImageIcon className="size-3.5" /> },
];

export function AssetSearchDialog({
  open,
  onOpenChange,
  projectId,
  studioTakeId,
  initialQuery = '',
  initialFormat = 'all',
  onAssetDownloaded,
}: AssetSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [formatFilter, setFormatFilter] =
    useState<ImageFormatFilter>(initialFormat);
  const [images, setImages] = useState<SerperImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SerperImage | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [downloadedUrls, setDownloadedUrls] = useState<Set<string>>(new Set());

  // Search execution
  const executeSearch = useCallback(
    async (q: string, format: ImageFormatFilter) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setIsSearching(true);
      setSelectedImage(null);
      try {
        const res = await window.electron.ipc.invoke<{
          success: boolean;
          total: number;
          images: SerperImage[];
          error?: string;
        }>('serper:search-images', {
          query: trimmed,
          formatFilter: format,
          count: 20,
        });

        if (res.success) {
          setImages(res.images);
          if (res.images.length === 0) {
            toast.info('No image results found for this query');
          }
        } else {
          toast.error(res.error || 'Failed to search images via Serper');
        }
      } catch (err) {
        toast.error(
          `Search error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  // Auto-search when opened with query
  useEffect(() => {
    if (open && initialQuery && images.length === 0) {
      setQuery(initialQuery);
      executeSearch(initialQuery, formatFilter);
    }
  }, [open, initialQuery, executeSearch, formatFilter, images.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, formatFilter);
  };

  const handleFormatChange = (fmt: ImageFormatFilter) => {
    setFormatFilter(fmt);
    if (query.trim()) {
      executeSearch(query, fmt);
    }
  };

  // Download action
  const handleDownload = async (img: SerperImage) => {
    setDownloadingUrl(img.imageUrl);
    try {
      const res = await window.electron.ipc.invoke<DownloadResourceResult>(
        'serper:download-asset',
        {
          url: img.imageUrl,
          projectId: projectId ?? undefined,
          studioTakeId: studioTakeId ?? undefined,
        },
      );

      if (res.success) {
        setDownloadedUrls((prev) => new Set(prev).add(img.imageUrl));
        toast.success(`Downloaded ${res.fileName || 'asset'}`);
        if (onAssetDownloaded) {
          onAssetDownloaded(res);
        }
      } else {
        toast.error(res.error || 'Failed to download asset');
      }
    } catch (err) {
      toast.error(
        `Download error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDownloadingUrl(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-w-4xl h-[85vh] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border border-border shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <SparklesIcon className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Web Resource Search & Download
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Search Google Images via Serper for mockups, transparent PNGs,
                  SVGs, and illustrations
                </DialogDescription>
              </div>
            </div>
            {projectId && (
              <Badge variant="outline" className="text-xs font-mono">
                Project Assets
              </Badge>
            )}
            {studioTakeId && (
              <Badge variant="secondary" className="text-xs font-mono">
                Studio Media Bin
              </Badge>
            )}
          </div>

          {/* Search bar + filter chips */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search images (e.g. "Tshirt mockup png", "Q Logo SVG", "cyberpunk icon")...'
                className="pl-9 pr-24 h-10 text-sm bg-muted/40 focus-visible:ring-primary/40"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!query.trim() || isSearching}
                className="absolute right-1.5 h-7 px-3 text-xs"
              >
                {isSearching ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
              {FORMAT_FILTERS.map((f) => {
                const isActive = formatFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFormatChange(f.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {f.icon}
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </form>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2Icon className="size-8 animate-spin text-primary" />
              <p className="text-sm">Fetching images from Serper...</p>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-center text-muted-foreground">
              <ImageIcon className="size-10 stroke-[1.2] opacity-40 mb-1" />
              <p className="text-sm font-medium text-foreground/80">
                No images to display
              </p>
              <p className="text-xs max-w-sm">
                Try searching for transparent PNGs, SVG logos, or project
                mockups above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {images.map((img, idx) => {
                const isSelected = selectedImage?.imageUrl === img.imageUrl;
                const isDownloading = downloadingUrl === img.imageUrl;
                const isDownloaded = downloadedUrls.has(img.imageUrl);

                return (
                  <div
                    key={`${img.imageUrl}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedImage(img)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedImage(img);
                      }
                    }}
                    className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30 shadow-md'
                        : 'border-border/60 hover:border-border hover:shadow-sm'
                    }`}
                  >
                    {/* Checkerboard thumbnail container for transparency */}
                    <div
                      className="relative w-full aspect-square overflow-hidden bg-neutral-900/90"
                      style={{
                        backgroundImage: `linear-gradient(45deg, #1f1f23 25%, transparent 25%), linear-gradient(-45deg, #1f1f23 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f23 75%), linear-gradient(-45deg, transparent 75%, #1f1f23 75%)`,
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                      }}
                    >
                      <img
                        src={img.imageUrl}
                        alt={img.title}
                        loading="lazy"
                        className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          // Fallback to thumbnailUrl if full imageUrl fails to load preview
                          if (
                            img.thumbnailUrl &&
                            e.currentTarget.src !== img.thumbnailUrl
                          ) {
                            e.currentTarget.src = img.thumbnailUrl;
                          }
                        }}
                      />

                      {/* Dimension badge */}
                      {img.width && img.height && (
                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[10px] font-mono text-white/90">
                          {img.width}×{img.height}
                        </div>
                      )}

                      {/* Download quick action overlay */}
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-7 rounded-lg shadow-md bg-background/90 hover:bg-background"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(img);
                          }}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : isDownloaded ? (
                            <CheckIcon className="size-3.5 text-emerald-500" />
                          ) : (
                            <DownloadIcon className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Metadata footer */}
                    <div className="p-2.5 bg-card/60 flex flex-col gap-1 border-t border-border/40">
                      <p
                        className="text-xs font-medium text-foreground truncate"
                        title={img.title}
                      >
                        {img.title || 'Untitled Image'}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate max-w-[120px]">
                          {img.domain}
                        </span>
                        <a
                          href={img.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary inline-flex items-center gap-0.5"
                          title="Open source page"
                        >
                          <ExternalLinkIcon className="size-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Drawer / Selected Asset Details */}
        {selectedImage && (
          <div className="px-6 py-3 border-t border-border/60 bg-muted/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="size-10 rounded-md overflow-hidden bg-neutral-900 border border-border/80 flex-shrink-0 flex items-center justify-center">
                <img
                  src={selectedImage.thumbnailUrl || selectedImage.imageUrl}
                  alt={selectedImage.title}
                  className="w-full h-full object-contain p-0.5"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate text-foreground">
                  {selectedImage.title}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {selectedImage.domain}
                  {selectedImage.width && selectedImage.height
                    ? ` • ${selectedImage.width}×${selectedImage.height}px`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="default"
                className="gap-1.5 h-8 text-xs font-medium"
                onClick={() => handleDownload(selectedImage)}
                disabled={downloadingUrl === selectedImage.imageUrl}
              >
                {downloadingUrl === selectedImage.imageUrl ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : downloadedUrls.has(selectedImage.imageUrl) ? (
                  <>
                    <CheckIcon className="size-3.5 text-emerald-400" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <DownloadIcon className="size-3.5" />
                    Download to Project
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
