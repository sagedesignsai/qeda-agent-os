/**
 * lib/offline-ai/models.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated catalog of Transformers.js-compatible models for offline inference.
 *
 * Each entry describes a Hugging Face model that can run in the browser via
 * Transformers.js with WebGPU or WASM. Models are organized by category and
 * include metadata for display in the settings UI.
 *
 * The catalog is intentionally small — these are models that actually work
 * well in-browser with reasonable download sizes and inference speed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ModelCategory = 'language' | 'embedding' | 'vision' | 'transcription';

export interface OfflineModelInfo {
  /** Hugging Face model ID, e.g. "Xenova/distilgpt2" */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Short description of capabilities */
  description: string;
  /** Approximate download size */
  size: string;
  /** Size in bytes for sorting/filtering */
  sizeBytes: number;
  /** Model category */
  category: ModelCategory;
  /** Recommended minimum hardware */
  minRam?: string;
  /** Whether WebGPU is recommended (vs optional) */
  webgpuRecommended?: boolean;
  /** Tags for search filtering */
  tags?: string[];
}

export const OFFLINE_MODELS: OfflineModelInfo[] = [
  // ── Language models ───────────────────────────────────────────────
  {
    id: 'Xenova/distilgpt2',
    name: 'DistilGPT-2',
    description: 'Fast, compact GPT-2 variant. Good for simple text generation, summarization, and Q&A.',
    size: '~260 MB',
    sizeBytes: 260_000_000,
    category: 'language',
    minRam: '2 GB',
    tags: ['text-generation', 'gpt', 'fast', 'small'],
  },
  {
    id: 'Xenova/tinyllama-1.1b',
    name: 'TinyLlama-1.1B',
    description: 'Better quality than GPT-2. Trained on 3T tokens, handles reasoning and code better.',
    size: '~630 MB',
    sizeBytes: 630_000_000,
    category: 'language',
    minRam: '4 GB',
    webgpuRecommended: true,
    tags: ['text-generation', 'llama', 'reasoning', 'code'],
  },
  {
    id: 'onnx-community/gpt2-ONNX',
    name: 'GPT-2',
    description: 'Classic GPT-2 model. Balanced quality and speed for general text generation.',
    size: '~500 MB',
    sizeBytes: 500_000_000,
    category: 'language',
    minRam: '3 GB',
    tags: ['text-generation', 'gpt', 'classic'],
  },
  {
    id: 'Xenova/phind-codellama-34b',
    name: 'Phind CodeLLama (quantized)',
    description: 'Code-focused model, INT4 quantized for browser use. Excellent for code generation and explanation.',
    size: '~2.0 GB',
    sizeBytes: 2_000_000_000,
    category: 'language',
    minRam: '8 GB',
    webgpuRecommended: true,
    tags: ['text-generation', 'code', 'quantized', 'large'],
  },
  {
    id: 'Xenova/Qwen2.5-Coder-Instruct-32B',
    name: 'Qwen2.5 Coder (quantized)',
    description: 'Modern code model with strong instruction following. INT4 quantized for browser inference.',
    size: '~19 GB',
    sizeBytes: 19_000_000_000,
    category: 'language',
    minRam: '32 GB',
    webgpuRecommended: true,
    tags: ['text-generation', 'code', 'quantized', 'large', 'qwen'],
  },

  // ── Embedding models ──────────────────────────────────────────────
  {
    id: 'Xenova/gte-small',
    name: 'GTE Small',
    description: 'Lightweight text embeddings for semantic search and RAG. Fast and memory-efficient.',
    size: '~90 MB',
    sizeBytes: 90_000_000,
    category: 'embedding',
    minRam: '1 GB',
    tags: ['embeddings', 'semantic-search', 'rag', 'small'],
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM L6',
    description: 'Very fast sentence embeddings. Good for document similarity and clustering.',
    size: '~90 MB',
    sizeBytes: 90_000_000,
    category: 'embedding',
    minRam: '1 GB',
    tags: ['embeddings', 'sentence', 'fast', 'small'],
  },

  // ── Vision models ─────────────────────────────────────────────────
  {
    id: 'Xenova/smollvm2-1.7b',
    name: 'SmolVLM2 1.7B',
    description: 'Vision-language model for image understanding and description. Can analyze screenshots and diagrams.',
    size: '~3.3 GB',
    sizeBytes: 3_300_000_000,
    category: 'vision',
    minRam: '8 GB',
    webgpuRecommended: true,
    tags: ['vision', 'image', 'multimodal', 'large'],
  },

  // ── Transcription models ──────────────────────────────────────────
  {
    id: 'Xenova/whisper-tiny',
    name: 'Whisper Tiny',
    description: 'Ultra-compact speech-to-text model. Fast transcription with decent accuracy.',
    size: '~75 MB',
    sizeBytes: 75_000_000,
    category: 'transcription',
    minRam: '1 GB',
    tags: ['speech', 'transcription', 'whisper', 'small'],
  },
  {
    id: 'Xenova/whisper-base',
    name: 'Whisper Base',
    description: 'Balanced speech-to-text model. Better accuracy than tiny with modest size increase.',
    size: '~140 MB',
    sizeBytes: 140_000_000,
    category: 'transcription',
    minRam: '2 GB',
    tags: ['speech', 'transcription', 'whisper'],
  },
];

/**
 * Filter models by search query and/or category.
 */
export function searchModels(
  query?: string,
  category?: ModelCategory,
): OfflineModelInfo[] {
  let results = OFFLINE_MODELS;

  if (category) {
    results = results.filter((m) => m.category === category);
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter((m) => {
      const searchable = [
        m.id,
        m.name,
        m.description,
        ...(m.tags ?? []),
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    });
  }

  return results;
}

/**
 * Get models grouped by category.
 */
export function getModelsByCategory(): Record<ModelCategory, OfflineModelInfo[]> {
  const grouped: Record<ModelCategory, OfflineModelInfo[]> = {
    language: [],
    embedding: [],
    vision: [],
    transcription: [],
  };

  for (const model of OFFLINE_MODELS) {
    grouped[model.category].push(model);
  }

  return grouped;
}
