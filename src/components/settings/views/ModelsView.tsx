/**
 * components/settings/views/ModelsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → "AI & Models": provider, model, fallback policy, and every API key
 * the app can hold. Ported verbatim from the former single-purpose Settings
 * dialog, which this section replaces.
 *
 * Two invariants carried over from that implementation, both of which are easy
 * to lose in a refactor:
 *
 * 1. An empty key input means "leave the stored key alone", not "clear it". The
 *    payload therefore only includes keys the user actually typed, so an
 *    already-encrypted key survives a save of an unrelated field. (The main
 *    process does support clearing via an explicit empty string; the UI simply
 *    never sends one.)
 * 2. The dialog only ever learns *whether* a key exists and where it came from
 *    (environment vs. encrypted store) — never the value. `settings:get`
 *    sanitises on the main side; nothing here may ask for a plaintext key.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  KeyIcon,
  CheckCircleIcon,
  LoaderIcon,
  RefreshCwIcon,
  GiftIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ProviderInfo, ServiceStatus } from '../../../main/ipc/channels';
import { useSettingsStore } from '../settings-store';

/** Editable draft of a user-defined OpenAI-compatible provider. */
interface CustomProviderDraft {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  hasKey: boolean;
}

/** Display order + labels for the service categories. */
const SERVICE_CATEGORIES: { id: ServiceStatus['category']; label: string }[] = [
  { id: 'search', label: 'Web search' },
  { id: 'scrape', label: 'Scraping' },
  { id: 'docs', label: 'Documentation' },
  { id: 'images', label: 'Images' },
  { id: 'speech', label: 'Speech' },
  { id: 'sandbox', label: 'Sandbox' },
];

export function ModelsView() {
  const { snapshot, saving, save } = useSettingsStore();

  const [activeProvider, setActiveProvider] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [serviceKeys, setServiceKeys] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [apiKeySources, setApiKeySources] = useState<
    Record<string, 'settings' | 'environment'>
  >({});
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProviderDraft[]>(
    [],
  );
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | undefined>();
  const [loadingModels, setLoadingModels] = useState(false);

  // Seed the editable fields once, when the snapshot first arrives. Seeding is
  // deliberately one-shot: re-running it would discard a value the user is
  // currently editing.
  const seeded = useRef(false);
  useEffect(() => {
    if (!snapshot || seeded.current) return;
    seeded.current = true;
    setActiveProvider(snapshot.activeProvider);
    setActiveModel(snapshot.activeModel);
    setFallbackEnabled(snapshot.fallbackEnabled);
  }, [snapshot]);

  const loadProviders = useCallback(async () => {
    try {
      const list =
        await window.electron.ipc.invoke<ProviderInfo[]>('providers:list');
      // Transformers.js runs in the renderer and is selected separately in
      // Offline Models; it is not a provider for main-process agents.
      const selectableProviders = list.filter(
        (provider) => provider.id !== 'offline',
      );
      setProviders(selectableProviders);
      setCustomProviders(
        selectableProviders
          .filter((provider) => provider.custom)
          .map((provider) => ({
            id: provider.id,
            name: provider.name,
            baseURL: provider.baseURL ?? '',
            apiKey: '',
            hasKey: provider.apiKeySet,
          })),
      );
      setApiKeySources(
        Object.fromEntries(
          selectableProviders
            .filter((provider) => !provider.custom)
            .map((provider) => [provider.id, provider.apiKeyPreference]),
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProviders();

    window.electron.ipc
      .invoke<ServiceStatus[]>('services:list')
      .then((list) => {
        if (!cancelled) setServices(list);
        return list;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [loadProviders]);

  const current = providers.find((p) => p.id === activeProvider);

  const loadModels = useCallback(async (providerId: string) => {
    if (!providerId) return;
    setLoadingModels(true);
    setModelsError(undefined);
    try {
      // Offline provider uses a dedicated IPC channel since it has no /models endpoint
      if (providerId === 'offline') {
        const modelIds = await window.electron.ipc.invoke<string[]>(
          'offline-models:list',
        );
        setModels(modelIds ?? []);
        if (modelIds.length === 0) {
          setModelsError(
            'No offline models downloaded. Download models in Settings → Offline Models first.',
          );
        }
        return;
      }
      const result = await window.electron.ipc.invoke<{
        models: string[];
        error?: string;
      }>('providers:models', { providerId });
      setModels(result.models ?? []);
      setModelsError(result.error);
    } catch (err) {
      setModels([]);
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // Owns model loading for the active provider. `handleProviderChange` only
  // changes the id and lets this effect do the fetch, so switching providers
  // never issues two `providers:models` calls for the same provider.
  useEffect(() => {
    if (seeded.current && activeProvider) void loadModels(activeProvider);
  }, [activeProvider, loadModels]);

  const handleProviderChange = (providerId: string) => {
    setActiveProvider(providerId);
    setModels([]);
    setModelsError(undefined);
    const suggested =
      providers.find((p) => p.id === providerId)?.freeModels ?? [];
    setActiveModel(suggested[0] ?? '');
  };

  const addCustomProvider = () => {
    setCustomProviders((previous) => [
      ...previous,
      {
        id: `custom-${Date.now().toString(36)}`,
        name: '',
        baseURL: '',
        apiKey: '',
        hasKey: false,
      },
    ]);
  };

  const updateCustomProvider = (
    id: string,
    patch: Partial<Omit<CustomProviderDraft, 'id'>>,
  ) => {
    setCustomProviders((previous) =>
      previous.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider,
      ),
    );
  };

  const removeCustomProvider = (id: string) => {
    setCustomProviders((previous) =>
      previous.filter((provider) => provider.id !== id),
    );
  };

  const handleSave = async () => {
    if (!activeModel.trim()) {
      toast.error('Pick or type a model id first.');
      return;
    }

    try {
      const providerSettings: Record<
        string,
        { apiKey?: string; apiKeySource?: 'settings' | 'environment' }
      > = {};
      for (const provider of providers) {
        // Custom providers carry their key in `customProviders`, not the
        // built-in providers map.
        if (provider.custom) continue;
        providerSettings[provider.id] = {
          apiKeySource: apiKeySources[provider.id] ?? 'environment',
        };
      }
      for (const [id, key] of Object.entries(apiKeys)) {
        if (key.trim()) {
          providerSettings[id] = {
            ...providerSettings[id],
            apiKey: key.trim(),
          };
        }
      }

      const serviceKeyPayload: Record<string, string> = {};
      for (const [id, value] of Object.entries(serviceKeys)) {
        if (value.trim()) serviceKeyPayload[id] = value.trim();
      }

      // Entries the user removed are simply absent from this list; the main
      // process treats it as the full set. An empty key field keeps the stored
      // cipher (see settings:save) instead of clearing it.
      const customProviderPayload = customProviders
        .filter((provider) => provider.name.trim() && provider.baseURL.trim())
        .map((provider) => ({
          id: provider.id,
          name: provider.name.trim(),
          baseURL: provider.baseURL.trim(),
          ...(provider.apiKey.trim() ? { apiKey: provider.apiKey.trim() } : {}),
        }));

      await save({
        activeProvider,
        activeModel: activeModel.trim(),
        fallbackEnabled,
        providers: providerSettings,
        customProviders: customProviderPayload,
        // When the offline provider is selected, also persist the model id
        // so the renderer-side chat hook knows which Transformers.js model to use.
        ...(activeProvider === 'offline'
          ? { offlineModel: activeModel.trim() }
          : {}),
        ...(Object.keys(serviceKeyPayload).length
          ? { serviceKeys: serviceKeyPayload }
          : {}),
      });

      // The stored keys are encrypted and never returned, so drop the plaintext
      // inputs rather than leaving a secret sitting in component state.
      setApiKeys({});
      setServiceKeys({});
      // Re-read so a newly added provider appears in the selector immediately.
      await loadProviders();

      toast.success(
        'Saved. The agent uses the new model on your next message.',
      );
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  if (!snapshot) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Provider selector */}
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={activeProvider} onValueChange={handleProviderChange}>
          <SelectTrigger id="provider-select">
            <SelectValue placeholder="Choose a provider…" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                <span className="flex items-center gap-2">
                  {provider.name}
                  {provider.apiKeySet && (
                    <CheckCircleIcon className="size-3 text-green-500" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {current?.note && (
          <p className="text-xs text-muted-foreground">{current.note}</p>
        )}
        {current && !current.apiKeySet && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            No key found for this provider — add one below or set its
            environment variable.
          </p>
        )}
      </div>

      {/* Model selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Model</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            disabled={!activeProvider || loadingModels}
            onClick={() => void loadModels(activeProvider)}
          >
            {loadingModels ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
            <span>Reload</span>
          </Button>
        </div>

        {activeProvider === 'offline' && models.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No offline models downloaded yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Go to Settings → Offline Models to download a model first.
            </p>
          </div>
        ) : (
          <>
            <Select value={activeModel} onValueChange={setActiveModel}>
              <SelectTrigger id="model-select">
                <SelectValue placeholder="Choose a model…" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model} value={model}>
                    <span className="flex items-center gap-2">
                      {model}
                      {activeProvider === 'offline' && (
                        <Badge variant="secondary" className="text-xs">
                          Offline
                        </Badge>
                      )}
                      {(model.endsWith(':free') ||
                        current?.freeModels.includes(model)) && (
                        <GiftIcon className="size-3 text-green-500" />
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              id="model-input"
              value={activeModel}
              onChange={(e) => setActiveModel(e.target.value)}
              placeholder="Or type a custom model ID…"
              className="text-sm"
            />
          </>
        )}

        {modelsError && (
          <p className="text-xs text-muted-foreground">
            Live model list unavailable ({modelsError}) — showing curated
            suggestions.
          </p>
        )}
      </div>

      <Separator />

      {/* Fallback */}
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label htmlFor="fallback-toggle" className="text-sm">
            Automatic provider fallback
          </Label>
          <p className="text-xs text-muted-foreground">
            If this provider is rate limited or unavailable, retry the turn on
            the next configured provider before showing an error.
          </p>
        </div>
        <Switch
          id="fallback-toggle"
          checked={fallbackEnabled}
          onCheckedChange={setFallbackEnabled}
        />
      </div>

      <Separator />

      {/* Custom providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Custom providers</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={addCustomProvider}
          >
            <PlusIcon className="size-3" />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Any OpenAI-compatible endpoint. Custom providers appear in the
          provider list and can be used for chat and embeddings.
        </p>

        {customProviders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No custom providers configured.
          </p>
        ) : (
          customProviders.map((provider) => (
            <div
              key={provider.id}
              className="space-y-1.5 rounded-md border border-border/60 p-2.5"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={provider.name}
                  placeholder="Display name"
                  className="text-sm"
                  onChange={(e) =>
                    updateCustomProvider(provider.id, { name: e.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Remove ${provider.name || 'custom provider'}`}
                  onClick={() => removeCustomProvider(provider.id)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
              <Input
                value={provider.baseURL}
                placeholder="https://api.example.com/v1"
                className="text-sm"
                onChange={(e) =>
                  updateCustomProvider(provider.id, { baseURL: e.target.value })
                }
              />
              <div className="relative">
                <KeyIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-8 text-sm"
                  placeholder={
                    provider.hasKey ? '••••••••••••••••' : 'API key (optional)'
                  }
                  value={provider.apiKey}
                  onChange={(e) =>
                    updateCustomProvider(provider.id, {
                      apiKey: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* External services */}
      <div className="space-y-3">
        <Label>External services</Label>
        <p className="text-xs text-muted-foreground">
          Power web search, scraping, docs lookup, images and speech. Keys are
          encrypted on disk; environment variables are used automatically.
        </p>

        {SERVICE_CATEGORIES.map((category) => {
          const list = services.filter(
            (service) => service.category === category.id,
          );
          if (list.length === 0) return null;
          return (
            <div key={category.id} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {category.label}
              </div>
              {list.map((service) => (
                <div key={service.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`svc-${service.id}`}
                      className="text-sm font-normal"
                    >
                      {service.name}
                    </Label>
                    {service.configured && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <CheckCircleIcon className="size-3 text-green-500" />
                        {service.source === 'environment'
                          ? 'From environment'
                          : 'Saved'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {service.note}
                  </p>
                  <div className="relative">
                    <KeyIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      id={`svc-${service.id}`}
                      type="password"
                      className="pl-8 text-sm"
                      placeholder={
                        service.configured
                          ? '••••••••••••••••'
                          : `Enter ${service.name} API key…`
                      }
                      value={serviceKeys[service.id] ?? ''}
                      onChange={(e) =>
                        setServiceKeys((prev) => ({
                          ...prev,
                          [service.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Provider API keys */}
      <div className="space-y-3">
        <Label>API Keys</Label>
        <p className="text-xs text-muted-foreground">
          Keys are encrypted with OS-level storage and never stored in
          plaintext. Keys already present in your environment are used
          automatically.
        </p>

        {providers
          .filter((provider) => !provider.custom)
          .map((provider) => (
            <div key={provider.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor={`key-${provider.id}`}
                  className="text-sm font-normal"
                >
                  {provider.name}
                </Label>
                {provider.apiKeySet && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <CheckCircleIcon className="size-3 text-green-500" />
                    {provider.apiKeySource === 'environment'
                      ? 'From environment'
                      : 'Saved'}
                  </Badge>
                )}
              </div>
              {provider.apiKeyEnvs.length > 0 && (
                <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2">
                  <div className="grid gap-0.5">
                    <Label
                      htmlFor={`key-source-${provider.id}`}
                      className="text-xs font-normal"
                    >
                      Use environment variable
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {provider.apiKeyEnvs.join(' / ')}
                    </p>
                  </div>
                  <Switch
                    id={`key-source-${provider.id}`}
                    checked={
                      (apiKeySources[provider.id] ??
                        provider.apiKeyPreference) === 'environment'
                    }
                    onCheckedChange={(useEnvironment) =>
                      setApiKeySources((previous) => ({
                        ...previous,
                        [provider.id]: useEnvironment
                          ? 'environment'
                          : 'settings',
                      }))
                    }
                    aria-label={`Use environment variable for ${provider.name}`}
                  />
                </div>
              )}
              <div className="relative">
                <KeyIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  id={`key-${provider.id}`}
                  type="password"
                  className="pl-8 text-sm"
                  placeholder={
                    provider.apiKeySet
                      ? '••••••••••••••••'
                      : `Enter ${provider.name} API key…`
                  }
                  value={apiKeys[provider.id] ?? ''}
                  disabled={
                    (apiKeySources[provider.id] ??
                      provider.apiKeyPreference) === 'environment'
                  }
                  onChange={(e) =>
                    setApiKeys((prev) => ({
                      ...prev,
                      [provider.id]: e.target.value,
                    }))
                  }
                />
              </div>
              {(apiKeySources[provider.id] ?? provider.apiKeyPreference) ===
                'environment' &&
                provider.apiKeyEnvs.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    The saved key is retained but ignored while environment mode
                    is on.
                  </p>
                )}
            </div>
          ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
