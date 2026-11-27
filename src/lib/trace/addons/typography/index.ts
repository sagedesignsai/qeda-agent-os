/**
 * lib/trace/addons/typography/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Typography add-on: six text-first blocks that complement the existing
 * title, kinetic-type and lower-third recipes.
 */

import type { TraceBlockDefinition } from '../../blocks/types';
import type { TraceAddonDefinition } from '../types';
import {
  agendaBlock,
  captionBlock,
  creditsBlock,
  splitTitleBlock,
  tickerBlock,
  typewriterBlock,
} from './blocks';

export {
  agendaBlock,
  captionBlock,
  creditsBlock,
  splitTitleBlock,
  tickerBlock,
  typewriterBlock,
};

export const TYPOGRAPHY_BLOCKS: readonly TraceBlockDefinition[] = [
  splitTitleBlock,
  captionBlock,
  tickerBlock,
  creditsBlock,
  typewriterBlock,
  agendaBlock,
];

export const TYPOGRAPHY_ADDON: TraceAddonDefinition = {
  id: 'typography',
  name: 'Typography',
  description:
    'Text-first blocks for titles, captions, tickers, credits, typewriter lines and agendas — all ordinary editable text layers.',
  category: 'Titles',
  keywords: [
    'text',
    'typography',
    'title',
    'caption',
    'subtitle',
    'ticker',
    'credits',
    'typewriter',
    'agenda',
    'copy',
  ],
  blocks: TYPOGRAPHY_BLOCKS,
  guidance: `## Typography add-on
For titles, captions, tickers, credits, typewriter lines and agendas, search the Titles category first. The Typography pack adds caption cards, marquee strips, credit rolls, split titles, typewriter lines with discrete text tracks, and numbered agendas. Insert them with \`insertBlock\`, then replace the copy with \`updateElements\`; text remains real text (not outlines) so it stays editable and searchable. Keep captions inside the subtitle-safe band and use the project's heading/body fonts when a look is set.`,
};