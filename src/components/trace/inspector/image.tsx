/**
 * components/trace/inspector/image.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Source section for `<image>` elements. Until now an image added from the
 * layer menu was created with an empty `href`, and nothing in the panel could
 * fill it in — the element simply rendered nothing. This section owns the two
 * attributes the serializer reads for images (`href` and
 * `preserveAspectRatio`) and previews whatever source is currently set, on a
 * checkerboard so transparent PNG/SVG sources stay readable.
 *
 * Neither attribute is animatable, so these are plain committed fields (blur or
 * Enter) rather than `ScrubField`s with a stopwatch.
 *
 * The field can also pick a file from the project through the shared
 * ProjectFileBrowserDialog. The chosen file is inlined as a `data:` URI rather
 * than referenced by its catalog URL: the catalog URL is an app-only scheme, so
 * an exported SVG or poster would lose the picture.
 */

import { useState } from 'react';
import {
  FolderSearchIcon,
  ImageIcon,
  ImageOffIcon,
  Link2Icon,
  Loader2Icon,
  XIcon,
} from 'lucide-react';

import { ProjectFileBrowserDialog } from '@/components/projects/ProjectFileBrowserDialog';

import { FieldRow } from '@/components/trace/inspector/fields';
import { PanelSection } from '@/components/trace/inspector/section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ProjectFileDataUrlResult,
  ProjectFileSelection,
} from '@/main/ipc/channels';
import type { TraceElement } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

const DEFAULT_PRESERVE_ASPECT = 'xMidYMid meet';

/** The values worth offering; the full spec is 9 alignments × meet/slice. */
const PRESERVE_ASPECT_OPTIONS = [
  { value: 'xMidYMid meet', label: 'Meet · centre' },
  { value: 'xMinYMin meet', label: 'Meet · top left' },
  { value: 'xMidYMin meet', label: 'Meet · top' },
  { value: 'xMaxYMin meet', label: 'Meet · top right' },
  { value: 'xMinYMid meet', label: 'Meet · left' },
  { value: 'xMaxYMid meet', label: 'Meet · right' },
  { value: 'xMinYMax meet', label: 'Meet · bottom left' },
  { value: 'xMidYMax meet', label: 'Meet · bottom' },
  { value: 'xMaxYMax meet', label: 'Meet · bottom right' },
  { value: 'xMidYMid slice', label: 'Slice · centre' },
  { value: 'xMinYMin slice', label: 'Slice · top left' },
  { value: 'none', label: 'Stretch (none)' },
];

const CHECKERBOARD = {
  backgroundImage:
    'linear-gradient(45deg, rgba(127,127,127,0.22) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.22) 75%), linear-gradient(45deg, rgba(127,127,127,0.22) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.22) 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 6px 6px',
} as const;

/* ── Source description ───────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A short, human label for the source: what it is, plus its size when it is
 * embedded (the case where "did this bloat my project?" actually matters).
 * Exports keep a remote href as a link, so the distinction is worth showing.
 */
function describeSource(source: string): {
  kind: string;
  detail: string;
  /** MIME type, when the source is a data URI. */
  mime?: string;
} {
  if (!source) return { kind: 'No source', detail: 'empty' };

  if (source.startsWith('data:')) {
    const match = /^data:([^;,]+)(;base64)?,/i.exec(source);
    if (!match) return { kind: 'Embedded', detail: 'data URI' };
    const mime = match[1];
    const base64 = Boolean(match[2]);
    const payloadLength = source.length - match[0].length;
    const bytes = base64
      ? Math.floor((payloadLength * 3) / 4)
      : payloadLength;
    const format = mime.replace(/^image\//, '').replace('svg+xml', 'svg');
    return {
      kind: 'Embedded',
      detail: `${format.toUpperCase()} · ${formatBytes(bytes)}`,
      mime,
    };
  }

  if (/^(https?:)?\/\//i.test(source)) {
    return { kind: 'Linked', detail: 'external URL' };
  }

  if (source.startsWith('blob:')) {
    return { kind: 'Embedded', detail: 'in-memory blob' };
  }

  return { kind: 'Linked', detail: 'local path' };
}

/* ── Preview ──────────────────────────────────────────────────────────────── */

function SourcePreview({ source }: { source: string }) {
  // Track the source that failed rather than a boolean, so swapping the href
  // clears the error state without an effect.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = failedSource === source;

  return (
    <div
      className="flex h-[96px] items-center justify-center overflow-hidden rounded-md border border-border/60"
      style={CHECKERBOARD}
    >
      {source && !failed ? (
        <img
          src={source}
          alt="Image source preview"
          draggable={false}
          onError={() => setFailedSource(source)}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          {source ? (
            <ImageOffIcon className="size-4 text-rose-400/80" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground/60" />
          )}
          <span className="text-[10px] leading-tight text-muted-foreground">
            {source ? 'Cannot load this source' : 'No image source yet'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Pickers ──────────────────────────────────────────────────────────────── */

function SourcePickerButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Choose an image from project files"
      aria-label="Choose an image from project files"
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {busy ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <FolderSearchIcon className="size-3" />
      )}
    </button>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────── */

export function ImageSection({
  element,
  projectId,
}: {
  element: TraceElement;
  /** Document project to open the file browser in; omit for no initial scope. */
  projectId?: string | null;
}) {
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  // `src` is the legacy key the serializer still accepts for images.
  const source = String(element.attributes.href ?? element.attributes.src ?? '');
  const preserveAspect = String(
    element.attributes.preserveAspectRatio ?? DEFAULT_PRESERVE_ASPECT,
  );

  const [draft, setDraft] = useState(source);
  const [lastSource, setLastSource] = useState(source);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  if (source !== lastSource) {
    setLastSource(source);
    setDraft(source);
  }

  if (element.type !== 'image') return null;

  const commit = () => {
    const next = draft.trim();
    if (next === source) return;
    updateAttributes(element.id, { href: next });
  };

  const embedFile = async (files: ProjectFileSelection[]) => {
    const file = files[0];
    if (!file) return;
    setEmbedError(null);
    setEmbedding(true);
    try {
      const result = await window.electron.ipc.invoke<ProjectFileDataUrlResult>(
        'project-files:read-data-url',
        { projectId: file.projectId, fileId: file.id },
      );
      updateAttributes(element.id, { href: result.dataUrl });
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : String(err));
    } finally {
      setEmbedding(false);
    }
  };

  // Keep a value we don't offer (e.g. from an imported SVG) visible instead of
  // letting Radix blank the trigger.
  const options = PRESERVE_ASPECT_OPTIONS.some(
    (option) => option.value === preserveAspect,
  )
    ? PRESERVE_ASPECT_OPTIONS
    : [
        ...PRESERVE_ASPECT_OPTIONS,
        { value: preserveAspect, label: `${preserveAspect} (custom)` },
      ];

  const { kind, detail, mime } = describeSource(source);
  // An embedded payload is thousands of characters of base64 — showing it in an
  // editable field is both unreadable and slow to lay out, so an embedded
  // source collapses to a summary with Replace/Clear instead.
  const embedded = source.startsWith('data:');

  return (
    <PanelSection title="Image">
      <SourcePreview source={source} />

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span
          className={cn(
            'font-medium',
            source ? 'text-muted-foreground' : 'text-amber-400/80',
          )}
        >
          {kind}
        </span>
        <span className="truncate font-mono text-muted-foreground/70" title={detail}>
          {detail}
        </span>
      </div>

      <FieldRow label="Source" wide>
        {embedded ? (
          <div className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-input bg-muted/20 px-1.5">
            <ImageIcon className="size-3 shrink-0 text-muted-foreground" />
            <span
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
              title={detail}
            >
              {`data:${mime ?? 'image/*'};base64,…`}
            </span>
            <SourcePickerButton
              busy={embedding}
              onClick={() => setBrowserOpen(true)}
            />
            <button
              type="button"
              onClick={() => updateAttributes(element.id, { href: '' })}
              title="Remove this image"
              aria-label="Remove this image"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 outline-none transition-colors hover:text-rose-400 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-input bg-muted/20 px-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
            <Link2Icon className="size-3 shrink-0 text-muted-foreground" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setDraft(source);
                  event.currentTarget.blur();
                }
              }}
              placeholder="Paste a URL, or pick a file ›"
              aria-label="Image source"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <SourcePickerButton
              busy={embedding}
              onClick={() => setBrowserOpen(true)}
            />
          </div>
        )}
      </FieldRow>

      {embedError ? (
        <p className="text-[10px] leading-relaxed text-rose-400">
          {embedError}
        </p>
      ) : null}

      <FieldRow label="Aspect" wide>
        <Select
          value={preserveAspect}
          onValueChange={(next) =>
            updateAttributes(element.id, { preserveAspectRatio: next })
          }
        >
          <SelectTrigger
            aria-label="Preserve aspect ratio"
            className="h-7 bg-muted/20 text-[11px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <ProjectFileBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        projectId={projectId ?? null}
        mode="select"
        accept={['image']}
        title="Choose an image"
        confirmLabel="Use image"
        onSelect={(files) => void embedFile(files)}
      />
    </PanelSection>
  );
}
