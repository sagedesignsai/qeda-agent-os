/**
 * services/http.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Small fetch helpers shared by the external-service clients.
 *
 * Every client takes an injectable `fetchImpl` so it can be unit-tested without
 * network access (same convention as tools/brave-search.ts). Failures are
 * normalised into `ServiceHttpError` with a message that is safe to show the
 * user (401/403 → key problem, 429 → rate limit, 402 → plan/credit limit).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class ServiceHttpError extends Error {
  readonly service: string;
  readonly status?: number;

  constructor(service: string, message: string, status?: number) {
    super(message);
    this.name = 'ServiceHttpError';
    this.service = service;
    this.status = status;
  }
}

interface RequestOptions {
  service: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** JSON body — serialized automatically. */
  body?: unknown;
  /** Raw bytes body (e.g. audio for STT). Takes precedence over `body`. */
  binaryBody?: Uint8Array;
  /** Content-Type for a binaryBody. Defaults to application/json for a JSON body. */
  contentType?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Pull the most useful message out of an error response body. */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const detail = json.detail;
      if (detail && typeof detail === 'object' && 'error' in detail) {
        return String((detail as { error: unknown }).error);
      }
      const first = json.error ?? json.message ?? json.detail;
      if (typeof first === 'string') return first;
    } catch {
      // Not JSON — fall through to the raw text.
    }
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

function describeStatus(service: string, status: number, detail: string): string {
  const base =
    status === 401 || status === 403
      ? `${service} rejected the API key (HTTP ${status}).`
      : status === 429
        ? `${service} rate limit reached (HTTP 429). Try again shortly.`
        : status === 402
          ? `${service} hit a plan or credit limit (HTTP 402).`
          : `${service} returned HTTP ${status}.`;
  return detail ? `${base} ${detail}` : base;
}

/** Perform a request, throwing a friendly `ServiceHttpError` on failure. */
async function send(options: RequestOptions): Promise<Response> {
  const {
    service,
    url,
    method = 'GET',
    headers = {},
    body,
    binaryBody,
    contentType,
    fetchImpl = fetch,
    timeoutMs = 30_000,
  } = options;

  const hasBody = binaryBody !== undefined || body !== undefined;
  const resolvedContentType =
    contentType ?? (body !== undefined ? 'application/json' : undefined);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(resolvedContentType ? { 'Content-Type': resolvedContentType } : {}),
        ...headers,
      },
      ...(hasBody
        ? { body: (binaryBody ?? JSON.stringify(body)) as BodyInit }
        : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ServiceHttpError(
      service,
      `${service} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new ServiceHttpError(service, describeStatus(service, response.status, detail), response.status);
  }
  return response;
}

/** Perform a request and parse a JSON response. */
export async function requestJson<T = unknown>(options: RequestOptions): Promise<T> {
  const response = await send(options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ServiceHttpError(options.service, `${options.service} returned invalid JSON.`);
  }
}

/** Perform a request and return the raw bytes plus content type (for audio). */
export async function requestBinary(
  options: RequestOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await send({ timeoutMs: 60_000, ...options });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get('content-type') ?? '' };
}
