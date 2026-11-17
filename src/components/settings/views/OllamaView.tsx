/**
 * components/settings/views/OllamaView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings section for Ollama local model management.
 *
 * Allows users to:
 * - Check if Ollama server is running
 * - List locally installed models
 * - View setup instructions
 * - Test connectivity and refresh the model list
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  CopyIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOllamaConnection, useOllamaModels, useOllamaSetupInstructions } from '@/hooks/use-ollama';

export function OllamaView() {
  const connection = useOllamaConnection();
  const models = useOllamaModels();
  const instructions = useOllamaSetupInstructions();

  const [showInstructions, setShowInstructions] = useState(false);

  // Check connection on mount
  useEffect(() => {
    void connection.checkConnection();
  }, []);

  const handleRefreshModels = async () => {
    if (!connection.isRunning) {
      toast.error('Ollama server is not running. Start it with "ollama serve"');
      return;
    }
    await models.listModels();
  };

  const handleReconnect = async () => {
    await connection.checkConnection();
    if (connection.isRunning) {
      await models.listModels();
    }
  };

  const handleCopyInstructions = () => {
    if (instructions.instructions) {
      navigator.clipboard.writeText(instructions.instructions);
      toast.success('Setup instructions copied to clipboard');
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {connection.isRunning ? (
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircleIcon className="h-5 w-5 text-amber-600" />
            )}
            Server Status
          </CardTitle>
          <CardDescription>
            {connection.isRunning
              ? 'Ollama server is running at http://localhost:11434'
              : 'Ollama server is not reachable'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection.error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
              {connection.error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconnect}
              disabled={connection.isLoading}
            >
              {connection.isLoading ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-2 h-4 w-4" />
              )}
              Check Connection
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              Setup Instructions
            </Button>

            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href="https://ollama.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                Download
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      {showInstructions && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started with Ollama</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {!instructions.instructions && (
                <Button
                  size="sm"
                  onClick={() => void instructions.getInstructions()}
                  disabled={instructions.isLoading}
                  variant="outline"
                >
                  {instructions.isLoading ? (
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load Instructions
                </Button>
              )}
              {instructions.instructions && (
                <>
                  <pre className="whitespace-pre-wrap rounded bg-slate-100 p-4 text-sm">
                    {instructions.instructions}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyInstructions}
                    className="absolute right-2 top-2"
                  >
                    <CopyIcon className="h-4 w-4" />
                  </Button>
                </>
              )}
              {instructions.error && (
                <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                  {instructions.error}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Models List */}
      {connection.isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Installed Models</CardTitle>
            <CardDescription>
              {models.models.length > 0
                ? `${models.models.length} model(s) ready to use`
                : 'No models installed yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {models.error && (
              <div className="rounded bg-amber-50 p-3 text-sm text-amber-700">
                {models.error}
              </div>
            )}

            {models.models.length > 0 && (
              <div className="space-y-2">
                {models.models.map((model) => (
                  <div
                    key={model}
                    className="flex items-center justify-between rounded border bg-slate-50 px-3 py-2 font-mono text-sm"
                  >
                    <span>{model}</span>
                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshModels}
              disabled={models.isLoading || !connection.isRunning}
            >
              {models.isLoading ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-2 h-4 w-4" />
              )}
              Refresh Models
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Commands */}
      {connection.isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Commands</CardTitle>
            <CardDescription>
              Copy and run these in your terminal to manage models
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'Pull Qwen 3.5 (lightweight)', cmd: 'ollama pull qwen3.5:0.8b' },
              { label: 'Pull Mistral', cmd: 'ollama pull mistral' },
              { label: 'Pull Neural Chat', cmd: 'ollama pull neural-chat' },
              { label: 'List all models', cmd: 'ollama list' },
              { label: 'Remove a model', cmd: 'ollama rm <model-name>' },
            ].map((item) => (
              <div
                key={item.cmd}
                className="flex items-center justify-between gap-2 rounded bg-slate-100 p-2 font-mono text-xs"
              >
                <div>
                  <div className="text-slate-600">{item.label}</div>
                  <div className="text-slate-900">{item.cmd}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(item.cmd);
                    toast.success('Copied to clipboard');
                  }}
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
