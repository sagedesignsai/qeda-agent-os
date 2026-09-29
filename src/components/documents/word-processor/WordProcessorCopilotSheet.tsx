/**
 * components/documents/word-processor/WordProcessorCopilotSheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-over AI Copilot Sheet for the Word Processor:
 *   - Whole-document outlining, section drafting, and structured generation
 *   - Quick prompt pills using ai-elements suggestions
 *   - In-place insertion into active or target position
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  SparklesIcon,
  Loader2Icon,
  TableIcon,
  BarChart3Icon,
  InfoIcon,
  FileTextIcon,
  ArrowRightIcon,
  HeadingIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { toast } from 'sonner';
import type { PdfBlock, BlockType } from '@/lib/pdf-studio/types';

interface WordProcessorCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  activeBlockId: string | null;
  onInsertBlock: (targetBlockId: string | null, block: PdfBlock) => void;
}

const DOCUMENT_COPILOT_SUGGESTIONS = [
  {
    label: 'Executive Summary Callout',
    prompt:
      'Draft an executive summary callout highlighting strategic impact, objectives, and ROI',
    type: 'callout' as BlockType,
  },
  {
    label: 'Implementation Milestones Table',
    prompt:
      'Create a 4-phase project milestones table with deliverables, owners, and timelines',
    type: 'table' as BlockType,
  },
  {
    label: 'Key KPI Metrics',
    prompt:
      'Generate 3 high-impact KPI cards showing cost savings, latency reduction, and velocity gain',
    type: 'metrics' as BlockType,
  },
  {
    label: 'Compliance & Security Note',
    prompt:
      'Draft a compliance callout detailing SOC2, air-gapped data retention, and audit logs',
    type: 'callout' as BlockType,
  },
  {
    label: 'Technical Architecture Paragraph',
    prompt:
      'Write a comprehensive technical overview of the local-first agent OS and IPC communication',
    type: 'paragraph' as BlockType,
  },
];

export function WordProcessorCopilotSheet({
  open,
  onOpenChange,
  documentTitle,
  activeBlockId,
  onInsertBlock,
}: WordProcessorCopilotSheetProps) {
  const [prompt, setPrompt] = useState('');
  const [blockType, setBlockType] = useState<string>('auto');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (customPrompt?: string, customType?: string) => {
    const finalPrompt = customPrompt || prompt;
    if (!finalPrompt.trim()) {
      toast.error('Please enter a description for the content to generate.');
      return;
    }

    setGenerating(true);
    try {
      const chosenType =
        customType || (blockType === 'auto' ? undefined : blockType);
      const res = await window.electron.ipc.invoke<{
        block: unknown;
        note?: string;
      }>('documents:ai-generate-block', {
        prompt: finalPrompt,
        blockType: chosenType,
        context: `Document title: "${documentTitle}"`,
      });

      if (res && res.block) {
        onInsertBlock(activeBlockId, res.block as PdfBlock);
        toast.success(res.note || 'AI generated and inserted element!');
        setPrompt('');
        onOpenChange(false);
      } else {
        toast.error('Could not generate block content.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate content with AI.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[440px] flex flex-col p-6"
      >
        <SheetHeader className="pb-3 border-b border-border/40">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <span>AI Document Copilot</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Generate customized sections, tables, KPI metrics, and executive
            summaries for &quot;{documentTitle}&quot;.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4 overflow-y-auto">
          {/* Custom Prompt Box */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Generate Custom Element
              </span>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger className="h-6 w-24 text-[11px]">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="callout">Callout</SelectItem>
                  <SelectItem value="metrics">Metrics</SelectItem>
                  <SelectItem value="paragraph">Paragraph</SelectItem>
                  <SelectItem value="heading">Heading</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              placeholder="e.g. Generate an itemized billing table for web design..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !generating) {
                  void handleGenerate();
                }
              }}
              className="text-xs"
              disabled={generating}
            />

            <Button
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => void handleGenerate()}
              disabled={generating || !prompt.trim()}
            >
              {generating ? (
                <>
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  <span>Drafting with AI...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>Generate & Insert</span>
                </>
              )}
            </Button>

            {generating && (
              <Shimmer className="text-[11px] text-primary text-center">
                Synthesizing document structure and layout...
              </Shimmer>
            )}
          </div>

          {/* Quick Starter Suggestions */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              One-Click Starters
            </span>

            <div className="space-y-2">
              {DOCUMENT_COPILOT_SUGGESTIONS.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    !generating && void handleGenerate(item.prompt, item.type)
                  }
                  className="group flex items-start justify-between rounded-lg border border-border/40 p-3 hover:border-primary/50 hover:bg-primary/[0.03] cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.type === 'table' && (
                        <TableIcon className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      {item.type === 'callout' && (
                        <InfoIcon className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      {item.type === 'metrics' && (
                        <BarChart3Icon className="h-3.5 w-3.5 text-purple-400" />
                      )}
                      {item.type === 'paragraph' && (
                        <FileTextIcon className="h-3.5 w-3.5 text-zinc-400" />
                      )}
                      <span>{item.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {item.prompt}
                    </p>
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
