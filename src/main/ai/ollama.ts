/**
 * ai/ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ollama-specific utilities for local model management.
 *
 * Ollama is a local model runner: users download models with `ollama pull <model>`
 * and serve them via `ollama serve`. This module handles Ollama connectivity,
 * model listing, shell execution, and helpful error messages specific to the local setup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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


/**
 * Shell execution utilities for Ollama management.
 * Allows starting Ollama server and pulling models from within the app.
 */

const execFileAsync = promisify(execFile);

export interface OllamaStartResult {
  success: boolean;
  pid?: number;
  error?: string;
  message?: string;
}

/**
 * Check if Ollama is installed on the system.
 */
export async function isOllamaInstalled(): Promise<boolean> {
  try {
    await execFileAsync('ollama', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the installed Ollama version.
 */
export async function getOllamaVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ollama', ['--version']);
    // Output format: "ollama version is 0.1.32"
    const match = stdout.match(/ollama version is ([\d.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Start the Ollama server.
 * 
 * On macOS, starts the app which auto-launches the server.
 * On Linux/Windows, runs `ollama serve` in the background.
 */
export async function startOllamaServer(): Promise<OllamaStartResult> {
  try {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: open the Ollama app
      try {
        await execFileAsync('open', ['-a', 'Ollama']);
        return {
          success: true,
          message: 'Ollama app opened. Server will start automatically.',
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to open Ollama.app. Is it installed? Download from https://ollama.ai`,
        };
      }
    }

    if (platform === 'win32') {
      // Windows: look for ollama.exe in Program Files
      try {
        const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
        const ollamaPath = `${programFiles}\\Ollama\\ollama.exe`;

        // Try to start Ollama
        const { spawn } = await import('node:child_process');
        spawn(ollamaPath, [], { detached: true, stdio: 'ignore' });

        return {
          success: true,
          message: 'Ollama server starting in background. Wait a few seconds then refresh.',
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to start Ollama. Is it installed? Download from https://ollama.ai`,
        };
      }
    }

    // Linux: run ollama serve
    try {
      const { spawn } = await import('node:child_process');
      const server = spawn('ollama', ['serve'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const pid = server.pid;
      server.unref();

      return {
        success: true,
        pid,
        message: `Ollama server starting (PID: ${pid}). Wait a few seconds then refresh.`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to start Ollama. Is it installed? Run: curl https://ollama.ai/install.sh | sh`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error starting Ollama',
    };
  }
}

export interface OllamaPullResult {
  success: boolean;
  modelId?: string;
  progress?: string;
  error?: string;
}

/**
 * Pull (download) a model from Ollama registry.
 * 
 * This spawns a background process to pull the model.
 * The process will run in the background even if the app closes.
 */
export async function pullOllamaModel(
  modelId: string,
  onProgress?: (update: string) => void,
): Promise<OllamaPullResult> {
  try {
    // Validate model ID format
    if (!modelId.trim() || !/^[\w\-.:]+$/.test(modelId)) {
      return {
        success: false,
        error: `Invalid model ID: "${modelId}". Use format: name or name:tag`,
      };
    }

    // Spawn detached process so it continues even if app closes
    const { spawn } = await import('node:child_process');
    const pull = spawn('ollama', ['pull', modelId], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    pull.stdout?.on('data', (data) => {
      output += data.toString();
      if (onProgress) {
        onProgress(output);
      }
    });

    pull.stderr?.on('data', (data) => {
      output += data.toString();
    });

    pull.unref();

    return {
      success: true,
      modelId,
      progress: `Started pulling ${modelId} in background. Run "ollama list" to check progress.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to pull model',
    };
  }
}

/**
 * Get currently running Ollama processes.
 */
export async function getRunningOllamaModels(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('ollama', ['ps']);
    // Parse output to extract model names
    const lines = stdout.split('\n').slice(1); // Skip header
    return lines
      .filter((line) => line.trim())
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Stop a running model.
 */
export async function stopOllamaModel(modelId: string): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process');
    const proc = spawn('ollama', ['stop', modelId], {
      stdio: 'pipe',
    });

    await new Promise<void>((resolve, reject) => {
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(code)));
      proc.on('error', reject);
    });

    return true;
  } catch {
    return false;
  }
}
