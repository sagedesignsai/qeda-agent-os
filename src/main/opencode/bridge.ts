/**
 * main/opencode/bridge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated localhost HTTP bridge that the Qeda Builder OpenCode plugin
 * calls into. Qeda owns the capabilities (preview, RAG, project DB); the
 * plugin is a thin caller.
 *
 * Started only when the OpenCode engine is active. Stopped on session teardown
 * or app quit. Token is per-launch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http from 'node:http';
import { randomBytes } from 'node:crypto';

export interface BridgeRouteHandler {
  (body: unknown): Promise<unknown>;
}

export interface Bridge {
  url: string;
  token: string;
  port: number;
  stop: () => Promise<void>;
}

export interface BridgeRoutes {
  [path: string]: BridgeRouteHandler;
}

export async function startBridge(routes: BridgeRoutes): Promise<Bridge> {
  const token = randomBytes(24).toString('hex');

  const server = http.createServer(async (req, res) => {
    // Auth.
    if (req.headers['x-qeda-token'] !== token) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const url = req.url ?? '/';
    const path = url.split('?')[0];

    if (req.method === 'GET' && path === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const handler = routes[path];
    if (!handler || req.method !== 'POST') {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    let body: unknown;
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }

    try {
      const result = await handler(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result ?? {}));
    } catch (error) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    port,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
