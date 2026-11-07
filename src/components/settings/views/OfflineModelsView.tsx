/**
 * components/settings/views/OfflineModelsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → "Offline Models": search, download, and manage local AI models.
 *
 * Lets the user browse a curated catalog of Transformers.js-compatible models,
 * search by name or tag, filter by category, and download models for offline
 * inference. Each model shows its download status, progress, and size.
 *
 * Models are cached by Transformers.js automatically, so after the first
 * download they load instantly and work fully offline.
 *
 *   ┌─ Search & Filter ─────────────────────────────────────────────────────┐
 *   │  [Search models...]  [All ▼]  [Language] [Embedding] [Vision] [...]  │
 *   ├─ Model Cards ─────────────────────────────────────────────────────────┤
 *   │  ┌─ DistilGPT-2 ────────────────────────────────────────────────────┐ │
 *   │  │  Fast, compact GPT-2 variant                                     │ │
 *   │  │  ~260 MB  •  Language  •  ✓ Downloaded                           │ │
 *   │  │  [Set as default]                                                │ │
 *   │  └──────────────────────────────────────────────────────────────────┘ │
 *   │  ┌─ TinyLlama-1.1B ─────────────────────────────────────────────────┐ │
 *   │  │  Better quality, handles reasoning and code                      │ │
 *   │  │  ~630 MB  •  Language  •  Downloading 45%                        │ │
 *   │  │  ─███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
 *   │  │  [Cancel]                                                        │ │
 *   │  └──────────────────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BotIcon,
  CheckCircleIcon,
  DownloadIcon,
  EyeIcon,
  Loader2Icon,
  MicIcon,
  PackageIcon,
  SearchIcon,
  SparklesIcon,
  BoxesIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  OFFLINE_MODELS,
  searchModels,
  type ModelCategory,
  type OfflineModelInfo,
} from '@/lib/offline-ai/models';
import {
  transformersJS,
  doesBrowserSupportTransformersJS,
} from '@browser-ai/transformers-js';
import { generateText } from 'ai';
import { setupHfToken } from '@/lib/offline-ai/setup-hf-token';

const CATEGORIES: { id: ModelCategory | 'all'; label: string; icon: typeof BotIcon }[] = [
  { id: 'all', label: 'All', icon: PackageIcon },
  { id: 'language', label: 'Language', icon: BotIcon },
  { id: 'embedding', label: 'Embedding', icon: BoxesIcon },
  { id: 'vision', label: 'Vision', icon: EyeIcon },
  { id: 'transcription', label: 'Transcription', icon: MicIcon },
];

interface ModelDownloadState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  progress: number;
  error: string | null;
}

export function OfflineModelsView() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ModelCategory | 'all'>('all');
  const [downloads, setDownloads] = useState<Record<string, ModelDownloadState>>({});
  const [defaultModel, setDefaultModel] = useState('');

  const webgpuAvailable = doesBrowserSupportTransformersJS();
  const abortControllers = useRef<Record<string, AbortController>>({});
  const seeded = useRef(false);

  // Inject the HF access token into Transformers.js fetch requests.
  useEffect(() => {
    setupHfToken();
  }, []);

  // Load the default offline model and set initial download states from settings.
  // We use the downloadedOfflineModels list from settings instead of creating
  // transformersJS instances for every model, which would load the full
  // Transformers.js library in parallel and cause OOM errors.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    let cancelled = false;
    window.electron.ipc
      .invoke<Record<string, unknown>>('settings:get')
      .then((settings) => {
        if (cancelled) return;
        const model = (settings?.offlineModel as string) ?? '';
        if (model) setDefaultModel(model);

        // Build initial download states from the persisted list
        const downloaded = (settings?.downloadedOfflineModels as string[]) ?? [];
        const downloadedSet = new Set(downloaded);
        const initial: Record<string, ModelDownloadState> = {};
        for (const m of OFFLINE_MODELS) {
          initial[m.id] = downloadedSet.has(m.id)
            ? { status: 'ready', progress: 100, error: null }
            : { status: 'idle', progress: 0, error: null };
        }
        setDownloads(initial);
      })
      .catch(() => {
        // If settings are unavailable, default all models to idle
        if (!cancelled) {
          const initial: Record<string, ModelDownloadState> = {};
          for (const m of OFFLINE_MODELS) {
            initial[m.id] = { status: 'idle', progress: 0, error: null };
          }
          setDownloads(initial);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredModels = useMemo(
    () => searchModels(query || undefined, category !== 'all' ? category : undefined),
    [query, category],
  );

  const updateDownload = useCallback((modelId: string, patch: Partial<ModelDownloadState>) => {
    setDownloads((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], ...patch },
    }));
  }, []);

  const handleDownload = useCallback(async (model: OfflineModelInfo) => {
    const controller = new AbortController();
    abortControllers.current[model.id] = controller;

    updateDownload(model.id, { status: 'downloading', progress: 0, error: null });

    try {
      const tjModel = transformersJS(model.id, {
        device: webgpuAvailable ? 'webgpu' : 'wasm',
        initProgressCallback: (progressValue: number) => {
          if (controller.signal.aborted) return;
          updateDownload(model.id, { progress: Math.round(progressValue * 100) });
        },
      });

      // Trigger initialization with a minimal generation call to download the model
      await generateText({
        model: tjModel,
        prompt: '.',
        maxOutputTokens: 1,
        abortSignal: controller.signal,
      });

      if (!controller.signal.aborted) {
        updateDownload(model.id, { status: 'ready', progress: 100, error: null });
        // Persist the downloaded model id in settings so the main process
        // knows it is available for the offline provider model list.
        // Fetch the current list first and append the new model id.
        window.electron.ipc
          .invoke<Record<string, unknown>>('settings:get')
          .then((settings) => {
            const downloaded = (settings?.downloadedOfflineModels as string[]) ?? [];
            if (!downloaded.includes(model.id)) {
              return window.electron.ipc.invoke('settings:save', {
                downloadedOfflineModels: [...downloaded, model.id],
              });
            }
          })
          .catch(() => {});
        toast.success(`${model.name} downloaded and ready for offline use.`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      let message = err instanceof Error ? err.message : 'Download failed';

      // Provide a user-friendly message for memory allocation failures
      if (message.includes('Array buffer allocation failed') ||
          message.includes('Failed to allocate') ||
          message.includes('out of memory') ||
          message.toLowerCase().includes('oom')) {
        message = `Not enough memory to download ${model.name} (${model.size}). ${model.minRam ? `Requires at least ${model.minRam} RAM.` : 'Try closing other applications or selecting a smaller model.'}`;
      }

      updateDownload(model.id, { status: 'error', error: message });
      toast.error(`Failed to download ${model.name}: ${message}`);
    } finally {
      delete abortControllers.current[model.id];
    }
  }, [webgpuAvailable, updateDownload]);

  const handleCancel = useCallback((modelId: string) => {
    const controller = abortControllers.current[modelId];
    if (controller) {
      controller.abort();
    }
    updateDownload(modelId, { status: 'idle', progress: 0, error: null });
  }, [updateDownload]);

  const handleSetDefault = useCallback(async (modelId: string) => {
    try {
      await window.electron.ipc.invoke('settings:save', { offlineModel: modelId });
      setDefaultModel(modelId);
      const model = OFFLINE_MODELS.find((m) => m.id === modelId);
      toast.success(`${model?.name ?? modelId} set as default offline model.`);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleClearCache = useCallback(async (modelId: string) => {
    const model = OFFLINE_MODELS.find((m) => m.id === modelId);
    try {
      updateDownload(modelId, { status: 'idle', progress: 0, error: null });
      if (defaultModel === modelId) {
        setDefaultModel('');
        await window.electron.ipc.invoke('settings:save', { offlineModel: '' });
      }
      // Remove the model id from the downloaded list in settings
      window.electron.ipc
        .invoke<Record<string, unknown>>('settings:get')
        .then((settings) => {
          const downloaded = (settings?.downloadedOfflineModels as string[]) ?? [];
          const filtered = downloaded.filter((id) => id !== modelId);
          if (filtered.length !== downloaded.length) {
            return window.electron.ipc.invoke('settings:save', {
              downloadedOfflineModels: filtered,
            });
          }
        })
        .catch(() => {});
      toast.success(`${model?.name ?? modelId} cache cleared.`);
    } catch (err) {
      toast.error(`Failed to clear cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [defaultModel, updateDownload]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((c) => c.abort());
    };
  }, []);

  const totalDownloaded = OFFLINE_MODELS.filter(
    (m) => downloads[m.id]?.status === 'ready',
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SparklesIcon className="h-4 w-4" />
          <span>
            {totalDownloaded} of {OFFLINE_MODELS.length} models downloaded
          </span>
        </div>
        <div className="flex items-center gap-2">
          {webgpuAvailable ? (
            <Badge variant="default" className="text-xs">
              WebGPU
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              WASM (CPU)
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* ── Search & filter ────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as ModelCategory | 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  <cat.icon className="h-3.5 w-3.5" />
                  {cat.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Model cards ────────────────────────────────────────────────── */}
      {filteredModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
          <SearchIcon className="h-10 w-10" />
          <p className="text-sm">No models match your search.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredModels.map((model) => {
            const state = downloads[model.id] ?? { status: 'idle', progress: 0, error: null };
            const isDefault = defaultModel === model.id;
            const CategoryIcon = CATEGORIES.find((c) => c.id === model.category)?.icon ?? PackageIcon;

            return (
              <Card key={model.id} className={cn(isDefault && 'ring-2 ring-primary')}>
                <CardContent className="flex flex-col gap-3 p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <h3 className="text-sm font-medium">{model.name}</h3>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                      </div>
                    </div>
                    {isDefault && (
                      <Badge variant="default" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {model.size}
                    </Badge>
                    {model.minRam && (
                      <span className="flex items-center gap-1">
                        <PackageIcon className="h-3 w-3" />
                        {model.minRam} RAM
                      </span>
                    )}
                    {model.webgpuRecommended && (
                      <Badge variant="secondary" className="text-xs">
                        WebGPU recommended
                      </Badge>
                    )}
                  </div>

                  {/* Status & actions */}
                  <div className="flex items-center gap-2">
                    {state.status === 'ready' ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        Downloaded
                      </div>
                    ) : state.status === 'downloading' ? (
                      <div className="flex-1 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Downloading {state.progress}%…
                          </span>
                        </div>
                        <Progress value={state.progress} className="h-1.5" />
                      </div>
                    ) : state.status === 'error' ? (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <XCircleIcon className="h-3.5 w-3.5" />
                        {state.error ?? 'Error'}
                      </div>
                    ) : state.status === 'checking' ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                        Checking…
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {state.status === 'idle' || state.status === 'error' ? (
                      <Button size="sm" onClick={() => handleDownload(model)}>
                        <DownloadIcon className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                    ) : state.status === 'downloading' ? (
                      <Button size="sm" variant="outline" onClick={() => handleCancel(model.id)}>
                        <XCircleIcon className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    ) : null}

                    {state.status === 'ready' && (
                      <>
                        {!isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetDefault(model.id)}
                          >
                            Set default
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleClearCache(model.id)}
                          title="Clear cached model"
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Info note ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          Models are cached locally by Transformers.js and work fully offline after the first
          download. Cached models persist across app restarts. Total disk usage depends on which
          models you download.
        </p>
      </div>
    </div>
  );
}
