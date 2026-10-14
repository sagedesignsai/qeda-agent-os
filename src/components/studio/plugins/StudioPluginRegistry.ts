/**
 * components/studio/plugins/StudioPluginRegistry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registry of extensible dialog plugins for Showcase Studio:
 *   - Device Mockup SVG Frame Plugin
 *   - Motion Title Intro/Outro Card Plugin
 *   - Kinetic Callout & Lower Thirds Overlay Plugin
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioPlugin } from '@/lib/studio-types';

export const BUILTIN_STUDIO_PLUGINS: StudioPlugin[] = [
  {
    id: 'plugin-device-frames',
    name: 'Device Mockup Frame Overlay',
    description: 'Wrap video recordings in SVG device frames (Browser, MacBook, iPhone, Frosted Glass).',
    category: 'frame',
    icon: 'MonitorIcon',
    version: '1.2.0',
    author: 'Qeda Core',
  },
  {
    id: 'plugin-intro-outro',
    name: 'Intro & Outro Motion Cards',
    description: 'Add high-converting intro motion cards and CTA outro cards to software walkthroughs.',
    category: 'motion',
    icon: 'FilmIcon',
    version: '1.1.0',
    author: 'Qeda Motion',
  },
  {
    id: 'plugin-kinetic-callout',
    name: 'Lower Thirds & Feature Badges',
    description: 'Display animated lower thirds, tech stack badges, and callout overlays.',
    category: 'overlay',
    icon: 'SparklesIcon',
    version: '1.0.0',
    author: 'Qeda Motion',
  },
];
