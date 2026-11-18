/**
 * components/workspace/renderers/ImageRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a standalone markdown image block, with a React-managed fallback
 * when the source cannot be loaded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseImageMarkdown } from '@/lib/markdown-blocks';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface ImageRendererProps {
  block: Block;
  className?: string;
}

export function ImageRenderer({ block, className }: ImageRendererProps) {
  const image = parseImageMarkdown(block.text);
  const [failed, setFailed] = useState(false);

  // Retry a new URL after the source changes.
  useEffect(() => {
    setFailed(false);
  }, [block.text]);

  if (!image?.url || failed) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground',
          className,
        )}
      >
        <ImageIcon className="size-4 shrink-0" />
        <span>
          {image?.url
            ? `Could not load image: ${image.url}`
            : 'Invalid image — use ![alt](https://…)'}
        </span>
      </div>
    );
  }

  return (
    <figure className={cn('my-2 space-y-2', className)}>
      <img
        src={image.url}
        alt={image.alt || 'Image'}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-96 w-auto max-w-full rounded-lg border object-contain"
      />
      {image.alt && (
        <figcaption className="text-xs text-muted-foreground">
          {image.alt}
        </figcaption>
      )}
    </figure>
  );
}
