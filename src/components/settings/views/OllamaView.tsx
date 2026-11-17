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
  PlayIcon,
  DownloadIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useOllamaConnection,
  useOllamaModels,
  useOllamaSetupInstructions,
  useOllamaInstallation,
  useOllamaServerControl,
  useOllamaModelPull,
  useOllamaRunningModels,
} from '@/hooks/use-ollama';

export function OllamaView() {
  const connection = useOllamaConnection();
  const models = useOllamaModels();
  const instructions = useOllamaSetupInstructions();
  const installation = useOllamaInstallation();
  const serverControl = useOllamaServerControl();
  const modelPull = useOllamaModelPull();
  const runningModels = useOllamaRunningModels();

  const [showInstructions, setShowInstructions] = useState(false);
  const [pullModelInput, setPullModelInput] = useState('');

  // Check installation and connection on mount
  useEffect(() => {
    void installation.checkInstallation();
    void connection.checkConnection();
  }, []);

  // Fetch running models when connected
  useEffect(() => {
    if (connection.isRunning) {
      void runningModels.getRunning();
    }
  }, [connection.isRunning]);

  const handleReconnect = async () => {
    await connection.checkConnection();
    if (connection.isRunning) {
      await models.listModels();
      await runningModels.getRunning();
    }
  };

  const handleStartServer = async () => {
    const success = await serverControl.startServer();
    if (success) {
      toast.success('Starting Ollama server...');
      // Wait a moment and try reconnecting
      setTimeout(() => {
        void handleReconnect();
      }, 2000);
    } else {
      toast.error(serverControl.startError || 'Failed to start Ollama');
    }
  };

  const handlePullModel = async (modelId: string) => {
    const success = await modelPull.pullModel(modelId);
    if (success) {
      toast.success(`Pulling ${modelId}. Check back later!`);
      setPullModelInput('');
    } else {
      toast.error(modelPull.pullError || 'Failed to pull model');
    }
  };

  const handleRefreshModels = async () => {
    if (!connection.isRunning) {
      toast.error('Ollama server is not running. Start it first.');
      return;
    }
    await models.listModels();
    toast.success('Model list refreshed');
  };

  const handleStopModel = async (modelId: string) => {
    const success = await runningModels.stopModel(modelId);
    if (success) {
      toast.success(`Stopped ${modelId}`);
    } else {
      toast.error(`Failed to stop ${modelId}`);
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
      {/* Installation Status Card */}
      {!installation.isInstalled && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircleIcon className="h-5 w-5" />
              Ollama Not Installed
            </CardTitle>
            <CardDescription className="text-amber-800">
              Ollama needs to be installed to use local models
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-800">
              Download and install Ollama from https://ollama.ai, then return here.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void installation.checkInstallation()}>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Check Again
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
      )}

      {/* Server Status Card */}
      {installation.isInstalled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {connection.isRunning ? (
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircleIcon className="h-5 w-5 text-amber-600" />
              )}
              Server Status
              {installation.version && (
                <span className="ml-auto text-sm font-normal text-slate-500">
                  v{installation.version}
                </span>
              )}
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

            {serverControl.startMessage && (
              <div className="rounded bg-green-50 p-3 text-sm text-green-700">
                {serverControl.startMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!connection.isRunning ? (
                <Button
                  size="sm"
                  onClick={handleStartServer}
                  disabled={serverControl.isStarting || !installation.isInstalled}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {serverControl.isStarting ? (
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayIcon className="mr-2 h-4 w-4" />
                  )}
                  Start Ollama Server
                </Button>
              ) : (
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
                  Reconnect
                </Button>
              )}

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
                  Ollama.ai
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Running Models Card */}
      {installation.isInstalled && connection.isRunning && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Running Models</span>
              <span className="text-sm font-normal text-slate-500">
                {runningModels.running.length > 0
                  ? `${runningModels.running.length} active`
                  : 'None running'}
              </span>
            </CardTitle>
            <CardDescription>
              Toggle running models on or off
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {runningModels.isLoading && (
              <div className="flex items-center justify-center gap-2 py-4">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                <span>Checking running models...</span>
              </div>
            )}

            {!runningModels.isLoading && runningModels.running.length === 0 && (
              <div className="rounded bg-slate-50 p-3 text-sm text-slate-600">
                No models currently running. Start one by selecting it in the chat.
              </div>
            )}

            {runningModels.running.length > 0 && (
              <div className="space-y-2">
                {runningModels.running.map((model) => (
                  <div
                    key={model}
                    className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-600" />
                      <span className="font-mono text-sm">{model}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleStopModel(model)}
                      className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => void runningModels.getRunning()}
              disabled={runningModels.isLoading}
            >
              {runningModels.isLoading ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-2 h-4 w-4" />
              )}
              Refresh Status
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pull Model Card */}
      {installation.isInstalled && connection.isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Pull a Model</CardTitle>
            <CardDescription>
              Download a new model from the Ollama library
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelPull.pullError && (
              <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                {modelPull.pullError}
              </div>
            )}

            {modelPull.progress && (
              <div className="rounded bg-blue-50 p-3 text-sm text-blue-700">
                {modelPull.progress}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., mistral, qwen3.5:0.8b, neural-chat"
                value={pullModelInput}
                onChange={(e) => setPullModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pullModelInput.trim()) {
                    void handlePullModel(pullModelInput.trim());
                  }
                }}
                className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
                disabled={modelPull.isPulling}
              />
              <Button
                size="sm"
                onClick={() => handlePullModel(pullModelInput.trim())}
                disabled={!pullModelInput.trim() || modelPull.isPulling}
              >
                {modelPull.isPulling ? (
                  <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <DownloadIcon className="mr-2 h-4 w-4" />
                )}
                Pull
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Model will download in the background. Check back later. Popular: mistral, qwen3.5:0.8b,
              neural-chat
            </p>
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
