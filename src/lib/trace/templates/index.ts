/**
 * lib/trace/templates/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Template surface for the browser, the new-composition dialog and main.
 */

export {
  COMPOSITION_TEMPLATES,
  getCompositionTemplate,
  instantiateCompositionTemplate,
  type CompositionTemplateMeta,
  type TemplateOptions,
} from './composition-templates';
export { createNovaTraceMarkProject } from './default-project';
export {
  instantiateSponsorCardTemplate,
  type SponsorCardFeature,
} from './sponsor-card';
export {
  instantiateLowerThirdTemplate,
  type LowerThirdConfig,
} from './lower-third';
