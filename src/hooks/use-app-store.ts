/**
 * hooks/use-app-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-export of the Zustand application store for consumers importing from `@/hooks`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { useAppStore, type AppStoreState } from '@/stores/app-store';
