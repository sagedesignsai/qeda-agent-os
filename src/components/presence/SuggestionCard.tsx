/**
 * components/presence/SuggestionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Three-state card (pending / done / skipped) with conversational copy.
 * Platform suggestions show a "Join Platform" button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { CopyIcon, ExternalLinkIcon, Undo2Icon } from 'lucide-react';
import type { PresenceItem } from '@/main/ipc/channels';
import { usePresenceActions } from '@/hooks/use-presence';
import { KIND_LABELS, PLATFORM_LABELS, PLATFORM_URLS, STATUS_LABELS } from '@/lib/presence';

interface SuggestionCardProps {
  item: PresenceItem;
}

export function SuggestionCard({ item }: SuggestionCardProps) {
  const [feedback, setFeedback] = useState('');
  const [body, setBody] = useState(item.body);
  const { updateItem, openBrowser } = usePresenceActions();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Clipboard API not available
    }
  };

  const handleOpenPlatform = async () => {
    if (item.platform !== 'any') {
      const url = PLATFORM_URLS[item.platform as keyof typeof PLATFORM_URLS] ?? '';
      if (url) await openBrowser(url);
    }
  };

  const handleStatus = async (status: 'done' | 'skipped' | 'edited') => {
    await updateItem(item.id, { status });
  };

  const handleSaveFeedback = async () => {
    await updateItem(item.id, { feedback });
  };

  const handleUndo = async () => {
    await updateItem(item.id, { status: 'pending' });
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
  };

  // ── Skipped state ────────────────────────────────────────────────────────

  if (item.status === 'skipped') {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            {KIND_LABELS[item.kind as keyof typeof KIND_LABELS] ?? item.kind}
          </span>
          {item.platform !== 'any' && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}
              </span>
            </>
          )}
          <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
            {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          No problem — we'll try something else next time.
        </p>
        <button
          type="button"
          onClick={handleUndo}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <Undo2Icon className="h-3 w-3" />
          Undo
        </button>
      </div>
    );
  }

  // ── Done state ───────────────────────────────────────────────────────────

  if (item.status === 'done') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {KIND_LABELS[item.kind as keyof typeof KIND_LABELS] ?? item.kind}
          </span>
          {item.platform !== 'any' && (
            <>
              <span className="text-emerald-300 dark:text-emerald-700">·</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}
              </span>
            </>
          )}
          <span className="ml-auto rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300">
            {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}
          </span>
        </div>
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
          Nice! How did it go? Any reactions or comments worth noting? (This helps me suggest
          better next time)
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Tell me what happened..."
          rows={3}
          className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm placeholder:text-emerald-300 focus:border-emerald-400 focus:outline-none dark:border-emerald-700 dark:bg-zinc-900 dark:placeholder:text-emerald-600"
        />
        <button
          type="button"
          onClick={handleSaveFeedback}
          className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Save feedback
        </button>
      </div>
    );
  }

  // ── Platform suggestion ──────────────────────────────────────────────────

  if (item.kind === 'platform_suggestion') {
    const platformName =
      PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform;
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
            {KIND_LABELS[item.kind as keyof typeof KIND_LABELS]}
          </span>
          {item.platform !== 'any' && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {platformName}
              </span>
            </>
          )}
        </div>
        <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {item.title}
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{item.body}</p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenPlatform}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            Join {platformName}
          </button>
          <button
            type="button"
            onClick={() => handleStatus('done')}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            I'll post this
          </button>
          <button
            type="button"
            onClick={() => handleStatus('skipped')}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Not today
          </button>
        </div>
      </div>
    );
  }

  // ── Pending state (default) ──────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
          {KIND_LABELS[item.kind as keyof typeof KIND_LABELS] ?? item.kind}
        </span>
        {item.platform !== 'any' && (
          <>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {item.title}
      </p>
      <textarea
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
        onBlur={() => {
          if (body !== item.body) {
            updateItem(item.id, { body });
          }
        }}
        rows={4}
        className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600 resize-none focus:border-zinc-300 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:focus:border-zinc-600"
      />
      {item.source_kind && (
        <span className="mt-2 inline-block text-xs text-zinc-400 dark:text-zinc-500">
          Based on {item.source_kind}: {item.source_id ?? 'unknown'}
        </span>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <CopyIcon className="h-3 w-3" />
          Copy
        </button>
        {item.platform !== 'any' && (
          <button
            type="button"
            onClick={handleOpenPlatform}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            Open {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS] ?? item.platform}
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => handleStatus('done')}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          I'll post this
        </button>
        <button
          type="button"
          onClick={() => handleStatus('skipped')}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Not today
        </button>
        <button
          type="button"
          onClick={() => handleStatus('edited')}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Let me think about it
        </button>
      </div>
    </div>
  );
}
