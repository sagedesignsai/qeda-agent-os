/**
 * components/settings/views/BuilderMcpView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → "Builder & MCP": engine selection, MCP server CRUD, and live
 * connection status.
 *
 * Design decisions:
 *
 * 1. Engine selection (Local vs OpenCode) is a single radio-style toggle. The
 *    choice is saved immediately via `settings:save` so it takes effect on the
 *    next `builder:session-create` without requiring a full dialog save.
 *
 * 2. MCP server list is edited in a side-sheet form. Secrets (env values,
 *    headers) are write-only from the renderer: the "set" indicator is a
 *    boolean from `hasEnv`/`hasHeaders`; the actual values are never sent
 *    over IPC back to the renderer.
 *
 * 3. "Test connection" fires `mcp:test-server` with the current form state,
 *    which the main process handles via a one-off probe that never persists.
 *    This means you can test a config before saving it.
 *
 * 4. A "Reload connections" action fires `mcp:reload` after a save, re-
 *    connecting enabled servers with the latest settings.
 *
 * 5. The MCP_SERVER_PRESETS gallery provides one-click bootstrapping for
 *    common servers (GitHub, Fetch, Memory, SQLite, Context7).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  PlusIcon,
  Trash2Icon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ZapIcon,
  ServerIcon,
  WifiOffIcon,
  LoaderIcon,
  KeyIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../settings-store';
import type {
  McpServerSettings,
  McpTransportKind,
  McpTestResult,
  McpServerStatus,
  McpServerPreset,
  BuilderEngine,
} from '@/main/ipc/channels';
import { MCP_SERVER_PRESETS } from '@/lib/builder-engine';
import { nanoid } from 'nanoid';

// ─── Engine toggle ────────────────────────────────────────────────────────────

const ENGINE_OPTIONS: {
  value: BuilderEngine;
  label: string;
  description: string;
}[] = [
  {
    value: 'local',
    label: 'Local Agent',
    description:
      'Native Qeda ToolLoopAgent — no external process required. Uses your configured AI provider + workspace coding tools + MCP servers.',
  },
  {
    value: 'opencode',
    label: 'OpenCode',
    description:
      'Attach to a running OpenCode v2 service for its server-side tooling, session history, and Zen models.',
  },
];

function EngineCard({
  option,
  selected,
  onSelect,
}: {
  option: (typeof ENGINE_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3 text-left transition-all',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border bg-card hover:border-border/80 hover:bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-primary' : 'border-muted-foreground/50',
          )}
        >
          {selected && (
            <div className="size-1.5 rounded-full bg-primary" />
          )}
        </div>
        <span className="text-sm font-medium">{option.label}</span>
        {option.value === 'local' && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            Recommended
          </Badge>
        )}
      </div>
      <p className="pl-6 text-xs text-muted-foreground leading-relaxed">
        {option.description}
      </p>
    </button>
  );
}

// ─── MCP server form ──────────────────────────────────────────────────────────

const EMPTY_SERVER: Omit<McpServerSettings, 'id'> = {
  name: '',
  enabled: true,
  transport: 'stdio',
  command: '',
  args: [],
  cwd: '',
  url: '',
  env: {},
  headers: {},
};

interface EnvEntry {
  key: string;
  value: string;
}

function entriesToRecord(entries: EnvEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

interface McpServerFormState {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransportKind;
  command: string;
  args: string; // space-separated for UI simplicity
  cwd: string;
  url: string;
  envEntries: EnvEntry[];
  headerEntries: EnvEntry[];
}

function formStateToSettings(s: McpServerFormState): McpServerSettings {
  return {
    id: s.id,
    name: s.name.trim() || 'Unnamed Server',
    enabled: s.enabled,
    transport: s.transport,
    command: s.command.trim() || undefined,
    args: s.args.trim()
      ? s.args.trim().split(/\s+/).filter(Boolean)
      : undefined,
    cwd: s.cwd.trim() || undefined,
    url: s.url.trim() || undefined,
    env:
      s.envEntries.length > 0 ? entriesToRecord(s.envEntries) : undefined,
    headers:
      s.headerEntries.length > 0 ? entriesToRecord(s.headerEntries) : undefined,
  };
}

function settingsToFormState(
  srv: Partial<McpServerSettings> & { hasEnv?: boolean; hasHeaders?: boolean },
  id: string,
): McpServerFormState {
  return {
    id,
    name: srv.name ?? '',
    enabled: srv.enabled !== false,
    transport: srv.transport ?? 'stdio',
    command: srv.command ?? '',
    args: (srv.args ?? []).join(' '),
    cwd: srv.cwd ?? '',
    url: srv.url ?? '',
    // If secrets are set but values stripped, show one placeholder entry
    envEntries: srv.hasEnv ? [{ key: '', value: '' }] : [],
    headerEntries: srv.hasHeaders ? [{ key: '', value: '' }] : [],
  };
}

function presetToFormState(preset: McpServerPreset): McpServerFormState {
  return {
    id: `${preset.id}-${Date.now()}`,
    name: preset.name,
    enabled: true,
    transport: preset.transport,
    command: preset.command ?? '',
    args: (preset.args ?? []).join(' '),
    cwd: '',
    url: preset.url ?? '',
    envEntries:
      preset.env
        ? Object.entries(preset.env).map(([key, value]) => ({ key, value }))
        : [],
    headerEntries:
      preset.headers
        ? Object.entries(preset.headers).map(([key, value]) => ({ key, value }))
        : [],
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ state }: { state: McpServerStatus['state'] }) {
  if (state === 'connected') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-500">
        <CheckCircleIcon className="size-3" />
        Connected
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-amber-500">
        <LoaderIcon className="size-3 animate-spin" />
        Connecting
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-destructive">
        <XCircleIcon className="size-3" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <WifiOffIcon className="size-3" />
      Disabled
    </span>
  );
}

// ─── Server row ───────────────────────────────────────────────────────────────

function ServerRow({
  srv,
  status,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  srv: McpServerFormState;
  status?: McpServerStatus;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2">
      <Switch
        id={`mcp-enabled-${srv.id}`}
        checked={srv.enabled}
        onCheckedChange={onToggleEnabled}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {srv.name || 'Unnamed Server'}
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px] font-mono">
            {srv.transport}
          </Badge>
          {status && <StatusBadge state={status.state} />}
          {status?.toolsCount ? (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {status.toolsCount} tool{status.toolsCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {srv.transport === 'stdio'
            ? [srv.command, srv.args].filter(Boolean).join(' ')
            : srv.url}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onEdit}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
}

// ─── Server edit form ─────────────────────────────────────────────────────────

function ServerEditForm({
  form,
  onChange,
  onTest,
  testResult,
  testing,
  onClose,
}: {
  form: McpServerFormState;
  onChange: (update: Partial<McpServerFormState>) => void;
  onTest: () => void;
  testResult: McpTestResult | null;
  testing: boolean;
  onClose: () => void;
}) {
  const isStdio = form.transport === 'stdio';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <ChevronDownIcon className="size-3.5" />
        </Button>
        <span className="text-sm font-medium">
          {form.name || 'New MCP Server'}
        </span>
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
        {/* Name + Transport */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`mcpname-${form.id}`} className="text-xs">
              Name
            </Label>
            <Input
              id={`mcpname-${form.id}`}
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="GitHub MCP"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mcptransport-${form.id}`} className="text-xs">
              Transport
            </Label>
            <Select
              value={form.transport}
              onValueChange={(v) =>
                onChange({ transport: v as McpTransportKind })
              }
            >
              <SelectTrigger
                id={`mcptransport-${form.id}`}
                className="h-7 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio" className="text-xs">
                  stdio
                </SelectItem>
                <SelectItem value="http" className="text-xs">
                  HTTP (SSE)
                </SelectItem>
                <SelectItem value="sse" className="text-xs">
                  SSE (legacy)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* stdio fields */}
        {isStdio && (
          <>
            <div className="space-y-1">
              <Label htmlFor={`mcpcmd-${form.id}`} className="text-xs">
                Command
              </Label>
              <Input
                id={`mcpcmd-${form.id}`}
                value={form.command}
                onChange={(e) => onChange({ command: e.target.value })}
                placeholder="npx"
                className="h-7 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`mcpargs-${form.id}`} className="text-xs">
                Arguments{' '}
                <span className="text-muted-foreground">(space-separated)</span>
              </Label>
              <Input
                id={`mcpargs-${form.id}`}
                value={form.args}
                onChange={(e) => onChange({ args: e.target.value })}
                placeholder="-y @modelcontextprotocol/server-github"
                className="h-7 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`mcpcwd-${form.id}`} className="text-xs">
                Working directory{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`mcpcwd-${form.id}`}
                value={form.cwd}
                onChange={(e) => onChange({ cwd: e.target.value })}
                placeholder="/path/to/workspace"
                className="h-7 font-mono text-xs"
              />
            </div>
          </>
        )}

        {/* HTTP/SSE URL */}
        {!isStdio && (
          <div className="space-y-1">
            <Label htmlFor={`mcpurl-${form.id}`} className="text-xs">
              Endpoint URL
            </Label>
            <Input
              id={`mcpurl-${form.id}`}
              value={form.url}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://mcp.example.com/sse"
              className="h-7 font-mono text-xs"
            />
          </div>
        )}

        {/* Env vars */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1 text-xs">
              <KeyIcon className="size-3" />
              Environment variables{' '}
              <span className="text-muted-foreground">(secrets)</span>
            </Label>
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() =>
                onChange({
                  envEntries: [...form.envEntries, { key: '', value: '' }],
                })
              }
            >
              <PlusIcon className="size-3" />
            </Button>
          </div>
          <div className="space-y-1">
            {form.envEntries.map((entry, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  value={entry.key}
                  onChange={(e) => {
                    const next = [...form.envEntries];
                    next[i] = { ...next[i], key: e.target.value };
                    onChange({ envEntries: next });
                  }}
                  placeholder="KEY"
                  className="h-6 flex-1 font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">=</span>
                <Input
                  type="password"
                  value={entry.value}
                  onChange={(e) => {
                    const next = [...form.envEntries];
                    next[i] = { ...next[i], value: e.target.value };
                    onChange({ envEntries: next });
                  }}
                  placeholder="value"
                  className="h-6 flex-1 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => {
                    const next = form.envEntries.filter((_, j) => j !== i);
                    onChange({ envEntries: next });
                  }}
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Headers (HTTP/SSE only) */}
        {!isStdio && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1 text-xs">
                <KeyIcon className="size-3" />
                HTTP headers{' '}
                <span className="text-muted-foreground">(secrets)</span>
              </Label>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() =>
                  onChange({
                    headerEntries: [
                      ...form.headerEntries,
                      { key: '', value: '' },
                    ],
                  })
                }
              >
                <PlusIcon className="size-3" />
              </Button>
            </div>
            <div className="space-y-1">
              {form.headerEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    value={entry.key}
                    onChange={(e) => {
                      const next = [...form.headerEntries];
                      next[i] = { ...next[i], key: e.target.value };
                      onChange({ headerEntries: next });
                    }}
                    placeholder="Authorization"
                    className="h-6 flex-1 font-mono text-xs"
                  />
                  <span className="text-xs text-muted-foreground">:</span>
                  <Input
                    type="password"
                    value={entry.value}
                    onChange={(e) => {
                      const next = [...form.headerEntries];
                      next[i] = { ...next[i], value: e.target.value };
                      onChange({ headerEntries: next });
                    }}
                    placeholder="Bearer token"
                    className="h-6 flex-1 font-mono text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => {
                      const next = form.headerEntries.filter(
                        (_, j) => j !== i,
                      );
                      onChange({ headerEntries: next });
                    }}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test button + result */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onTest}
            disabled={testing}
          >
            {testing ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <PlayIcon className="size-3" />
            )}
            Test connection
          </Button>
          {testResult && (
            <span
              className={cn(
                'flex items-center gap-1 text-[11px]',
                testResult.success ? 'text-emerald-500' : 'text-destructive',
              )}
            >
              {testResult.success ? (
                <CheckCircleIcon className="size-3" />
              ) : (
                <XCircleIcon className="size-3" />
              )}
              {testResult.success
                ? `${testResult.tools.length} tool${testResult.tools.length === 1 ? '' : 's'} discovered`
                : testResult.message.slice(0, 60)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Presets gallery ──────────────────────────────────────────────────────────

function PresetGallery({
  onSelect,
}: {
  onSelect: (preset: McpServerPreset) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        <ZapIcon className="size-3" />
        Quick-add from presets
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-1.5">
          {MCP_SERVER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              className={cn(
                'flex flex-col gap-0.5 rounded-md border border-border/60 bg-card p-2 text-left text-xs transition-colors',
                'hover:border-primary/40 hover:bg-primary/5',
              )}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="line-clamp-2 text-[10px] text-muted-foreground leading-relaxed">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function BuilderMcpView() {
  const { snapshot, saving, save } = useSettingsStore();

  const [engine, setEngine] = useState<BuilderEngine>('local');
  const [servers, setServers] = useState<McpServerFormState[]>([]);
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, McpTestResult>
  >({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [reloading, setReloading] = useState(false);

  // Seed once from snapshot
  const seeded = { current: false };
  useEffect(() => {
    if (!snapshot || seeded.current) return;
    seeded.current = true;
    setEngine(snapshot.builderEngine ?? 'local');
    setServers(
      (snapshot.mcpServers ?? []).map((s) =>
        settingsToFormState(s, s.id),
      ),
    );
  }, [snapshot]);

  // Load live statuses
  useEffect(() => {
    window.electron.ipc
      .invoke<McpServerStatus[]>('mcp:statuses')
      .then(setStatuses)
      .catch(() => undefined);
  }, []);

  const handleEngineSave = useCallback(
    async (next: BuilderEngine) => {
      setEngine(next);
      try {
        await save({ builderEngine: next });
        toast.success(`Builder engine switched to "${next === 'local' ? 'Local Agent' : 'OpenCode'}".`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to save engine.',
        );
      }
    },
    [save],
  );

  const buildMcpServerList = useCallback(
    (current: McpServerFormState[]): McpServerSettings[] =>
      current.map(formStateToSettings),
    [],
  );

  const handleServersSave = useCallback(
    async (current: McpServerFormState[]) => {
      try {
        await save({ mcpServers: buildMcpServerList(current) });
        // Reload live connections after persisting.
        const res = await window.electron.ipc.invoke<{ activeCount: number }>(
          'mcp:reload',
        );
        // Refresh statuses
        const freshStatuses = await window.electron.ipc.invoke<
          McpServerStatus[]
        >('mcp:statuses');
        setStatuses(freshStatuses);
        toast.success(
          `MCP servers saved. ${res.activeCount} active connection${res.activeCount === 1 ? '' : 's'}.`,
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to save MCP servers.',
        );
      }
    },
    [save, buildMcpServerList],
  );

  const handleAddServer = useCallback(() => {
    const id = `srv-${nanoid(6)}`;
    const newServer: McpServerFormState = {
      ...settingsToFormState({ ...EMPTY_SERVER }, id),
      id,
    };
    const next = [...servers, newServer];
    setServers(next);
    setEditingId(id);
  }, [servers]);

  const handleAddPreset = useCallback(
    (preset: McpServerPreset) => {
      const form = presetToFormState(preset);
      const next = [...servers, form];
      setServers(next);
      setEditingId(form.id);
    },
    [servers],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const next = servers.filter((s) => s.id !== id);
      setServers(next);
      if (editingId === id) setEditingId(null);
      await handleServersSave(next);
    },
    [servers, editingId, handleServersSave],
  );

  const handleToggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const next = servers.map((s) => (s.id === id ? { ...s, enabled } : s));
      setServers(next);
      await handleServersSave(next);
    },
    [servers, handleServersSave],
  );

  const handleFormChange = useCallback(
    (id: string, update: Partial<McpServerFormState>) => {
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  const handleTest = useCallback(
    async (id: string) => {
      const form = servers.find((s) => s.id === id);
      if (!form) return;
      setTesting((prev) => ({ ...prev, [id]: true }));
      try {
        const result = await window.electron.ipc.invoke<McpTestResult>(
          'mcp:test-server',
          formStateToSettings(form),
        );
        setTestResults((prev) => ({ ...prev, [id]: result }));
        if (!result.success) {
          toast.error(`Connection failed: ${result.message}`);
        }
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [id]: {
            success: false,
            message: err instanceof Error ? err.message : String(err),
            tools: [],
          },
        }));
      } finally {
        setTesting((prev) => ({ ...prev, [id]: false }));
      }
    },
    [servers],
  );

  const handleReload = useCallback(async () => {
    setReloading(true);
    try {
      const res = await window.electron.ipc.invoke<{ activeCount: number }>(
        'mcp:reload',
      );
      const fresh = await window.electron.ipc.invoke<McpServerStatus[]>(
        'mcp:statuses',
      );
      setStatuses(fresh);
      toast.success(
        `Reconnected. ${res.activeCount} active server${res.activeCount === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reload failed.');
    } finally {
      setReloading(false);
    }
  }, []);

  const handleSaveAndClose = useCallback(async () => {
    await handleServersSave(servers);
    setEditingId(null);
  }, [servers, handleServersSave]);

  if (!snapshot) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
      </div>
    );
  }

  const editing = editingId ? servers.find((s) => s.id === editingId) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        {/* ── Engine selection ──────────────────────────────────────────── */}
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Builder Engine</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Controls which agent runtime processes your coding prompts. Takes
              effect when you open your next Builder session.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ENGINE_OPTIONS.map((opt) => (
              <EngineCard
                key={opt.value}
                option={opt}
                selected={engine === opt.value}
                onSelect={() => {
                  if (engine !== opt.value) handleEngineSave(opt.value);
                }}
              />
            ))}
          </div>
        </section>

        <Separator />

        {/* ── MCP servers ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <h3 className="text-sm font-medium">MCP Servers</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Model Context Protocol servers extend the Local Builder agent
                with external tools — file systems, APIs, databases, and more.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={handleReload}
                  disabled={reloading}
                >
                  <RefreshCwIcon
                    className={cn('size-3.5', reloading && 'animate-spin')}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Reload connections
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Edit form (inline, replaces row) */}
          {editing ? (
            <>
              <ServerEditForm
                form={editing}
                onChange={(update) => handleFormChange(editing.id, update)}
                onTest={() => handleTest(editing.id)}
                testResult={testResults[editing.id] ?? null}
                testing={testing[editing.id] ?? false}
                onClose={handleSaveAndClose}
              />
              <Button
                variant="default"
                size="sm"
                className="w-full h-7 text-xs gap-1.5"
                onClick={handleSaveAndClose}
                disabled={saving}
              >
                {saving ? (
                  <LoaderIcon className="size-3 animate-spin" />
                ) : (
                  <CheckCircleIcon className="size-3" />
                )}
                Save server
              </Button>
            </>
          ) : (
            <>
              {/* Server rows */}
              <div className="space-y-1.5">
                {servers.length === 0 && (
                  <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/60 py-6 text-center">
                    <ServerIcon className="size-5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      No MCP servers configured yet.
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      Add one manually or pick a preset below.
                    </p>
                  </div>
                )}
                {servers.map((srv) => {
                  const st = statuses.find((s) => s.id === srv.id);
                  return (
                    <ServerRow
                      key={srv.id}
                      srv={srv}
                      status={st}
                      onEdit={() => setEditingId(srv.id)}
                      onDelete={() => handleDelete(srv.id)}
                      onToggleEnabled={(enabled) =>
                        handleToggleEnabled(srv.id, enabled)
                      }
                    />
                  );
                })}
              </div>

              {/* Add new server */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 gap-1.5 text-xs"
                onClick={handleAddServer}
              >
                <PlusIcon className="size-3" />
                Add MCP server
              </Button>

              {/* Preset gallery */}
              <PresetGallery onSelect={handleAddPreset} />
            </>
          )}
        </section>

        {/* ── OpenCode note ─────────────────────────────────────────────── */}
        {engine === 'opencode' && (
          <>
            <Separator />
            <section>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">OpenCode service required</p>
                  <p className="text-muted-foreground">
                    OpenCode must be installed and running on your machine.
                    MCP servers configured above are only used by the Local
                    Agent engine; OpenCode manages its own tool set.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
