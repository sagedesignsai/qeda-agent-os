/**
 * components/documents/editors/ParagraphEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline editor for Paragraph blocks:
 *   - Rich text formatting helpers: Bold, Italic, Underline, Strikethrough, Code, Links, Colors
 *   - Alignment (Left, Center, Right, Justify)
 *   - Dynamic page tokens ({{pageNumber}}, {{totalPages}})
 *   - Orphan & Widow line protection (orphans, widows)
 *   - Internal destination anchor ID (anchorId)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  CodeIcon,
  LinkIcon,
  HighlighterIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  FileTextIcon,
  SlidersIcon,
  HashIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ParagraphBlock } from '@/lib/pdf-studio/types';

interface ParagraphEditorProps {
  block: ParagraphBlock;
  onUpdate: (updates: Partial<ParagraphBlock>) => void;
}

export function ParagraphEditor({ block, onUpdate }: ParagraphEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to insert markdown or tag wrapper around selection or cursor
  const insertWrap = (
    before: string,
    after: string = before,
    placeholder = 'text',
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const original = block.content;
    const selected = original.substring(start, end) || placeholder;
    const replacement = `${before}${selected}${after}`;
    const newContent =
      original.substring(0, start) + replacement + original.substring(end);

    onUpdate({ content: newContent });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    }, 0);
  };

  return (
    <div className="space-y-2">
      {/* Formatting & Controls Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 justify-between">
        <div className="flex items-center gap-1">
          {/* Bold */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.bold ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => insertWrap('**', '**', 'bold text')}
              >
                <BoldIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold (**text**)</TooltipContent>
          </Tooltip>

          {/* Italic */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.italic ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => insertWrap('*', '*', 'italic text')}
              >
                <ItalicIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic (*text*)</TooltipContent>
          </Tooltip>

          {/* Underline */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.underline ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => insertWrap('__', '__', 'underlined')}
              >
                <UnderlineIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Underline (__text__)</TooltipContent>
          </Tooltip>

          {/* Strikethrough */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.strike ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => insertWrap('~~', '~~', 'strikethrough')}
              >
                <StrikethroughIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Strikethrough (~~text~~)</TooltipContent>
          </Tooltip>

          {/* Code */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => insertWrap('`', '`', 'code')}
              >
                <CodeIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inline Code (`code`)</TooltipContent>
          </Tooltip>

          {/* Link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  insertWrap('[', '](https://example.com)', 'link label')
                }
              >
                <LinkIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hyperlink [label](url)</TooltipContent>
          </Tooltip>

          {/* Color Highlight */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  insertWrap('{color:accent}', '{/color}', 'highlighted text')
                }
              >
                <HighlighterIcon className="h-3 w-3 text-amber-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Color Tag {'{color:accent}...{/color}'}
            </TooltipContent>
          </Tooltip>

          {/* Dynamic Page Number */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground"
                onClick={() =>
                  insertWrap('Page {{pageNumber}} of {{totalPages}}', '', '')
                }
              >
                <FileTextIcon className="h-3 w-3" />
                <span>Page #</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert Dynamic Page Counter</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Alignment */}
          <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
            <Button
              variant={
                block.align === 'left' || !block.align ? 'secondary' : 'ghost'
              }
              size="icon"
              className="h-5 w-5"
              onClick={() => onUpdate({ align: 'left' })}
            >
              <AlignLeftIcon className="h-3 w-3" />
            </Button>
            <Button
              variant={block.align === 'center' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-5 w-5"
              onClick={() => onUpdate({ align: 'center' })}
            >
              <AlignCenterIcon className="h-3 w-3" />
            </Button>
            <Button
              variant={block.align === 'right' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-5 w-5"
              onClick={() => onUpdate({ align: 'right' })}
            >
              <AlignRightIcon className="h-3 w-3" />
            </Button>
            <Button
              variant={block.align === 'justify' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-5 w-5"
              onClick={() => onUpdate({ align: 'justify' })}
            >
              <AlignJustifyIcon className="h-3 w-3" />
            </Button>
          </div>

          {/* Advanced Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showAdvanced ? 'secondary' : 'outline'}
                size="icon"
                className="h-6 w-6 text-xs"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <SlidersIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Orphans, Widows & Anchor ID</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Paragraph Textarea */}
      <Textarea
        ref={textareaRef}
        placeholder="Paragraph content (supports **bold**, *italic*, __underline__, ~~strike~~, `code`, and [link](url))..."
        value={block.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        rows={3}
        className="text-xs font-normal leading-relaxed"
      />

      {/* Advanced Drawer */}
      {showAdvanced && (
        <div className="rounded-md border border-border/70 bg-muted/20 p-2.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-4">
            {/* Orphans & Widows */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Orphans:
                </span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={block.orphans ?? 2}
                  onChange={(e) =>
                    onUpdate({
                      orphans: parseInt(e.target.value, 10) || 2,
                    })
                  }
                  className="h-6 w-12 text-center text-[11px]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Widows:
                </span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={block.widows ?? 2}
                  onChange={(e) =>
                    onUpdate({
                      widows: parseInt(e.target.value, 10) || 2,
                    })
                  }
                  className="h-6 w-12 text-center text-[11px]"
                />
              </div>
            </div>

            {/* Keep with Next */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Keep with next:
              </span>
              <Input
                type="number"
                min={0}
                value={block.minPresenceAhead ?? 0}
                onChange={(e) =>
                  onUpdate({
                    minPresenceAhead: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="h-6 w-12 text-center text-[11px]"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            {/* Anchor Destination ID */}
            <div className="flex items-center gap-1.5 flex-1">
              <HashIcon className="h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Anchor ID for links (e.g. paragraph-terms)"
                value={block.anchorId || ''}
                onChange={(e) =>
                  onUpdate({ anchorId: e.target.value || undefined })
                }
                className="h-6 text-[11px] font-mono"
              />
            </div>

            {/* Font size */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Size:</span>
              <Input
                type="number"
                min={6}
                max={24}
                value={block.fontSize ?? 10}
                onChange={(e) =>
                  onUpdate({
                    fontSize: parseInt(e.target.value, 10) || undefined,
                  })
                }
                className="h-6 w-12 text-center text-[11px]"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
