/**
 * hooks/use-app-loading.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared loading state for the initial app boot sequence. Starts `true` so the
 * overlay covers the blank state between splash screen close and the first
 * meaningful render. ProjectsHome sets it to `false` after IPC calls resolve.
 *
 * Extracted to avoid a circular import between App.tsx and routes.tsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext } from 'react';

interface AppLoadingState {
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export const AppLoadingContext = createContext<AppLoadingState>({
  loading: true,
  setLoading: () => {},
});

export function useAppLoading() {
  return useContext(AppLoadingContext);
}
