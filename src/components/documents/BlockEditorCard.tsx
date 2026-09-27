/**
 * components/documents/BlockEditorCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive editor card for a single PDF block in the composer outline.
 *
 * Provides:
 *   - Inline editing for text, tables, columns, callouts, metrics, signatures
 *   - Reordering (Move Up / Down)
 *   - Unbreakable block toggle (React-PDF wrap={false})
 *   - Forced page break toggle (React-PDF break={true})
 *   - Duplicate and Delete actions
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import {
  HeadingIcon,
  AlignLeftIcon,
  TableIcon,
  InfoIcon,
  BarChart3Icon,
  MinusIcon,
  PenToolIcon,
  ColumnsIcon,
  Trash2Icon,
  CopyIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlusIcon,
  SplitIcon,
  BoldIcon,
  ItalicIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  PdfBlock,
  HeadingBlock,
  ParagraphBlock,
  TableBlock,
  CalloutBlock,
  MetricsBlock,
  DividerBlock,
  SignatureBlock,
  ColumnsBlock,
} from '@/lib/pdf-studio/types';

interface BlockEditorCardProps {
  block: PdfBlock;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updates: Partial<PdfBlock>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function BlockEditorCard({
  block,
  isFirst,
  isLast,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: BlockEditorCardProps) {
  const getBlockMeta = () => {
    switch (block.type) {
      case 'heading':
        return {
          label: `Heading ${block.level}`,
          icon: HeadingIcon,
          color: 'text-sky-400',
        };
      case 'paragraph':
        return {
          label: 'Paragraph',
          icon: AlignLeftIcon,
          color: 'text-zinc-400',
        };
      case 'table':
        return {
          label: 'Data Table',
          icon: TableIcon,
          color: 'text-emerald-400',
        };
      case 'callout':
        return {
          label: 'Callout Box',
          icon: InfoIcon,
          color: 'text-amber-400',
        };
      case 'metrics':
        return {
          label: 'Metric Cards',
          icon: BarChart3Icon,
          color: 'text-purple-400',
        };
      case 'columns':
        return {
          label: 'Columns',
          icon: ColumnsIcon,
          color: 'text-indigo-400',
        };
      case 'divider':
        return { label: 'Divider', icon: MinusIcon, color: 'text-zinc-500' };
      case 'page-break':
        return { label: 'Page Break', icon: SplitIcon, color: 'text-rose-400' };
      case 'signature':
        return {
          label: 'Signature',
          icon: PenToolIcon,
          color: 'text-teal-400',
        };
      default:
        return { label: 'Block', icon: AlignLeftIcon, color: 'text-zinc-400' };
    }
  };

  const meta = getBlockMeta();
  const Icon = meta.icon;

  return (
    <div className="group relative rounded-lg border border-border/60 bg-card/60 p-3.5 shadow-sm transition-all hover:border-border hover:shadow-md">
      {/* Top Header Row */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60">
            <Icon className={cn('h-3.5 w-3.5', meta.color)} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-foreground/90">
            {meta.label}
          </span>
          {block.wrap === false && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              Unbreakable
            </span>
          )}
          {block.breakBefore && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
              Break Before
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
          {/* Unbreakable toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={block.wrap === false ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6 text-xs"
                onClick={() =>
                  onUpdate({ wrap: block.wrap === false ? true : false })
                }
              >
                <ShieldCheckIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {block.wrap === false
                ? 'Allow page split inside block'
                : 'Keep block together on one page (wrap=false)'}
            </TooltipContent>
          </Tooltip>

          {/* Move Up */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isFirst}
                onClick={onMoveUp}
              >
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move Up</TooltipContent>
          </Tooltip>

          {/* Move Down */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isLast}
                onClick={onMoveDown}
              >
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move Down</TooltipContent>
          </Tooltip>

          {/* Duplicate */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDuplicate}
              >
                <CopyIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate Block</TooltipContent>
          </Tooltip>

          {/* Delete */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2Icon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Block</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Block Body Editor */}
      <div className="space-y-2">
        {block.type === 'heading' && (
          <HeadingEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'paragraph' && (
          <ParagraphEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'table' && (
          <TableEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'callout' && (
          <CalloutEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'metrics' && (
          <MetricsEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'columns' && (
          <ColumnsEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'signature' && (
          <SignatureEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'divider' && (
          <DividerEditor block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'page-break' && (
          <div className="flex items-center justify-center rounded border border-dashed border-border/80 py-3 text-xs text-muted-foreground">
            --- Forced Page Break ---
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline Editors for Each Block Type ───────────────────────────────────────

function HeadingEditor({
  block,
  onUpdate,
}: {
  block: HeadingBlock;
  onUpdate: (updates: Partial<HeadingBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Level selector */}
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          {([1, 2, 3, 4] as const).map((lvl) => (
            <Button
              key={lvl}
              variant={block.level === lvl ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs font-semibold"
              onClick={() => onUpdate({ level: lvl })}
            >
              H{lvl}
            </Button>
          ))}
        </div>

        {/* Alignment */}
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          <Button
            variant={
              block.align === 'left' || !block.align ? 'secondary' : 'ghost'
            }
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'left' })}
          >
            <AlignLeftIcon className="h-3 w-3" />
          </Button>
          <Button
            variant={block.align === 'center' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'center' })}
          >
            <AlignCenterIcon className="h-3 w-3" />
          </Button>
          <Button
            variant={block.align === 'right' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-6 w-6"
            onClick={() => onUpdate({ align: 'right' })}
          >
            <AlignRightIcon className="h-3 w-3" />
          </Button>
        </div>

        {/* Tag / Badge */}
        <Input
          placeholder="Badge (optional, e.g. PROPOSAL)"
          value={block.badge || ''}
          onChange={(e) => onUpdate({ badge: e.target.value || undefined })}
          className="h-7 text-xs flex-1"
        />
      </div>

      <Input
        placeholder="Heading text..."
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        className="font-semibold"
      />

      <Input
        placeholder="Subtitle or description (optional)..."
        value={block.subtitle || ''}
        onChange={(e) => onUpdate({ subtitle: e.target.value || undefined })}
        className="h-7 text-xs text-muted-foreground"
      />
    </div>
  );
}

function ParagraphEditor({
  block,
  onUpdate,
}: {
  block: ParagraphBlock;
  onUpdate: (updates: Partial<ParagraphBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Button
          variant={block.bold ? 'secondary' : 'ghost'}
          size="icon"
          className="h-6 w-6"
          onClick={() => onUpdate({ bold: !block.bold })}
        >
          <BoldIcon className="h-3 w-3" />
        </Button>
        <Button
          variant={block.italic ? 'secondary' : 'ghost'}
          size="icon"
          className="h-6 w-6"
          onClick={() => onUpdate({ italic: !block.italic })}
        >
          <ItalicIcon className="h-3 w-3" />
        </Button>
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
            variant={block.align === 'justify' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-5 w-5"
            onClick={() => onUpdate({ align: 'justify' })}
          >
            <AlignJustifyIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Textarea
        placeholder="Paragraph content..."
        value={block.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        rows={3}
        className="text-xs font-normal"
      />
    </div>
  );
}

function TableEditor({
  block,
  onUpdate,
}: {
  block: TableBlock;
  onUpdate: (updates: Partial<TableBlock>) => void;
}) {
  const handleHeaderChange = (colIndex: number, newHeader: string) => {
    const nextCols = [...block.columns];
    nextCols[colIndex] = { ...nextCols[colIndex], header: newHeader };
    onUpdate({ columns: nextCols });
  };

  const handleCellChange = (rIdx: number, cIdx: number, val: string) => {
    const nextRows = block.rows.map((row, i) => {
      if (i === rIdx) {
        const newRow = [...row];
        newRow[cIdx] = val;
        return newRow;
      }
      return row;
    });
    onUpdate({ rows: nextRows });
  };

  const addRow = () => {
    const newRow = new Array(block.columns.length).fill('');
    onUpdate({ rows: [...block.rows, newRow] });
  };

  const deleteRow = (rIdx: number) => {
    if (block.rows.length <= 1) return;
    onUpdate({ rows: block.rows.filter((_, i) => i !== rIdx) });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-border/60 bg-muted/20 p-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60">
              {block.columns.map((col, cIdx) => (
                <th key={col.id} className="pb-1 pr-1 text-left font-semibold">
                  <Input
                    value={col.header}
                    onChange={(e) => handleHeaderChange(cIdx, e.target.value)}
                    className="h-6 text-[11px] font-bold"
                  />
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="border-b border-border/30 last:border-none"
              >
                {block.columns.map((col, cIdx) => (
                  <td key={col.id} className="py-1 pr-1">
                    <Input
                      value={row[cIdx] ?? ''}
                      onChange={(e) =>
                        handleCellChange(rIdx, cIdx, e.target.value)
                      }
                      className="h-6 text-[11px]"
                    />
                  </td>
                ))}
                <td className="py-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRow(rIdx)}
                  >
                    <Trash2Icon className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={addRow}
        >
          <PlusIcon className="h-3 w-3" />
          Add Row
        </Button>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={block.striped ?? true}
            onChange={(e) => onUpdate({ striped: e.target.checked })}
            className="rounded border-border/60 text-primary"
          />
          Zebra striping
        </label>
      </div>
    </div>
  );
}

function CalloutEditor({
  block,
  onUpdate,
}: {
  block: CalloutBlock;
  onUpdate: (updates: Partial<CalloutBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
          {(['info', 'warning', 'success', 'note', 'quote'] as const).map(
            (v) => (
              <Button
                key={v}
                variant={block.variant === v ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px] capitalize"
                onClick={() => onUpdate({ variant: v })}
              >
                {v}
              </Button>
            ),
          )}
        </div>
        <Input
          placeholder="Callout title (optional)..."
          value={block.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value || undefined })}
          className="h-7 text-xs flex-1 font-medium"
        />
      </div>

      <Textarea
        placeholder="Callout text..."
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={2}
        className="text-xs"
      />
    </div>
  );
}

function MetricsEditor({
  block,
  onUpdate,
}: {
  block: MetricsBlock;
  onUpdate: (updates: Partial<MetricsBlock>) => void;
}) {
  const updateItem = (
    id: string,
    updates: Partial<MetricsBlock['items'][0]>,
  ) => {
    const nextItems = block.items.map((i) =>
      i.id === id ? { ...i, ...updates } : i,
    );
    onUpdate({ items: nextItems });
  };

  const addItem = () => {
    onUpdate({
      items: [
        ...block.items,
        { id: nanoid(), label: 'New Metric', value: '100%', change: '+10%' },
      ],
    });
  };

  const deleteItem = (id: string) => {
    if (block.items.length <= 1) return;
    onUpdate({ items: block.items.filter((i) => i.id !== id) });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {block.items.map((item) => (
          <div
            key={item.id}
            className="relative rounded border border-border/60 bg-muted/20 p-2"
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <Input
                placeholder="Value"
                value={item.value}
                onChange={(e) => updateItem(item.id, { value: e.target.value })}
                className="h-6 text-xs font-bold w-1/2"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => deleteItem(item.id)}
              >
                <Trash2Icon className="h-3 w-3" />
              </Button>
            </div>
            <Input
              placeholder="Label"
              value={item.label}
              onChange={(e) => updateItem(item.id, { label: e.target.value })}
              className="h-5 text-[10px] text-muted-foreground mb-1"
            />
            <Input
              placeholder="Change / note"
              value={item.change || ''}
              onChange={(e) =>
                updateItem(item.id, { change: e.target.value || undefined })
              }
              className="h-5 text-[10px]"
            />
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px]"
        onClick={addItem}
      >
        <PlusIcon className="h-3 w-3" />
        Add Metric Card
      </Button>
    </div>
  );
}

function ColumnsEditor({
  block,
  onUpdate,
}: {
  block: ColumnsBlock;
  onUpdate: (updates: Partial<ColumnsBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {block.columns.map((col, idx) => (
          <div
            key={col.id}
            className="rounded border border-border/60 bg-muted/20 p-2"
          >
            <Input
              placeholder={`Column ${idx + 1} Title`}
              value={col.title || ''}
              onChange={(e) => {
                const nextCols = [...block.columns];
                nextCols[idx] = { ...col, title: e.target.value };
                onUpdate({ columns: nextCols });
              }}
              className="h-6 text-xs font-semibold mb-2"
            />
            <Textarea
              placeholder="Column content..."
              value={
                col.blocks[0] && col.blocks[0].type === 'paragraph'
                  ? (col.blocks[0] as ParagraphBlock).content
                  : ''
              }
              onChange={(e) => {
                const nextCols = [...block.columns];
                const nextChild = {
                  id: col.blocks[0]?.id || nanoid(),
                  type: 'paragraph' as const,
                  content: e.target.value,
                  fontSize: 10,
                };
                nextCols[idx] = { ...col, blocks: [nextChild] };
                onUpdate({ columns: nextCols });
              }}
              rows={3}
              className="text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SignatureEditor({
  block,
  onUpdate,
}: {
  block: SignatureBlock;
  onUpdate: (updates: Partial<SignatureBlock>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        placeholder="Signee Name"
        value={block.signeeName}
        onChange={(e) => onUpdate({ signeeName: e.target.value })}
        className="h-7 text-xs font-semibold"
      />
      <Input
        placeholder="Role / Title"
        value={block.role || ''}
        onChange={(e) => onUpdate({ role: e.target.value || undefined })}
        className="h-7 text-xs"
      />
      <Input
        placeholder="Company / Organization"
        value={block.company || ''}
        onChange={(e) => onUpdate({ company: e.target.value || undefined })}
        className="h-7 text-xs"
      />
      <Input
        placeholder="Date"
        value={block.date || ''}
        onChange={(e) => onUpdate({ date: e.target.value || undefined })}
        className="h-7 text-xs"
      />
    </div>
  );
}

function DividerEditor({
  block,
  onUpdate,
}: {
  block: DividerBlock;
  onUpdate: (updates: Partial<DividerBlock>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Style:</span>
      {(['solid', 'dashed', 'dotted'] as const).map((s) => (
        <Button
          key={s}
          variant={
            block.style === s || (!block.style && s === 'solid')
              ? 'secondary'
              : 'ghost'
          }
          size="sm"
          className="h-6 px-2 text-xs capitalize"
          onClick={() => onUpdate({ style: s })}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
