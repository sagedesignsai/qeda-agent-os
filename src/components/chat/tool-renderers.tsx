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
  AudioLinesIcon,
  QuoteIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Output = Record<string, unknown>;

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const isFailed = (output: Output): boolean => output.success === false;

function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card text-sm', className)}>
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
      {meta && <span className="ml-auto flex items-center gap-1.5">{meta}</span>}
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
                <span className="line-clamp-1">{result.title || result.url}</span>
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
        <div className="text-xs font-medium text-foreground">{title || url}</div>
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
              <span className="text-xs font-medium">{snippet.title || 'Snippet'}</span>
              {snippet.language && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {snippet.language}
                </Badge>
              )}
            </div>
            {snippet.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{snippet.description}</p>
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
          <p className="px-3 py-3 text-xs text-muted-foreground">No documentation found.</p>
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
        <p className="px-3 py-3 text-xs text-muted-foreground">No images found.</p>
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
  const provider = asString(output.provider) || 'speech';
  const bytes = asNumber(output.bytes);

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
            {bytes !== undefined && (
              <Badge variant="outline" className="text-xs">
                {Math.round(bytes / 1024)} KB
              </Badge>
            )}
          </>
        }
      />
      <div className="px-3 py-2">
        {dataUrl ? (
          <audio controls src={dataUrl} className="h-8 w-full" />
        ) : (
          <p className="text-xs text-muted-foreground">No audio returned.</p>
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
      <CardHeader icon={<FileTextIcon className="h-3.5 w-3.5" />} label="Transcription" />
      <div className="px-3 py-2">
        {filePath && (
          <div className="mb-1 truncate text-[10px] text-muted-foreground">{filePath}</div>
        )}
        <p className="whitespace-pre-wrap text-xs">
          {text || <span className="text-muted-foreground">No speech detected.</span>}
        </p>
      </div>
    </CardShell>
  );
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/** Tool names that have a purpose-built renderer. */
export const SPECIALIZED_TOOLS = new Set([
  'advancedSearch',
  'scrapePage',
  'libraryDocs',
  'findImages',
  'textToSpeech',
  'transcribeAudio',
]);

/** Render the specialized card for a tool, or null when it has none. */
export function renderSpecializedTool(
  toolName: string,
  output: unknown,
): ReactNode | null {
  if (!SPECIALIZED_TOOLS.has(toolName)) return null;
  const data = (output ?? {}) as Output;
  // A failed call falls back to the generic card so the error stays visible.
  if (isFailed(data)) return null;

  switch (toolName) {
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
    default:
      return null;
  }
}
