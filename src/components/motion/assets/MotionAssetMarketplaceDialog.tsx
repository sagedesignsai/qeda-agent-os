/**
 * components/motion/assets/MotionAssetMarketplaceDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Browse and import 3D models into the current Motion bundle. Two sources:
 * — "Local Library": pre-installed GLB models shipped with the app (offline).
 * — "Catalog": public assets from Poly Haven or Sketchfab (downloaded once, then offline).
 *
 * The dialog is a list + preview split: selecting a row frames the model in a
 * live viewport (bundled models) or shows the provider's card (catalog hits,
 * whose bytes do not exist locally until the import runs).
 *
 * Mounted only while open so a closed dialog never queries the provider.
 */

import { BoxIcon, CheckIcon, DownloadIcon, FolderOpenIcon, SearchIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMotionLocalLibrary } from '@/hooks/use-motion-local-library';
import { useMotionRemoteAssets } from '@/hooks/use-motion-remote-assets';
import { localModelMediaUrl } from '@/lib/motion/local-library';
import type {
  MotionLocalModelEntry,
  MotionRemoteAssetHit,
  MotionRemoteAssetKind,
  MotionRemoteProviderId,
} from '@/main/ipc/channels';

type LocalLibraryState = ReturnType<typeof useMotionLocalLibrary>;
type MarketplaceState = ReturnType<typeof useMotionRemoteAssets>;

// The viewport pulls in three/drei; loading it with the dialog keeps the editor
// bundle free of the 3D stack until someone actually previews a model.
const MotionModelPreview = lazy(() =>
  import('@/components/motion/assets/MotionModelPreview.js').then((module) => ({
    default: module.MotionModelPreview,
  })),
);

export function MotionAssetMarketplaceDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'local' | 'catalog'>('local');
  // The local library is offline; the catalog is only queried once its tab is open.
  const marketplace = useMotionRemoteAssets(projectId, { searchEnabled: tab === 'catalog' });
  const localLibrary = useMotionLocalLibrary(projectId);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedHitId, setSelectedHitId] = useState<string | null>(null);

  // A first result is preselected so the preview pane is never blank on entry.
  useEffect(() => {
    if (!selectedLocalId && localLibrary.models.length) setSelectedLocalId(localLibrary.models[0].id);
  }, [localLibrary.models, selectedLocalId]);

  useEffect(() => {
    if (!selectedHitId && marketplace.hits.length) setSelectedHitId(marketplace.hits[0].id);
  }, [marketplace.hits, selectedHitId]);

  const selectedLocal = localLibrary.models.find((model) => model.id === selectedLocalId) ?? null;
  const selectedHit = marketplace.hits.find((hit) => hit.id === selectedHitId) ?? null;
  const errors = tab === 'local' ? localLibrary.importErrors : marketplace.importErrors;

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
      <DialogContent className="flex h-[min(80vh,760px)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b border-border/60 px-5 py-4">
          <div>
            <DialogTitle className="text-sm">Asset library</DialogTitle>
            <DialogDescription className="text-xs">
              {tab === 'local'
                ? 'Pre-installed 3D models — preview, then import directly into this project.'
                : 'Download a model once — it is stored inside this project and works offline afterwards.'}
            </DialogDescription>
          </div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as 'local' | 'catalog')} className="flex gap-3">
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

        <div className="flex min-h-0 flex-1">
          <section className="flex min-h-0 w-[45%] min-w-[320px] shrink-0 flex-col border-r border-border/60">
            {tab === 'local' ? (
              <LocalLibraryPanel
                library={localLibrary}
                selectedId={selectedLocalId}
                onSelect={setSelectedLocalId}
              />
            ) : (
              <CatalogPanel
                marketplace={marketplace}
                selectedId={selectedHitId}
                onSelect={setSelectedHitId}
              />
            )}
          </section>

          <aside className="flex min-h-0 flex-1 flex-col bg-black/10">
            {tab === 'local' ? (
              <LocalPreview model={selectedLocal} library={localLibrary} />
            ) : (
              <CatalogPreview hit={selectedHit} marketplace={marketplace} />
            )}
          </aside>
        </div>

        {errors.length > 0 && (
          <div role="alert" className="border-t border-destructive/30 px-5 py-2 text-xs text-destructive">
            {errors.map((error) => (
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
            {tab === 'local'
              ? 'Offline · bundled with the app'
              : marketplace.provider === 'sketchfab'
                ? 'Creative Commons · downloaded once, then bundled locally'
                : 'CC0 · downloaded once, then bundled locally'}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/* ── Local library ──────────────────────────────────────────────────────────── */

function LocalLibraryPanel({
  library,
  selectedId,
  onSelect,
}: {
  library: LocalLibraryState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
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
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Loading library…
        </div>
      ) : library.models.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
          {library.totalCount === 0 ? 'No pre-installed models were found.' : 'No models match this search.'}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border/50">
            {library.models.map((model) => (
              <LocalModelRow
                key={model.id}
                model={model}
                selected={model.id === selectedId}
                onSelect={() => onSelect(model.id)}
                library={library}
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
  selected,
  onSelect,
  library,
}: {
  model: MotionLocalModelEntry;
  selected: boolean;
  onSelect: () => void;
  library: LocalLibraryState;
}) {
  return (
    <li className={selected ? 'bg-muted/60' : undefined}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/50 text-muted-foreground">
            <BoxIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{model.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {describeLocalModel(model)}
            </span>
          </span>
        </button>
        <div className="shrink-0">
          <LocalImportControl library={library} model={model} />
        </div>
      </div>
    </li>
  );
}

function LocalImportControl({
  library,
  model,
  large = false,
}: {
  library: LocalLibraryState;
  model: MotionLocalModelEntry;
  large?: boolean;
}) {
  if (library.importing.has(model.id)) {
    return (
      <span className="flex w-24 items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <Spinner /> Importing…
      </span>
    );
  }
  if (library.imported.has(model.id)) {
    return (
      <span className="flex w-24 items-center justify-end gap-1 text-[11px] text-muted-foreground">
        <CheckIcon data-icon className="size-3.5" /> Imported
      </span>
    );
  }
  return (
    <Button
      type="button"
      size={large ? 'default' : 'sm'}
      variant="outline"
      className={large ? 'gap-1.5' : 'h-7 gap-1.5'}
      onClick={() => void library.importModel(model)}
    >
      <DownloadIcon data-icon="inline-start" />
      Import
    </Button>
  );
}

function LocalPreview({
  model,
  library,
}: {
  model: MotionLocalModelEntry | null;
  library: LocalLibraryState;
}) {
  if (!model) {
    return <PreviewEmpty message="Select a model to preview it here." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_30%,#212a3b,#0a0d14_72%)]">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading preview…
            </div>
          }
        >
          <MotionModelPreview url={localModelMediaUrl(model.id)} label={model.name} />
        </Suspense>
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] text-white/35">
          Drag to orbit · scroll to zoom
        </p>
      </div>

      <div className="shrink-0 border-t border-border/60 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{model.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{describeLocalModel(model)}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {formatBytes(model.byteSize)}
          </Badge>
        </div>

        {model.animationNames.length > 0 && (
          <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
            Clips: {model.animationNames.join(', ')}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">Bundled with the app · works offline</p>
          <LocalImportControl library={library} model={model} large />
        </div>
      </div>
    </div>
  );
}

/* ── Catalog ────────────────────────────────────────────────────────────────── */

function CatalogPanel({
  marketplace,
  selectedId,
  onSelect,
}: {
  marketplace: MarketplaceState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="shrink-0 space-y-2 border-b border-border/40 px-4 py-3">
        <div className="relative">
          <SearchIcon
            data-icon
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={marketplace.query}
            onChange={(event) => marketplace.setQuery(event.target.value)}
            placeholder="Search models…"
            className="h-8 pl-8 text-xs"
            aria-label="Search the asset catalog"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={marketplace.provider}
            onValueChange={(value) => {
              marketplace.setProvider(value as MotionRemoteProviderId);
              marketplace.setKind('model');
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="polyhaven" className="text-xs">Poly Haven</TabsTrigger>
              <TabsTrigger value="sketchfab" className="text-xs">Sketchfab</TabsTrigger>
            </TabsList>
          </Tabs>
          {marketplace.provider === 'polyhaven' && (
            <Tabs
              value={marketplace.kind}
              onValueChange={(value) => marketplace.setKind(value as MotionRemoteAssetKind)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="model" className="text-xs">Models</TabsTrigger>
                <TabsTrigger value="environment" className="text-xs">Environments</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {marketplace.searchError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-xs text-muted-foreground">{marketplace.searchError}</p>
          <Button type="button" size="sm" variant="outline" onClick={marketplace.retrySearch}>
            Try again
          </Button>
        </div>
      ) : marketplace.isSearching && !marketplace.hits.length ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Searching…
        </div>
      ) : !marketplace.hits.length ? (
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
          No assets match this search.
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border/50">
            {marketplace.hits.map((hit) => (
              <CatalogResultRow
                key={hit.id}
                hit={hit}
                marketplace={marketplace}
                selected={hit.id === selectedId}
                onSelect={() => onSelect(hit.id)}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </>
  );
}

function CatalogResultRow({
  hit,
  marketplace,
  selected,
  onSelect,
}: {
  hit: MotionRemoteAssetHit;
  marketplace: MarketplaceState;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className={selected ? 'bg-muted/60' : undefined}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <AssetThumbnail hit={hit} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{hit.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {hit.creator ?? 'Unknown creator'}
              {hit.popularity ? ` · ${hit.popularity.toLocaleString()} downloads` : ''}
            </span>
            {marketplace.variantErrors[hit.id] && (
              <span className="block truncate text-[11px] text-destructive">
                {marketplace.variantErrors[hit.id]}
              </span>
            )}
          </span>
        </button>
        <div className="shrink-0">
          <CatalogImportControl marketplace={marketplace} hit={hit} />
        </div>
      </div>
    </li>
  );
}

function CatalogPreview({
  hit,
  marketplace,
}: {
  hit: MotionRemoteAssetHit | null;
  marketplace: MarketplaceState;
}) {
  if (!hit) {
    return <PreviewEmpty message="Select a catalog asset to see its details." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_30%,#212a3b,#0a0d14_72%)]">
        {hit.thumbnailUrl ? (
          <img
            src={hit.thumbnailUrl}
            alt=""
            className="h-full w-full object-contain p-4"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <BoxIcon className="size-10" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{hit.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {hit.creator ?? 'Unknown creator'}
              {hit.popularity ? ` · ${hit.popularity.toLocaleString()} downloads` : ''}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {hit.license.replace('-1.0', '')}
          </Badge>
        </div>

        {hit.description && (
          <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
            {hit.description}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {hit.kind === 'environment' ? 'HDRI environment' : '3D model'} · downloaded once, then bundled
          </p>
          <CatalogImportControl marketplace={marketplace} hit={hit} large />
        </div>
      </div>
    </div>
  );
}

function CatalogImportControl({
  marketplace,
  hit,
  large = false,
}: {
  marketplace: MarketplaceState;
  hit: MotionRemoteAssetHit;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const variants = marketplace.variants[hit.id];
  const variantError = marketplace.variantErrors[hit.id];
  const progress = marketplace.progress[hit.id];

  if (marketplace.importing.has(hit.id)) {
    const percent = progress?.totalBytes
      ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
      : null;
    return (
      <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {percent === null ? formatBytes(progress?.receivedBytes ?? 0) : `${percent}%`}
      </span>
    );
  }
  if (marketplace.imported.has(hit.id)) {
    return (
      <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] text-muted-foreground">
        <CheckIcon data-icon className="size-3.5" /> Imported
      </span>
    );
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !variants) void marketplace.loadVariants(hit);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={large ? 'default' : 'sm'}
          variant="outline"
          className={large ? 'gap-1.5' : 'h-7 shrink-0 gap-1.5'}
        >
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
              onSelect={() => void marketplace.importAsset(hit, variant.id)}
            >
              <span className="flex-1">{variant.label}</span>
              {variant.byteSize ? (
                <span className="text-[10px] text-muted-foreground">{formatBytes(variant.byteSize)}</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Shared pieces ──────────────────────────────────────────────────────────── */

function AssetThumbnail({ hit }: { hit: MotionRemoteAssetHit }) {
  return (
    <span className="size-10 shrink-0 overflow-hidden rounded border border-border/60 bg-muted">
      {hit.thumbnailUrl ? (
        <img src={hit.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

function PreviewEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function describeLocalModel(model: MotionLocalModelEntry): string {
  const details: string[] = [model.source];
  if (model.hasAnimations) {
    details.push(`${model.animationCount} anim${model.animationCount > 1 ? 'ations' : 'ation'}`);
  }
  if (model.hasSkin) details.push(`${model.boneCount} bones`);
  if (model.materialCount > 0) {
    details.push(`${model.materialCount} mat${model.materialCount > 1 ? 's' : ''}`);
  }
  if (model.nodeCount > 0) details.push(`${model.nodeCount} nodes`);
  return details.join(' · ');
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
