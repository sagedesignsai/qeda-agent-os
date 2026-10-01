/**
 * __tests__/serper-resources.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Serper images, scholar, patents, and the resource downloader.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  serperImages,
  serperScholar,
  serperPatents,
} from '../main/services/serper';
import {
  downloadResource,
  sanitizeFileName,
} from '../main/services/downloader';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

describe('serper resources service', () => {
  it('maps Serper images and applies format filters', async () => {
    let capturedBody: any;
    let capturedHeaders: any;

    const mockFetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        images: [
          {
            title: 'Tshirt Mockup Black PNG',
            imageUrl: 'https://cdn.example.com/tshirt.png',
            thumbnailUrl: 'https://cdn.example.com/thumb.png',
            imageWidth: 1000,
            imageHeight: 1000,
            domain: 'freepik.com',
            link: 'https://freepik.com/item/1',
          },
        ],
      });
    }) as unknown as typeof fetch;

    const res = await serperImages({
      query: 'tshirt mockup',
      apiKey: 'test-key',
      formatFilter: 'png',
      fetchImpl: mockFetch,
    });

    expect(capturedHeaders['X-API-KEY']).toBe('test-key');
    expect(capturedBody.q).toContain('png transparent');
    expect(res.total).toBe(1);
    expect(res.images[0]).toEqual({
      title: 'Tshirt Mockup Black PNG',
      imageUrl: 'https://cdn.example.com/tshirt.png',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
      sourceUrl: 'https://freepik.com/item/1',
      domain: 'freepik.com',
      width: 1000,
      height: 1000,
    });
  });

  it('maps Serper scholar papers and extracts PDF links', async () => {
    const mockFetch = (async () => {
      return jsonResponse({
        organic: [
          {
            title: 'Attention Is All You Need',
            link: 'https://arxiv.org/abs/1706.03762',
            snippet: 'The dominant sequence transduction models...',
            publication: 'NeurIPS',
            year: 2017,
            citedBy: 110000,
            authors: ['A Vaswani', 'N Shazeer'],
            pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
          },
        ],
      });
    }) as unknown as typeof fetch;

    const res = await serperScholar({
      query: 'attention is all you need',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    });

    expect(res.total).toBe(1);
    expect(res.papers[0].title).toBe('Attention Is All You Need');
    expect(res.papers[0].pdfUrl).toBe('https://arxiv.org/pdf/1706.03762.pdf');
    expect(res.papers[0].authors).toEqual(['A Vaswani', 'N Shazeer']);
  });

  it('maps Serper patents', async () => {
    const mockFetch = (async () => {
      return jsonResponse({
        organic: [
          {
            title: 'Neural Network Architecture',
            link: 'https://patents.google.com/patent/US123456',
            snippet: 'Systems and methods for deep learning...',
            patentNumber: 'US123456B2',
            assignee: 'DeepMind',
            filingDate: '2020-01-01',
          },
        ],
      });
    }) as unknown as typeof fetch;

    const res = await serperPatents({
      query: 'deep learning architecture',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    });

    expect(res.total).toBe(1);
    expect(res.patents[0].patentNumber).toBe('US123456B2');
    expect(res.patents[0].assignee).toBe('DeepMind');
  });
});

describe('downloadResource service', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'serper-dl-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('sanitizes filenames properly', () => {
    expect(sanitizeFileName('Logo: Final/V1 *draft?.png')).toBe('Logo_Final_V1_draft_.png');
    expect(sanitizeFileName('  test file name  ')).toBe('test_file_name');
  });

  it('downloads binary data and infers missing extension from Content-Type', async () => {
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header bytes
    const mockFetch = (async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => fakeBytes.buffer,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await downloadResource({
      url: 'https://example.com/asset_without_extension',
      destinationDir: tmpDir,
      filename: 'cool_logo',
      fetchImpl: mockFetch,
    });

    expect(result.success).toBe(true);
    expect(result.fileName).toBe('cool_logo.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.sizeBytes).toBe(fakeBytes.byteLength);

    const written = await fs.readFile(result.filePath!);
    expect(written.byteLength).toBe(fakeBytes.byteLength);
  });

  it('avoids overwriting existing files by appending counter', async () => {
    const existingFile = path.join(tmpDir, 'mockup.png');
    await fs.writeFile(existingFile, Buffer.from([1, 2, 3]));

    const mockFetch = (async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await downloadResource({
      url: 'https://example.com/mockup.png',
      destinationDir: tmpDir,
      overwrite: false,
      fetchImpl: mockFetch,
    });

    expect(result.success).toBe(true);
    expect(result.fileName).toBe('mockup-1.png');
    expect(await fs.readFile(result.filePath!)).toEqual(Buffer.from([4, 5, 6]));
    expect(await fs.readFile(existingFile)).toEqual(Buffer.from([1, 2, 3]));
  });
});
