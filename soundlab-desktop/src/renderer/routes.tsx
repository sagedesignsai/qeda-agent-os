/**
 * renderer/routes.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Single route to the SoundLab page. The standalone app has no sidebar,
 * no project scope, no onboarding — just the DAW.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Navigate, type RouteObject } from 'react-router';
import SoundLab from './pages/SoundLab';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <SoundLab />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];
