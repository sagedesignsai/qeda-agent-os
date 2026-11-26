/**
 * components/studio/features/FeatureDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared shell for Studio feature dialogs (blend modes, text animators, shape
 * editing, effect browsing, …).
 *
 * Guarantees a consistent header, optional inline help, scrollable body and an
 * Apply/Cancel footer. Radix Dialog owns focus trapping, Escape-to-close and
 * focus return to the trigger, so every feature dialog inherits the same
 * accessible behaviour.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FeatureDialogWidth = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH_CLASS: Record<FeatureDialogWidth, string> = {
  sm: 'w-[min(420px,calc(100vw-2rem))]',
  md: 'w-[min(560px,calc(100vw-2rem))]',
  lg: 'w-[min(760px,calc(100vw-2rem))]',
  xl: 'w-[min(960px,calc(100vw-2rem))]',
};

interface FeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Inline, always-visible help explaining the feature. */
  helpText?: string;
  width?: FeatureDialogWidth;
  children: ReactNode;
  applyLabel?: string;
  applyDisabled?: boolean;
  onApply: () => void;
  /** Rendered between the body and the footer, e.g. a live preview. */
  preview?: ReactNode;
  testId?: string;
}

export function FeatureDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  helpText,
  width = 'md',
  children,
  applyLabel = 'Apply',
  applyDisabled = false,
  onApply,
  preview,
  testId,
}: FeatureDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testId}
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0',
          WIDTH_CLASS[width],
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {helpText && (
            <p className="flex items-start gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3 shrink-0 text-primary" />
              <span>{helpText}</span>
            </p>
          )}
          {preview}
          {children}
        </div>

        <DialogFooter className="-mx-0 -mb-0 shrink-0 rounded-b-none border-t border-border/60 bg-muted/10 px-4 py-2.5 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
            disabled={applyDisabled}
          >
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}