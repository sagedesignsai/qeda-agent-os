/**
 * services/serper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serper client for Google Images, Scholar, and Patents searches.
 * Complementary to the standard web search in services/search.ts.
 *
 * Uses POST https://google.serper.dev/{images,scholar,patents} with X-API-KEY.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestJson } from './http.js';

export type ImageFormatFilter = 'all' | 'png' | 'svg' | 'jpg';

export interface SerperImagesRequest {
  query: string;
  apiKey: string;
  count?: number;
  page?: number;
  country?: string;
  language?: string;
  formatFilter?: ImageFormatFilter;
  fetchImpl?: typeof fetch;
}

export interface SerperImage {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  domain: string;
  width?: number;
  height?: number;
}

export interface SerperImagesResult {
  query: string;
  total: number;
  images: SerperImage[];
}

export interface SerperScholarRequest {
  query: string;
  apiKey: string;
  count?: number;
  page?: number;
  country?: string;
  language?: string;
  fetchImpl?: typeof fetch;
}

export interface SerperScholarItem {
  title: string;
  link: string;
  snippet: string;
  publication?: string;
  year?: number;
  citedBy?: number;
  authors?: string[];
  pdfUrl?: string;
}

export interface SerperScholarResult {
  query: string;
  total: number;
  papers: SerperScholarItem[];
}

export interface SerperPatentsRequest {
  query: string;
  apiKey: string;
  count?: number;
  page?: number;
  country?: string;
  language?: string;
  fetchImpl?: typeof fetch;
}

export interface SerperPatentItem {
  title: string;
  link: string;
  snippet: string;
  patentNumber?: string;
  assignee?: string;
  filingDate?: string;
  publicationDate?: string;
  pdfUrl?: string;
}

export interface SerperPatentsResult {
  query: string;
  total: number;
  patents: SerperPatentItem[];
}

// ── Raw Serper Response Types ────────────────────────────────────────────────

interface RawSerperImagesResponse {
  images?: Array<{
    title?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    link?: string;
    source?: string;
    domain?: string;
    imageWidth?: number;
    imageHeight?: number;
  }>;
}

interface RawSerperScholarResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    publication?: string;
    year?: number;
    citedBy?: number;
    authors?: string[];
    pdfUrl?: string;
  }>;
}

interface RawSerperPatentsResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    patentNumber?: string;
    assignee?: string;
    filingDate?: string;
    publicationDate?: string;
    pdfUrl?: string;
  }>;
}

const SERPER_IMAGES_URL = 'https://google.serper.dev/images';
const SERPER_SCHOLAR_URL = 'https://google.serper.dev/scholar';
const SERPER_PATENTS_URL = 'https://google.serper.dev/patents';

function buildImageQuery(query: string, formatFilter?: ImageFormatFilter): string {
  const q = query.trim();
  if (!formatFilter || formatFilter === 'all') return q;
  const lower = q.toLowerCase();
  if (formatFilter === 'png') {
    return lower.includes('png') ? q : `${q} png transparent`;
  }
  if (formatFilter === 'svg') {
    return lower.includes('svg') ? q : `${q} svg vector`;
  }
  if (formatFilter === 'jpg') {
    return lower.includes('jpg') || lower.includes('jpeg') ? q : `${q} jpg`;
  }
  return q;
}

export async function serperImages(
  req: SerperImagesRequest,
): Promise<SerperImagesResult> {
  const query = buildImageQuery(req.query, req.formatFilter);
  const data = await requestJson<RawSerperImagesResponse>({
    service: 'Serper',
    url: SERPER_IMAGES_URL,
    method: 'POST',
    headers: { 'X-API-KEY': req.apiKey },
    body: {
      q: query,
      num: Math.min(Math.max(req.count ?? 10, 1), 100),
      ...(req.page && req.page > 1 ? { page: req.page } : {}),
      ...(req.country ? { gl: req.country.toLowerCase() } : {}),
      ...(req.language ? { hl: req.language.toLowerCase() } : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  const images: SerperImage[] = (data.images ?? [])
    .filter((img) => typeof img.imageUrl === 'string' && img.imageUrl)
    .map((img) => ({
      title: img.title ?? '',
      imageUrl: img.imageUrl as string,
      thumbnailUrl: img.thumbnailUrl ?? img.imageUrl ?? '',
      sourceUrl: img.link ?? img.imageUrl ?? '',
      domain: img.domain ?? img.source ?? '',
      ...(img.imageWidth ? { width: img.imageWidth } : {}),
      ...(img.imageHeight ? { height: img.imageHeight } : {}),
    }));

  return { query, total: images.length, images };
}

export async function serperScholar(
  req: SerperScholarRequest,
): Promise<SerperScholarResult> {
  const data = await requestJson<RawSerperScholarResponse>({
    service: 'Serper',
    url: SERPER_SCHOLAR_URL,
    method: 'POST',
    headers: { 'X-API-KEY': req.apiKey },
    body: {
      q: req.query,
      num: Math.min(Math.max(req.count ?? 10, 1), 50),
      ...(req.page && req.page > 1 ? { page: req.page } : {}),
      ...(req.country ? { gl: req.country.toLowerCase() } : {}),
      ...(req.language ? { hl: req.language.toLowerCase() } : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  const papers: SerperScholarItem[] = (data.organic ?? [])
    .filter((p) => typeof p.link === 'string' && p.link)
    .map((p) => ({
      title: p.title ?? '',
      link: p.link as string,
      snippet: p.snippet ?? '',
      ...(p.publication ? { publication: p.publication } : {}),
      ...(p.year ? { year: p.year } : {}),
      ...(p.citedBy ? { citedBy: p.citedBy } : {}),
      ...(Array.isArray(p.authors) ? { authors: p.authors } : {}),
      ...(p.pdfUrl ? { pdfUrl: p.pdfUrl } : {}),
    }));

  return { query: req.query, total: papers.length, papers };
}

export async function serperPatents(
  req: SerperPatentsRequest,
): Promise<SerperPatentsResult> {
  const data = await requestJson<RawSerperPatentsResponse>({
    service: 'Serper',
    url: SERPER_PATENTS_URL,
    method: 'POST',
    headers: { 'X-API-KEY': req.apiKey },
    body: {
      q: req.query,
      num: Math.min(Math.max(req.count ?? 10, 1), 50),
      ...(req.page && req.page > 1 ? { page: req.page } : {}),
      ...(req.country ? { gl: req.country.toLowerCase() } : {}),
      ...(req.language ? { hl: req.language.toLowerCase() } : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  const patents: SerperPatentItem[] = (data.organic ?? [])
    .filter((p) => typeof p.link === 'string' && p.link)
    .map((p) => ({
      title: p.title ?? '',
      link: p.link as string,
      snippet: p.snippet ?? '',
      ...(p.patentNumber ? { patentNumber: p.patentNumber } : {}),
      ...(p.assignee ? { assignee: p.assignee } : {}),
      ...(p.filingDate ? { filingDate: p.filingDate } : {}),
      ...(p.publicationDate ? { publicationDate: p.publicationDate } : {}),
      ...(p.pdfUrl ? { pdfUrl: p.pdfUrl } : {}),
    }));

  return { query: req.query, total: patents.length, patents };
}
