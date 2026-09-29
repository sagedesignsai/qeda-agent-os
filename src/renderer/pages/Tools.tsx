/**
 * renderer/pages/Tools.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive Device Tools & Sandbox Explorer.
 *
 * Demonstrates native desktop agent superpowers:
 *   • Direct Terminal command execution (Bash/Zsh/PowerShell)
 *   • Filesystem access (readFile, writeFile, listDir, deleteFile)
 *   • System Clipboard I/O
 *   • Interactive live tool execution sandbox
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalContent,
} from '@/components/ai-elements/terminal';
import {
  TerminalIcon,
  FolderIcon,
  ClipboardIcon,
  FileSearchIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  PlayIcon,
  SparklesIcon,
  CheckCircle2Icon,
  Code2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ToolInfo } from '../../main/ipc/channels';

interface ToolItem {
  name: string;
  description: string;
  requiresApproval: boolean;
  category: 'Terminal' | 'Filesystem' | 'Clipboard' | 'RAG';
  /**
   * `key` must match the tool's Zod inputSchema field name exactly – a
   * mismatch fails validation in the main process.
   */
  defaultParam: {
    key: string;
    label: string;
    placeholder: string;
    defaultValue: string;
  };
}

export default function Tools() {
  const [selectedTool, setSelectedTool] = useState<string>('runShell');
  const [paramValue, setParamValue] = useState<string>('git status --short');
  const [isRunning, setIsRunning] = useState(false);
  const [outputResult, setOutputResult] = useState<string>('');
  const [lastSuccess, setLastSuccess] = useState<boolean | null>(null);
  // Approval flags come from the main process so this page can never disagree
  // with the real `toolApprovalPolicy`.
  const [approvalFlags, setApprovalFlags] = useState<Record<string, boolean>>(
    {},
  );

  const tools: ToolItem[] = [
    {
      name: 'runShell',
      description:
        'Execute shell commands in the workspace with real-time output and exit codes.',
      requiresApproval: true,
      category: 'Terminal',
      defaultParam: {
        key: 'command',
        label: 'Shell Command',
        placeholder: 'e.g. ls -la or git status',
        defaultValue: 'git status --short',
      },
    },
    {
      name: 'listDir',
      description:
        'List contents of a directory including file sizes and subdirectories.',
      requiresApproval: false,
      category: 'Filesystem',
      defaultParam: {
        key: 'dirPath',
        label: 'Directory Path',
        placeholder: 'e.g. . or src',
        defaultValue: 'src',
      },
    },
    {
      name: 'readFile',
      description:
        'Read UTF-8 content of a file within the workspace with line count limits.',
      requiresApproval: false,
      category: 'Filesystem',
      defaultParam: {
        key: 'filePath',
        label: 'File Path',
        placeholder: 'e.g. package.json',
        defaultValue: 'package.json',
      },
    },
    {
      name: 'readClipboard',
      description:
        'Read the current text content from the operating system clipboard.',
      requiresApproval: false,
      category: 'Clipboard',
      defaultParam: {
        key: 'none',
        label: 'No Parameters Required',
        placeholder: 'Reads system clipboard directly',
        defaultValue: '',
      },
    },
    {
      name: 'writeClipboard',
      description:
        'Write text to the operating system clipboard. Requires user approval.',
      requiresApproval: true,
      category: 'Clipboard',
      defaultParam: {
        key: 'text',
        label: 'Clipboard Text',
        placeholder: 'Text to copy...',
        defaultValue: 'Hello from the Vellum agent!',
      },
    },
    {
      name: 'searchDocs',
      description:
        'Semantic search over the documents indexed in the local vector store.',
      requiresApproval: false,
      category: 'RAG',
      defaultParam: {
        key: 'query',
        label: 'Search Query',
        placeholder: 'e.g. how does the agent stream?',
        defaultValue: 'agent architecture',
      },
    },
    {
      name: 'listIndexed',
      description:
        'List every file path currently held in the local document index.',
      requiresApproval: false,
      category: 'RAG',
      defaultParam: {
        key: 'none',
        label: 'No Parameters Required',
        placeholder: 'Lists the indexed documents',
        defaultValue: '',
      },
    },
  ];

  // Merge the real approval policy in from the main process.
  const resolvedTools = tools.map((t) => ({
    ...t,
    requiresApproval: approvalFlags[t.name] ?? t.requiresApproval,
  }));

  const currentTool =
    resolvedTools.find((t) => t.name === selectedTool) || resolvedTools[0];

  useEffect(() => {
    window.electron.ipc
      .invoke<ToolInfo[]>('tools:list')
      .then((list) => {
        if (!Array.isArray(list)) return;
        setApprovalFlags(
          Object.fromEntries(list.map((t) => [t.name, t.requiresApproval])),
        );
      })
      .catch(() => {
        // Fall back to the static catalogue below.
      });
  }, []);

  useEffect(() => {
    setParamValue(currentTool.defaultParam.defaultValue);
    setOutputResult('');
    setLastSuccess(null);
  }, [selectedTool]);

  const handleExecute = async () => {
    setIsRunning(true);
    setOutputResult('Executing tool via main process IPC…');
    setLastSuccess(null);

    try {
      const params: Record<string, unknown> = {};
      if (currentTool.defaultParam.key !== 'none') {
        params[currentTool.defaultParam.key] = paramValue;
      }

      const res = await window.electron.ipc.invoke<Record<string, unknown>>(
        'tools:execute',
        {
          toolName: currentTool.name,
          params,
        },
      );

      setOutputResult(JSON.stringify(res, null, 2));
      setLastSuccess(true);
      toast.success(`Tool ${currentTool.name} executed successfully!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOutputResult(`Execution Error: ${msg}`);
      setLastSuccess(false);
      toast.error(`Execution failed: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ── Left Tools Catalog ──────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r bg-card/20 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Code2Icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Registered Tools
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Native device capabilities
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-3">
          <div className="flex flex-col gap-2">
            {resolvedTools.map((t) => {
              const isSelected = selectedTool === t.name;
              return (
                <div
                  key={t.name}
                  onClick={() => setSelectedTool(t.name)}
                  className={`group flex flex-col gap-1 rounded-lg border p-3 text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary/50 bg-accent text-accent-foreground shadow-xs'
                      : 'border-border/60 bg-card/40 hover:bg-accent/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-foreground group-hover:text-primary">
                      {t.name}
                    </span>
                    <Badge
                      variant={t.requiresApproval ? 'destructive' : 'secondary'}
                      className="text-[9px] px-1.5 py-0 h-4 uppercase font-mono"
                    >
                      {t.requiresApproval ? 'Approval' : 'Auto'}
                    </Badge>
                  </div>
                  <p className="text-[11px] line-clamp-2 leading-relaxed opacity-80">
                    {t.description}
                  </p>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right Sandbox Testing Area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 bg-background">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
          {/* Tool Details Card */}
          <Card className="border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {currentTool.category === 'Terminal' && (
                      <TerminalIcon className="h-4 w-4" />
                    )}
                    {currentTool.category === 'Filesystem' && (
                      <FolderIcon className="h-4 w-4" />
                    )}
                    {currentTool.category === 'Clipboard' && (
                      <ClipboardIcon className="h-4 w-4" />
                    )}
                    {currentTool.category === 'RAG' && (
                      <FileSearchIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base font-mono">
                      {currentTool.name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {currentTool.description}
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <SparklesIcon className="h-3 w-3 text-amber-500" />
                    <span>Category: {currentTool.category}</span>
                  </Badge>

                  {currentTool.requiresApproval ? (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <ShieldAlertIcon className="h-3 w-3" />
                      <span>Requires Approval</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-xs gap-1 text-emerald-600 dark:text-emerald-400"
                    >
                      <ShieldCheckIcon className="h-3 w-3" />
                      <span>Autonomous Execution</span>
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              {currentTool.defaultParam.key !== 'none' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {currentTool.defaultParam.label}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                      placeholder={currentTool.defaultParam.placeholder}
                      className="font-mono text-xs bg-muted/30"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExecute();
                      }}
                    />
                    <Button
                      onClick={handleExecute}
                      disabled={isRunning}
                      className="shrink-0 gap-1.5 text-xs"
                      size="sm"
                    >
                      <PlayIcon className="h-3 w-3" />
                      <span>{isRunning ? 'Running…' : 'Execute'}</span>
                    </Button>
                  </div>
                </div>
              )}

              {currentTool.defaultParam.key === 'none' && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    This tool reads system state without requiring input
                    arguments.
                  </span>
                  <Button
                    onClick={handleExecute}
                    disabled={isRunning}
                    className="shrink-0 gap-1.5 text-xs"
                    size="sm"
                  >
                    <PlayIcon className="h-3 w-3" />
                    <span>{isRunning ? 'Reading…' : 'Execute Tool'}</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Result Output Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Live Execution Output
              </span>
              {lastSuccess !== null && (
                <Badge
                  variant={lastSuccess ? 'secondary' : 'destructive'}
                  className="text-[10px] gap-1"
                >
                  {lastSuccess ? (
                    <>
                      <CheckCircle2Icon className="h-3 w-3 text-emerald-500" />
                      <span>Success</span>
                    </>
                  ) : (
                    <span>Failed</span>
                  )}
                </Badge>
              )}
            </div>

            <Terminal
              output={
                outputResult ||
                '// Press "Execute" to run the tool and inspect live output.'
              }
            >
              <TerminalHeader>
                <TerminalTitle>
                  $ {currentTool.name}({paramValue || ''})
                </TerminalTitle>
              </TerminalHeader>
              <TerminalContent />
            </Terminal>
          </div>
        </div>
      </div>
    </div>
  );
}
