/**
 * components/presence/SuggestionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One suggestion, as a dense row in the coach queue.
 *
 * The queue is the left pane of a split layout, so the row leads with the two
 * things a user needs to decide whether to act: what kind of move this is and
 * where it happens. The title follows, and the body stays collapsed.
 *
 * Clicking the row copies the draft. That is deliberately the only effect of the
 * primary click: social platforms cannot be prefilled from a URL, and silently
 * stealing the right-hand tab mid-read is worse than a clipboard write. Acting
 * on the item (done / skip / edit / feedback) lives in the expanded panel where
 * it cannot be hit by accident.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
  GlobeIcon,
  MessageCircleIcon,
  Undo2Icon,
  UserPlusIcon,
  UsersIcon,
  SendIcon,
} from 'lucide-react';
import type { PresenceItem } from '@/main/ipc/channels';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { usePresenceActions } from '@/hooks/use-presence';
import {
  KIND_LABELS,
  PLATFORM_LABELS,
  PRESENCE_PLATFORMS,
  type PresenceKind,
  type PresencePlatform,
} from '@/lib/presence';

interface SuggestionCardProps {
  item: PresenceItem;
  projectId: string | null;
}

const KIND_ICONS: Record<PresenceKind, typeof FileTextIcon> = {
  post_draft: FileTextIcon,
  platform_suggestion: GlobeIcon,
  connection_suggestion: UserPlusIcon,
  engagement_prompt: MessageCircleIcon,
  group_suggestion: UsersIcon,
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  skipped: 'bg-muted text-muted-foreground/70',
};

export function SuggestionCard({ item, projectId }: SuggestionCardProps) {
  const { updateItem, logPost } = usePresenceActions();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [body, setBody] = useState(item.body);
  const [feedback, setFeedback] = useState(item.feedback);
  const [showLogPost, setShowLogPost] = useState(false);
  const [postMetrics, setPostMetrics] = useState('');
  const [postContent, setPostContent] = useState(item.body);
  const [postPlatform, setPostPlatform] = useState<PresencePlatform | ''>(
    item.platform === 'any' ? '' : item.platform,
  );
  const [postError, setPostError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A refreshed item (broadcast, project switch) is the source of truth unless
  // the user has an expanded editor open on it.
  useEffect(() => {
    if (!expanded) {
      setBody(item.body);
      setFeedback(item.feedback);
    }
  }, [item.body, item.feedback, expanded]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const kindIcon = KIND_ICONS[item.kind as PresenceKind] ?? FileTextIcon;
  const Icon = kindIcon;
  const platformLabel =
    item.platform === 'any'
      ? null
      : (PLATFORM_LABELS[item.platform as PresencePlatform] ?? item.platform);
  const isResolved = item.status === 'done' || item.status === 'skipped';
  const dirty = body !== item.body;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied; the expanded panel still exposes the
      // text so the user can select it manually.
    }
  };

  const setStatus = async (status: 'done' | 'skipped' | 'pending') => {
    await updateItem(item.id, { status }, projectId);
  };

  const saveEdit = async () => {
    if (!dirty) return;
    await updateItem(item.id, { body }, projectId);
  };

  const saveFeedback = async () => {
    await updateItem(item.id, { feedback }, projectId);
  };

  const handleLogPost = async () => {
    if (!postPlatform || !postContent.trim()) {
      setPostError('Choose a platform and add the content that was posted.');
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      await logPost({
        projectId,
        platform: postPlatform,
        content: postContent.trim(),
        metrics: postMetrics,
        itemId: item.id,
      });
      setShowLogPost(false);
      setPostMetrics('');
      setPostError(null);
    } catch (error) {
      setPostError(
        error instanceof Error ? error.message : 'Failed to log this post.',
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card/40 transition-colors',
        expanded
          ? 'border-amber-500/40'
          : 'border-border/60 hover:border-border',
        isResolved && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          onClick={() => void copy()}
          title="Copy this draft"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md p-0.5 text-left"
        >
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Icon className="size-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {KIND_LABELS[item.kind as PresenceKind] ?? item.kind}
              {platformLabel && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="normal-case tracking-normal">
                    {platformLabel}
                  </span>
                </>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs font-medium text-foreground">
              {item.title}
            </span>
            <span
              className={cn(
                'mt-0.5 block truncate text-[11px]',
                copied
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground',
              )}
            >
              {copied ? 'Copied — paste it on the platform' : item.body}
            </span>
          </span>
        </button>

        <span
          className={cn(
            'mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            STATUS_STYLES[item.status] ?? STATUS_STYLES.pending,
          )}
        >
          {item.status === 'pending' ? 'To do' : item.status}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse suggestion' : 'Expand suggestion'}
          className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <ChevronDownIcon
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-2.5 pb-2.5 pt-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            aria-label="Suggestion body"
            className="min-h-20 resize-y bg-background/60 text-xs leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <CopyIcon className="size-3" />
              Copy
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={!dirty}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 text-[11px] font-medium text-amber-700 disabled:opacity-40 dark:text-amber-300"
            >
              <CheckIcon className="size-3" />
              Save edit
            </button>
            {item.status === 'pending' ? (
              <>
                <button
                  type="button"
                  onClick={() => void setStatus('done')}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                >
                  <CheckIcon className="size-3" />
                  Mark done
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus('skipped')}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Not today
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void setStatus('pending')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Undo2Icon className="size-3" />
                Undo
              </button>
            )}
          </div>

          {item.status === 'done' && (
            <div className="space-y-1">
              <label
                htmlFor={`feedback-${item.id}`}
                className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                How did it go?
              </label>
              <Textarea
                id={`feedback-${item.id}`}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={2}
                placeholder="Reactions, comments, anything worth remembering…"
                className="min-h-12 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveFeedback()}
                  disabled={feedback === item.feedback}
                  className="text-[11px] font-medium text-emerald-600 disabled:opacity-40 dark:text-emerald-400"
                >
                  Save feedback
                </button>
                {item.posted_at ? (
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                    Post logged
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogPost((visible) => !visible);
                      setPostContent(body);
                      setPostPlatform(
                        item.platform === 'any' ? '' : item.platform,
                      );
                      setPostError(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <SendIcon className="size-3" />
                    {showLogPost ? 'Cancel' : 'Log post'}
                  </button>
                )}
              </div>

              {showLogPost && (
                <div className="space-y-2 rounded-lg bg-blue-500/5 p-2">
                  <label
                    htmlFor={`post-platform-${item.id}`}
                    className="sr-only"
                  >
                    Platform where you posted
                  </label>
                  <select
                    id={`post-platform-${item.id}`}
                    value={postPlatform}
                    onChange={(event) =>
                      setPostPlatform(event.target.value as PresencePlatform | '')
                    }
                    className="w-full rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px]"
                  >
                    <option value="">Choose platform</option>
                    {PRESENCE_PLATFORMS.filter(
                      (platform) => platform !== 'any',
                    ).map((platform) => (
                      <option key={platform} value={platform}>
                        {PLATFORM_LABELS[platform]}
                      </option>
                    ))}
                  </select>
                  <Textarea
                    value={postContent}
                    onChange={(event) => setPostContent(event.target.value)}
                    rows={3}
                    aria-label="Published post content"
                    className="min-h-16 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="e.g., 24 likes, 5 comments"
                    value={postMetrics}
                    onChange={(event) => setPostMetrics(event.target.value)}
                    className="w-full rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11px]"
                  />
                  {postError && (
                    <p role="alert" className="text-[11px] text-destructive">
                      {postError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleLogPost()}
                    disabled={posting || !projectId}
                    className="w-full rounded-md bg-blue-600/20 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-600/30 disabled:opacity-50 dark:text-blue-400"
                  >
                    {posting ? 'Logging...' : 'Confirm log'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
