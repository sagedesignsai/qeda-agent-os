import { useEffect } from 'react';
import { MemoryRouter as Router, useNavigate, useRoutes } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Router>
          <NavigationBridge />
          <AppRoutes />
        </Router>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
