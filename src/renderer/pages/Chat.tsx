/**
 * renderer/pages/Chat.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main chat interface. Navigation between conversations lives in the rail
 * (ChatMenu); this page is a thin view over the active `/chat/:sessionId`:
 * route params select the session, and the messages come from `useAgentChat`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatWelcome } from '@/components/chat/ChatWelcome';
import { ChatContextPicker } from '@/components/chat/ChatContextPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2Icon, AlertCircleIcon, XIcon, GlobeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { AssetSearchDialog } from '@/components/resources/AssetSearchDialog';
import type { ChatContext, AgentIntent, DownloadResourceResult } from '../../main/ipc/channels';

export interface ChatLocationState {
  chatContext?: ChatContext;
  /** A prompt to auto-send once this chat's session is bound (notebook dialog). */
  initialPrompt?: string;
  /**
   * Declares the turn's operating mode. Set by surfaces that already know
   * they are, so the notebook protocol does not depend on prompt wording.
   */
  intent?: AgentIntent;
}

interface SessionSummary {
  id: string;
  title: string;
}

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const {
    projectId,
    projectName,
    clear: clearProjectScope,
    withScope,
  } = useProjectScope();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | undefined>(
    undefined,
  );

  const handleAssetDownloaded = (res: DownloadResourceResult) => {
    if (!res.fileName) return;
    toast.success(`Asset downloaded: ${res.fileName}`);
  };

  // The chat agent receives the active project so its answers can assume this
  // is the current context of work. Merged, so a handover context (page/notebook)
  // and the URL scope coexist.
  useEffect(() => {
    setChatContext((prev) => {
      if (projectId) return { ...prev, projectId };
      if (!prev?.projectId) return prev;
      const copy = { ...prev };
      delete copy.projectId;
      return Object.keys(copy).length ? (copy as ChatContext) : undefined;
    });
  }, [projectId]);
  // A message typed before a session exists is queued here and sent once the
  // session created for it has been bound to the route.
  const pendingSendRef = useRef<string | null>(null);
  // Set while the first message is being turned into a session, so a second
  // submit cannot start a competing one.
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  // Guards the one-shot auto-send of an `initialPrompt` handed over via state.
  const initialPromptSentRef = useRef(false);
  // Held in state rather than read off `location.state`, because the auto-send
  // effect clears that state to avoid a replay on remount — and the mode has to
  // survive the clear so the follow-up turns are covered too.
  //
  // The lazy initializer is load-bearing, not stylistic: the intent has to be
  // correct on the FIRST render, because the one-shot auto-send effect below
  // fires in that same commit. Reading it via an effect would leave the
  // generating turn with no intent — i.e. exactly the turn that needs it.
  const [intent, setIntent] = useState<AgentIntent | undefined>(
    () => (location.state as ChatLocationState | null)?.intent,
  );

  // A page can hand over chat context via navigate('/chat', { state }).
  useEffect(() => {
    const state = location.state as ChatLocationState | null;
    if (state?.chatContext) {
      setChatContext((prev) => ({ ...prev, ...state.chatContext }));
    }
    if (state?.intent) setIntent(state.intent);
  }, [location.state]);

  // Keep the breadcrumb title in sync with the active session.
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const list =
          await window.electron.ipc.invoke<SessionSummary[]>('sessions:list');
        const found = list?.find((s) => s.id === sessionId);
        if (!cancelled) setSessionTitle(found?.title ?? '');
      } catch {
        if (!cancelled) setSessionTitle('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useAgentChat({
    sessionId: sessionId ?? '',
    initialMessages: [],
    context: chatContext,
    intent,
  });

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Flush a queued message once the session exists.
  useEffect(() => {
    if (!sessionId || !pendingSendRef.current) return;
    const queued = pendingSendRef.current;
    pendingSendRef.current = null;
    sendMessage(queued);
  }, [sessionId, sendMessage]);

  /** Give a default-titled conversation its first line as a title. */
  const maybeAutoTitle = (text: string) => {
    if (!sessionId) return;
    if (sessionTitle === 'New Chat' || sessionTitle === '') {
      const title = text.slice(0, 32).trim();
      setSessionTitle(title);
      window.electron.ipc
        .invoke('sessions:rename', { id: sessionId, title })
        .catch(() => {
          // Cosmetic only.
        });
    }
  };

  // The first message is what brings a conversation into existence: it creates
  // the session, titles it from the message, then hands the text to the flush
  // effect below, which runs once the new `:sessionId` has been bound.
  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || creatingRef.current) return;

    if (sessionId) {
      maybeAutoTitle(trimmed);
      sendMessage(trimmed);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    void (async () => {
      try {
        const title = trimmed.slice(0, 32).trim();
        const session = await window.electron.ipc.invoke<{ id: string }>(
          'sessions:create',
          { title, projectId: projectId ?? null },
        );
        setSessionTitle(title);
        pendingSendRef.current = trimmed;
        navigate(withScope(`/chat/${session.id}`), { replace: true });
      } catch {
        toast.error('Failed to start a new session.');
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    })();
  };

  // Auto-send a prompt handed over by the notebook dialog. The session was
  // already titled by the dialog, so no auto-titling happens here.
  useEffect(() => {
    if (!sessionId || initialPromptSentRef.current) return;
    const state = location.state as ChatLocationState | null;
    const prompt = state?.initialPrompt;
    if (!prompt) return;
    initialPromptSentRef.current = true;
    sendMessage(prompt);
    // Clear the state so a remount does not replay the prompt.
    navigate(location.pathname, { replace: true, state: null });
  }, [sessionId, location.state, location.pathname, navigate, sendMessage]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <PageHeader
        crumbs={[
          { label: 'Chat', to: withScope('/chat') },
          ...(projectName ? [{ label: projectName }] : []),
          { label: sessionTitle || 'New conversation' },
        ]}
        actions={
          <>
            <ProjectScopeChip name={projectName} onClear={clearProjectScope} />
            {messages.length > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 font-mono text-[10px] text-muted-foreground"
              >
                {messages.length} {messages.length === 1 ? 'msg' : 'msgs'}
              </Badge>
            )}
            <ChatContextPicker
              value={chatContext}
              onChange={(ctx) =>
                setChatContext((prev) => {
                  // The picker owns page/notebook context; the project scope is
                  // owned by the URL (see useProjectScope) and survives here.
                  const merged = { projectId: prev?.projectId, ...ctx };
                  return Object.values(merged).some(Boolean)
                    ? (merged as ChatContext)
                    : undefined;
                })
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAssetModalOpen(true)}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground border-border/60"
              title="Search and download web assets via Serper"
            >
              <GlobeIcon className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Web Assets</span>
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                title="Clear messages in view"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </>
        }
      />

      {/* Middle Message / Welcome Area. On an empty conversation the welcome
          view owns the composer, so the docked bar below is suppressed. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatWelcome
            onSend={handleSend}
            disabled={creating}
            isStreaming={status === 'streaming'}
          />
        ) : (
          <div className="mx-auto max-w-4xl">
            <MessageList
              messages={messages}
              status={status}
              error={error}
              onApproval={respondToApproval}
            />
          </div>
        )}
      </div>

      {/* Provider fallback notice */}
      {fallbackNotice && (
        <div className="mx-auto flex w-full max-w-4xl items-start gap-2 px-4 pb-2">
          <Alert className="flex-1 border-amber-500/40 bg-amber-500/5 py-2">
            <AlertCircleIcon className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-xs">
              <span className="font-medium">{fallbackNotice.fromProvider}</span>{' '}
              was unavailable ({fallbackNotice.reason}) — this reply is coming
              from{' '}
              <span className="font-medium">{fallbackNotice.toProvider}</span>{' '}
              <span className="font-mono text-[11px]">
                {fallbackNotice.toModel}
              </span>
              .
            </AlertDescription>
            <button
              type="button"
              onClick={dismissFallbackNotice}
              aria-label="Dismiss fallback notice"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </Alert>
        </div>
      )}

      {/* Docked prompt input — only once the conversation has content, since
          the empty state renders its own centred composer. */}
      {messages.length > 0 && (
        <div className="border-t bg-card/30 p-3 backdrop-blur-xs sm:p-4">
          <div className="mx-auto max-w-4xl">
            <ChatInput
              onSend={handleSend}
              disabled={creating || status === 'streaming'}
              isStreaming={status === 'streaming'}
              placeholder="Ask a follow up question… (Enter to send, Shift+Enter for newline)"
            />
          </div>
        </div>
      )}

      <AssetSearchDialog
        open={isAssetModalOpen}
        onOpenChange={setIsAssetModalOpen}
        projectId={projectId}
        onAssetDownloaded={handleAssetDownloaded}
      />
    </div>
  );
}
