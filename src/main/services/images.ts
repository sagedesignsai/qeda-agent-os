/**
 * services/images.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unsplash client: find cover art / diagrams-by-photo for notebooks and pages.
 * Uses the public search endpoint with an access key (`Client-ID` auth); the
 * secret key is only needed for the OAuth write flow, which the app does not
 * use.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestJson } from './http.js';

export interface ImageRequest {
  query: string;
  apiKey: string;
  count?: number;
  page?: number;
  orientation?: 'landscape' | 'portrait' | 'squarish';
  fetchImpl?: typeof fetch;
}

export interface UnsplashImage {
  id: string;
  description: string;
  /** "regular" size (~1080px) — the right default for page previews. */
  url: string;
  thumbUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  author: string;
  authorUrl: string;
  pageUrl: string;
}

export interface ImageResult {
  total: number;
  images: UnsplashImage[];
}

interface UnsplashResponse {
  total?: number;
  results?: Array<{
    id: string;
    description?: string | null;
    alt_description?: string | null;
    width?: number;
    height?: number;
    urls?: { raw?: string; full?: string; regular?: string; small?: string; thumb?: string };
    links?: { html?: string };
    user?: { name?: string; links?: { html?: string } };
  }>;
}

const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos';

export async function unsplashSearch(req: ImageRequest): Promise<ImageResult> {
  const params = new URLSearchParams({
    query: req.query,
    per_page: String(Math.min(Math.max(req.count ?? 6, 1), 30)),
    page: String(Math.max(req.page ?? 1, 1)),
  });
  if (req.orientation) params.set('orientation', req.orientation);

  const data = await requestJson<UnsplashResponse>({
    service: 'Unsplash',
    url: `${UNSPLASH_SEARCH_URL}?${params.toString()}`,
    headers: { Authorization: `Client-ID ${req.apiKey}` },
    fetchImpl: req.fetchImpl,
  });

  const images: UnsplashImage[] = (data.results ?? []).map((r) => ({
    id: r.id,
    description: r.description ?? r.alt_description ?? '',
    url: r.urls?.regular ?? r.urls?.small ?? '',
    thumbUrl: r.urls?.thumb ?? r.urls?.small ?? '',
    fullUrl: r.urls?.full ?? r.urls?.raw ?? '',
    width: r.width ?? 0,
    height: r.height ?? 0,
    author: r.user?.name ?? '',
    authorUrl: r.user?.links?.html ?? '',
    pageUrl: r.links?.html ?? '',
  }));

  return { total: data.total ?? images.length, images };
}
