/**
 * components/workspace/editors/ImageBlockEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Specialized fields for image blocks: alt text and URL, instead of asking the
 * author to type `![alt](url)` by hand. The block text stays markdown.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { formatImageMarkdown, parseImageMarkdown } from '@/lib/markdown-blocks';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface ImageBlockEditorProps {
  block: Block;
  onChange: (text: string) => void;
  className?: string;
}

export function ImageBlockEditor({
  block,
  onChange,
  className,
}: ImageBlockEditorProps) {
  const image = parseImageMarkdown(block.text);
  const [alt, setAlt] = useState(image?.alt ?? '');
  const [url, setUrl] = useState(image?.url ?? '');
  const [failed, setFailed] = useState(false);

  // Re-seed when the editor is reused for another image block.
  useEffect(() => {
    const parsed = parseImageMarkdown(block.text);
    setAlt(parsed?.alt ?? '');
    setUrl(parsed?.url ?? '');
    setFailed(false);
  }, [block.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Only commit once the URL is non-empty; an invalid block must not be saved. */
  const commit = (nextAlt: string, nextUrl: string) => {
    setAlt(nextAlt);
    setUrl(nextUrl);
    setFailed(false);
    if (nextUrl.trim()) {
      onChange(formatImageMarkdown(nextAlt, nextUrl));
    }
  };

  return (
    <div className={cn('space-y-2 py-1', className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={alt}
          onChange={(e) => commit(e.target.value, url)}
          placeholder="Alt text"
          aria-label="Image alt text"
          className="h-8 flex-1 text-xs"
        />
        <Input
          value={url}
          onChange={(e) => commit(alt, e.target.value)}
          placeholder="https://…"
          aria-label="Image URL"
          className="h-8 flex-[2] font-mono text-xs"
        />
      </div>

      {url.trim() ? (
        failed ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            <ImageIcon className="size-4 shrink-0" />
            Could not load image.
          </div>
        ) : (
          <img
            src={url}
            alt={alt || 'Image preview'}
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-80 w-auto max-w-full rounded-md border object-contain"
          />
        )
      ) : (
        <div className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          Add an image URL to preview it.
        </div>
      )}
    </div>
  );
}
