import { MemoryRouter as Router, useRoutes } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { routes } from './routes';

function AppRoutes() {
  return useRoutes(routes);
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Router>
          <AppRoutes />
        </Router>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
