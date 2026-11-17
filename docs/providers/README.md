# AI Providers Documentation

This directory contains comprehensive guides for each AI provider integrated with Qeda.

## Providers

### [Ollama - Local Models](./OLLAMA.md)

Complete guide to using Ollama for local, private AI inference without network access or API keys.

- Quick setup and installation
- Dynamic model discovery and fallback chain integration
- Settings panel UI for model management
- Connection testing and troubleshooting

**Quick Start:**
```bash
ollama serve
ollama pull qwen3.5:0.8b
# Select "Ollama (local, no key)" in Settings → AI & Models
```

---

## Provider Architecture

All providers in Qeda follow a standardized architecture:

### Provider Registry

Located in `src/main/ai/registry.ts`:
- Provider metadata (name, base URL, API key environment variables)
- Free/curated model suggestions
- User-friendly descriptions

### Model Resolution

Located in `src/main/ai/provider.ts`:
- `resolveModel()` - Returns a LanguageModel for chat
- `resolveEmbeddingModel()` - Returns an EmbeddingModel for RAG
- `listProviderModels()` - Lists available models (dynamic lookup)
- `resolveModelChain()` - Builds fallback provider chain

### Fallback Chain

Located in `src/main/ai/fallback.ts`:
- `buildModelChain()` - Determines fallback order
- Error classification (retryable vs. permanent)
- Provider health scoring

### IPC Layer

Located in `src/main/ipc/`:
- `channels.ts` - Type-safe IPC channel contracts
- `handlers/` - Handler implementations per provider
- Settings, model listing, connection testing

## Adding a New Provider

To add support for a new AI provider:

1. **Add to Registry** (`src/main/ai/registry.ts`)
   ```typescript
   {
     id: 'newprovider',
     name: 'New Provider (description)',
     baseURL: 'https://api.newprovider.com/v1',
     apiKeyEnvs: ['NEWPROVIDER_API_KEY'],
     freeModels: ['model-1', 'model-2'],
   }
   ```

2. **Model Factory** (`src/main/ai/provider.ts`)
   - Add case in `resolveModel()` if special handling needed
   - Add case in `resolveEmbeddingModel()` if embeddings supported
   - Update `listProviderModels()` for live model discovery

3. **Settings** (`src/main/ai/settings.ts`)
   - Add API key encryption if needed
   - Add provider-specific settings

4. **IPC Handler** (`src/main/ipc/handlers/`)
   - Create new handler if custom operations needed
   - Register in `src/main/ipc/index.ts`

5. **UI Component** (`src/components/settings/views/`)
   - Optional: Add provider-specific settings panel
   - Integrate into ModelsView.tsx

6. **Tests**
   - Unit tests for model resolution
   - Integration tests for IPC channels
   - Provider-specific edge cases

## Provider Comparison

| Provider | Type | Auth | Local | Free Tier | Setup |
|----------|------|------|-------|-----------|-------|
| [Ollama](./OLLAMA.md) | Open-weight | None | ✓ | ✓ | `ollama serve` |
| Groq | Cloud | API Key | ✗ | ✓ Limited | 1 env var |
| OpenRouter | Cloud | API Key | ✗ | ✓ Free models | 1 env var |
| Gemini | Cloud | API Key | ✗ | ✓ Flash tier | 1 env var |
| OpenAI | Cloud | API Key | ✗ | ✗ (paid) | 1 env var |
| Anthropic | Cloud | API Key | ✗ | ✗ (paid) | 1 env var |
| Cohere | Cloud | API Key | ✗ | ✓ Trial | 1 env var |

## Error Handling

All providers implement consistent error handling:

- **Retryable errors** (429, 5xx, network): Fallback to next provider
- **Non-retryable errors** (401, 403, 404): Show error immediately
- **Provider-specific messages**: Clear guidance on resolution

## Performance

### Model Loading
- Cached on first use
- Live `/models` endpoint queried for current list
- Fallback to curated suggestions if lookup fails

### Fallback Chain
- Resolved dynamically on each turn
- Ollama models fetched fresh (no cache)
- Timeout of 10 seconds per lookup
- Up to 3 providers attempted per message

### Embeddings
- Separate provider configuration from chat models
- Allows embeddings from different source (e.g., OpenAI embeddings + Ollama chat)
- Caching handled by AI SDK layer

---

For detailed information on a specific provider, see its documentation file above.
