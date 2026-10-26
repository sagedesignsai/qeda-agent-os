/**
 * __tests__/opencode-bridge.test.ts
 */
import { startBridge } from '@/main/opencode/bridge';
import http from 'node:http';

function request(
  url: string,
  options: http.RequestOptions = {},
  body?: string,
) {
  return new Promise<{ status: number; json: () => Promise<unknown> }>(
    (resolve, reject) => {
      const req = http.request(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            json: async () => JSON.parse(text),
          });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    },
  );
}

describe('opencode bridge', () => {
  let bridge: Awaited<ReturnType<typeof startBridge>>;

  afterEach(async () => {
    if (bridge) await bridge.stop();
  });

  it('starts on a free port and reports health', async () => {
    bridge = await startBridge({});
    expect(bridge.port).toBeGreaterThan(0);
    expect(bridge.url).toContain('127.0.0.1');

    const res = await request(`${bridge.url}/health`, {
      headers: { 'X-Qeda-Token': bridge.token },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects unauthenticated requests', async () => {
    bridge = await startBridge({});
    const res = await request(`${bridge.url}/ping`, { method: 'POST' }, '{}');
    expect(res.status).toBe(401);
  });

  it('routes authenticated POST requests to handlers', async () => {
    bridge = await startBridge({
      '/ping': async (body) => {
        const b = body as { message?: string };
        return { reply: `echo:${b?.message ?? ''}` };
      },
    });
    const res = await request(
      `${bridge.url}/ping`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Qeda-Token': bridge.token,
        },
      },
      JSON.stringify({ message: 'hi' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: 'echo:hi' });
  });

  it('returns 404 for unknown routes', async () => {
    bridge = await startBridge({});
    const res = await request(
      `${bridge.url}/nope`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Qeda-Token': bridge.token,
        },
      },
      '{}',
    );
    expect(res.status).toBe(404);
  });

  it('stops cleanly', async () => {
    bridge = await startBridge({});
    const url = bridge.url;
    await bridge.stop();
    bridge = undefined as never;
    // After stop, connections should fail.
    await expect(request(`${url}/health`)).rejects.toThrow();
  });
});
