/**
 * components/documents/inspector/TypographyPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Typography and font styling controls for Text primitives.
 *
 * Exposes:
 *   - Font Family select & Weight selector
 *   - Font Size, Line Height, Letter Spacing
 *   - Text Alignment (Left, Center, Right, Justify)
 *   - Format toggles (Bold, Italic, Underline, Strikethrough)
 *   - Dual-input token color picker (Token pill vs raw hex)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TokenDualInput, type TokenItem } from './TokenDualInput';
import type { TextNode, StyleValue } from '@/lib/pdf-studio/primitives-ast';

interface TypographyPanelProps {
  node: TextNode;
  tokens: TokenItem[];
  onChange: (patch: Partial<TextNode>) => void;
}

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times-Roman', label: 'Times New Roman' },
  { value: 'Courier', label: 'Courier Mono' },
  { value: 'Geist', label: 'Geist' },
];

const FONT_WEIGHTS = [
  { value: '300', label: '300 - Light' },
  { value: '400', label: '400 - Regular' },
  { value: '500', label: '500 - Medium' },
  { value: '600', label: '600 - Semibold' },
  { value: '700', label: '700 - Bold' },
  { value: '800', label: '800 - Extra Bold' },
];

export function TypographyPanel({
  node,
  tokens,
  onChange,
}: TypographyPanelProps) {
  const fontFamilyValue =
    typeof node.fontFamily === 'string'
      ? node.fontFamily
      : node.fontFamily?.name || 'Inter';

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Font Family & Weight */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Family
          </Label>
          <Select
            value={fontFamilyValue}
            onValueChange={(val) => onChange({ fontFamily: val })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Weight
          </Label>
          <Select
            value={String(node.fontWeight ?? (node.bold ? 700 : 400))}
            onValueChange={(val) => {
              const weight = Number(val) as 300 | 400 | 500 | 600 | 700 | 800;
              onChange({
                fontWeight: weight,
                bold: weight >= 700,
              });
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Font Size, Line Height, Letter Spacing */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Size
          </Label>
          <div className="flex items-center rounded-md border border-border/70 px-2 py-0.5 bg-background">
            <Input
              type="number"
              min={6}
              max={120}
              value={node.fontSize ?? 11}
              onChange={(e) =>
                onChange({ fontSize: Math.max(6, Number(e.target.value)) })
              }
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="ml-1 text-[10px] text-muted-foreground">pt</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Line H
          </Label>
          <div className="flex items-center rounded-md border border-border/70 px-2 py-0.5 bg-background">
            <Input
              type="number"
              step={0.05}
              min={0.8}
              max={3.0}
              value={node.lineHeight ?? 1.45}
              onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Spacing
          </Label>
          <div className="flex items-center rounded-md border border-border/70 px-2 py-0.5 bg-background">
            <Input
              type="number"
              step={0.2}
              value={node.letterSpacing ?? 0}
              onChange={(e) =>
                onChange({ letterSpacing: Number(e.target.value) })
              }
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* Formatting & Alignment buttons */}
      <div className="flex items-center justify-between gap-2">
        {/* Style Toggles */}
        <div className="flex items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
          <Button
            type="button"
            variant={node.bold ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() =>
              onChange({ bold: !node.bold, fontWeight: !node.bold ? 700 : 400 })
            }
            title="Bold"
          >
            <BoldIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.italic ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ italic: !node.italic })}
            title="Italic"
          >
            <ItalicIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.underline ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ underline: !node.underline })}
            title="Underline"
          >
            <UnderlineIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.strike ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ strike: !node.strike })}
            title="Strikethrough"
          >
            <StrikethroughIcon className="h-3 w-3" />
          </Button>
        </div>

        {/* Alignment */}
        <div className="flex items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
          <Button
            type="button"
            variant={
              node.align === 'left' || !node.align ? 'secondary' : 'ghost'
            }
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ align: 'left' })}
            title="Align Left"
          >
            <AlignLeftIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.align === 'center' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ align: 'center' })}
            title="Align Center"
          >
            <AlignCenterIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.align === 'right' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ align: 'right' })}
            title="Align Right"
          >
            <AlignRightIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant={node.align === 'justify' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6 rounded-xs cursor-pointer"
            onClick={() => onChange({ align: 'justify' })}
            title="Justify"
          >
            <AlignJustifyIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Text Color Dual-Input */}
      <TokenDualInput
        label="Text Color"
        value={node.color}
        tokens={tokens}
        type="color"
        onChange={(val: StyleValue<string>) => onChange({ color: val })}
      />
    </div>
  );
}
