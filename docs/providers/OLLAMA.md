# Ollama Implementation Guide

A comprehensive guide to Qeda's support for local Ollama models with full connectivity checking, model listing, and automatic fallback chain integration.

## Quick Links

- [Quick Setup](#quick-setup)
- [Key Features](#key-features)
- [Files Added/Modified](#files-addedmodified)
- [How It Works](#how-it-works)
- [Fallback Chain Integration](#fallback-chain-with-ollama-models)
- [Testing](#testing-the-fallback-chain)
- [Debugging](#debugging)

## Quick Setup

1. Download Ollama from https://ollama.ai
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull qwen3.5:0.8b`
4. In Qeda Settings → AI & Models → Providers, select "Ollama (local, no key)"
5. Click "Refresh models" to list installed models
6. Select a model and start chatting

## Key Features

✓ List locally installed Ollama models dynamically  
✓ Check Ollama server connectivity with helpful error messages  
✓ Ollama models included in automatic fallback chain when primary provider fails  
✓ Settings panel with model management UI  
✓ Setup instructions and quick copy-paste commands  
✓ Native Ollama `/api/tags` endpoint support (more reliable than OpenAI-compat)

## Files Added/Modified

### NEW FILES

**src/main/ai/ollama.ts**
- `checkOllamaConnection()` - Verify Ollama server is running
- `listOllamaModels()` - List all locally installed models
- `getOllamaModelInfo()` - Get details about a specific model
- `formatOllamaSetupInstructions()` - User-friendly setup guide

**src/main/ipc/handlers/ollama.ts**
- `registerOllamaHandlers()` - Register IPC endpoints
- `ollama:check-connection` - IPC channel
- `ollama:list-models` - IPC channel
- `ollama:get-setup-instructions` - IPC channel

**src/hooks/use-ollama.ts** (Renderer)
- `useOllamaConnection()` - Hook for checking server connection
- `useOllamaModels()` - Hook for listing models
- `useOllamaSetupInstructions()` - Hook for getting setup guide

**src/components/settings/views/OllamaView.tsx** (Renderer)
- UI component for Ollama settings panel
- Server status display
- Model list with refresh
- Setup instructions and quick commands

### MODIFIED FILES

**src/main/ai/registry.ts**
- Added common model suggestions to Ollama provider entry
- Updated description with better guidance

**src/main/ai/provider.ts**
- Enhanced `listProviderModels()` to use native Ollama `/api/tags` endpoint
- Handles both OpenAI-compatible format and Ollama native format
- Better error messages for Ollama-specific issues
- `resolveModelChain()` now async to dynamically fetch Ollama models
- Import added for `listOllamaModels()`

**src/main/ai/fallback.ts**
- `buildModelChain()` and `resolveChain()` now async
- Added `getInstalledModels` callback for dynamic model lookup
- Ollama models fetched dynamically and included in fallback chain

**src/main/ipc/channels.ts**
- Added three new IPC channel definitions for Ollama

**src/main/ipc/index.ts**
- Registered OllamaHandlers in `registerIpcHandlers()`

**src/main/ipc/handlers/*.ts** (10 files)
- Updated all `resolveModelChain()` calls to await the async function
- Fallback chain now dynamically includes locally installed Ollama models
- Files: agent-chat, copilot, document-drafter, studio-copilot, motion-copilot, trace-copilot, correspondence-copilot, model-builder, music-copilot, presence

## How It Works

### User Interaction Flow

```
┌─────────────────────────────────────────────────────┐
│ User opens Settings → AI & Models                    │
│ Selects "Ollama (local, no key)" provider            │
│                    │                                 │
│                    ▼                                 │
│ listProviderModels("ollama") is called               │
│ → IPC invokes 'providers:models' (request)           │
│                    │                                 │
│                    ▼                                 │
│ Main process receives request                        │
│ → resolveProvider("ollama") gets base URL            │
│ → Strips "/v1" suffix → "http://localhost:11434"     │
│ → listOllamaModels() calls /api/tags endpoint        │
│                    │                                 │
│                    ▼                                 │
│ Response formatted and sent back to renderer          │
│                    │                                 │
│                    ▼                                 │
│ Models displayed in dropdown                         │
│ User selects model & starts chatting                 │
└─────────────────────────────────────────────────────┘
```

### Connection Checking

```
┌──────────────────────────────────────────┐
│ OllamaView mounts                         │
│ → useOllamaConnection() hook              │
│ → Calls checkOllamaConnection()           │
│                │                          │
│                ▼                          │
│ IPC: 'ollama:check-connection'            │
│                │                          │
│                ▼                          │
│ Main process tries to fetch               │
│ http://localhost:11434/api/tags           │
│                │                          │
│         ┌──────┴──────┐                   │
│         ▼             ▼                   │
│      Success        Fail                  │
│      {isRunning:    {isRunning:          │
│       true}         false, error}         │
│         │             │                   │
│         ▼             ▼                   │
│      Show ✓        Show ✗ + message      │
└──────────────────────────────────────────┘
```

### Model Listing

```
┌──────────────────────────────────────────┐
│ User clicks "Refresh Models"              │
│ → useOllamaModels().listModels()          │
│                │                          │
│                ▼                          │
│ IPC: 'ollama:list-models'                 │
│                │                          │
│                ▼                          │
│ Main: fetch(/api/tags)                    │
│ Parse: payload.models array               │
│ Extract: model.name fields                │
│                │                          │
│                ▼                          │
│ Return { models: ["qwen3.5:0.8b", ...] } │
│                │                          │
│                ▼                          │
│ UI displays list with checkmarks          │
└──────────────────────────────────────────┘
```

## API Endpoints Used

### OpenAI-compatible adapter (when using local provider)
```
GET /v1/models
→ Returns: { data: [{ id: "model-name" }, ...] }
```

### Ollama native (preferred, more reliable)
```
GET /api/tags
→ Returns: { models: [{ name: "model-name:tag", ... }, ...] }
```

### Ollama model details
```
POST /api/show
Body: { name: "model-name:tag" }
→ Returns: { name, model, modified_at, size, digest }
```

## Fallback Chain with Ollama Models

### What is the Fallback Chain?

When a provider fails (rate limited, server error, etc.), Qeda tries the next provider in a pre-configured chain instead of showing an error. This keeps conversations flowing.

**Standard Chain (before Ollama):**
1. User's selected provider (e.g., Groq)
2. OpenRouter :free models (if configured)
3. Gemini Flash (if configured)
4. (up to 3 total attempts)

**New Chain (with Ollama):**
1. User's selected provider (e.g., Groq)
2. Ollama (if running and models installed) ← NEW
3. OpenRouter :free models (if configured)
4. (up to 3 total attempts)

### Scenario 1: User on Groq, Rate-Limited

```
User sends message while on Groq

resolveModelChain() builds fallback list:
 1. "groq" + "openai/gpt-oss-120b"
 2. "ollama" + dynamically fetched model  ← DYNAMIC LOOKUP
 3. "openrouter" + first :free model

Attempt 1: Groq → HTTP 429 (rate limit)
           → Retryable error detected

Attempt 2: Ollama → Success! ✓
           → Response sent to user
           → UI shows "Using Ollama…"
```

### Scenario 2: Ollama Not Running

```
resolveModelChain() called

getInstalledModels('ollama') tries to:
 1. Fetch http://localhost:11434/api/tags
 2. Connection refused
 3. Returns empty array []

Ollama skipped, tries next provider
Fallback chain: Groq → OpenRouter → ...
               (Ollama not included)
```

### Implementation Details

**File: src/main/ai/fallback.ts**

`buildModelChain()` signature changed:
```typescript
// OLD
function buildModelChain(opts): ModelTarget[]

// NEW
async function buildModelChain(opts): Promise<ModelTarget[]>
```

Added parameter:
```typescript
getInstalledModels?: (providerId: string) => Promise<string[]>
```

When building chain for Ollama:
```typescript
if (provider.id === 'ollama' && getInstalledModels) {
  try {
    const models = await getInstalledModels('ollama');  // Dynamic
    if (models.length > 0) {
      chain.push({ providerId: 'ollama', modelId: models[0] });
    }
  } catch {
    // If lookup fails, Ollama is skipped gracefully
  }
}
```

**File: src/main/ai/provider.ts**

`resolveModelChain()` implementation:
```typescript
getInstalledModels: async (providerId) => {
  if (providerId !== 'ollama') return [];
  const baseURL = resolveBaseURL(providerId, settings);
  const ollamaBase = baseURL.replace(/\/v1\/?$/, '');
  const result = await listOllamaModels(ollamaBase);
  return result.models || [];
}
```

### Performance Considerations

**Dynamic Model Lookup Cost:**
- Only happens when the primary provider fails
- Ollama `/api/tags` typically responds in <100ms
- Timeout set to 10 seconds (fallback skipped if timeout)
- Minimal overhead to the error-recovery path

**Caching:**
- Models NOT cached (fresh lookup each failure)
- Ensures users who pull new models see them immediately
- Trade-off: slight latency on fallback, better UX for model updates

## Error Handling

Common error messages and what they mean:

```
ECONNREFUSED → "Cannot connect to Ollama server. Start with: ollama serve"
Timeout      → "Ollama server is not responding (timeout). Restart with: ollama serve"
No models    → "No models installed. Pull one first: ollama pull qwen3.5:0.8b"
HTTP 500     → "Ollama server error. Try restarting: ollama serve"
HTTP 404     → "Ollama API endpoint not found. Check your Ollama version."
```

## Suggested Models to Pull

From https://ollama.ai/library

**Lightweight (fast, good for testing):**
- `ollama pull qwen3.5:0.8b` (~530 MB)
- `ollama pull tinyllama` (~400 MB)
- `ollama pull phi` (~2.6 GB)

**Balanced (good quality, reasonable size):**
- `ollama pull mistral` (~4 GB)
- `ollama pull neural-chat` (~5 GB)
- `ollama pull dolphin-mixtral` (~26 GB)

**High-quality (requires good hardware):**
- `ollama pull llama3` (~4.7 GB)
- `ollama pull llama2` (~3.8 GB)
- `ollama pull openchat` (~4 GB)

## Testing the Fallback Chain

### Test 1: Fallback to Ollama from free provider

1. Start Ollama: `ollama serve`
2. Pull a model: `ollama pull qwen3.5:0.8b`
3. In Settings, select Groq as primary (or another free tier)
4. In developer console, monitor IPC calls
5. Send a message, Groq hits rate limit (429)
6. Watch the fallback attempt to Ollama
7. Message should complete using Ollama
8. UI shows "Retried with Ollama · qwen3.5:0.8b"

### Test 2: Skip Ollama if not running

1. Stop Ollama (or don't start it)
2. Set Groq as primary provider
3. Send a message that triggers Groq error
4. Fallback chain builds, Ollama lookup fails
5. Tries next provider (OpenRouter, etc.)
6. Should NOT see Ollama in the fallback attempts

### Test 3: Multiple models installed

1. Install multiple models: `ollama pull mistral`, `ollama pull neural-chat`
2. Trigger fallback
3. Ollama included with first available model
4. Any of the installed models can serve the request
5. Chain uses first one, but all are usable

## Debugging

### If models don't show up

1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Verify models are installed: `ollama list`
3. Pull a model if needed: `ollama pull qwen3.5:0.8b`
4. Check logs: Settings → Offline Models or developer console (F12)

### If connection fails

1. Ensure Ollama is running: `ollama serve`
2. Check it's listening on port 11434: `netstat -an | grep 11434`
3. Try direct API call: `curl http://localhost:11434/api/tags`
4. On Windows/Mac, Ollama may need firewall/permissions allowance

### If chat doesn't work

1. Try a smaller model first (qwen3.5:0.8b)
2. Check available system memory: Ollama needs 2-4GB+ per model
3. Verify model works from CLI: `ollama run qwen3.5:0.8b "hello"`
4. Check main process logs for errors

## Example Usage in Renderer Component

```typescript
import { useOllamaConnection, useOllamaModels } from '@/hooks/use-ollama';

export function ExampleOllamaUsage() {
  const connection = useOllamaConnection();
  const models = useOllamaModels();

  return (
    <div>
      {/* Check connection on mount */}
      <button onClick={() => void connection.checkConnection()}>
        Check Ollama Connection
      </button>

      {connection.isRunning && <p>✓ Ollama is running!</p>}
      {connection.error && <p>✗ {connection.error}</p>}

      {/* List models */}
      <button 
        onClick={() => void models.listModels()} 
        disabled={!connection.isRunning}
      >
        List Models
      </button>

      {models.models.map((model) => (
        <div key={model}>{model}</div>
      ))}

      {models.error && <p>Error: {models.error}</p>}
    </div>
  );
}
```

## Backward Compatibility

✓ Existing fallback behavior unchanged for non-Ollama providers  
✓ If Ollama not running, silently skipped (no errors to user)  
✓ All settings panels still work the same  
✓ No breaking changes to IPC contracts

## Known Limitations

1. **Ollama models not pre-cached**
   - Each fallback attempt fetches current model list
   - Slight latency when falling back to Ollama
   - Trade-off: always-fresh vs. fast retry

2. **First attempt always uses user's selection**
   - Even if Ollama is faster/cheaper
   - Respects explicit user choice
   - Automatic fallback only when primary fails

3. **Fallback chain limited to 3 attempts**
   - Prevents infinite retry loops
   - Ollama likely to be included in first 3
   - Most failures resolved before hitting limit

## Future Enhancements

Potential improvements (not in v1):

- **Ollama model caching with TTL** - Cache model list for 5-10 seconds, avoid repeated lookups
- **Ollama as primary provider optimization** - No fetching needed when Ollama is the active choice
- **Provider health scoring** - Track success rate, prioritize healthier providers
- **User-configured fallback order** - Let users specify their preferred fallback priority
