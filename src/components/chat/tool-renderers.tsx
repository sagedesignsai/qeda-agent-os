/**
 * components/chat/tool-renderers.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose-built renderers for the external-service tool calls. A generic JSON
 * dump is unreadable for search results, docs snippets, images, or audio, so
 * each service tool gets a card that shows exactly what the user cares about.
 *
 * Inputs are `unknown` tool outputs, so every field is read defensively — a
 * malformed or partial output must degrade to an empty state, never a crash.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SearchIcon,
  FileTextIcon,
  BookOpenIcon,
  BookIcon,
  AudioLinesIcon,
  QuoteIcon,
  GitBranchIcon,
  HistoryIcon,
  FileDiffIcon,
  FlaskConicalIcon,
  ListChecksIcon,
  BoxIcon,
  Layers3Icon,
  WandSparklesIcon,
  EyeIcon,
  CodeIcon,
  DownloadIcon,
  CheckIcon,
  CopyIcon,
} from 'lucide-react';
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources';
import { cn } from '@/lib/utils';
import { ttsClient } from '@/lib/tts';

type Output = Record<string, unknown>;

const asArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const isFailed = (output: Output): boolean => output.success === false;

function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  label,
  meta,
}: {
  icon: ReactNode;
  label: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium">{label}</span>
      {meta && (
        <span className="ml-auto flex items-center gap-1.5">{meta}</span>
      )}
    </div>
  );
}

// ─── advancedSearch ───────────────────────────────────────────────────────────

interface SearchResultView {
  title?: string;
  url?: string;
  snippet?: string;
  provider?: string;
  publishedDate?: string;
}

export function SearchResultsCard({ output }: { output: Output }) {
  const results = asArray<SearchResultView>(output.results);
  const answer = asString(output.answer);
  const provider = asString(output.provider) || 'web';
  const query = asString(output.query);

  return (
    <CardShell>
      <CardHeader
        icon={<SearchIcon className="h-3.5 w-3.5" />}
        label="Web search"
        meta={
          <>
            <Badge variant="secondary" className="text-xs">
              {provider}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {results.length} result{results.length === 1 ? '' : 's'}
            </Badge>
          </>
        }
      />
      {query && (
        <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
          “{query}”
        </div>
      )}
      {answer && (
        <div className="flex gap-2 border-b bg-primary/5 px-3 py-2 text-xs">
          <QuoteIcon className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <p className="text-foreground/90">{answer}</p>
        </div>
      )}
      {results.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">No results.</p>
      ) : (
        <ol className="divide-y">
          {results.map((result, index) => (
            <li key={`${result.url ?? index}`} className="px-3 py-2">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <span className="line-clamp-1">
                  {result.title || result.url}
                </span>
                <ExternalLinkIcon className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
              {result.snippet && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {result.snippet}
                </p>
              )}
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/80">
                <span className="truncate">{result.url}</span>
                {result.publishedDate && <span>· {result.publishedDate}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}

// ─── scrapePage ───────────────────────────────────────────────────────────────

export function ScrapeCard({ output }: { output: Output }) {
  const [expanded, setExpanded] = useState(false);
  const title = asString(output.title);
  const url = asString(output.url);
  const markdown = asString(output.markdown);
  const truncated = output.truncated === true;

  return (
    <CardShell>
      <CardHeader
        icon={<FileTextIcon className="h-3.5 w-3.5" />}
        label="Scraped page"
        meta={
          <Badge variant="outline" className="text-xs">
            {markdown.length.toLocaleString()} chars
          </Badge>
        }
      />
      <div className="px-3 py-2">
        <div className="text-xs font-medium text-foreground">
          {title || url}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary hover:underline"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )}
          {expanded ? 'Hide markdown' : 'Show markdown'}
        </button>
        {expanded && (
          <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-relaxed">
            {markdown}
            {truncated ? '\n… (truncated)' : ''}
          </pre>
        )}
      </div>
    </CardShell>
  );
}

// ─── libraryDocs ──────────────────────────────────────────────────────────────

interface CodeSnippetView {
  title?: string;
  description?: string;
  language?: string;
  code?: string;
  source?: string;
}
interface InfoSnippetView {
  breadcrumb?: string;
  content?: string;
}

export function DocsCard({ output }: { output: Output }) {
  const codeSnippets = asArray<CodeSnippetView>(output.codeSnippets);
  const infoSnippets = asArray<InfoSnippetView>(output.infoSnippets);

  return (
    <CardShell>
      <CardHeader
        icon={<BookOpenIcon className="h-3.5 w-3.5" />}
        label="Library docs"
        meta={
          <Badge variant="outline" className="text-xs">
            {codeSnippets.length} snippet{codeSnippets.length === 1 ? '' : 's'}
          </Badge>
        }
      />
      <div className="divide-y">
        {codeSnippets.map((snippet, index) => (
          <div key={`${snippet.title ?? index}-${index}`} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {snippet.title || 'Snippet'}
              </span>
              {snippet.language && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {snippet.language}
                </Badge>
              )}
            </div>
            {snippet.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {snippet.description}
              </p>
            )}
            {snippet.code && (
              <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                <code>{snippet.code}</code>
              </pre>
            )}
          </div>
        ))}
        {infoSnippets.slice(0, 4).map((snippet, index) => (
          <div key={`info-${index}`} className="px-3 py-2">
            {snippet.breadcrumb && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {snippet.breadcrumb}
              </div>
            )}
            <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground">
              {snippet.content}
            </p>
          </div>
        ))}
        {codeSnippets.length === 0 && infoSnippets.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No documentation found.
          </p>
        )}
      </div>
    </CardShell>
  );
}

// ─── findImages ───────────────────────────────────────────────────────────────

interface ImageView {
  id?: string;
  description?: string;
  url?: string;
  thumbUrl?: string;
  author?: string;
  authorUrl?: string;
  pageUrl?: string;
}

export function ImageGridCard({ output }: { output: Output }) {
  const images = asArray<ImageView>(output.images);
  const query = asString(output.query);

  return (
    <CardShell>
      <CardHeader
        icon={<SearchIcon className="h-3.5 w-3.5" />}
        label={query ? `Images · “${query}”` : 'Images'}
        meta={
          <Badge variant="outline" className="text-xs">
            {images.length}
          </Badge>
        }
      />
      {images.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          No images found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <a
              key={image.id ?? index}
              href={image.pageUrl || image.url}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-md border"
              title={image.description}
            >
              <img
                src={image.thumbUrl || image.url}
                alt={image.description || 'Unsplash result'}
                loading="lazy"
                className="h-24 w-full object-cover transition-transform group-hover:scale-105"
              />
              {image.author && (
                <div className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                  {image.author}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </CardShell>
  );
}

// ─── textToSpeech ─────────────────────────────────────────────────────────────

export function AudioCard({ output }: { output: Output }) {
  const dataUrl = asString(output.dataUrl);
  const assetId = asString(output.assetId);
  const url = asString(output.url);
  const provider = asString(output.provider) || 'speech';
  const bytes = asNumber(output.bytes);
  const durationMs = asNumber(output.durationMs);
  const [exporting, setExporting] = useState(false);
  const src = url || dataUrl;

  const save = async () => {
    if (!assetId || exporting) return;
    setExporting(true);
    try {
      await ttsClient.exportAsset({ id: assetId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <CardShell>
      <CardHeader
        icon={<AudioLinesIcon className="h-3.5 w-3.5" />}
        label="Generated audio"
        meta={
          <>
            <Badge variant="secondary" className="text-xs">
              {provider}
            </Badge>
            {durationMs !== undefined && (
              <Badge variant="outline" className="text-xs">
                {formatDuration(durationMs)}
              </Badge>
            )}
            {bytes !== undefined && (
              <Badge variant="outline" className="text-xs">
                {Math.round(bytes / 1024)} KB
              </Badge>
            )}
          </>
        }
      />
      <div className="flex items-center gap-2 px-3 py-2">
        {src ? (
          <audio controls src={src} className="h-8 min-w-0 flex-1" />
        ) : (
          <p className="text-xs text-muted-foreground">No audio returned.</p>
        )}
        {assetId && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={exporting}
            title="Save audio"
            aria-label="Save audio"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </CardShell>
  );
}

// ─── transcribeAudio ──────────────────────────────────────────────────────────

export function TranscriptCard({ output }: { output: Output }) {
  const text = asString(output.text);
  const filePath = asString(output.filePath);
  return (
    <CardShell>
      <CardHeader
        icon={<FileTextIcon className="h-3.5 w-3.5" />}
        label="Transcription"
      />
      <div className="px-3 py-2">
        {filePath && (
          <div className="mb-1 truncate text-[10px] text-muted-foreground">
            {filePath}
          </div>
        )}
        <p className="whitespace-pre-wrap text-xs">
          {text || (
            <span className="text-muted-foreground">No speech detected.</span>
          )}
        </p>
      </div>
    </CardShell>
  );
}

// ─── Repository tools (tools/repo.ts) ─────────────────────────────────────────

interface CommitView {
  sha?: string;
  author?: string;
  when?: string;
  subject?: string;
}

/**
 * `gitStatus` — where the repo stands.
 *
 * The dirty/clean state and the ahead/behind counts are the two things that
 * change what an agent should propose next, so they get visual weight; the
 * per-file change list stays collapsed until asked for.
 */
export function GitStatusCard({ output }: { output: Output }) {
  const branch = asString(output.branch) || 'unknown';
  const clean = output.clean === true;
  const ahead = asNumber(output.ahead) ?? 0;
  const behind = asNumber(output.behind) ?? 0;
  const untracked = asNumber(output.untracked) ?? 0;
  const changes = asArray<{ XY?: string; path?: string }>(output.changes);
  const truncated = output.changesTruncated === true;

  return (
    <CardShell>
      <CardHeader
        icon={<GitBranchIcon className="size-3.5" />}
        label={branch}
        meta={
          <>
            <Badge
              variant={clean ? 'secondary' : 'outline'}
              className="gap-1 text-[10px]"
            >
              {clean
                ? 'clean'
                : `${asNumber(output.changedFileCount) ?? changes.length} changed`}
            </Badge>
            {ahead > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                ↑{ahead}
              </Badge>
            )}
            {behind > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                ↓{behind}
              </Badge>
            )}
          </>
        }
      />
      {(untracked > 0 || truncated) && (
        <div className="flex flex-wrap gap-2 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
          {untracked > 0 && <span>{untracked} untracked</span>}
          {truncated && <span>list truncated</span>}
        </div>
      )}
      {changes.length > 0 && (
        <ChangeList changes={changes} truncated={truncated} />
      )}
    </CardShell>
  );
}

function ChangeList({
  changes,
  truncated,
}: {
  changes: { XY?: string; path?: string }[];
  truncated: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        {open ? 'Hide' : 'Show'} changed files
        {truncated && <span className="ml-1 opacity-70">(partial)</span>}
      </button>
      {open && (
        <ul className="max-h-48 overflow-auto border-t px-3 py-1.5 font-mono text-[11px]">
          {changes.map((c, i) => (
            <li key={`${c.path}-${i}`} className="flex gap-2 py-px">
              {/* XY is git's staged/unstaged pair; both matter for "is it saved". */}
              <span
                className={cn(
                  'w-5 shrink-0 select-none',
                  c.XY?.includes('?')
                    ? 'text-muted-foreground'
                    : c.XY?.includes('A')
                      ? 'text-emerald-500'
                      : 'text-amber-500',
                )}
              >
                {c.XY ?? '  '}
              </span>
              <span className="truncate">{c.path ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** `gitLog` — recent history, newest first. */
export function GitLogCard({ output }: { output: Output }) {
  const commits = asArray<CommitView>(output.commits);
  return (
    <CardShell>
      <CardHeader
        icon={<HistoryIcon className="size-3.5" />}
        label="Recent commits"
        meta={
          <Badge variant="secondary" className="text-[10px]">
            {asNumber(output.count) ?? commits.length}
          </Badge>
        }
      />
      {commits.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          No commits yet.
        </p>
      ) : (
        <ul className="divide-y">
          {commits.map((c) => (
            <li
              key={c.sha}
              className="flex items-start gap-2 px-3 py-1.5 text-[11px]"
            >
              <span className="shrink-0 font-mono text-muted-foreground">
                {c.sha?.slice(0, 7)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.subject}</span>
                <span className="text-muted-foreground">
                  {c.author}
                  {c.when ? ` · ${c.when}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/** `gitDiffStat` — what changed, as per-file counts. */
export function DiffStatCard({ output }: { output: Output }) {
  const files = asArray<{
    file?: string;
    added?: number | null;
    removed?: number | null;
  }>(output.files);
  const truncated = output.filesTruncated === true;
  const added = asNumber(output.totalAdded) ?? 0;
  const removed = asNumber(output.totalRemoved) ?? 0;

  return (
    <CardShell>
      <CardHeader
        icon={<FileDiffIcon className="size-3.5" />}
        label={asString(output.ref) || 'working tree'}
        meta={
          <>
            <span className="text-[10px] text-emerald-500">+{added}</span>
            <span className="text-[10px] text-rose-500">−{removed}</span>
          </>
        }
      />
      {files.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          No changes.
        </p>
      ) : (
        <ul className="max-h-56 overflow-auto border-t px-3 py-1.5 font-mono text-[11px]">
          {files.map((f, i) => (
            <li
              key={`${f.file}-${i}`}
              className="flex items-center gap-2 py-px"
            >
              <span className="min-w-0 flex-1 truncate">{f.file}</span>
              {/* Binary files report null rather than a count. */}
              <span className="shrink-0 text-emerald-500">
                {f.added === null ? '' : `+${f.added}`}
              </span>
              <span className="shrink-0 text-rose-500">
                {f.removed === null ? '' : `−${f.removed}`}
              </span>
            </li>
          ))}
          {truncated && (
            <li className="pt-1 font-sans text-muted-foreground">
              list truncated — more files changed
            </li>
          )}
        </ul>
      )}
    </CardShell>
  );
}

interface GrepFileView {
  file?: string;
  matches?: { line?: number; text?: string }[];
}

/**
 * `grepSearch` — matches grouped by file.
 *
 * Always surfaces the truncation notice. A capped result that renders like a
 * complete one is actively misleading: the agent may conclude a symbol is
 * defined in exactly one place when the search stopped early.
 */
export function GrepResultsCard({ output }: { output: Output }) {
  const results = asArray<GrepFileView>(output.results);
  const truncated = output.truncated === true;
  const total = asNumber(output.matchCount) ?? 0;
  const pattern = asString(output.pattern);

  return (
    <CardShell>
      <CardHeader
        icon={<SearchIcon className="size-3.5" />}
        label={pattern ? `“${pattern}”` : 'Search'}
        meta={
          <Badge variant="secondary" className="gap-1 text-[10px]">
            {total} in {asNumber(output.filesWithMatches) ?? results.length}{' '}
            file
            {(asNumber(output.filesWithMatches) ?? results.length) === 1
              ? ''
              : 's'}
          </Badge>
        }
      />
      {truncated && (
        <div className="border-b bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          {asString(output.truncatedReason) || 'Results truncated'} — this is
          not the full set.
        </div>
      )}
      {results.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          No matches.
        </p>
      ) : (
        <ul className="max-h-72 divide-y overflow-auto">
          {results.map((f) => (
            <li key={f.file} className="px-3 py-1.5">
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {f.file}
              </div>
              <ul className="mt-0.5 font-mono text-[11px]">
                {asArray<{ line?: number; text?: string }>(f.matches).map(
                  (m, i) => (
                    <li key={i} className="flex gap-2 py-px">
                      <span className="w-10 shrink-0 text-right text-muted-foreground/70">
                        {m.line}
                      </span>
                      <span className="min-w-0 flex-1 break-all">{m.text}</span>
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

// ─── Research tools (tools/workspace.ts) ──────────────────────────────────────

/**
 * The four research tools invert the service tools above: their meaningful text
 * is in the **input**, not the output.
 *
 * `startResearchRun` returns only `{ runId }`, `recordSource` and
 * `recordEvidence` return only a new id, and the report itself is an *input* to
 * `completeResearchRun`. So these renderers read the input and use the output
 * only to confirm the call landed — which is why `renderSpecializedTool` now
 * takes the input as well.
 */

/** `startResearchRun` — the question being investigated. */
export function ResearchRunCard({ input }: { input: Output }) {
  const question = asString(input.question);
  return (
    <CardShell>
      <CardHeader
        icon={<FlaskConicalIcon className="h-3.5 w-3.5" />}
        label="Research run started"
      />
      <div className="px-3 py-2">
        <p className="text-xs text-foreground/90">
          {question || 'Untitled investigation'}
        </p>
      </div>
    </CardShell>
  );
}

/** `recordSource` — a source added to the run's audit trail. */
export function ResearchSourceCard({ input }: { input: Output }) {
  const url = asString(input.url);
  const title = asString(input.title);
  const kind = asString(input.kind) || 'web';
  const snippet = asString(input.snippet);

  return (
    <CardShell>
      <CardHeader
        icon={<BookOpenIcon className="h-3.5 w-3.5" />}
        label={title || url || 'Source recorded'}
        meta={
          <Badge variant="secondary" className="text-xs">
            {kind}
          </Badge>
        }
      />
      {snippet && (
        <p className="line-clamp-2 px-3 py-1.5 text-[11px] text-muted-foreground">
          {snippet}
        </p>
      )}
      {url && (
        <div className="truncate border-t px-3 py-1.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-primary hover:underline"
          >
            {url}
          </a>
        </div>
      )}
    </CardShell>
  );
}

/** `recordEvidence` — the exact quote lifted from a source. */
export function ResearchEvidenceCard({ input }: { input: Output }) {
  const quote = asString(input.quote);
  const note = asString(input.note);

  return (
    <CardShell>
      <CardHeader
        icon={<QuoteIcon className="h-3.5 w-3.5" />}
        label="Evidence recorded"
      />
      {quote && (
        <div className="px-3 py-2">
          <p className="border-l-2 border-primary/40 pl-2 text-[11px] leading-relaxed text-foreground/80 italic">
            {quote}
          </p>
        </div>
      )}
      {note && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">{note}</p>
      )}
    </CardShell>
  );
}

interface CitationView {
  n?: number;
  title?: string;
  url?: string | null;
}

/**
 * `completeResearchRun` — the payoff, and the reason the run was worth recording.
 *
 * Renders the run's numbered citation list as the collapsible Sources panel, so
 * a `[1]`/`[2]` marker in the report is resolvable back to its source. This is
 * the same panel the ai-elements Response pattern uses, for the same reason.
 *
 * A citation may have no `url` — `research_sources` covers workspace pages and
 * local files as well as web URLs. An anchor with an `undefined` href looks
 * exactly like a working link, so those render as plain rows instead.
 */
export function ResearchCitationsCard({ output }: { output: Output }) {
  const citations = asArray<CitationView>(output.citations);
  const status = asString(output.status) || 'completed';
  const finished = status === 'completed';

  return (
    <div className="not-prose w-full rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <ListChecksIcon
          className={cn(
            'h-3.5 w-3.5',
            finished ? 'text-emerald-500' : 'text-amber-500',
          )}
        />
        <span className="text-xs font-medium">
          {finished ? 'Research complete' : `Research ${status}`}
        </span>
      </div>

      {/*
        The citation list is collapsed by default — the same shape the
        ai-elements Response pattern uses, and it keeps a 20-source
        investigation from swamping the conversation it belongs to. The trigger
        carries the count, so the header above does not repeat it.
      */}
      {citations.length > 0 && (
        <Sources className="mt-2 mb-0">
          <SourcesTrigger count={citations.length}>
            <p className="font-medium">Sources ({citations.length})</p>
            <ChevronDownIcon className="h-4 w-4" />
          </SourcesTrigger>
          <SourcesContent className="max-h-72 w-full overflow-y-auto">
            {citations.map((citation, index) => {
              const label = `${citation.n ?? index + 1}. ${
                citation.title || citation.url || 'Untitled source'
              }`;
              return citation.url ? (
                <Source
                  key={`${citation.url}-${index}`}
                  href={citation.url}
                  title={label}
                  className="min-w-0 hover:underline"
                />
              ) : (
                <span
                  key={`${label}-${index}`}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <BookIcon className="h-4 w-4 shrink-0" />
                  <span className="block truncate font-medium">{label}</span>
                </span>
              );
            })}
          </SourcesContent>
        </Sources>
      )}
    </div>
  );
}

function MotionPlanCard({
  output,
  namespace,
}: {
  output: Output;
  namespace: string;
}) {
  const operationCount = asNumber(output.operationCount) ?? 0;
  const requiresApproval = output.requiresApproval === true;
  const risk = asString(output.risk) || 'safe';
  const diff = (output.diff ?? {}) as Output;
  const changed = asNumber(diff.changed) ?? asNumber(diff.totalChanges) ?? 0;
  const Icon = namespace === 'motion.scene.director'
    ? Layers3Icon
    : namespace === 'motion.node.builder'
      ? BoxIcon
      : WandSparklesIcon;

  return (
    <CardShell>
      <CardHeader
        icon={<Icon className="size-4" />}
        label={namespace.replace('motion.', '').replaceAll('.', ' / ')}
        meta={<Badge variant={requiresApproval ? 'secondary' : 'outline'}>{risk}</Badge>}
      />
      <div className="space-y-2 px-3 py-3">
        <p className="font-medium">Motion plan ready</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{operationCount} operation{operationCount === 1 ? '' : 's'}</span>
          <span>{changed} document change{changed === 1 ? '' : 's'}</span>
          {requiresApproval && <span>Approval required</span>}
        </div>
      </div>
    </CardShell>
  );
}

// ─── Blender asset generation ───────────────────────────────────────────────

/**
 * `blender.asset.generate` / `blender.asset.import` /
 * `blenderSpecialist.buildAsset` — what the user actually wants to see is the
 * preview render of the generated model, plus the asset facts (generator,
 * size, triangle count). Reads defensively: a result without a preview still
 * renders the summary.
 */
export function BlenderAssetCard({ output }: { output: Output }) {
  const previewUrl = asString(output.previewUrl);
  const generatedBy = asString(output.generatedBy);
  const bytes = asNumber(output.bytes);
  const nodeId = asString(output.nodeId);
  const assetId = asString(output.assetId);
  const attempts = asNumber(output.attempts);
  const report = (
    output.report && typeof output.report === 'object' ? output.report : {}
  ) as Output;
  const triCount = asNumber(report.tri_count);
  const partCount = asNumber(report.part_count);

  const sourceLabel =
    generatedBy === 'authored'
      ? 'AI-authored'
      : generatedBy === 'template'
        ? 'Template'
        : asString(output.source) === 'import'
          ? 'Imported'
          : asString(output.source) === 'mcp-sync'
            ? 'Live Blender'
            : 'Blender';

  return (
    <CardShell className="w-full max-w-md">
      <CardHeader
        icon={<BoxIcon className="size-4" />}
        label="Blender model"
        meta={
          <>
            <Badge variant="secondary" className="text-xs">
              {sourceLabel}
            </Badge>
            {bytes !== undefined && (
              <Badge variant="outline" className="text-xs">
                {Math.round(bytes / 1024)} KB
              </Badge>
            )}
          </>
        }
      />
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Preview render of the generated model"
          loading="lazy"
          className="max-h-64 w-full object-contain bg-muted/20"
        />
      ) : (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          No preview render was produced for this asset.
        </p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
        {nodeId && <span>node: {nodeId}</span>}
        {assetId && <span>asset: {assetId}</span>}
        {triCount !== undefined && (
          <span>{triCount.toLocaleString()} tris</span>
        )}
        {partCount !== undefined && (
          <span>
            {partCount} part{partCount === 1 ? '' : 's'}
          </span>
        )}
        {attempts !== undefined && <span>{attempts} attempt{attempts === 1 ? '' : 's'}</span>}
      </div>
    </CardShell>
  );
}

// ─── Live Blender MCP Tool Renderers ─────────────────────────────────────────

export function BlenderLookCard({
  output,
  input = {},
}: {
  output: Output;
  input?: Record<string, unknown>;
}) {
  const mode = asString(output.mode) || asString(input.mode) || 'viewport';
  const shading = asString(output.shading) || asString(input.shading);
  const target = asArray<string>(output.target ?? input.target);

  let imgSrc = asString(output.image) || asString(output.previewUrl) || asString(output.data);
  if (!imgSrc) {
    const content = asArray<{ type?: string; data?: string; mimeType?: string }>(output.content);
    const imgItem = content.find((c) => c && c.type === 'image' && c.data);
    if (imgItem?.data) {
      imgSrc = `data:${imgItem.mimeType || 'image/png'};base64,${imgItem.data}`;
    }
  } else if (
    imgSrc &&
    !imgSrc.startsWith('data:') &&
    !imgSrc.startsWith('http') &&
    !imgSrc.startsWith('blob:') &&
    !imgSrc.startsWith('/')
  ) {
    imgSrc = `data:image/png;base64,${imgSrc}`;
  }

  const stats = (output.stats && typeof output.stats === 'object' ? output.stats : {}) as Output;
  const tris = asNumber(stats.tris ?? output.tris);
  const quads = asNumber(stats.quads ?? output.quads);
  const ngons = asNumber(stats.ngons ?? output.ngons);
  const nonManifold = asNumber(stats.non_manifold ?? output.non_manifold);
  const looseVerts = asNumber(stats.loose_vertices ?? output.loose_vertices);
  const hasTopologyStats = tris !== undefined || quads !== undefined || ngons !== undefined;

  return (
    <CardShell className="w-full max-w-lg">
      <CardHeader
        icon={<EyeIcon className="size-4" />}
        label="Blender Scene View"
        meta={
          <>
            <Badge variant="secondary" className="text-xs capitalize">
              {mode}
            </Badge>
            {shading && (
              <Badge variant="outline" className="text-xs capitalize">
                {shading}
              </Badge>
            )}
            {target.length > 0 && (
              <Badge variant="outline" className="text-xs truncate max-w-[120px]">
                {target.join(', ')}
              </Badge>
            )}
          </>
        }
      />
      {imgSrc ? (
        <div className="relative bg-black/60 flex items-center justify-center overflow-hidden">
          <img
            src={imgSrc}
            alt={`Blender ${mode} view`}
            loading="lazy"
            className="max-h-80 w-full object-contain"
          />
        </div>
      ) : (
        <div className="p-3 text-xs text-muted-foreground">
          {asString(output.message) || 'Image view captured.'}
        </div>
      )}
      {hasTopologyStats && (
        <div className="grid grid-cols-4 gap-2 border-t bg-muted/20 px-3 py-2 text-xs">
          {tris !== undefined && (
            <div>
              <span className="text-muted-foreground block text-[10px]">Tris</span>
              <span className="font-mono font-medium">{tris.toLocaleString()}</span>
            </div>
          )}
          {quads !== undefined && (
            <div>
              <span className="text-muted-foreground block text-[10px]">Quads</span>
              <span className="font-mono font-medium">{quads.toLocaleString()}</span>
            </div>
          )}
          {ngons !== undefined && (
            <div>
              <span className="text-muted-foreground block text-[10px]">Ngons</span>
              <span className={cn('font-mono font-medium', ngons > 0 ? 'text-amber-500' : '')}>
                {ngons.toLocaleString()}
              </span>
            </div>
          )}
          {nonManifold !== undefined && (
            <div>
              <span className="text-muted-foreground block text-[10px]">Non-manifold</span>
              <span className={cn('font-mono font-medium', nonManifold > 0 ? 'text-red-500' : '')}>
                {nonManifold.toLocaleString()}
              </span>
            </div>
          )}
          {looseVerts !== undefined && looseVerts > 0 && (
            <div>
              <span className="text-muted-foreground block text-[10px]">Loose Verts</span>
              <span className="font-mono font-medium text-amber-500">{looseVerts}</span>
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
}

export function BlenderCodeCard({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output: Output;
}) {
  const code = asString(input.code);
  const result = asString(output.result) || asString(output.stdout) || (typeof output === 'string' ? output : '');
  const stderr = asString(output.stderr) || asString(output.error);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(true);

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CardShell className="w-full max-w-lg font-mono text-xs">
      <CardHeader
        icon={<CodeIcon className="size-4" />}
        label="Blender Python (bpy)"
        meta={
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] font-sans">
              executed
            </Badge>
            <button
              type="button"
              onClick={copyCode}
              title="Copy code"
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
            </button>
          </div>
        }
      />
      {code && (
        <div className="relative border-b bg-muted/40 p-2.5">
          <div className="flex items-center justify-between pb-1 text-[10px] font-sans text-muted-foreground">
            <span>Script</span>
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="text-[10px] hover:underline"
            >
              {showCode ? 'collapse' : 'expand'}
            </button>
          </div>
          {showCode && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-foreground/90">
              {code}
            </pre>
          )}
        </div>
      )}
      {(result || stderr) && (
        <div className="bg-background/80 p-2.5">
          <span className="block pb-1 text-[10px] font-sans text-muted-foreground">Console Output</span>
          {result && (
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px] text-emerald-600 dark:text-emerald-400">
              {result}
            </pre>
          )}
          {stderr && (
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px] text-red-500">
              {stderr}
            </pre>
          )}
        </div>
      )}
    </CardShell>
  );
}

export function BlenderSceneInfoCard({
  output,
  input = {},
}: {
  output: Output;
  input?: Record<string, unknown>;
}) {
  const objects = asArray<Record<string, unknown>>(output.objects);
  const textSummary = asString(output.text) || asString(output.summary) || asString(output.result);
  const query = asString(input.query) || asString(input.root);

  return (
    <CardShell className="w-full max-w-lg">
      <CardHeader
        icon={<Layers3Icon className="size-4" />}
        label="Blender Scene Hierarchy"
        meta={
          <>
            {query && (
              <Badge variant="outline" className="text-xs">
                {query}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {objects.length > 0 ? `${objects.length} objects` : 'Scene info'}
            </Badge>
          </>
        }
      />
      {objects.length > 0 ? (
        <div className="max-h-60 overflow-y-auto divide-y divide-border/40 text-xs">
          {objects.map((obj, i) => {
            const name = asString(obj.name) || `Object ${i + 1}`;
            const dims = asArray<number>(obj.dimensions);
            const grounded = obj.grounded === true || obj.is_grounded === true;
            const faces = asNumber(obj.face_count ?? obj.faces);
            const materials = asArray<string>(obj.materials);

            return (
              <div key={i} className="flex items-center justify-between p-2 hover:bg-muted/30">
                <div className="flex flex-col gap-0.5 truncate">
                  <span className="font-medium truncate">{name}</span>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {dims.length >= 3 && (
                      <span>
                        {dims[0].toFixed(2)}m × {dims[1].toFixed(2)}m × {dims[2].toFixed(2)}m
                      </span>
                    )}
                    {faces !== undefined && <span>{faces.toLocaleString()} faces</span>}
                    {materials.length > 0 && <span>mat: {materials.join(', ')}</span>}
                  </div>
                </div>
                <div>
                  {obj.grounded !== undefined && (
                    <Badge
                      variant={grounded ? 'outline' : 'secondary'}
                      className={cn(
                        'text-[10px]',
                        grounded ? 'border-emerald-500/40 text-emerald-500' : 'text-amber-500',
                      )}
                    >
                      {grounded ? 'Grounded' : 'Floating'}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : textSummary ? (
        <pre className="max-h-56 overflow-auto p-2.5 font-mono text-[11px] whitespace-pre-wrap bg-muted/20">
          {textSummary}
        </pre>
      ) : (
        <p className="p-3 text-xs text-muted-foreground">Scene inspected successfully.</p>
      )}
    </CardShell>
  );
}

export function BlenderAssetsCard({
  output,
  input = {},
}: {
  output: Output;
  input?: Record<string, unknown>;
}) {
  const source = asString(input.source) || asString(output.source) || 'library';
  const query = asString(input.query) || asString(output.query);
  const results = asArray<Record<string, unknown>>(output.results ?? output.assets);

  return (
    <CardShell className="w-full max-w-lg">
      <CardHeader
        icon={<SearchIcon className="size-4" />}
        label="3D Asset Search"
        meta={
          <>
            <Badge variant="secondary" className="text-xs uppercase">
              {source}
            </Badge>
            {results.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {results.length} found
              </Badge>
            )}
          </>
        }
      />
      {query && (
        <div className="border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          Query: <span className="font-medium text-foreground">"{query}"</span>
        </div>
      )}
      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 p-2.5 max-h-72 overflow-y-auto">
          {results.slice(0, 10).map((item, i) => {
            const id = asString(item.id) || asString(item.uid) || `${i}`;
            const name = asString(item.name) || asString(item.title) || id;
            const preview = asString(item.preview) || asString(item.thumbnail);
            const licence = asString(item.licence) || asString(item.license);

            return (
              <div
                key={id}
                className="flex flex-col overflow-hidden rounded-md border border-border/60 bg-muted/10 p-1.5 text-xs"
              >
                {preview && (
                  <img
                    src={preview}
                    alt={name}
                    loading="lazy"
                    className="h-24 w-full rounded object-cover bg-black/20 mb-1.5"
                  />
                )}
                <span className="font-medium truncate text-[11px]" title={name}>
                  {name}
                </span>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate max-w-[90px] font-mono">{id}</span>
                  {licence && <Badge variant="outline" className="text-[9px] px-1 py-0">{licence}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-3 text-xs text-muted-foreground">
          {asString(output.message) || 'No assets found matching the query.'}
        </p>
      )}
    </CardShell>
  );
}

export function BlenderImportCard({
  output,
  input = {},
}: {
  output: Output;
  input?: Record<string, unknown>;
}) {
  const source = asString(input.source) || asString(output.source) || 'library';
  const id = asString(input.id) || asString(output.id);
  const targetSize = asNumber(input.target_size);
  const applyTo = asArray<string>(input.apply_to);

  return (
    <CardShell className="w-full max-w-md">
      <CardHeader
        icon={<DownloadIcon className="size-4" />}
        label="Blender Asset Imported"
        meta={
          <Badge variant="secondary" className="text-xs uppercase">
            {source}
          </Badge>
        }
      />
      <div className="p-3 text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Asset ID:</span>
          <span className="font-mono font-medium truncate max-w-[200px]">{id}</span>
        </div>
        {targetSize !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Target Size:</span>
            <span>{targetSize} m</span>
          </div>
        )}
        {applyTo.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Applied to:</span>
            <span className="truncate max-w-[200px]">{applyTo.join(', ')}</span>
          </div>
        )}
        <div className="pt-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
          ✓ Imported into Blender session
        </div>
      </div>
    </CardShell>
  );
}

export function BlenderGuideCard({
  output,
  input = {},
}: {
  output: Output;
  input?: Record<string, unknown>;
}) {
  const topic = asString(input.topic) || asString(output.topic) || 'Blender';
  const guideText = asString(output.guide) || asString(output.content) || asString(output.result);

  return (
    <CardShell className="w-full max-w-lg">
      <CardHeader
        icon={<BookOpenIcon className="size-4" />}
        label="Blender Workflow Guide"
        meta={
          <Badge variant="secondary" className="text-xs capitalize">
            {topic}
          </Badge>
        }
      />
      <div className="p-3 text-xs space-y-2">
        <p className="text-muted-foreground">
          Loaded craft guide for <span className="font-medium text-foreground">{topic}</span> into agent context.
        </p>
        {guideText && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:underline py-1">View guide details</summary>
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[10px]">
              {guideText}
            </pre>
          </details>
        )}
      </div>
    </CardShell>
  );
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/** Tool names that have a purpose-built renderer. */
export const SPECIALIZED_TOOLS = new Set([
  'blender_asset_generate',
  'blender_asset_import',
  'blenderSpecialist_buildAsset',
  'blender_session_sync',
  'blender.session.sync',
  'execute_blender_code',
  'mcp_blender_execute_blender_code',
  'look',
  'mcp_blender_look',
  'get_scene_info',
  'mcp_blender_get_scene_info',
  'search_assets',
  'mcp_blender_search_assets',
  'import_asset',
  'mcp_blender_import_asset',
  'get_guide',
  'mcp_blender_get_guide',
  'motion_scene_director',
  'motion_node_builder',
  'motion_procedural_modeling',
  'advancedSearch',
  'scrapePage',
  'libraryDocs',
  'findImages',
  'textToSpeech',
  'transcribeAudio',
  'gitStatus',
  'gitLog',
  'gitDiffStat',
  'grepSearch',
  'startResearchRun',
  'recordSource',
  'recordEvidence',
  'completeResearchRun',
]);

/**
 * Render the specialized card for a tool, or null when it has none.
 *
 * `input` is optional because the service tools above are fully described by
 * their output; the research tools are the reverse and read it. Every field is
 * read defensively either way — a partial output must degrade to an empty card,
 * never a crash.
 */
export function renderSpecializedTool(
  toolName: string,
  output: unknown,
  input: Record<string, unknown> = {},
): ReactNode | null {
  if (!SPECIALIZED_TOOLS.has(toolName)) return null;
  const data = (output ?? {}) as Output;
  // A failed call falls back to the generic card so the error stays visible.
  if (isFailed(data)) return null;

  switch (toolName) {
    case 'blender_asset_generate':
    case 'blender_asset_import':
    case 'blenderSpecialist_buildAsset':
    case 'blender_session_sync':
    case 'blender.session.sync':
      return <BlenderAssetCard output={data} />;
    case 'look':
    case 'mcp_blender_look':
      return <BlenderLookCard output={data} input={input} />;
    case 'execute_blender_code':
    case 'mcp_blender_execute_blender_code':
      return <BlenderCodeCard output={data} input={input} />;
    case 'get_scene_info':
    case 'mcp_blender_get_scene_info':
      return <BlenderSceneInfoCard output={data} input={input} />;
    case 'search_assets':
    case 'mcp_blender_search_assets':
      return <BlenderAssetsCard output={data} input={input} />;
    case 'import_asset':
    case 'mcp_blender_import_asset':
      return <BlenderImportCard output={data} input={input} />;
    case 'get_guide':
    case 'mcp_blender_get_guide':
      return <BlenderGuideCard output={data} input={input} />;
    case 'motion_scene_director':
      return <MotionPlanCard output={data} namespace="motion.scene.director" />;
    case 'motion_node_builder':
      return <MotionPlanCard output={data} namespace="motion.node.builder" />;
    case 'motion_procedural_modeling':
      return <MotionPlanCard output={data} namespace="motion.procedural.modeling" />;
    case 'startResearchRun':
      return <ResearchRunCard input={input} />;
    case 'recordSource':
      return <ResearchSourceCard input={input} />;
    case 'recordEvidence':
      return <ResearchEvidenceCard input={input} />;
    case 'completeResearchRun':
      // Nothing to draw without a citation list; fall back to the raw card.
      return asArray(data.citations).length > 0 ? (
        <ResearchCitationsCard output={data} />
      ) : null;
    case 'advancedSearch':
      return <SearchResultsCard output={data} />;
    case 'scrapePage':
      return <ScrapeCard output={data} />;
    case 'libraryDocs':
      return <DocsCard output={data} />;
    case 'findImages':
      return <ImageGridCard output={data} />;
    case 'textToSpeech':
      return <AudioCard output={data} />;
    case 'transcribeAudio':
      return <TranscriptCard output={data} />;
    case 'gitStatus':
      return <GitStatusCard output={data} />;
    case 'gitLog':
      return <GitLogCard output={data} />;
    case 'gitDiffStat':
      return <DiffStatCard output={data} />;
    case 'grepSearch':
      return <GrepResultsCard output={data} />;
    default:
      return null;
  }
}
