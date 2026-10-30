/**
 * renderer/routes.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The application route tree, expressed as nested `RouteObject`s.
 *
 * Structure (not exhaustive — Chat and Workspace are called out because they
 * are the two that take a param and are driven by a rail submenu):
 *   <AppLayout>                     – persistent shell (rail + framed content)
 *     ├── /                         – redirects to /projects
 *     ├── /chat                     – Chat index (blank conversation; the
 *     │                               session is created lazily by the first
 *     │                               message, not by landing here)
 *     │     └── /chat/:sessionId    – a specific conversation
 *     ├── /workspace                – Knowledge index (no page selected)
 *     │     ├── /workspace/:notebookId
 *     │     └── /workspace/:notebookId/:pageId
 *     └── *                         – redirects to /projects
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
import SoundLab from './pages/SoundLab';
import Motion from './pages/Motion';
import MotionBrowser from './pages/MotionBrowser';
import Workspace from './pages/Workspace';
import Builder from './pages/Builder';
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog';
import type { Project } from '@/main/ipc/channels';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      /**
       * The app's starting point is now conditional on project state:
       *
       *   1. An active project is set  → start on /chat (the research surface).
       *   2. No active project, but at
       *      least one project exists → start on /projects.
       *   3. No projects at all        → start on /onboarding (create the first
       *      project before anything else makes sense).
       *
       * This is the first render decision; the conditional redirect itself is
       * computed inside the route element so it can read the current project
       * list and active-project id without a separate top-level context.
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
        path: 'soundlab',
        children: [
          { index: true, element: <SoundLab /> },
          { path: ':sessionId', element: <SoundLab /> },
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

      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
];

/**
 * Conditional homepage: /chat when there is an active project, /projects when
 * there are projects but no active one, and /onboarding when the workspace is
 * empty.
 */
function ProjectsHome() {
  const navigate = useNavigate();

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

        const anyRealProject = projects.some((p) => p.id !== 'inbox');

        if (!anyRealProject) {
          if (!cancelled) navigate('/onboarding', { replace: true });
          return;
        }

        if (activeProjectId) {
          if (!cancelled) {
            navigate(`/chat?project=${encodeURIComponent(activeProjectId)}`, {
              replace: true,
            });
          }
          return;
        }

        if (!cancelled) navigate('/projects', { replace: true });
      } catch {
        if (!cancelled) navigate('/projects', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
      onClose={() => navigate('/projects', { replace: true })}
      onOpenProject={(id) =>
        navigate(`/projects/${encodeURIComponent(id)}`, { replace: true })
      }
    />
  );
}
