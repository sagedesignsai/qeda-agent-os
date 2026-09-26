/**
 * components/workspace/PageInfoPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Right-hand panel of the Workspace page: outline, tags, backlinks, outgoing
 * links, related pages, version history (with restore) and the page's research
 * run history. This is Vellum's transparency surface — where research lineage
 * and document history become visible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import type { PageDetail, ResearchRun } from '@/main/ipc/channels';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ListTreeIcon,
  LinkIcon,
  HistoryIcon,
  FlaskConicalIcon,
  RotateCcwIcon,
  LoaderIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageInfoPanelProps {
  detail: PageDetail | null;
  onNavigate: (pageId: string) => void;
  onChatWithContext?: (pageId: string) => void;
  onVersionRestore?: (versionId: string) => void;
}

export function PageInfoPanel({ detail, onNavigate, onChatWithContext, onVersionRestore }: PageInfoPanelProps) {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [trace, setTrace] = useState<import('@/main/ipc/channels').ResearchTrace | null>(null);

  useEffect(() => {
    if (!detail) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    setRunLoading(true);
    window.electron.ipc
      .invoke<ResearchRun[]>('research:list', { pageId: detail.page.id })
      .then((data) => {
        if (!cancelled) setRuns(data ?? []);
      })
      .finally(() => {
        if (!cancelled) setRunLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrace = async (runId: string) => {
    if (openRunId === runId) {
      setOpenRunId(null);
      setTrace(null);
      return;
    }
    const data = await window.electron.ipc.invoke<
      import('@/main/ipc/channels').ResearchTrace | null
    >('research:trace', { runId });
    setTrace(data);
    setOpenRunId(runId);
  };

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a page to see its outline, links and research history.
      </div>
    );
  }

  const headings = detail.blocks.filter((b) => b.type.startsWith('heading'));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="outline" className="flex h-full flex-col">
        <TabsList className="shrink-0 justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="outline" className="gap-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary">
            <ListTreeIcon className="h-3.5 w-3.5" /> Outline
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary">
            <LinkIcon className="h-3.5 w-3.5" /> Links
          </TabsTrigger>
          <TabsTrigger value="research" className="gap-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary">
            <FlaskConicalIcon className="h-3.5 w-3.5" /> Research
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary">
            <HistoryIcon className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-3 text-xs">
          {/* ── Outline ─────────────────────────────────────────────────── */}
          <TabsContent value="outline" className="mt-0 space-y-3">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">Outline</div>
              {headings.length === 0 ? (
                <p className="text-muted-foreground">No headings yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {headings.map((block) => (
                    <li
                      key={block.id}
                      className={cn(
                        'truncate rounded px-1.5 py-0.5 hover:bg-accent',
                        block.type === 'heading2' && 'pl-4',
                        block.type === 'heading3' && 'pl-7',
                      )}
                    >
                      {block.text || <span className="text-muted-foreground">(empty)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-1 font-medium text-muted-foreground">Tags</div>
              {detail.tags.length === 0 ? (
                <p className="text-muted-foreground">Add #tags anywhere in the page.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 font-mono">#{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {onChatWithContext && (
              <Button size="sm" className="w-full" onClick={() => onChatWithContext(detail.page.id)}>
                Chat about this page
              </Button>
            )}
          </TabsContent>

          {/* ── Links ───────────────────────────────────────────────────── */}
          <TabsContent value="links" className="mt-0 space-y-3">
            <LinkSection
              label="Backlinks"
              empty="No other page links here. Use [[Page Title]] or doc: links."
              items={detail.backlinks}
              onNavigate={onNavigate}
            />
            <LinkSection
              label="Outgoing links"
              empty="No outgoing links."
              items={detail.outgoing}
              onNavigate={onNavigate}
            />
            <LinkSection
              label="Related (shared tags)"
              empty="No tag-related pages yet."
              items={detail.related}
              onNavigate={onNavigate}
            />
          </TabsContent>

          {/* ── Research ────────────────────────────────────────────────── */}
          <TabsContent value="research" className="mt-0 space-y-2">
            {runLoading && <LoaderIcon className="h-3 w-3 animate-spin" />}
            {!runLoading && runs.length === 0 && (
              <p className="text-muted-foreground">
                No research runs yet. Ask Vellum to research this page's topic in Chat.
              </p>
            )}
            {runs.map((run) => (
              <div key={run.id} className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  onClick={() => void loadTrace(run.id)}
                >
                  <FlaskConicalIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{run.question}</span>
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 text-[9px] uppercase',
                      run.status === 'completed' && 'bg-green-500/15 text-green-600',
                      run.status === 'running' && 'bg-amber-500/15 text-amber-600',
                      run.status === 'failed' && 'bg-red-500/15 text-red-600',
                      run.status === 'cancelled' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {run.status}
                  </span>
                </button>
                {openRunId === run.id && trace && (
                  <div className="space-y-2 border-t p-2">
                    {trace.sources.length === 0 && (
                      <p className="text-muted-foreground">No sources recorded.</p>
                    )}
                    {trace.sources.map((source, i) => (
                      <div key={source.id} className="rounded bg-muted/40 p-1.5">
                        <div className="font-medium">
                          [{i + 1}]{' '}
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-dotted"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {source.title || source.url}
                            </a>
                          ) : (
                            source.title || 'Untitled source'
                          )}
                        </div>
                        {source.snippet && (
                          <p className="mt-0.5 text-muted-foreground">{source.snippet.slice(0, 200)}</p>
                        )}
                        {source.evidence.length > 0 && (
                          <ul className="mt-1 space-y-1">
                            {source.evidence.map((item) => (
                              <li key={item.id} className="border-l-2 border-primary/40 pl-2 italic text-muted-foreground">
                                “{item.quote.slice(0, 220)}”
                                {item.note && <span className="not-italic"> — {item.note}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {trace.run.report && (
                      <div>
                        <div className="mb-1 font-medium">Report</div>
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
                          {trace.run.report}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          {/* ── History ─────────────────────────────────────────────────── */}
          <TabsContent value="history" className="mt-0 space-y-1">
            {detail.versions.length === 0 && (
              <p className="text-muted-foreground">No saved versions yet.</p>
            )}
            {detail.versions.map((version) => (
              <div key={version.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent">
                <div className="flex-1">
                  <div className="font-medium">{version.title}</div>
                  <div className="text-muted-foreground">
                    {new Date(version.created_at * 1000).toLocaleString()} · {version.origin}
                  </div>
                </div>
                {onVersionRestore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5"
                    onClick={() => onVersionRestore(version.id)}
                    aria-label="Restore version"
                  >
                    <RotateCcwIcon className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function LinkSection({
  label,
  items,
  empty,
  onNavigate,
}: {
  label: string;
  items: { id: string; title: string }[];
  empty: string;
  onNavigate: (pageId: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-accent"
                onClick={() => onNavigate(item.id)}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
