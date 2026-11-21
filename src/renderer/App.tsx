import { useEffect, useState } from 'react';
import { MemoryRouter as Router, useLocation, useNavigate, useRoutes } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { AppearanceProvider } from '@/hooks/use-appearance';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLoadingOverlay } from '@/components/AppLoadingOverlay';
import { AppLoadingContext } from '@/hooks/use-app-loading';
import { routes } from './routes';

function AppRoutes() {
  return useRoutes(routes);
}

/**
 * Routes `ui:navigate` pushes from main (tray, menu accelerators, notification
 * clicks, deep links) into the MemoryRouter. Must render inside the Router.
 *
 * Also keeps `window.__qeda_active_route__` in sync so the autonomous operator's
 * `getActiveRoute` tool can read the current route via CDP executeJavaScript.
 */
function NavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  // Keep a window-global in sync for the getActiveRoute tool (CDP read).
  useEffect(() => {
    (window as any).__qeda_active_route__ = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    return window.electron.ipc.on('ui:navigate', (payload) => {
      const path = (payload as { path?: string } | undefined)?.path;
      if (typeof path === 'string' && path.startsWith('/')) {
        navigate(path);
      }
    });
  }, [navigate]);
  return null;
}

export default function App() {
  const [loading, setLoading] = useState(true);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppearanceProvider>
      <TooltipProvider>
        <AppLoadingContext.Provider value={{ loading, setLoading }}>
          <Router>
            <NavigationBridge />
            <AppRoutes />
          </Router>
          <Toaster position="bottom-right" />
          <AppLoadingOverlay loading={loading} />
        </AppLoadingContext.Provider>
      </TooltipProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}

export { useAppLoading } from '@/hooks/use-app-loading';
