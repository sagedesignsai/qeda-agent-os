/**
 * components/documents/TemplatePickerModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal gallery for picking from professional starter document templates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileTextIcon,
  ReceiptIcon,
  UserCheckIcon,
  TerminalIcon,
  PlusIcon,
  SparklesIcon,
} from 'lucide-react';
import { DOCUMENT_TEMPLATES } from '@/lib/pdf-studio/templates';

interface TemplatePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplatePickerModal({
  open,
  onOpenChange,
  onSelectTemplate,
}: TemplatePickerModalProps) {
  const getTemplateIcon = (id: string) => {
    switch (id) {
      case 'executive-proposal':
        return FileTextIcon;
      case 'professional-invoice':
        return ReceiptIcon;
      case 'modern-resume':
        return UserCheckIcon;
      case 'technical-spec':
        return TerminalIcon;
      default:
        return PlusIcon;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-primary" />
            Create New Document
          </DialogTitle>
          <DialogDescription>
            Choose a professionally designed document template powered by
            React-PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
          {DOCUMENT_TEMPLATES.map((tmpl) => {
            const Icon = getTemplateIcon(tmpl.id);
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => {
                  onSelectTemplate(tmpl.id);
                  onOpenChange(false);
                }}
                className="group flex flex-col items-start rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary hover:bg-muted/30 hover:shadow-md"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2.5 group-hover:scale-105 transition-transform">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {tmpl.name}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {tmpl.description}
                </p>
                <span className="mt-3 inline-block rounded bg-muted/60 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                  {tmpl.category}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
