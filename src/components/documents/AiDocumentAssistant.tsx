/**
 * components/documents/AiDocumentAssistant.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * AI Copilot assistant for Document Studio.
 *
 * Generates structured content blocks (executive callouts, tables, KPI metrics,
 * paragraphs) directly tailored to the document context using the active LLM.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  SparklesIcon,
  Loader2Icon,
  TableIcon,
  BarChart3Icon,
  InfoIcon,
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
import { toast } from 'sonner';
import type { PdfBlock } from '@/lib/pdf-studio/types';

interface AiDocumentAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  onInsertBlock: (block: PdfBlock) => void;
}

const QUICK_PROMPTS = [
  {
    label: 'Executive Summary Callout',
    prompt: 'Draft an executive summary highlighting ROI and strategic goals',
    type: 'callout',
    icon: InfoIcon,
  },
  {
    label: 'Invoice Line Items Table',
    prompt:
      'Create a 4-row billing table for software architecture and engineering services with rates and totals',
    type: 'table',
    icon: TableIcon,
  },
  {
    label: 'Project KPI Metrics',
    prompt:
      'Generate 3 key performance metrics showing speed increase, efficiency gains, and cost reduction',
    type: 'metrics',
    icon: BarChart3Icon,
  },
  {
    label: 'Implementation Milestones',
    prompt:
      'Create a 3-phase delivery schedule table with timeline and deliverables',
    type: 'table',
    icon: TableIcon,
  },
  {
    label: 'Security & Compliance Note',
    prompt:
      'Write a callout note explaining enterprise security compliance and data isolation guarantees',
    type: 'callout',
    icon: InfoIcon,
  },
];

export function AiDocumentAssistant({
  open,
  onOpenChange,
  documentTitle,
  onInsertBlock,
}: AiDocumentAssistantProps) {
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
        onInsertBlock(res.block as PdfBlock);
        toast.success(
          res.note || 'AI generated and inserted block into document!',
        );
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
        className="w-[380px] sm:w-[440px] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-primary" />
            AI Document Copilot
          </SheetTitle>
          <SheetDescription>
            Generate structured tables, metrics, summaries, and paragraphs
            tailored to this document.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4 overflow-y-auto">
          {/* Custom Prompt Box */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <span className="text-xs font-semibold">
              Custom Generation Prompt
            </span>
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
            />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Target:</span>
                <Select value={blockType} onValueChange={setBlockType}>
                  <SelectTrigger className="h-6 w-24 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="table">Table</SelectItem>
                    <SelectItem value="metrics">Metrics</SelectItem>
                    <SelectItem value="callout">Callout</SelectItem>
                    <SelectItem value="paragraph">Paragraph</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="default"
                size="sm"
                className="h-7 gap-1.5 px-3 text-xs"
                onClick={() => handleGenerate()}
                disabled={generating || !prompt.trim()}
              >
                {generating ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            </div>
          </div>

          {/* Quick Starters */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Recommended Document Blocks
            </span>

            <div className="space-y-2">
              {QUICK_PROMPTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={generating}
                    onClick={() => handleGenerate(item.prompt, item.type)}
                    className="flex w-full items-start gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 text-left text-xs transition-all hover:border-primary hover:bg-muted/30 hover:shadow-sm"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-foreground flex items-center justify-between">
                        <span>{item.label}</span>
                        <span className="text-[10px] text-primary/80 font-normal uppercase">
                          + Add
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {item.prompt}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
