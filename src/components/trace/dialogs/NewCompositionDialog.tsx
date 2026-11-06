/**
 * components/trace/dialogs/NewCompositionDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Template-driven project creation for the Trace browser.
 */

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COMPOSITION_TEMPLATES } from '@/lib/trace/templates';

export type NewCompositionPayload = {
  name: string;
  templateId: string;
  width: number;
  height: number;
};

export type NewCompositionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: NewCompositionPayload) => Promise<void> | void;
};

const SIZE_PRESETS = [
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1080 × 1080', width: 1080, height: 1080 },
  { label: '1080 × 1920', width: 1080, height: 1920 },
];

export function NewCompositionDialog({
  open,
  onOpenChange,
  onCreate,
}: NewCompositionDialogProps) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('nova-mark');
  const [size, setSize] = useState(SIZE_PRESETS[0]);
  const [creating, setCreating] = useState(false);

  const template = COMPOSITION_TEMPLATES.find(
    (entry) => entry.id === templateId,
  );
  const isBlank = templateId === 'blank';
  const width = isBlank ? size.width : (template?.width ?? 1920);
  const height = isBlank ? size.height : (template?.height ?? 1080);

  const submit = async () => {
    if (creating) return;
    const clean = name.trim();
    if (!clean) return;
    setCreating(true);
    try {
      await onCreate({ name: clean, templateId, width, height });
      setName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#0a1120] text-slate-200 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            New Trace composition
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Start from a template or a blank artboard. Everything stays editable
            and local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trace-name" className="text-[11px] text-slate-400">
              Composition name
            </Label>
            <Input
              id="trace-name"
              ref={(node) => {
                if (node && document.activeElement !== node) node.focus();
              }}
              value={name}
              placeholder="e.g. Product launch stinger"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              className="h-8 border-white/10 bg-white/[0.04] text-slate-100 placeholder:text-slate-600"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">Template</p>
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
              {COMPOSITION_TEMPLATES.map((entry) => {
                const active = entry.id === templateId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTemplateId(entry.id)}
                    className={
                      'flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ' +
                      (active
                        ? 'border-sky-400/70 bg-sky-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/25')
                    }
                  >
                    <div
                      className="flex h-16 items-center justify-center rounded-md border border-white/10"
                      style={{
                        background: `radial-gradient(circle at 50% 40%, ${entry.previewColor}33, #070b14 72%)`,
                      }}
                    >
                      <span
                        className="size-7 rounded-full border-2"
                        style={{ borderColor: entry.previewColor }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-slate-200">
                        {entry.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-slate-500">
                        {entry.description}
                      </p>
                      <p className="mt-1 font-mono text-[9px] text-slate-600">
                        {entry.width}×{entry.height} ·{' '}
                        {(entry.durationMs / 1000).toFixed(1)}s
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {isBlank ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-400">Artboard size</p>
              <div className="flex flex-wrap gap-1">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSize(preset)}
                    className={
                      'rounded border px-2 py-1 font-mono text-[10px] ' +
                      (preset.label === size.label
                        ? 'border-sky-400/70 bg-sky-500/10 text-sky-200'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/25')
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            onClick={() => void submit()}
            disabled={creating || !name.trim()}
          >
            <PlusIcon className="size-3.5" />
            {creating ? 'Creating…' : 'Create composition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
