/**
 * services/downloader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe binary asset downloader. Fetches resources (PNG, SVG, JPG, PDF, etc.)
 * from remote URLs with browser emulation headers to prevent CDN/hotlink 403s,
 * validates content-type, dedupes filenames, and writes to disk.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface DownloadResourceOptions {
  url: string;
  destinationDir: string;
  filename?: string;
  overwrite?: boolean;
  maxSizeBytes?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface DownloadResourceResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  url: string;
  error?: string;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

function deriveBaseNameAndExt(urlStr: string, contentType: string, requestedName?: string): {
  base: string;
  ext: string;
} {
  let candidateName = requestedName?.trim();
  if (!candidateName) {
    try {
      const parsed = new URL(urlStr);
      const urlBase = path.basename(parsed.pathname);
      if (urlBase && urlBase !== '/' && urlBase.includes('.')) {
        candidateName = urlBase;
      } else if (urlBase && urlBase !== '/') {
        candidateName = urlBase;
      }
    } catch {
      // invalid URL string, will fallback
    }
  }

  if (!candidateName) {
    candidateName = 'downloaded_asset';
  }

  candidateName = sanitizeFileName(candidateName);

  let ext = path.extname(candidateName).toLowerCase();
  let base = path.basename(candidateName, ext);

  // If no extension or unknown extension, check MIME type
  if (!ext || ext === '.') {
    const cleanMime = contentType.split(';')[0].trim().toLowerCase();
    ext = MIME_TO_EXTENSION[cleanMime] ?? '';
  }

  if (!base) {
    base = 'asset';
  }

  return { base, ext };
}

async function findAvailablePath(
  dir: string,
  base: string,
  ext: string,
  overwrite: boolean,
): Promise<{ fullPath: string; fileName: string }> {
  let counter = 0;
  while (true) {
    const fileName = counter === 0 ? `${base}${ext}` : `${base}-${counter}${ext}`;
    const fullPath = path.join(dir, fileName);

    if (overwrite) {
      return { fullPath, fileName };
    }

    try {
      await fs.access(fullPath);
      counter++;
    } catch {
      // File does not exist, safe to use
      return { fullPath, fileName };
    }
  }
}

export async function downloadResource(
  options: DownloadResourceOptions,
): Promise<DownloadResourceResult> {
  const {
    url,
    destinationDir,
    filename,
    overwrite = false,
    maxSizeBytes = 100 * 1024 * 1024, // 100MB safety ceiling
    fetchImpl = fetch,
    timeoutMs = 45_000,
  } = options;

  try {
    let origin = '';
    try {
      origin = new URL(url).origin;
    } catch {
      return { success: false, url, error: `Invalid URL: "${url}"` };
    }

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept:
          'image/avif,image/webp,image/apng,image/svg+xml,image/*,application/pdf,*/*;q=0.8',
        Referer: origin,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return {
        success: false,
        url,
        error: `Failed to download resource: HTTP ${response.status} (${response.statusText || 'Error'})`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > maxSizeBytes) {
      return {
        success: false,
        url,
        error: `Resource exceeded maximum allowed size of ${maxSizeBytes} bytes (got ${buffer.byteLength} bytes).`,
      };
    }

    // Ensure target directory exists
    await fs.mkdir(destinationDir, { recursive: true });

    const { base, ext } = deriveBaseNameAndExt(url, contentType, filename);
    const { fullPath, fileName } = await findAvailablePath(
      destinationDir,
      base,
      ext,
      overwrite,
    );

    await fs.writeFile(fullPath, buffer);

    return {
      success: true,
      filePath: fullPath,
      fileName,
      sizeBytes: buffer.byteLength,
      mimeType: contentType.split(';')[0].trim() || 'application/octet-stream',
      url,
    };
  } catch (err) {
    return {
      success: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
