/**
 * ai/ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ollama-specific utilities for local model management.
 *
 * Ollama is a local model runner: users download models with `ollama pull <model>`
 * and serve them via `ollama serve`. This module handles Ollama connectivity,
 * model listing, and helpful error messages specific to the local setup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface OllamaModelsResponse {
  models: OllamaModelInfo[];
}

/**
 * Check if Ollama server is running and reachable.
 */
export async function checkOllamaConnection(
  baseURL: string = 'http://localhost:11434',
): Promise<{
  isRunning: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(`${baseURL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        isRunning: false,
        error: `Ollama server responded with HTTP ${response.status}`,
      };
    }

    return { isRunning: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ECONNREFUSED')) {
      return {
        isRunning: false,
        error:
          'Connection refused. Start Ollama with: ollama serve\n\nDownload Ollama from: https://ollama.ai',
      };
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        isRunning: false,
        error: 'Ollama server is not responding. Start with: ollama serve',
      };
    }

    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return {
        isRunning: false,
        error: 'Cannot resolve localhost. Is Ollama installed? Visit https://ollama.ai',
      };
    }

    return {
      isRunning: false,
      error: `Connection error: ${message}`,
    };
  }
}

/**
 * List locally installed Ollama models.
 * Uses the Ollama API endpoint directly (not OpenAI-compatible).
 */
export async function listOllamaModels(
  baseURL: string = 'http://localhost:11434',
): Promise<{
  models: string[];
  error?: string;
}> {
  try {
    const response = await fetch(`${baseURL}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          models: [],
          error: 'Ollama API endpoint not found. Check your Ollama version.',
        };
      }

      if (response.status >= 500) {
        return {
          models: [],
          error: 'Ollama server error. Try restarting: ollama serve',
        };
      }

      return {
        models: [],
        error: `Ollama API returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as OllamaModelsResponse;
    const models = (payload.models || [])
      .map((m) => m.name || m.model)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .sort();

    if (models.length === 0) {
      return {
        models: [],
        error:
          'No models found in Ollama. Pull a model first:\n\n  ollama pull qwen3.5:0.8b\n  ollama pull mistral\n  ollama pull neural-chat\n\nThen refresh this list.',
      };
    }

    return { models };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ECONNREFUSED')) {
      return {
        models: [],
        error:
          'Cannot connect to Ollama. Start the server:\n\n  ollama serve\n\nThen refresh this list.',
      };
    }

    if (message.includes('timeout')) {
      return {
        models: [],
        error: 'Ollama server is not responding. Restart with: ollama serve',
      };
    }

    return {
      models: [],
      error: `Error listing models: ${message}`,
    };
  }
}

/**
 * Get detailed info about a specific Ollama model.
 */
export async function getOllamaModelInfo(
  modelName: string,
  baseURL: string = 'http://localhost:11434',
): Promise<{
  info?: OllamaModelInfo;
  error?: string;
}> {
  try {
    const response = await fetch(`${baseURL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        error: `Failed to get model info: HTTP ${response.status}`,
      };
    }

    const info = (await response.json()) as OllamaModelInfo;
    return { info };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Failed to get model info',
    };
  }
}

/**
 * Helper to format Ollama setup instructions for users.
 */
export function formatOllamaSetupInstructions(): string {
  return `
## Getting Started with Ollama

1. **Download & Install**: Visit https://ollama.ai and download Ollama for your platform.

2. **Start the server**:
   \`\`\`bash
   ollama serve
   \`\`\`
   This starts the Ollama API server on http://localhost:11434

3. **Pull a model** (in another terminal):
   \`\`\`bash
   # Lightweight models (recommended to start)
   ollama pull qwen3.5:0.8b    # ~530 MB, very fast
   ollama pull mistral          # ~4 GB, good quality
   ollama pull neural-chat      # ~5 GB, optimized for chat
   
   # More models at: https://ollama.ai/library
   \`\`\`

4. **Refresh the model list** in Settings → Providers → Ollama to see available models.

5. **Select a model** and start chatting — everything runs locally!

### Common Commands

\`\`\`bash
ollama list                 # See installed models
ollama pull mistral         # Download a model
ollama rm mistral          # Remove a model
ollama serve               # Start the API server
\`\`\`

**Note**: Models are stored in \`~/.ollama/models\` (Linux/Mac) or \`%USERPROFILE%\\.ollama\\models\` (Windows).
`.trim();
}
