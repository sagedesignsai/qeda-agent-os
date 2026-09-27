import { useEffect, useState, type CSSProperties } from 'react';
import { Outlet, useNavigate } from 'react-router';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsDialog } from '@/components/chat/SettingsDialog';
import { GenerateNotebookProvider } from '@/components/GenerateNotebookDialog';
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog';
import { useProjects } from '@/hooks/use-projects';

/** The Inbox is seeded for every install, so it does not count as a project. */
const INBOX_PROJECT_ID = 'inbox';

export function AppLayout() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** null while we don't yet know; false until the user finishes onboarding. */
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(
    null,
  );
  /** Latched: decided once, only lowered by an explicit close. */
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { rollups, loading: projectsLoading } = useProjects();

  // A brand-new install should meet the welcome flow once. Gating on "no real
  // projects yet" too means an existing user upgrading into this build never
  // sees it, even though they have no `onboardingCompleted` flag stored.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await window.electron.ipc.invoke<{
          onboardingCompleted?: boolean;
        }>('settings:get');
        if (!cancelled) setOnboardingCompleted(s?.onboardingCompleted === true);
      } catch {
        if (!cancelled) setOnboardingCompleted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasRealProject = rollups.some(
    (r) => r.project.id !== INBOX_PROJECT_ID,
  );
  // Decide eligibility exactly once. If we kept recomputing, creating the first
  // project inside the flow would flip `hasRealProject` and slam the dialog shut
  // before the final step could be seen.
  useEffect(() => {
    if (onboardingChecked) return;
    if (onboardingCompleted === null || projectsLoading) return;
    setOnboardingChecked(true);
    if (onboardingCompleted === false && !hasRealProject) {
      setShowOnboarding(true);
    }
  }, [onboardingChecked, onboardingCompleted, projectsLoading, hasRealProject]);

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

        <OnboardingDialog
          open={showOnboarding}
          onClose={() => {
            setOnboardingCompleted(true);
            setShowOnboarding(false);
          }}
          onOpenProject={(id) => {
            setOnboardingCompleted(true);
            setShowOnboarding(false);
            navigate(`/projects/${id}`);
          }}
        />
      </SidebarProvider>
    </GenerateNotebookProvider>
  );
}
