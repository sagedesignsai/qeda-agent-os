/**
 * components/documents/word-processor/InlineAiPrompt.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline AI prompt pill triggered via Ctrl+K / Cmd+K over the active block:
 *   - Utilizes ai-elements Suggestions and Suggestion components
 *   - Quick prompt pills for rewriting, expanding, and adjusting tone
 *   - Shimmer and loading state during generation
 *   - Direct in-place replacement or insertion
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import { SparklesIcon, Loader2Icon, XIcon, ArrowRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { toast } from 'sonner';
import type {
  PdfBlock,
  ParagraphBlock,
  HeadingBlock,
} from '@/lib/pdf-studio/types';

interface InlineAiPromptProps {
  block: PdfBlock | null;
  documentTitle: string;
  onUpdateBlock: (blockId: string, updates: Partial<PdfBlock>) => void;
  onClose: () => void;
}

const INLINE_SUGGESTIONS = [
  'Make more concise',
  'Make formal and professional',
  'Expand with examples',
  'Fix grammar & flow',
  'Summarize key takeaway',
];

export function InlineAiPrompt({
  block,
  documentTitle,
  onUpdateBlock,
  onClose,
}: InlineAiPromptProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleExecute = async (customPrompt?: string) => {
    const finalPrompt = customPrompt || prompt;
    if (!finalPrompt.trim()) return;

    if (!block) {
      toast.error('Select a block to apply AI edits to.');
      return;
    }

    setLoading(true);
    try {
      let currentContent = '';
      if (block.type === 'paragraph') {
        currentContent = (block as ParagraphBlock).content;
      } else if (block.type === 'heading') {
        currentContent = (block as HeadingBlock).text;
      }

      const res = await window.electron.ipc.invoke<{
        block?: unknown;
        note?: string;
      }>('documents:ai-generate-block', {
        prompt: `Action: ${finalPrompt}. Current content: "${currentContent}". Output appropriate text for this block.`,
        blockType: block.type,
        context: `Document title: "${documentTitle}"`,
      });

      if (res && res.block) {
        const generated = res.block as Record<string, unknown>;
        if (
          block.type === 'paragraph' &&
          typeof generated.content === 'string'
        ) {
          onUpdateBlock(block.id, {
            content: generated.content,
          } as Partial<ParagraphBlock>);
        } else if (
          block.type === 'heading' &&
          typeof generated.text === 'string'
        ) {
          onUpdateBlock(block.id, {
            text: generated.text,
          } as Partial<HeadingBlock>);
        } else {
          onUpdateBlock(block.id, res.block as Partial<PdfBlock>);
        }
        toast.success(res.note || 'Updated block with AI!');
        onClose();
      } else {
        toast.error('Could not generate AI content.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to run AI command.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-30 -translate-y-full pb-2 select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-zinc-950/95 p-2.5 shadow-2xl backdrop-blur-md text-foreground max-w-xl mx-auto">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-primary animate-pulse flex-shrink-0" />
          <Input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                void handleExecute();
              }
            }}
            placeholder="Ask AI to rewrite, expand, tone-adjust, or summarize..."
            className="h-8 flex-1 text-xs bg-background/50 border-border/50 focus-visible:ring-1 focus-visible:ring-primary shadow-none"
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-8 px-2.5 gap-1 text-xs"
            onClick={() => void handleExecute()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <span>Apply</span>
                <ArrowRightIcon className="h-3 w-3" />
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="py-1">
            <Shimmer className="text-xs text-primary font-medium">
              Generating enhanced content with AI...
            </Shimmer>
          </div>
        ) : (
          <Suggestions className="pt-0.5">
            {INLINE_SUGGESTIONS.map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={(s) => void handleExecute(s)}
                variant="secondary"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted"
              >
                {suggestion}
              </Suggestion>
            ))}
          </Suggestions>
        )}
      </div>
    </div>
  );
}
