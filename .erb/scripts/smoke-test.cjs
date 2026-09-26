const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const port = Number(process.env.SMOKE_PORT || 1213);
const debugPort = Number(process.env.SMOKE_DEBUG_PORT || 9335);
const windows = process.platform === 'win32';
const child = spawn(
  windows ? 'npm.cmd' : 'npm',
  [
    'start',
    '--',
    '--remoteDebuggingPort',
    String(debugPort),
    ...(process.env.CI && process.platform === 'linux' ? ['--noSandbox'] : []),
  ],
  {
    detached: !windows,
    shell: windows,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
let exited = false;
let socket;
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
child.on('exit', () => {
  exited = true;
});
child.on('error', (error) => {
  output += error.stack;
  exited = true;
});

async function waitFor(check, description) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`npm start exited before ${description}`);
    const value = await check();
    if (value) return value;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      return targets.find(
        (entry) =>
          entry.type === 'page' &&
          entry.url.startsWith(`http://localhost:${port}`),
      );
    } catch {
      return null;
    }
  }, 'Electron renderer');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const requests = new Map();
  const exceptions = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params);
    if (requests.has(message.id)) {
      requests.get(message.id)(message);
      requests.delete(message.id);
    }
  });
  function send(method, params = {}) {
    id += 1;
    const requestId = id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        requests.delete(requestId);
        reject(new Error(`Timed out: ${method}`));
      }, 15_000);
      requests.set(requestId, (message) => {
        clearTimeout(timeout);
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(message)));
        } else resolve(message.result);
      });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result.value;
  }
  await send('Runtime.enable');
  // The shell: brand in the rail, plus the two primary section links.
  await waitFor(
    () =>
      evaluate(
        'document.body.textContent.includes("Docugent") && Array.from(document.querySelectorAll("a")).some((a) => a.textContent.trim() === "Chat & Research") && Array.from(document.querySelectorAll("a")).some((a) => a.textContent.trim() === "Workspace")',
      ),
    'app shell and navigation',
  );
  assert.equal(
    await evaluate('Boolean(document.querySelector("vite-error-overlay"))'),
    false,
  );
  // Exercises the real contextBridge + ipcMain.handle round-trip. `tools:list`
  // is used because it has no dependency on the SQLite database.
  assert.equal(
    await evaluate(
      'window.electron.ipc.invoke("tools:list").then((tools) => Array.isArray(tools) && tools.some((t) => t.name === "runShell"))',
    ),
    true,
  );
  // Exercises the external-services registry over IPC: every category that the
  // notebook generator can use must be advertised to the renderer.
  assert.equal(
    await evaluate(
      'window.electron.ipc.invoke("services:list").then((services) => Array.isArray(services) && ["tavily", "exa", "serper", "firecrawl", "context7", "unsplash", "elevenlabs", "deepgram", "cartesia"].every((id) => services.some((s) => s.id === id)))',
    ),
    true,
  );
  assert.deepEqual(exceptions, []);
  console.log(
    'Electron startup passed: app shell, navigation, preload IPC, and no renderer exceptions.',
  );
}

main()
  .finally(async () => {
    socket?.close();
    if (windows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else if (child.pid) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        if (signal === 'SIGTERM') await delay(1000);
      }
    }
  })
  .catch((error) => {
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
