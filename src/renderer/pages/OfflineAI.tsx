/**
 * pages/OfflineAI.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Demo page for offline AI inference using Transformers.js.
 *
 * Allows downloading a tiny model for local, private inference. Once cached,
 * the model runs entirely offline. Provides a simple chat interface to test
 * the model's capabilities.
 *
 *   ┌─ PageHeader ────────────────────────────────────────────────────────────┐
 *   │  Offline AI                                                              │
 *   ├──────────────────────────────────────────────────────────────────────────┤
 *   │  [Status: Downloading 45%]  [WebGPU: ✓]                                 │
 *   │  ┌─ Progress Bar ─────────────────────────────────────────────────────┐ │
 *   │  │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
 *   │  └────────────────────────────────────────────────────────────────────┘ │
 *   │                                                                          │
 *   │  Model: Xenova/distilgpt2 (~260MB)                                      │
 *   │  Device: WebGPU (or WASM fallback)                                      │
 *   │                                                                          │
 *   │  ┌─ Chat ─────────────────────────────────────────────────────────────┐ │
 *   │  │ > What is the meaning of life?                                     │ │
 *   │  │ The meaning of life is a philosophical question...                 │ │
 *   │  │                                                                     │ │
 *   │  │ [Type a message...]  [Send]                                        │ │
 *   │  └────────────────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useOfflineAI } from '@/hooks/use-offline-ai';
import { cn } from '@/lib/utils';
import {
  BotIcon,
  CpuIcon,
  DownloadIcon,
  Loader2Icon,
  SendIcon,
  SparklesIcon,
  UserIcon,
  XCircleIcon,
} from 'lucide-react';

const MODELS = [
  { id: 'Xenova/distilgpt2', label: 'DistilGPT-2', size: '~260MB', description: 'Fast, compact GPT-2 variant' },
  { id: 'Xenova/tinyllama-1.1b', label: 'TinyLlama 1.1B', size: '~630MB', description: 'Better quality, larger model' },
  { id: 'onnx-community/gpt2-ONNX', label: 'GPT-2', size: '~500MB', description: 'Classic GPT-2 model' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function OfflineAI() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    status,
    progress,
    webgpuAvailable,
    error,
    modelId,
    generate,
    reset,
    initialize,
  } = useOfflineAI({
    modelId: selectedModel,
  });

  const handleInitialize = useCallback(async () => {
    await initialize();
  }, [initialize]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || status !== 'ready' || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    try {
      const stream = await generate(userMessage);
      let assistantContent = '';

      // Add empty assistant message that we'll update
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      for await (const chunk of stream) {
        assistantContent += chunk;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantContent },
        ]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMsg}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [input, status, isStreaming, generate]);

  const handleReset = useCallback(() => {
    reset();
    setMessages([]);
  }, [reset]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setMessages([]);
      reset();
    },
    [reset]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const selectedModelInfo = MODELS.find((m) => m.id === selectedModel);

  const statusLabel = (() => {
    switch (status) {
      case 'idle':
        return 'Not started';
      case 'checking':
        return 'Checking...';
      case 'downloading':
        return `Downloading ${progress}%`;
      case 'ready':
        return 'Ready';
      case 'generating':
        return 'Generating...';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        crumbs={[{ label: 'Offline AI' }]}
        meta={
          <div className="flex items-center gap-2">
            <Badge
              variant={status === 'ready' ? 'default' : 'secondary'}
              className="gap-1"
            >
              {status === 'ready' ? (
                <SparklesIcon className="h-3 w-3" />
              ) : status === 'downloading' ? (
                <Loader2Icon className="h-3 w-3 animate-spin" />
              ) : status === 'error' ? (
                <XCircleIcon className="h-3 w-3" />
              ) : (
                <CpuIcon className="h-3 w-3" />
              )}
              {statusLabel}
            </Badge>
            {webgpuAvailable && (
              <Badge variant="outline">WebGPU</Badge>
            )}
          </div>
        }
      />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-4 overflow-hidden">
        {/* Model selector */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Model</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedModelInfo?.description} ({selectedModelInfo?.size})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status === 'ready' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      Reset
                    </Button>
                  )}
                  {status === 'idle' && (
                    <Button size="sm" onClick={handleInitialize}>
                      <DownloadIcon className="mr-1 h-3 w-3" />
                      Download Model
                    </Button>
                  )}
                </div>
              </div>

              {/* Model picker */}
              <div className="flex gap-2 flex-wrap">
                {MODELS.map((model) => (
                  <Button
                    key={model.id}
                    variant={selectedModel === model.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleModelChange(model.id)}
                    disabled={status === 'downloading'}
                    className="text-xs"
                  >
                    {model.label}
                  </Button>
                ))}
              </div>

              {/* Progress */}
              {status === 'downloading' && (
                <div className="space-y-1">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    Downloading and caching {modelId}...
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <XCircleIcon className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="flex-1 flex flex-col gap-3 p-4 min-h-0">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/75">
                <BotIcon className="h-10 w-10" />
                <p className="text-sm">
                  {status === 'ready'
                    ? 'Model ready! Send a message to start.'
                    : 'Download a model to start chatting offline.'}
                </p>
                <p className="text-xs text-muted-foreground/50">
                  All inference runs locally — no data leaves your device.
                </p>
              </div>
            ) : (
              <ScrollArea ref={scrollRef} className="flex-1">
                <div className="space-y-4 pr-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex gap-3',
                        msg.role === 'user' && 'justify-end'
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <BotIcon className="h-5 w-5 shrink-0 mt-1 text-muted-foreground" />
                      )}
                      <div
                        className={cn(
                          'rounded-lg px-3 py-2 text-sm max-w-[80%]',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        <pre className="whitespace-pre-wrap font-sans">
                          {msg.content}
                        </pre>
                      </div>
                      {msg.role === 'user' && (
                        <UserIcon className="h-5 w-5 shrink-0 mt-1 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Input
                placeholder={
                  status === 'ready'
                    ? 'Type a message...'
                    : 'Download a model first...'
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={status !== 'ready' || isStreaming}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={status !== 'ready' || isStreaming || !input.trim()}
                size="icon"
              >
                {isStreaming ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SendIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
