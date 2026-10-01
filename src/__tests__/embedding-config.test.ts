/**
 * __tests__/embedding-config.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The RAG embedding configuration rules: which model gets picked, and the
 * width contract that keeps a wrong-width vector out of a fixed-width index.
 *
 * This module is deliberately free of the `ai` SDK and of Electron, which is
 * what makes it testable at all: `tools/rag.ts` cannot be imported here because
 * the `ai` package is ESM-only and unmocked in jest.config.js, so every
 * decision worth testing has to live in this layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  EMBEDDING_CONFIGS,
  EmbeddingNotConfiguredError,
  EmbeddingWidthError,
  assertEmbeddingWidth,
  availableEmbeddingConfigs,
  embeddingProviderOptions,
  resolveEmbeddingConfig,
} from '../main/ai/embedding-config';

const keyed =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id);

describe('resolveEmbeddingConfig', () => {
  it('prefers the Settings pair over everything else', () => {
    const resolved = resolveEmbeddingConfig({
      settingsProvider: 'gemini',
      settingsModel: 'gemini-embedding-001',
      envProvider: 'nvidia',
      envModel: 'nvidia/llama-3.2-nv-embedqa-1b-v1',
      hasKey: keyed('gemini', 'nvidia'),
    });

    expect(resolved).toMatchObject({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      source: 'settings',
    });
  });

  it('falls back to the environment when Settings is empty', () => {
    const resolved = resolveEmbeddingConfig({
      settingsProvider: '   ',
      envProvider: 'nvidia',
      envModel: 'snowflake/arctic-embed-l',
      hasKey: keyed('nvidia'),
    });

    expect(resolved.source).toBe('environment');
    expect(resolved.model).toBe('snowflake/arctic-embed-l');
  });

  it('auto-picks the measured model when a known provider is keyed', () => {
    // This is the path that revives the RAG tools: the user has a Gemini key
    // and has never been told to name an embedding model.
    const resolved = resolveEmbeddingConfig({ hasKey: keyed('gemini') });

    expect(resolved).toMatchObject({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      source: 'auto',
    });
  });

  it('never auto-picks a model whose width is unmeasured', () => {
    // NVIDIA is keyed but its curated entries have dim: null, so auto-selection
    // must not guess — otherwise the first index would fail the width check.
    expect(() => resolveEmbeddingConfig({ hasKey: keyed('nvidia') })).toThrow(
      EmbeddingNotConfiguredError,
    );
  });

  it('names the keyed candidates when nothing can be auto-selected', () => {
    expect(() => resolveEmbeddingConfig({ hasKey: keyed('nvidia') })).toThrow(
      /nvidia\/llama-3\.2-nv-embedqa-1b-v1/,
    );
  });

  it('explains itself when no embedding provider is keyed at all', () => {
    expect(() => resolveEmbeddingConfig({ hasKey: keyed() })).toThrow(
      /none of the known embedding providers are keyed/,
    );
  });

  it('attaches the curated entry when the pair is a known one', () => {
    const resolved = resolveEmbeddingConfig({
      settingsProvider: 'gemini',
      settingsModel: 'gemini-embedding-001',
      hasKey: keyed('gemini'),
    });
    expect(resolved.curated?.requestDim).toBe(true);
  });
});

describe('embeddingProviderOptions', () => {
  it('pins the width for a model that honours an explicit width', () => {
    const options = embeddingProviderOptions(
      {
        provider: 'gemini',
        model: 'gemini-embedding-001',
        source: 'auto',
        curated: EMBEDDING_CONFIGS[0],
      },
      1536,
    );
    expect(options).toEqual({ gemini: { dimensions: 1536 } });
  });

  it('sends nothing for an unmeasured model, so it is measured instead', () => {
    const unmeasured = EMBEDDING_CONFIGS.find((c) => c.dim === null)!;
    const options = embeddingProviderOptions(
      {
        provider: unmeasured.provider,
        model: unmeasured.model,
        source: 'settings',
      },
      1536,
    );
    expect(options).toBeUndefined();
  });

  it('sends nothing for a model we know nothing about', () => {
    const options = embeddingProviderOptions(
      {
        provider: 'gemini',
        model: 'text-embedding-3-small',
        source: 'settings',
      },
      1536,
    );
    expect(options).toBeUndefined();
  });
});

describe('assertEmbeddingWidth', () => {
  it('passes a vector that matches the index', () => {
    expect(() =>
      assertEmbeddingWidth({
        provider: 'gemini',
        model: 'gemini-embedding-001',
        actual: 1536,
        tableDim: 1536,
      }),
    ).not.toThrow();
  });

  it('rejects a mismatched vector and reports both numbers', () => {
    const args = {
      provider: 'gemini',
      model: 'gemini-embedding-001',
      actual: 3072,
      tableDim: 1536,
    };

    expect(() => assertEmbeddingWidth(args)).toThrow(EmbeddingWidthError);

    // Assert on the error directly rather than inside a catch, so a failure
    // cannot be silently skipped.
    const width = new EmbeddingWidthError(args);
    expect(width.actual).toBe(3072);
    expect(width.tableDim).toBe(1536);
    // It must name a way out, not merely complain.
    expect(width.message).toMatch(/gemini-embedding-001/);
    expect(width.message).toMatch(/3072/);
    expect(width.message).toMatch(/EMBEDDING_DIM=3072/);
  });

  it('falls back to the re-index instruction when nothing fits', () => {
    const err = new EmbeddingWidthError({
      provider: 'unknown',
      model: 'mystery-model',
      actual: 999,
      tableDim: 128,
    });
    expect(err.message).toMatch(/EMBEDDING_DIM=999/);
    expect(err.message).toMatch(/re-index/);
  });
});

describe('availableEmbeddingConfigs', () => {
  it('lists only models whose provider is keyed', () => {
    const available = availableEmbeddingConfigs(keyed('nvidia'));
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((c) => c.provider === 'nvidia')).toBe(true);
    expect(available.map((c) => c.model)).not.toContain('gemini-embedding-001');
  });

  it('is empty when nothing is keyed', () => {
    expect(availableEmbeddingConfigs(keyed())).toEqual([]);
  });
});
