/**
 * components/settings/views/EmbeddingsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → "Embeddings": the RAG vector index configuration.
 *
 * These two fields (`embeddingProvider`, `embeddingModel`) have existed in
 * AppSettings for a while and are read by tools/rag.ts, but nothing ever wrote
 * them from the UI — so the only way to configure RAG was editing .env.local,
 * which a packaged install does not have. This section closes that gap.
 *
 * It is deliberately separate from "AI & Models" because the two are configured
 * independently and for a real reason: most free chat tiers (Groq,
 * OpenRouter's free models) serve no embeddings endpoint at all, so inheriting
 * the active chat provider would fail confusingly at query time.
 *
 * The vector width (EMBEDDING_DIM) is intentionally NOT editable here. It is
 * read once, from the environment, when the database is first opened
 * (db/client.ts), and the sqlite-vec `vec0` table is created with that fixed
 * width. Offering a field that cannot take effect would be worse than saying
 * so, hence the note below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircleIcon, InfoIcon, WandIcon } from 'lucide-react';
import type { ProviderInfo } from '../../../main/ipc/channels';
// Pure data + rules (no `ai`, no Electron), so the renderer can import it
// directly rather than round-tripping over IPC for a static list.
import { availableEmbeddingConfigs } from '../../../main/ai/embedding-config';
import { useSettingsStore } from '../settings-store';

export function EmbeddingsView() {
  const { snapshot, saving, save } = useSettingsStore();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');

  const seeded = useRef(false);
  useEffect(() => {
    if (!snapshot || seeded.current) return;
    seeded.current = true;
    setProvider(snapshot.embeddingProvider);
    setModel(snapshot.embeddingModel);
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    window.electron.ipc
      .invoke<ProviderInfo[]>('providers:list')
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  // An empty stored value means "not configured here" — the env var wins.
  const usingEnv = !snapshot?.embeddingProvider && !snapshot?.embeddingModel;

  /**
   * Curated models whose provider the user has already keyed.
   *
   * This is the part that makes the feature usable: without a hint, the only
   * way to find out which model ids exist is to read the provider's docs, and
   * the previous suggestion shipped in .env.example pointed at a model that
   * had been retired.
   */
  const suggestions = useMemo(
    () =>
      availableEmbeddingConfigs((id) =>
        providers.some((p) => p.id === id && p.apiKeySet),
      ),
    [providers],
  );

  const clearOverride = () => {
    setProvider('');
    setModel('');
  };

  const handleSave = async () => {
    try {
      // Send both fields as trimmed strings; an empty string clears the stored
      // override so the environment takes over again. `settings:save` merges
      // this over the existing settings, so nothing else is disturbed.
      await save({
        embeddingProvider: provider.trim(),
        embeddingModel: model.trim(),
      });
      toast.success('Embedding settings saved.');
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  if (!snapshot) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Embeddings provider</Label>
          {usingEnv && (
            <Badge variant="secondary" className="gap-1 text-xs">
              From environment
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The endpoint that turns documents into vectors for local search. Must
          be an OpenAI-compatible <code className="font-mono">/embeddings</code>{' '}
          route, and it is{' '}
          <span className="font-medium text-foreground">not</span> the same
          thing as your chat model.
        </p>
      </div>

      <div className="space-y-2">
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger id="embedding-provider-select">
            <SelectValue placeholder="Choose a provider…" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  {p.name}
                  {p.apiKeySet && (
                    <CheckCircleIcon className="size-3 text-green-500" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Leave empty to fall back to{' '}
          <code className="font-mono">EMBEDDING_PROVIDER</code>.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="embedding-model">Embedding model</Label>
        <Input
          id="embedding-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. text-embedding-3-small"
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to fall back to{' '}
          <code className="font-mono">EMBEDDING_MODEL</code>. Model lists are
          not fetched for embeddings, so type the id exactly as the provider
          spells it.
        </p>
      </div>

      <Separator />

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Recommended for your keys</Label>
            {!usingEnv && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearOverride}
              >
                Use automatic selection
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave both fields empty and the app uses the best of these by
            itself. Each one is checked against this machine&apos;s index width
            before anything is written.
          </p>
          <div className="space-y-2">
            {suggestions.map((config) => {
              const selected =
                provider === config.provider && model === config.model;
              return (
                <button
                  key={`${config.provider}/${config.model}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setProvider(config.provider);
                    setModel(config.model);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? 'border-primary bg-muted'
                      : 'border-border/60 bg-muted/40 hover:bg-muted'
                  }`}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      {config.model}
                      {config.requestDim && (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[10px]"
                        >
                          <WandIcon className="size-3" /> fits any index
                        </Badge>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {config.note}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {config.dim ? `${config.dim} dims` : 'width checked'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Separator />

      <div className="flex gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">
            Vector width is fixed at first launch
          </p>
          <p>
            The index is created with{' '}
            <code className="font-mono">EMBEDDING_DIM</code> (default{' '}
            <code className="font-mono">1536</code>) the first time the database
            is opened. Changing the dimension later requires deleting{' '}
            <code className="font-mono">vellum.db</code> and re-indexing your
            documents, so it is not editable here. A mismatched width is
            reported as a configuration error rather than failing at query time.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
