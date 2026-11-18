/**
 * components/workspace/renderers/CodeRenderer.tsx
 *
 * Renders code blocks with syntax highlighting using Shiki.
 * Falls back to plain <pre> if language detection fails.
 */

import React, { useEffect, useState } from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { cn } from '@/lib/utils';
import { CopyIcon, CheckIcon } from 'lucide-react';

interface CodeRendererProps {
  block: Block;
  className?: string;
}

export function CodeRenderer({ block, className }: CodeRendererProps) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // Dynamically import and use Shiki for syntax highlighting. Highlighting is
  // async, so ignore a result that arrives after the text changed or unmounted.
  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);

    const highlightCode = async () => {
      try {
        const { codeToHtml } = await import('shiki');
        const html = await codeToHtml(block.text, {
          lang: block.language || 'text',
          theme: 'github-dark',
        });
        if (!cancelled) setHighlighted(html);
      } catch {
        // Fallback: just use the plain text.
        if (!cancelled) setHighlighted(null);
      }
    };

    void highlightCode();
    return () => {
      cancelled = true;
    };
  }, [block.text, block.language]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(block.text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (highlighted) {
    return (
      <div className={cn('group relative my-2', className)}>
        <div
          className="overflow-x-auto rounded-lg bg-muted p-3 text-sm"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-muted/80 hover:bg-muted"
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <CheckIcon className="size-4 text-emerald-500" />
          ) : (
            <CopyIcon className="size-4 text-muted-foreground" />
          )}
        </button>
      </div>
    );
  }

  // Fallback: plain code block
  return (
    <div className={cn('group relative my-2', className)}>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-sm text-foreground">
        <code>{block.text}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-muted/80 hover:bg-muted"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <CheckIcon className="size-4 text-emerald-500" />
        ) : (
          <CopyIcon className="size-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
