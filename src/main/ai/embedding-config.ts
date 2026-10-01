/**
 * ai/embedding-config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Which embedding model RAG should use, and whether its vectors fit the index.
 *
 * This module is deliberately pure — no `ai` SDK, no Electron, no database — so
 * that the interesting decisions are unit-testable. `tools/rag.ts` owns the SDK
 * calls; this owns the configuration and the width contract.
 *
 * Why a width contract at all: the sqlite-vec `vec0` table is created with a
 * FIXED width the first time the database is opened (`EMBEDDING_DIM`, default
 * 1536). Embedding models do not agree on width — Google's `gemini-embedding-001`
 * emits 3072 by default and only 1536 when explicitly asked. Writing a
 * wrong-width vector into that table is not a recoverable error, so the width
 * is checked before anything is written and reported as the configuration
 * mistake it is.
 *
 * Every entry in EMBEDDING_CONFIGS was confirmed against the live API. The
 * `dim: null` entries are models the vendor's catalogue still lists but whose
 * width was NOT measured here — they are offered, and the width check reports
 * the real number on first use rather than guessing it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EmbeddingConfig {
  /** Provider registry id (ai/registry.ts) that serves this model. */
  provider: string;
  /** Model id exactly as the provider spells it. */
  model: string;
  /** Verified output width, or null when unmeasured. */
  dim: number | null;
  /**
   * True when the endpoint honours an explicit width and will emit `dim`
   * vectors when asked. This is what lets a model match an existing index
   * without a rebuild.
   */
  requestDim: boolean;
  note: string;
  docsUrl: string;
}

/** Curated embedding models, best-supported first. */
export const EMBEDDING_CONFIGS: EmbeddingConfig[] = [
  {
    provider: 'gemini',
    model: 'gemini-embedding-001',
    dim: 1536,
    requestDim: true,
    note: 'Returns 3072 by default but emits exactly 1536 when asked, which matches the default index width — no rebuild needed.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/embeddings',
  },
  {
    provider: 'nvidia',
    model: 'nvidia/llama-3.2-nv-embedqa-1b-v1',
    dim: null,
    requestDim: false,
    note: 'Listed in the NIM catalogue. Width not measured here — reported on first use.',
    docsUrl: 'https://build.nvidia.com',
  },
  {
    provider: 'nvidia',
    model: 'nvidia/nv-embedqa-mistral-7b-v2',
    dim: null,
    requestDim: false,
    note: 'Listed in the NIM catalogue. Width not measured here — reported on first use.',
    docsUrl: 'https://build.nvidia.com',
  },
  {
    provider: 'nvidia',
    model: 'snowflake/arctic-embed-l',
    dim: null,
    requestDim: false,
    note: 'Listed in the NIM catalogue. Width not measured here — reported on first use.',
    docsUrl: 'https://build.nvidia.com',
  },
];

export type EmbeddingConfigSource = 'settings' | 'environment' | 'auto';

export interface ResolvedEmbeddingConfig {
  provider: string;
  model: string;
  source: EmbeddingConfigSource;
  /** The curated entry, when this exact pair is one we know about. */
  curated?: EmbeddingConfig;
}

/** Thrown when embeddings are not configured, and nothing keyed can serve them. */
export class EmbeddingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingNotConfiguredError';
  }
}

/** Thrown when the model's vectors do not fit the existing index width. */
export class EmbeddingWidthError extends Error {
  readonly actual: number;
  readonly tableDim: number;

  constructor(args: {
    provider: string;
    model: string;
    actual: number;
    tableDim: number;
  }) {
    // Offer a concrete way out when we know of a model that fits the index.
    const fit = EMBEDDING_CONFIGS.find(
      (c) => c.dim === args.tableDim && c.requestDim,
    );
    const reindex = `set EMBEDDING_DIM=${args.actual} and re-index (delete vellum.db, then re-run the index tools)`;
    super(
      `Embedding width mismatch: ${args.provider}/${args.model} produced ` +
        `${args.actual}-dimension vectors, but the local index is ` +
        `${args.tableDim} wide (EMBEDDING_DIM). Vectors of different widths ` +
        `cannot be compared and the index cannot be resized. Fix it by ` +
        (fit
          ? `switching to ${fit.provider}/${fit.model}, which emits ` +
            `${fit.dim} dimensions, or by ` +
            reindex
          : reindex) +
        '.',
    );
    this.name = 'EmbeddingWidthError';
    this.actual = args.actual;
    this.tableDim = args.tableDim;
  }
}

export interface ResolveEmbeddingArgs {
  settingsProvider?: string;
  settingsModel?: string;
  envProvider?: string;
  envModel?: string;
  /** True when the provider registry has a usable key for this provider id. */
  hasKey: (providerId: string) => boolean;
}

/**
 * Decide which embedding model to use.
 *
 * Precedence is Settings → environment → first curated model whose provider is
 * keyed. That last step is the point: the app already ships five RAG tools that
 * cannot run at all without this, and the user has almost always keyed a
 * provider that serves embeddings, so making them name the model by hand should
 * not be a requirement.
 */
export function resolveEmbeddingConfig(
  args: ResolveEmbeddingArgs,
): ResolvedEmbeddingConfig {
  const pick = (
    provider: string,
    model: string,
    source: EmbeddingConfigSource,
  ): ResolvedEmbeddingConfig => {
    const match = EMBEDDING_CONFIGS.find(
      (c) => c.provider === provider && c.model === model,
    );
    return {
      provider,
      model,
      source,
      ...(match ? { curated: match } : {}),
    };
  };

  if (args.settingsProvider?.trim() && args.settingsModel?.trim()) {
    return pick(
      args.settingsProvider.trim(),
      args.settingsModel.trim(),
      'settings',
    );
  }
  if (args.envProvider?.trim() && args.envModel?.trim()) {
    return pick(args.envProvider.trim(), args.envModel.trim(), 'environment');
  }

  // Auto-select only a model whose width we measured, so a first run cannot
  // pick something on a guess and then fail the width check immediately.
  const auto = EMBEDDING_CONFIGS.find(
    (c) => c.dim !== null && args.hasKey(c.provider),
  );
  if (auto) return pick(auto.provider, auto.model, 'auto');

  const keyed = EMBEDDING_CONFIGS.filter((c) => args.hasKey(c.provider));
  const options =
    keyed.length > 0
      ? keyed.map((c) => `${c.provider}/${c.model}`).join(', ')
      : 'none of the known embedding providers are keyed';

  throw new EmbeddingNotConfiguredError(
    'RAG embeddings are not configured. Set EMBEDDING_PROVIDER and ' +
      'EMBEDDING_MODEL, or pick a model in Settings → Embeddings. ' +
      `Keyed candidates: ${options}.`,
  );
}

/**
 * Provider options that pin the request to the index width.
 *
 * Only models that advertise `requestDim` get this. Sending `dimensions` to an
 * endpoint that ignores it is harmless, but sending it to one that rejects
 * unknown body keys is not, and an uncurated model is better measured than
 * assumed. Returns undefined in both of those cases.
 */
export function embeddingProviderOptions(
  resolved: ResolvedEmbeddingConfig,
  tableDim: number,
): Record<string, Record<string, number>> | undefined {
  if (!resolved.curated?.requestDim) return undefined;
  return { [resolved.provider]: { dimensions: tableDim } };
}

/**
 * Reject vectors that do not fit the index before they reach sqlite-vec.
 *
 * Call this on the first embedding of every operation. It is deliberately
 * loud: the alternative is an index that only fails much later, during a query,
 * with no clue why.
 */
export function assertEmbeddingWidth(args: {
  provider: string;
  model: string;
  actual: number;
  tableDim: number;
}): void {
  if (args.actual === args.tableDim) return;
  throw new EmbeddingWidthError(args);
}

/** Curated models whose provider is keyed, for the Settings UI. */
export function availableEmbeddingConfigs(
  hasKey: (providerId: string) => boolean,
): EmbeddingConfig[] {
  return EMBEDDING_CONFIGS.filter((c) => hasKey(c.provider));
}
