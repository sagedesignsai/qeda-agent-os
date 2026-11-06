/**
 * lib/trace/export/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Export surface: self-contained animated SVG and GSAP code.
 */

export {
  compileProjectToAnimatedSvg,
  downloadAnimatedSvg,
  type AnimatedSvgOptions,
} from './animated-svg';
export {
  copyOrDownloadCode,
  generateGsapCode,
  type GsapCodeOptions,
} from './gsap-code';
