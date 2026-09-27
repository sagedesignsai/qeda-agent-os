/**
 * components/documents/DocumentSettingsModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for document page setup, styling theme, and header/footer rules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { DOCUMENT_THEMES } from '@/lib/pdf-studio/themes';
import type {
  PdfDocument,
  PageSize,
  PageOrientation,
  DocumentTheme,
  DocumentMargins,
} from '@/lib/pdf-studio/types';

interface DocumentSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: PdfDocument;
  onUpdateTitle: (title: string) => void;
  onUpdatePageSize: (size: PageSize) => void;
  onUpdateOrientation: (orientation: PageOrientation) => void;
  onUpdateTheme: (theme: DocumentTheme) => void;
  onUpdateMargins: (margins: Partial<DocumentMargins>) => void;
  onUpdateHeader: (header: Partial<PdfDocument['settings']['header']>) => void;
  onUpdateFooter: (footer: Partial<PdfDocument['settings']['footer']>) => void;
}

export function DocumentSettingsModal({
  open,
  onOpenChange,
  doc,
  onUpdateTitle,
  onUpdatePageSize,
  onUpdateOrientation,
  onUpdateTheme,
  onUpdateMargins,
  onUpdateHeader,
  onUpdateFooter,
}: DocumentSettingsModalProps) {
  const { settings } = doc;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Page & Layout Settings</DialogTitle>
          <DialogDescription>
            Configure page format, margins, color palette, and dynamic
            headers/footers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Document Title</Label>
            <Input
              id="doc-title"
              value={doc.title}
              onChange={(e) => onUpdateTitle(e.target.value)}
            />
          </div>

          {/* Page Setup */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Page Size</Label>
              <Select
                value={settings.pageSize}
                onValueChange={(v) => onUpdatePageSize(v as PageSize)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                  <SelectItem value="LETTER">Letter (8.5 × 11 in)</SelectItem>
                  <SelectItem value="LEGAL">Legal (8.5 × 14 in)</SelectItem>
                  <SelectItem value="TABLOID">Tabloid (11 × 17 in)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Orientation</Label>
              <Select
                value={settings.orientation}
                onValueChange={(v) => onUpdateOrientation(v as PageOrientation)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Color Theme */}
          <div className="space-y-1.5">
            <Label>Color & Typography Theme</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {Object.entries(DOCUMENT_THEMES).map(([key, t]) => {
                const isSelected = settings.theme.name === t.name;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onUpdateTheme(t)}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-muted/30'
                        : 'border-border/60 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: t.accentColor }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: t.surfaceColor }}
                      />
                    </div>
                    <span className="font-semibold text-foreground">
                      {t.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t.fontFamily}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Margins */}
          <div className="space-y-1.5">
            <Label>Page Margins (points, 72 pt = 1 inch)</Label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground">Top</span>
                <Input
                  type="number"
                  value={settings.margins.top}
                  onChange={(e) =>
                    onUpdateMargins({ top: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Right</span>
                <Input
                  type="number"
                  value={settings.margins.right}
                  onChange={(e) =>
                    onUpdateMargins({ right: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">
                  Bottom
                </span>
                <Input
                  type="number"
                  value={settings.margins.bottom}
                  onChange={(e) =>
                    onUpdateMargins({ bottom: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Left</span>
                <Input
                  type="number"
                  value={settings.margins.left}
                  onChange={(e) =>
                    onUpdateMargins({ left: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Header Settings */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Running Page Header</span>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.header.enabled}
                  onChange={(e) =>
                    onUpdateHeader({ enabled: e.target.checked })
                  }
                  className="rounded border-border text-primary"
                />
                Enabled
              </label>
            </div>
            {settings.header.enabled && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Input
                  placeholder="Left text (e.g. Document Title)"
                  value={settings.header.leftText || ''}
                  onChange={(e) =>
                    onUpdateHeader({ leftText: e.target.value || undefined })
                  }
                  className="h-7 text-xs"
                />
                <Input
                  placeholder="Right text (e.g. Confidential)"
                  value={settings.header.rightText || ''}
                  onChange={(e) =>
                    onUpdateHeader({ rightText: e.target.value || undefined })
                  }
                  className="h-7 text-xs"
                />
              </div>
            )}
          </div>

          {/* Footer Settings */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Running Page Footer</span>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.footer.enabled}
                  onChange={(e) =>
                    onUpdateFooter({ enabled: e.target.checked })
                  }
                  className="rounded border-border text-primary"
                />
                Enabled
              </label>
            </div>
            {settings.footer.enabled && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Left footer text (e.g. Company name)"
                    value={settings.footer.leftText || ''}
                    onChange={(e) =>
                      onUpdateFooter({ leftText: e.target.value || undefined })
                    }
                    className="h-7 text-xs"
                  />
                  <Select
                    value={settings.footer.pageNumberFormat || 'page_of_total'}
                    onValueChange={(v) =>
                      onUpdateFooter({
                        pageNumberFormat: v as 'simple' | 'page_of_total',
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page_of_total">
                        Page X of Y (e.g. Page 1 of 3)
                      </SelectItem>
                      <SelectItem value="simple">
                        Simple Number (e.g. 1)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
