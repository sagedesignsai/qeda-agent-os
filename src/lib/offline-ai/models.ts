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
  /** Hugging Face model ID, e.g. "HuggingFaceTB/SmolLM2-360M-Instruct" */
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
  /** Whether the model has a chat template (required for @browser-ai/transformers-js chat) */
  hasChatTemplate?: boolean;
  /** Tags for search filtering */
  tags?: string[];
}

export const OFFLINE_MODELS: OfflineModelInfo[] = [
  // ── Language models (chat-tuned, with chat templates) ─────────────
  // Only instruction-tuned models work with @browser-ai/transformers-js
  // because it always calls apply_chat_template() on the tokenizer.
  {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    name: 'SmolLM2 360M Instruct',
    description: 'Small instruction-tuned model. Fast, good for chat, Q&A, and simple reasoning.',
    size: '~720 MB',
    sizeBytes: 720_000_000,
    category: 'language',
    minRam: '2 GB',
    hasChatTemplate: true,
    tags: ['text-generation', 'chat', 'instruct', 'small', 'fast'],
  },
  {
    id: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
    name: 'TinyLlama-1.1B Chat',
    description: 'Chat-tuned TinyLlama. Better quality than SmolLM2, handles reasoning and code.',
    size: '~630 MB',
    sizeBytes: 630_000_000,
    category: 'language',
    minRam: '4 GB',
    webgpuRecommended: true,
    hasChatTemplate: true,
    tags: ['text-generation', 'llama', 'chat', 'reasoning', 'code'],
  },
  {
    id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    name: 'SmolLM2 1.7B Instruct',
    description: 'Larger SmolLM2 variant with better reasoning and instruction following.',
    size: '~3.4 GB',
    sizeBytes: 3_400_000_000,
    category: 'language',
    minRam: '6 GB',
    webgpuRecommended: true,
    hasChatTemplate: true,
    tags: ['text-generation', 'chat', 'instruct', 'reasoning'],
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
    hasChatTemplate: true,
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
    hasChatTemplate: true,
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
