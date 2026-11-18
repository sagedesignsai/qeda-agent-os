/**
 * components/workspace/renderers/TableRenderer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a pipe-table block as a real HTML table. The block's text is the
 * markdown source, so this stays a pure view over the stored content.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { Block } from '@/lib/markdown-blocks';
import { parseTableMarkdown } from '@/lib/markdown-blocks';
import { parseInlineMarkdown, renderInlineTokens } from '@/lib/inline-markdown';
import { cn } from '@/lib/utils';

interface TableRendererProps {
  block: Block;
  className?: string;
}

export function TableRenderer({ block, className }: TableRendererProps) {
  const table = parseTableMarkdown(block.text);

  if (!table) {
    // A block typed as a table but holding invalid text should never vanish.
    return (
      <pre className={cn('text-sm text-muted-foreground', className)}>
        {block.text}
      </pre>
    );
  }

  return (
    <div className={cn('my-2 overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {table.header.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border border-border bg-muted/40 px-3 py-2 text-left font-semibold text-foreground"
              >
                {renderInlineTokens(parseInlineMarkdown(cell))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border border-border px-3 py-2 align-top text-foreground"
                >
                  {renderInlineTokens(parseInlineMarkdown(cell))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
