/**
 * components/settings/SettingsDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The application settings shell: a section rail on the left, one section
 * rendered on the right.
 *
 * Three deliberate departures from the stock shadcn sidebar-in-a-dialog recipe,
 * each forced by something in this codebase:
 *
 * 1. NO nested <SidebarProvider>. AppLayout already wraps the whole app in one
 *    (renderer/components/AppLayout.tsx) and renders this dialog inside it. A
 *    second provider registers a *second* ⌘B/Ctrl+B listener that calls
 *    preventDefault() (ui/sidebar.tsx), so pressing ⌘B with Settings open would
 *    collapse the app rail behind the dialog. The primitives would also inherit
 *    AppLayout's 14rem --sidebar-width and paint bg-sidebar (the rail surface)
 *    inside a bg-popover dialog. A plain <nav> avoids all of it and uses the
 *    same tokens as the rest of the dialog.
 *
 * 2. <button> rather than the recipe's <a href="#">. asChild resolves through
 *    Slot.Root, so an anchor would navigate on click; a settings rail is a
 *    button list. It is marked with aria-current rather than role="tab",
 *    because tabs would oblige us to implement roving arrow-key focus.
 *
 * 3. All sections stay MOUNTED; inactive ones get the `hidden` attribute. This
 *    is what stops a half-typed API key from being discarded when you tab away
 *    and back, and it avoids refetching the live model list on every switch.
 *    `hidden` (not a class) keeps them out of the accessibility tree too.
 *
 * Each section saves only its own fields — `settings:save` merges rather than
 * replaces (main/ipc/handlers.ts), so sections cannot clobber each other.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsStoreProvider } from './settings-store';
import { ModelsView } from './views/ModelsView';
import { EmbeddingsView } from './views/EmbeddingsView';
import { AppearanceView } from './views/AppearanceView';
import { cn } from '@/lib/utils';
import { BotIcon, BoxesIcon, PaletteIcon } from 'lucide-react';

const SECTIONS = [
  { id: 'models', label: 'AI & Models', icon: BotIcon },
  { id: 'embeddings', label: 'Embeddings', icon: BoxesIcon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [section, setSection] = useState<SectionId>('models');
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,36rem)] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure {active.label.toLowerCase()}.
        </DialogDescription>

        <SettingsStoreProvider active={open}>
          <div className="flex min-h-0 flex-1">
            {/* Section rail */}
            <nav
              aria-label="Settings sections"
              className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/30 p-3"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => {
                const isActive = id === section;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      isActive
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Section body */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* `pr-12` clears the DialogContent's absolutely positioned
                  close button, which sits at top-2 right-2. */}
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 pr-12">
                <span className="text-xs text-muted-foreground">Settings</span>
                <span aria-hidden className="text-xs text-muted-foreground/50">
                  /
                </span>
                <h2 className="truncate text-sm font-medium">{active.label}</h2>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {/* All three stay mounted; `hidden` keeps the inactive ones out
                    of both layout and the accessibility tree. The ids give tests
                    and e2e a stable handle to scope to a single section. */}
                <div id="settings-panel-models" hidden={section !== 'models'}>
                  <ModelsView />
                </div>
                <div
                  id="settings-panel-embeddings"
                  hidden={section !== 'embeddings'}
                >
                  <EmbeddingsView />
                </div>
                <div
                  id="settings-panel-appearance"
                  hidden={section !== 'appearance'}
                >
                  <AppearanceView />
                </div>
              </div>
            </div>
          </div>
        </SettingsStoreProvider>
      </DialogContent>
    </Dialog>
  );
}
