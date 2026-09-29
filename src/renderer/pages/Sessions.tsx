/**
 * renderer/pages/Sessions.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Session History and SQLite Database Management page.
 *
 * Allows viewing all persisted chats, exporting to markdown, and managing history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  MessageSquareIcon,
  SearchIcon,
  Trash2Icon,
  DownloadIcon,
  DatabaseIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  HistoryIcon,
  CalendarIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface Session {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();

  const loadSessions = async () => {
    try {
      const data = await window.electron.ipc.invoke<Session[]>('sessions:list');
      setSessions(data || []);
    } catch {
      toast.error('Failed to load sessions from SQLite.');
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electron.ipc.invoke('sessions:delete', { id });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success('Session deleted.');
    } catch {
      toast.error('Failed to delete session.');
    }
  };

  const handleExport = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const messages = await window.electron.ipc.invoke<any[]>(
        'sessions:messages',
        { id: session.id },
      );
      let md = `# ${session.title}\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

      for (const m of messages) {
        md += `### ${m.role === 'user' ? '👤 User' : '🤖 Assistant'}\n`;
        for (const p of m.parts || []) {
          if (p.type === 'text') {
            md += `${p.text}\n\n`;
          } else if (
            p.type === 'tool-invocation' ||
            p.type?.startsWith?.('tool-')
          ) {
            const name = p.toolName || p.type.replace(/^tool-/, '');
            md += `> **Tool Execution: \`${name}\`**\n`;
            md += `> \`\`\`json\n> ${JSON.stringify(p.input, null, 2)}\n> \`\`\`\n\n`;
          }
        }
      }

      // Download file in browser
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Session exported to Markdown!');
    } catch {
      toast.error('Failed to export session.');
    }
  };

  // The dynamic /sessions/:sessionId route renders the detail view in place.
  if (sessionId) {
    return (
      <SessionDetail
        key={sessionId}
        sessionId={sessionId}
        session={sessions.find((s) => s.id === sessionId)}
        onBack={() => navigate('/sessions')}
      />
    );
  }

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background p-6">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        {/* ── Top Header & Stats ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-primary" />
              <span>Conversation History</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              All agent runs and chat histories persisted locally in SQLite.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate('/chat')}
              size="sm"
              className="gap-1.5 text-xs shadow-xs"
            >
              <MessageSquareIcon className="h-3.5 w-3.5" />
              <span>Go to Chat</span>
            </Button>
          </div>
        </div>

        {/* ── Metric Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <MessageSquareIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Sessions</p>
                <h3 className="text-lg font-bold text-foreground">
                  {sessions.length}
                </h3>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <DatabaseIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Storage Engine</p>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-foreground">
                    SQLite 3
                  </h3>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1 text-emerald-500 border-emerald-500/30"
                  >
                    WAL mode
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Synced</p>
                <h3 className="text-xs font-semibold text-foreground">
                  {sessions[0]?.updated_at
                    ? new Date(
                        sessions[0].updated_at * 1000,
                      ).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Just now'}
                </h3>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Search & Filter ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversation titles…"
              className="pl-9 text-xs h-9 bg-card/50"
            />
          </div>
        </div>

        {/* ── Sessions List / Table ─────────────────────────────────────────── */}
        <Card className="border bg-card/40 overflow-hidden">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <MessageSquareIcon className="h-10 w-10 mb-2 stroke-1 opacity-40" />
              <p className="text-sm font-medium">No sessions found</p>
              <p className="text-xs mt-1">
                Start a new chat to begin recording sessions.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => navigate(`/sessions/${session.id}`)}
                  className="group flex items-center justify-between p-4 hover:bg-accent/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MessageSquareIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {session.title}
                      </h4>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        ID: {session.id.slice(0, 8)}…
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleExport(session, e)}
                      className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Export as Markdown"
                    >
                      <DownloadIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(session.id, e)}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/sessions/${session.id}`);
                      }}
                    >
                      <span>Open</span>
                      <ArrowRightIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Session detail (/sessions/:sessionId) ───────────────────────────────────

interface StoredPart {
  type: string;
  text?: string;
  toolName?: string;
  input?: unknown;
}

interface StoredMessage {
  id: string;
  role: string;
  parts?: StoredPart[];
}

function SessionDetail({
  sessionId,
  session,
  onBack,
}: {
  sessionId: string;
  session: Session | undefined;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.electron.ipc.invoke<StoredMessage[]>(
          'sessions:messages',
          { id: sessionId },
        );
        if (!cancelled) setMessages(data ?? []);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background p-6">
      <div className="max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onBack}
              aria-label="Back to session history"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
                {session?.title || 'Session'}
              </h1>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                ID: {sessionId}
                {session?.created_at
                  ? ` · ${new Date(session.created_at * 1000).toLocaleString()}`
                  : ''}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => navigate(`/chat/${sessionId}`)}
          >
            <MessageSquareIcon className="h-3.5 w-3.5" />
            <span>Open in Chat</span>
          </Button>
        </div>

        {/* Messages */}
        <Card className="border bg-card/40 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Loading transcript…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <MessageSquareIcon className="h-10 w-10 mb-2 stroke-1 opacity-40" />
              <p className="text-sm font-medium">No messages recorded</p>
              <p className="text-xs mt-1">
                This session has no persisted transcript yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((m) => (
                <div key={m.id} className="p-4 space-y-1.5">
                  <Badge
                    variant={m.role === 'user' ? 'secondary' : 'outline'}
                    className="text-[10px] uppercase font-mono h-4 px-1.5"
                  >
                    {m.role}
                  </Badge>
                  {(m.parts ?? []).map((p, i) => {
                    if (p.type === 'text') {
                      return (
                        <p
                          key={i}
                          className="text-xs whitespace-pre-wrap text-foreground/90"
                        >
                          {p.text}
                        </p>
                      );
                    }
                    if (
                      p.type === 'tool-invocation' ||
                      p.type.startsWith('tool-')
                    ) {
                      const name = p.toolName || p.type.replace(/^tool-/, '');
                      return (
                        <pre
                          key={i}
                          className="rounded-md bg-muted/40 p-2 text-[11px] font-mono overflow-x-auto"
                        >
                          {`tool: ${name}\n${JSON.stringify(p.input ?? {}, null, 2)}`}
                        </pre>
                      );
                    }
                    return null;
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
