import { useEffect, useState, type CSSProperties } from 'react';
import { Outlet } from 'react-router';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsDialog } from '@/components/chat/SettingsDialog';
import { GenerateNotebookProvider } from '@/components/GenerateNotebookDialog';

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global keyboard shortcuts: ⌘K / Ctrl+K opens the palette, ⌘, opens settings.
  // (The sidebar's own ⌘B toggle is registered by SidebarProvider.)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <GenerateNotebookProvider>
      {/* The rail is narrowed from the primitive's 16rem default for density.
          `SidebarProvider` merges `style` after its own defaults, so this
          overrides the token without editing generated code. */}
      <SidebarProvider
        defaultOpen={false}
        className="h-svh overflow-hidden bg-sidebar"
        style={{ '--sidebar-width': '14rem' } as CSSProperties}
      >
        <AppSidebar
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* The floating variant no longer frames the main area, so the inset
            treatment (gutter + rounded, ringed panel) is applied explicitly. */}
        <SidebarInset className="min-w-0 flex-1 flex-col overflow-hidden md:m-2 md:ml-0 md:rounded-xl md:shadow-sm md:ring-1 md:ring-sidebar-border">
          <Outlet />
        </SidebarInset>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </SidebarProvider>
    </GenerateNotebookProvider>
  );
}
