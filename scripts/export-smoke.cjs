/**
 * scripts/export-smoke.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Opt-in end-to-end encode check: `bun run test:export`.
 *
 * jest cannot run this — jsdom has no `VideoEncoder`. The script bundles the
 * harness with Bun, loads it in a hidden Electron window (WebCodecs needs a
 * `file://` or `localhost` secure context), encodes two presets through the real
 * `runMotionExport`, and demuxes each result with Mediabunny's `Input`.
 *
 * It runs headless on Linux (`--ozone-platform=headless`), so CI or a container
 * does not need Xvfb. Set `EXPORT_SMOKE_KEEP=1` to keep the temp bundle.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(__dirname, 'export-smoke', 'harness.ts');

// Must be set before `app.whenReady()`; the app itself never runs in this mode.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ozone-platform', 'headless');
app.disableHardwareAcceleration();

function resolveBun() {
  const candidates = [process.env.BUN, 'bun', path.join(os.homedir(), '.bun', 'bin', 'bun')].filter(
    Boolean,
  );
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function bundleHarness(outDir) {
  const bun = resolveBun();
  if (!bun) throw new Error('Bun was not found. Set BUN=/path/to/bun and retry.');
  const outfile = path.join(outDir, 'harness.js');
  const result = spawnSync(
    bun,
    ['build', ENTRY, '--target=browser', '--format=iife', '--outfile', outfile],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `bun build failed: ${result.error ? result.error.message : result.stderr || result.stdout}`,
    );
  }
  return outfile;
}

function writePage(outDir) {
  const html = path.join(outDir, 'export-smoke.html');
  fs.writeFileSync(
    html,
    '<!doctype html><html><body><script src="./harness.js"></script></body></html>\n',
  );
  return html;
}

function logReport(report) {
  const seconds = (value) => `${value.toFixed(3)}s`;
  console.log(
    [
      `  ${report.presetId}`,
      `${report.container}/${report.codec}`,
      report.codecString ? `(${report.codecString})` : '(unknown profile)',
      `${report.frames} frames`,
      `${report.format}`,
      `${report.width}x${report.height}`,
      `${(report.bytes / 1024).toFixed(1)} KiB`,
      `duration ${seconds(report.duration)} (Δ ${(report.durationDelta * 1000).toFixed(1)}ms)`,
      `${report.chunks} chunks`,
      report.decodedFrame ? 'decoded' : 'NOT decoded',
    ].join(' · '),
  );
}

app.whenReady().then(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-export-smoke-'));
  const window = new BrowserWindow({
    show: false,
    width: 640,
    height: 360,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  try {
    bundleHarness(outDir);
    await window.loadFile(writePage(outDir));

    const reports = await window.webContents.executeJavaScript('window.__exportSmoke()');
    console.log('Motion export smoke — real WebCodecs + Mediabunny round trip');
    for (const report of reports) logReport(report);
    console.log(JSON.stringify(reports));
    if (process.env.EXPORT_SMOKE_KEEP) console.log('Harness kept at', outDir);
    else fs.rmSync(outDir, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    console.error('Motion export smoke failed:', error && error.message ? error.message : error);
    if (process.env.EXPORT_SMOKE_KEEP) console.error('Harness kept at', outDir);
    else fs.rmSync(outDir, { recursive: true, force: true });
    app.exit(1);
  }
});
