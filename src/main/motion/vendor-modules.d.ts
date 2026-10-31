/**
 * main/motion/vendor-modules.d.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal CJS declarations for runtime dependencies that do not ship types.
 */

declare module 'write-file-atomic' {
  const writeFileAtomic: (
    filename: string,
    data: string | Uint8Array,
    options?: unknown,
  ) => Promise<void>;
  export default writeFileAtomic;
}
