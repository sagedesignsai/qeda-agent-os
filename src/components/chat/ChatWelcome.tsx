/**
 * components/chat/ChatWelcome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The empty state: a single centred question, the composer as the centrepiece,
 * and a row of suggestion chips.
 *
 * The composer moves *into* this view rather than sitting in a docked bar, so
 * on an empty conversation there is exactly one input and it is the focal
 * point. `Chat.tsx` hides the docked composer while this is shown.
 *
 * Chips carry a short label but send a full prompt, which keeps the row
 * scannable while still giving the agent real instructions to work from.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import {
  FolderIcon,
  TerminalIcon,
  ClipboardIcon,
  SparklesIcon,
  NotebookPenIcon,
  ChevronDownIcon,
  type LucideIcon,
} from 'lucide-react';
import { useGenerateNotebook } from '@/components/GenerateNotebookDialog';
import { QedaLogomark } from '@/components/QedaLogo';
import { useIpcEvent } from '@/hooks/use-ipc';

interface ChatWelcomeProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

interface Suggestion {
  label: string;
  prompt: string;
  icon: LucideIcon;
}

const SUGGESTIONS: Suggestion[] = [
  {
    label: 'Inspect project',
    icon: FolderIcon,
    prompt:
      'List the files in the current workspace directory and summarize what this project does.',
  },
  {
    label: 'Run a command',
    icon: TerminalIcon,
    prompt:
      'Run `git status` in the terminal and tell me which files have changed.',
  },
  {
    label: 'Read clipboard',
    icon: ClipboardIcon,
    prompt:
      'Read what is currently on my system clipboard and explain or format it.',
  },
  {
    label: 'Plan a feature',
    icon: SparklesIcon,
    prompt:
      'How can I add custom tools to this desktop agent? Give me a concise example.',
  },
];

/** Static model readout for the composer footer. */
function ModelIndicator() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await window.electron.ipc.invoke<{
          activeProvider?: string;
          activeModel?: string;
        }>('settings:get');
        if (cancelled) return;
        setLabel(
          [s?.activeProvider, s?.activeModel].filter(Boolean).join(' · '),
        );
      } catch {
        if (!cancelled) setLabel('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // This indicator mounts once per chat surface, long before the Settings
  // dialog exists, so the one-shot fetch above went stale after a model
  // change. Re-read on the same broadcast the sidebar footer listens to.
  useIpcEvent(
    'settings:changed',
    () => {
      void (async () => {
        try {
          const s = await window.electron.ipc.invoke<{
            activeProvider?: string;
            activeModel?: string;
          }>('settings:get');
          setLabel(
            [s?.activeProvider, s?.activeModel].filter(Boolean).join(' · '),
          );
        } catch {
          setLabel('');
        }
      })();
    },
    [],
  );

  if (!label) return null;

  return (
    <span className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <SparklesIcon className="size-3.5 shrink-0 text-primary/70" />
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
    </span>
  );
}

export function ChatWelcome({
  onSend,
  disabled,
  isStreaming,
}: ChatWelcomeProps) {
  const { open: openGenerateNotebook } = useGenerateNotebook();

  const footerLeft = <ModelIndicator />;

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center px-4 pb-20">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-sm text-foreground">
        <QedaLogomark
          size="md"
          ringClassName="text-foreground"
          boltClassName="text-sky-400"
          animated
        />
      </div>
      <h1 className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        What do you want to build or run?
      </h1>

      {/* Composer — the single input for an empty conversation. */}
      <div className="mt-6 w-full max-w-2xl">
        <ChatInput
          onSend={onSend}
          disabled={disabled}
          isStreaming={isStreaming}
          tall
          footerLeft={footerLeft}
          placeholder="Research a topic, summarize your notes, or ask Qeda anything…"
        />
      </div>

      {/* Suggestions. Notebook generation is a peer of the prompts here rather
          than a separate call to action, so the row stays one uniform rhythm. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((item) => (
          <SuggestionChip
            key={item.label}
            icon={item.icon}
            label={item.label}
            onClick={() => onSend(item.prompt)}
          />
        ))}
        <SuggestionChip
          icon={NotebookPenIcon}
          label="Generate notebook"
          onClick={openGenerateNotebook}
        />
      </div>
    </div>
  );
}

function SuggestionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card/40 px-3 py-1.5',
        'text-xs text-muted-foreground transition-colors',
        'hover:border-primary/40 hover:bg-accent/40 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
