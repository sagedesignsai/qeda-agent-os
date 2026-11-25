import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import log from 'electron-log';
import { getSettings, saveSettings } from './settings';

const AUTH_ENDPOINT = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN_ENDPOINT = 'https://auth.openai.com/api/accounts/oauth/token';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export interface ChatGPTCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId: string;
  hostId: string;
}

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function performChatGPTSignIn(port = 1455): Promise<ChatGPTCredentials> {
  const settings = getSettings();
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const hostId = settings.chatgptAuth?.hostId || crypto.randomUUID();
  const clientId = settings.chatgptAuth?.clientId || DEFAULT_CLIENT_ID;
  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: 'https://api.openai.com/v1',
    ext_agent_host_id: hostId,
  });

  const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

  const { shell } = await import('electron');
  await shell.openExternal(authUrl);

  const { code, returnedClientId } = await new Promise<{ code: string; returnedClientId?: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://127.0.0.1:${port}`);
      if (url.pathname !== '/auth/callback') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const c = url.searchParams.get('code');
      const st = url.searchParams.get('state');
      const cid = url.searchParams.get('client_id') || undefined;
      if (!c || st !== state) {
        res.statusCode = 400;
        res.end('invalid callback');
        server.close();
        reject(new Error('invalid callback'));
        return;
      }
      res.end('You can close this window.');
      server.close();
      resolve({ code: c, returnedClientId: cid });
    });
    server.listen(port, '127.0.0.1');
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error('sign-in timeout'));
    }, 300_000);
  });

  const finalClientId = returnedClientId || clientId;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: finalClientId,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const creds: ChatGPTCredentials = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    clientId: finalClientId,
    hostId,
  };

  const raw = getSettings();
  saveSettings({
    ...raw,
    chatgptAuth: creds,
    activeProvider: 'chatgpt',
    activeModel: raw.activeProvider === 'chatgpt' ? raw.activeModel : 'gpt-5',
  });
  return creds;
}

export async function refreshChatGPTToken(): Promise<string | undefined> {
  const settings = getSettings();
  const auth = settings.chatgptAuth;
  if (!auth?.accessToken) return undefined;
  if (auth.expiresAt && auth.expiresAt > Date.now() + 60_000) {
    return auth.accessToken;
  }
  if (!auth.refreshToken) return undefined;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    client_id: auth.clientId || '',
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (auth.expiresAt && auth.expiresAt <= Date.now()) return undefined;
    return auth.accessToken;
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const raw = getSettings();
  saveSettings({
    ...raw,
    chatgptAuth: {
      ...auth,
      accessToken: json.access_token,
      refreshToken: json.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    },
  });
  return json.access_token;
}

let refreshTimer: ReturnType<typeof setInterval> | undefined;

/** Refresh persisted OAuth credentials before their access token expires. */
export function startChatGPTTokenRefresh(): void {
  if (refreshTimer) return;

  const refresh = async () => {
    try {
      await refreshChatGPTToken();
    } catch (error) {
      log.warn(
        '[chatgpt-auth] token refresh failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  void refresh();
  refreshTimer = setInterval(() => void refresh(), 30_000);
  refreshTimer.unref?.();
}
