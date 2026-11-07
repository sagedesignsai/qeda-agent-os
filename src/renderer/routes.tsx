/**
 * renderer/routes.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The application route tree, expressed as nested `RouteObject`s.
 *
 * Structure (not exhaustive — Chat and Workspace are called out because they
 * are the two that take a param and are driven by a rail submenu):
 *   <AppLayout>                     – persistent shell (rail + framed content)
 *     ├── /                         – redirects to /tasks
 *     ├── /chat                     – Chat index (blank conversation; the
 *     │                               session is created lazily by the first
 *     │                               message, not by landing here)
 *     │     └── /chat/:sessionId    – a specific conversation
 *     ├── /workspace                – Notebooks index (no page selected)
 *     │     ├── /workspace/:notebookId
 *     │     └── /workspace/:notebookId/:pageId
 *     └── *                         – redirects to /tasks
 *
 * The route params mirror the selection held in the rail's section submenus
 * (ChatMenu / WorkspaceMenu), which is what keeps a single sidebar in play.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Navigate, useNavigate, type RouteObject } from 'react-router';
import { useEffect } from 'react';
import { AppLayout } from './components/AppLayout';
import Chat from './pages/Chat';
import Terminal from './pages/Terminal';
import Tasks from './pages/Tasks';
import Correspondence from './pages/Correspondence';
import Projects from './pages/Projects';
import Documents from './pages/Documents';
import Studio from './pages/Studio';
import Music from './pages/Music';
import Motion from './pages/Motion';
import MotionBrowser from './pages/MotionBrowser';
import Trace from './pages/Trace';
import TraceBrowser from './pages/TraceBrowser';
import Workspace from './pages/Workspace';
import Builder from './pages/Builder';
import OfflineAI from './pages/OfflineAI';
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog';
import { useAppLoading } from '@/hooks/use-app-loading';
import type { Project } from '@/main/ipc/channels';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      /**
       * The app's starting point is conditional:
       *
       *   1. No projects at all        → start on /onboarding (create the first
       *      project before anything else makes sense).
       *   2. Otherwise                 → start on /tasks (the work dashboard).
       *
       * Tasks is the landing page because it shows what needs attention right
       * now — today's blocks, overdue items, and active work — giving immediate
       * orientation before the user navigates to a specific tool.
       *
       * This is the first render decision; the conditional redirect itself is
       * computed inside the route element so it can read the current project
       * list without a separate top-level context.
       */
      { index: true, element: <ProjectsHome /> },

      {
        path: 'projects',
        children: [
          { index: true, element: <Projects /> },
          { path: ':projectId', element: <Projects /> },
        ],
      },

      { path: 'onboarding', element: <OnboardingRoute /> },

      { path: 'tasks', element: <Tasks /> },

      // Correspondence is contact-centric rather than project-centric, so it has
      // no sub-params yet: the rail's project scope arrives as `?project=` via
      // `withScope`, exactly as it does for Tasks and Documents.
      { path: 'correspondence', element: <Correspondence /> },

      // Motion (product-showcase 3D) is deliberately a separate route from
      // Showcase Studio (/studio, screen captures). Same family of output,
      // different engine — see docs/motion-studio-spec.md.
      {
        path: 'motion',
        children: [
          { index: true, element: <MotionBrowser /> },
          { path: ':projectId', element: <Motion /> },
        ],
      },

      // Nova Trace is the 2D vector motion workspace: SVG elements and keyframe
      // tracks. It shares no document, store or renderer with 3D Motion.
      {
        path: 'trace',
        children: [
          { index: true, element: <TraceBrowser /> },
          { path: ':projectId', element: <Trace /> },
        ],
      },

      { path: 'builder', element: <Builder /> },

      {
        path: 'documents',
        children: [
          { index: true, element: <Documents /> },
          { path: ':documentId', element: <Documents /> },
        ],
      },

      {
        path: 'studio',
        children: [
          { index: true, element: <Studio /> },
          { path: ':takeId', element: <Studio /> },
        ],
      },

      {
        path: 'music',
        children: [
          { index: true, element: <Music /> },
          { path: ':playlistId', element: <Music /> },
        ],
      },

      {
        path: 'terminal',
        children: [
          { index: true, element: <Terminal /> },
          { path: ':sessionId', element: <Terminal /> },
        ],
      },

      {
        path: 'chat',
        children: [
          { index: true, element: <Chat /> },
          { path: ':sessionId', element: <Chat /> },
        ],
      },

      {
        path: 'workspace',
        children: [
          { index: true, element: <Workspace /> },
          { path: ':notebookId', element: <Workspace /> },
          { path: ':notebookId/:pageId', element: <Workspace /> },
        ],
      },

      // Offline AI — local, private inference with Transformers.js models.
      { path: 'offline-ai', element: <OfflineAI /> },

      { path: '*', element: <Navigate to="/tasks" replace /> },
    ],
  },
];

/**
 * Conditional homepage: /tasks as the default landing page, or /onboarding when
 * the workspace is empty (no projects). Signals the app loading overlay to fade
 * out once IPC calls resolve.
 */
function ProjectsHome() {
  const navigate = useNavigate();
  const { setLoading } = useAppLoading();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const projects =
          await window.electron.ipc.invoke<Project[]>('projects:list');
        const activeProjectId =
          (
            await window.electron.ipc.invoke<{
              activeProjectId?: string;
            }>('settings:get')
          ).activeProjectId ?? '';

        // Signal that initial data loading is complete — overlay will fade out
        if (!cancelled) setLoading(false);

        const anyRealProject = projects.some((p) => p.id !== 'inbox');

        if (!anyRealProject) {
          if (!cancelled) navigate('/onboarding', { replace: true });
          return;
        }

        if (!cancelled) navigate('/tasks', { replace: true });
      } catch {
        // On error, still hide the overlay and fall back to tasks
        if (!cancelled) setLoading(false);
        if (!cancelled) navigate('/tasks', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, setLoading]);

  return null;
}

/**
 * The empty-workspace state. Onboarding is a dialog, so it needs a route that
 * stays mounted until the flow is left; both of its exits navigate, otherwise
 * skipping would leave the user on a route whose dialog is still `open`.
 */
function OnboardingRoute() {
  const navigate = useNavigate();
  return (
    <OnboardingDialog
      open
      onClose={() => navigate('/tasks', { replace: true })}
      onOpenProject={(id) =>
        navigate(`/projects/${encodeURIComponent(id)}`, { replace: true })
      }
    />
  );
}
