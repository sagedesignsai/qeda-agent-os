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
import { Navigate, type RouteObject } from 'react-router';
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

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },

      {
        path: 'projects',
        children: [
          { index: true, element: <Projects /> },
          { path: ':projectId', element: <Projects /> },
        ],
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
