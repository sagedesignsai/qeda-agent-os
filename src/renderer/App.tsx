import { useEffect, useState } from 'react';
import { MemoryRouter as Router, useNavigate, useRoutes } from 'react-router';
import { ThemeProvider } from 'next-themes';
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
 */
function NavigationBridge() {
  const navigate = useNavigate();
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
    </ThemeProvider>
  );
}

export { useAppLoading } from '@/hooks/use-app-loading';
