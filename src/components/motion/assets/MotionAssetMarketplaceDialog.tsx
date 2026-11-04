/**
 * components/motion/assets/MotionAssetMarketplaceDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Browse and import 3D models into the current Motion bundle. Two sources:
 * — "Local Library": pre-installed GLB models shipped with the app (offline).
 * — "Catalog": public assets from Poly Haven (downloaded once, then offline).
 *
 * Mounted only while open so a closed dialog never queries the provider.
 */

import { BoxIcon, CheckIcon, DownloadIcon, FolderOpenIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMotionLocalLibrary } from '@/hooks/use-motion-local-library';
import { useMotionRemoteAssets } from '@/hooks/use-motion-remote-assets';
import type {
  MotionLocalModelEntry,
  MotionRemoteAssetHit,
  MotionRemoteAssetKind,
  MotionRemoteVariant,
} from '@/main/ipc/channels';

export function MotionAssetMarketplaceDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const marketplace = useMotionRemoteAssets(projectId);
  const localLibrary = useMotionLocalLibrary(projectId);
  const [openResult, setOpenResult] = useState<string | null>(null);
  const [tab, setTab] = useState<'local' | 'catalog'>('local');

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          marketplace.cancelImports();
          onClose();
        }
      }}
    >
      <DialogContent className="flex h-[min(72vh,640px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b border-border/60 px-5 py-4">
          <div>
            <DialogTitle className="text-sm">Asset library</DialogTitle>
            <DialogDescription className="text-xs">
              {tab === 'local'
                ? 'Pre-installed 3D models — import directly into this project.'
                : 'Download a model once — it is stored inside this project and works offline afterwards.'}
            </DialogDescription>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'local' | 'catalog')} className="flex gap-3">
            <TabsList className="h-8 gap-0.5">
              <TabsTrigger value="local" className="text-xs">
                <FolderOpenIcon data-icon className="mr-1 size-3" />
                Local Library
              </TabsTrigger>
              <TabsTrigger value="catalog" className="text-xs">
                <DownloadIcon data-icon className="mr-1 size-3" />
                Catalog
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'local' | 'catalog')} className="flex h-full flex-col">
            {/* ── Local Library tab ── */}
            <TabsContent value="local" forceMount className="min-h-0 flex-1" hidden={tab !== 'local'}>
              <LocalLibraryPanel library={localLibrary} />
            </TabsContent>

            {/* ── Catalog tab ── */}
            <TabsContent value="catalog" forceMount className="min-h-0 flex-1" hidden={tab !== 'catalog'}>
              <CatalogPanel
                marketplace={marketplace}
                openResult={openResult}
                setOpenResult={setOpenResult}
              />
            </TabsContent>
          </Tabs>
        </div>

        {tab === 'local' && localLibrary.importErrors.length > 0 && (
          <div role="alert" className="border-t border-destructive/30 px-5 py-2 text-xs text-destructive">
            {localLibrary.importErrors.map((error) => (
              <p key={`${error.name}-${error.code}`} className="truncate">
                {error.name}: {error.message}
              </p>
            ))}
          </div>
        )}
        {tab === 'catalog' && marketplace.importErrors.length > 0 && (
          <div role="alert" className="border-t border-destructive/30 px-5 py-2 text-xs text-destructive">
            {marketplace.importErrors.map((error) => (
              <p key={`${error.name}-${error.code}`} className="truncate">
                {error.name}: {error.message}
              </p>
            ))}
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-2 text-[11px] text-muted-foreground">
          <span>
            {tab === 'local'
              ? `${localLibrary.totalCount} pre-installed models`
              : marketplace.total > 0
                ? `${marketplace.total.toLocaleString()} assets`
                : 'Search the catalog'}
            {tab === 'catalog' && marketplace.providerCredit ? ` · ${marketplace.providerCredit}` : ''}
          </span>
          <span className="hidden sm:inline">
            {tab === 'local' ? 'Offline · bundled with the app' : 'CC0 · downloaded once, then bundled locally'}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function LocalLibraryPanel({ library }: { library: ReturnType<typeof useMotionLocalLibrary> }) {
  return (
    <>
      <div className="border-b border-border/40 px-5 py-3">
        <div className="relative">
          <SearchIcon
            data-icon
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={library.query}
            onChange={(event) => library.setQuery(event.target.value)}
            placeholder="Search local models…"
            className="h-8 pl-8 text-xs"
            aria-label="Search local models"
          />
        </div>
      </div>

      {library.loading ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Loading library…
        </div>
      ) : library.models.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
          No models match this search.
        </div>
      ) : (
        <ScrollArea className="h-full">
          <ul className="divide-y divide-border/50">
            {library.models.map((model) => (
              <LocalModelRow
                key={model.id}
                model={model}
                imported={library.imported.has(model.id)}
                importing={library.importing.has(model.id)}
                onImport={() => void library.importModel(model)}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </>
  );
}

function LocalModelRow({
  model,
  imported,
  importing,
  onImport,
}: {
  model: MotionLocalModelEntry;
  imported: boolean;
  importing: boolean;
  onImport: () => void;
}) {
  const details: string[] = [model.source];
  if (model.hasAnimations) details.push(`${model.animationCount} anim${model.animationCount > 1 ? 'ations' : 'ation'}`);
  if (model.hasSkin) details.push(`${model.boneCount} bones`);
  if (model.materialCount > 0) details.push(`${model.materialCount} mat${model.materialCount > 1 ? 's' : ''}`);
  if (model.nodeCount > 0) details.push(`${model.nodeCount} nodes`);

  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/50 text-muted-foreground">
        <BoxIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{model.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {details.join(' · ')}
        </p>
      </div>

      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
        {formatBytes(model.byteSize)}
      </Badge>

      {importing ? (
        <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
          Importing…
        </span>
      ) : imported ? (
        <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <CheckIcon data-icon className="size-3.5" /> Imported
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5"
          onClick={onImport}
        >
          <DownloadIcon data-icon="inline-start" />
          Import
        </Button>
      )}
    </li>
  );
}

function CatalogPanel({
  marketplace,
  openResult,
  setOpenResult,
}: {
  marketplace: ReturnType<typeof useMotionRemoteAssets>;
  openResult: string | null;
  setOpenResult: (id: string | null) => void;
}) {
  return (
    <>
      <div className="border-b border-border/40 px-5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              data-icon
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={marketplace.query}
              onChange={(event) => marketplace.setQuery(event.target.value)}
              placeholder="Search models and environments…"
              className="h-8 pl-8 text-xs"
              aria-label="Search the asset catalog"
            />
          </div>
          <Tabs
            value={marketplace.kind}
            onValueChange={(value) => marketplace.setKind(value as MotionRemoteAssetKind)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="model" className="text-xs">Models</TabsTrigger>
              <TabsTrigger value="environment" className="text-xs">Environments</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {marketplace.searchError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-xs text-muted-foreground">{marketplace.searchError}</p>
          <Button type="button" size="sm" variant="outline" onClick={marketplace.retrySearch}>
            Try again
          </Button>
        </div>
      ) : marketplace.isSearching && !marketplace.hits.length ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Searching…
        </div>
      ) : !marketplace.hits.length ? (
        <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
          No assets match this search.
        </div>
      ) : (
        <ScrollArea className="h-full">
          <ul className="divide-y divide-border/50">
            {marketplace.hits.map((hit) => (
              <ResultRow
                key={hit.id}
                hit={hit}
                variants={marketplace.variants[hit.id]}
                variantError={marketplace.variantErrors[hit.id]}
                imported={marketplace.imported.has(hit.id)}
                importing={marketplace.importing.has(hit.id)}
                progress={marketplace.progress[hit.id]}
                onLoadVariants={() => marketplace.loadVariants(hit)}
                onImport={(variantId) => marketplace.importAsset(hit, variantId)}
                open={openResult === hit.id}
                onOpenChange={(next) => setOpenResult(next ? hit.id : null)}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </>
  );
}

function ResultRow({
  hit,
  variants,
  variantError,
  imported,
  importing,
  progress,
  onLoadVariants,
  onImport,
  open,
  onOpenChange,
}: {
  hit: MotionRemoteAssetHit;
  variants?: MotionRemoteVariant[];
  variantError?: string;
  imported: boolean;
  importing: boolean;
  progress?: { receivedBytes: number; totalBytes?: number };
  onLoadVariants: () => Promise<MotionRemoteVariant[]>;
  onImport: (variantId: string) => Promise<boolean>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const percent = progress?.totalBytes
    ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
    : null;

  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <div className="size-12 shrink-0 overflow-hidden rounded border border-border/60 bg-muted">
        {hit.thumbnailUrl ? (
          <img
            src={hit.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{hit.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {hit.creator ?? 'Unknown creator'}
          {hit.popularity ? ` · ${hit.popularity.toLocaleString()} downloads` : ''}
        </p>
        {variantError && (
          <p className="truncate text-[11px] text-destructive">{variantError}</p>
        )}
      </div>

      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
        {hit.license.replace('-1.0', '')}
      </Badge>

      {importing ? (
        <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {percent === null ? formatBytes(progress?.receivedBytes ?? 0) : `${percent}%`}
        </span>
      ) : imported ? (
        <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <CheckIcon data-icon className="size-3.5" /> Imported
        </span>
      ) : (
        <DropdownMenu
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            if (next && !variants) void onLoadVariants();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1.5">
              <DownloadIcon data-icon="inline-start" />
              Import
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Choose a download
            </DropdownMenuLabel>
            {!variants?.length ? (
              <DropdownMenuItem disabled className="text-xs">
                {variantError ? 'Unavailable' : 'Loading variants…'}
              </DropdownMenuItem>
            ) : (
              variants.map((variant) => (
                <DropdownMenuItem
                  key={variant.id}
                  className="text-xs"
                  onSelect={() => void onImport(variant.id)}
                >
                  <span className="flex-1">{variant.label}</span>
                  {variant.byteSize ? (
                    <span className="text-[10px] text-muted-foreground">
                      {formatBytes(variant.byteSize)}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
