/**
 * services/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registry of the external *services* Vellum can use beyond chat models:
 * search, scraping, documentation lookup, images and speech.
 *
 * Deliberately dependency-free (like ai/registry.ts) so settings, IPC and the
 * tool layer can all import it without cycles. Each entry declares the env
 * variable(s) that can carry its key; the value itself is never read here —
 * `keys.ts` resolves it (encrypted Settings first, then environment).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ServiceCategory =
  'search' | 'scrape' | 'docs' | 'images' | 'speech';

export interface ServiceConfig {
  /** Stable id used in settings, the service key map, IPC and tool params. */
  id: string;
  /** Human-readable label. */
  name: string;
  category: ServiceCategory;
  /** Environment variable(s) checked for a key, in priority order. */
  apiKeyEnvs: string[];
  /** One-line description surfaced in the Settings dialog. */
  note: string;
  /** Where to get a key / read the docs. */
  docsUrl: string;
  /** True when the service works with no key at all. */
  keyless?: boolean;
}

export const SERVICES: ServiceConfig[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    category: 'search',
    apiKeyEnvs: ['TAVILY_API_KEY'],
    note: 'AI-native web search with an optional synthesized answer. Built for RAG and agents.',
    docsUrl: 'https://docs.tavily.com',
  },
  {
    id: 'exa',
    name: 'Exa',
    category: 'search',
    apiKeyEnvs: ['EXA_API_KEY', 'EXA_API_KEY_2'],
    note: 'Neural web search with inline content extraction and published dates.',
    docsUrl: 'https://docs.exa.ai',
  },
  {
    id: 'serper',
    name: 'Serper (Google)',
    category: 'search',
    apiKeyEnvs: ['SERPER_API_KEY'],
    note: 'Real Google SERP results: organic links, answer box, knowledge graph, news.',
    docsUrl: 'https://serper.dev',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    category: 'search',
    apiKeyEnvs: ['BRAVE_API_KEY'],
    note: 'Independent web index. Free tier: 1 query/second, 2,000 queries/month.',
    docsUrl: 'https://brave.com/search/api',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    category: 'scrape',
    apiKeyEnvs: ['FIRECRAWL_API_KEY'],
    note: 'Scrape any page or whole site into clean markdown; also search + scrape in one call.',
    docsUrl: 'https://docs.firecrawl.dev',
  },
  {
    id: 'context7',
    name: 'Context7',
    category: 'docs',
    apiKeyEnvs: ['CONTEXT7_API_KEY'],
    note: 'Up-to-date, version-specific library documentation and code snippets.',
    docsUrl: 'https://context7.com/docs',
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    category: 'images',
    apiKeyEnvs: ['UNSPLASH_ACCESS_KEY'],
    note: 'Stock photography for notebooks and pages. Search only needs the access key.',
    docsUrl: 'https://unsplash.com/documentation',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'speech',
    apiKeyEnvs: ['ELEVENLABS_API_KEY'],
    note: 'High-quality text-to-speech with a wide voice library.',
    docsUrl: 'https://elevenlabs.io/docs/api-reference',
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    category: 'speech',
    apiKeyEnvs: ['DEEPGRAM_API_KEY'],
    note: 'Aura text-to-speech and Nova speech-to-text.',
    docsUrl: 'https://developers.deepgram.com/docs',
  },
  {
    id: 'cartesia',
    name: 'Cartesia',
    category: 'speech',
    apiKeyEnvs: ['CARTESIA_API_KEY'],
    note: 'Low-latency Sonic text-to-speech, good for real-time playback.',
    docsUrl: 'https://docs.cartesia.ai',
  },
];

/** Look up a service descriptor by id. */
export function getService(id: string): ServiceConfig | undefined {
  return SERVICES.find((service) => service.id === id);
}

/** Services in one category, in registry order. */
export function servicesByCategory(category: ServiceCategory): ServiceConfig[] {
  return SERVICES.filter((service) => service.category === category);
}

/** First environment variable that is set for this service, and its value. */
export function envServiceKey(service: ServiceConfig): string | undefined {
  for (const name of service.apiKeyEnvs) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}
