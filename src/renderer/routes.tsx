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
import Projects from './pages/Projects';
import Documents from './pages/Documents';
import Studio from './pages/Studio';
import SoundLab from './pages/SoundLab';
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

      {
        path: 'onboarding',
        element: (
          <OnboardingDialog
            open
            onClose={() => {
              // Prevent the user from escaping the empty-workspace state
              // back to a blank app; the only out is creating or importing
              // the first project.
            }}
            onOpenProject={() => {
              // Creating the first project closes onboarding and leaves the
              // user on the project they just created.
            }}
          />
        ),
      },

      { path: 'tasks', element: <Tasks /> },

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
          (await window.electron.ipc.invoke<{
            activeProjectId?: string;
          }>('settings:get')).activeProjectId ?? '';

        const anyRealProject = projects.some((p) => p.id !== 'inbox');

        if (!anyRealProject) {
          if (!cancelled) navigate('/onboarding', { replace: true });
          return;
        }

        if (activeProjectId) {
          if (!cancelled) navigate('/chat', { replace: true });
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
