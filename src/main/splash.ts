/**
 * main/splash.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native splash screen window that displays the animated Qeda logo during app
 * startup (DB init, IPC registration, main window creation). Closes when the
 * main window fires `ready-to-show`.
 *
 * Writes a minimal HTML page to a temp file so it loads reliably on all
 * platforms (data: URLs fail with sandbox on Windows). No React, no JS bundle —
 * pure HTML/CSS for instant cold-start rendering.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { BrowserWindow, nativeTheme } from 'electron';
import { readPersistedTheme } from './ipc/handlers/theme.js';

let splashWindow: BrowserWindow | null = null;
let splashTimeout: NodeJS.Timeout | null = null;
let splashHtmlPath: string | null = null;

/** Maximum time the splash may show before force-closing (fallback safety). */
const SPLASH_TIMEOUT_MS = 10_000;

/**
 * SVG paths extracted from QedaLogo.tsx so the splash screen can render the
 * logo without importing React. ViewBox and coordinates match the component.
 */
const RING_PATH =
  'm 99.333958,165.81275 c -9.570989,-0.70831 -18.077945,-5.25085 -24.258468,-12.95353 -2.929114,-3.6505 -5.28556,-8.39527 -6.412457,-12.91166 -1.202843,-4.82077 -1.340603,-9.56439 -0.424147,-14.605 1.556562,-8.56128 6.647752,-16.5092 13.841355,-21.60792 2.778149,-1.96911 5.363706,-3.28857 8.585918,-4.38156 3.545596,-1.202686 6.358767,-1.685167 10.244671,-1.757039 4.12374,-0.07627 7.48586,0.423288 11.13366,1.654289 5.07306,1.71197 9.49381,4.4878 13.25948,8.32574 1.75046,1.78407 3.22159,3.63609 4.56253,5.74382 0.83688,1.31543 2.32445,4.25231 2.89473,5.715 0.99204,2.54445 1.70935,5.44064 2.10746,8.509 0.18377,1.41633 0.25799,5.45307 0.1278,6.95072 -0.49673,5.71432 -2.28132,10.97771 -5.37278,15.84619 -0.37715,0.59396 -0.71355,1.07021 -0.74755,1.05834 -0.034,-0.0119 -0.96892,-1.37413 -2.0776,-3.02725 -1.10868,-1.65312 -2.36984,-3.52607 -2.80259,-4.16211 l -0.7868,-1.15644 0.17631,-0.3456 c 0.27644,-0.54187 0.93079,-2.16846 1.24662,-3.09885 1.53883,-4.53325 1.69241,-9.47987 0.44833,-14.44008 -0.79316,-3.16236 -2.44389,-6.45821 -4.59001,-9.16439 -0.83202,-1.04915 -2.88986,-3.12316 -3.87393,-3.90437 -2.63005,-2.08789 -6.03214,-3.7919 -9.1422,-4.57906 -2.07521,-0.52524 -3.79748,-0.7299 -6.14302,-0.72997 -3.765604,-1.3e-4 -7.214629,0.80579 -10.580444,2.47229 -4.055181,2.00781 -7.276653,4.86558 -9.822188,8.71325 -1.573431,2.3783 -2.611922,4.78146 -3.338345,7.72522 -0.41196,1.66944 -0.564547,2.69403 -0.689538,4.63013 -0.18643,2.88778 0.310965,6.45909 1.280259,9.19231 1.369517,3.86178 3.263303,6.87916 6.086782,9.69812 2.549674,2.54559 5.082564,4.21232 8.345697,5.49177 1.946518,0.76322 3.960743,1.30425 5.55636,1.49248 l 0.47636,0.0562 1.346303,1.28272 c 6.827894,6.50543 8.072644,7.70126 8.072644,7.75542 0,0.0636 -1.35513,0.27275 -2.794,0.43127 -1.09488,0.12062 -4.72948,0.16994 -5.937202,0.0806 z';

const BOLT_PATH =
  'm 137.82022,188.73672 c -2.40095,-2.19311 -17.2883,-16.15904 -21.50006,-20.16938 -0.93133,-0.88679 -3.71263,-3.51629 -6.18067,-5.84334 -5.37724,-5.07007 -6.4084,-6.06691 -6.34323,-6.13217 0.0272,-0.0273 2.27171,-0.0687 4.9877,-0.0919 l 4.93816,-0.0423 -1.39455,-1.905 c -0.76701,-1.04775 -2.28139,-3.10514 -3.36529,-4.57199 -1.0839,-1.46685 -2.70807,-3.67665 -3.60927,-4.91067 -0.9012,-1.23402 -1.97791,-2.69776 -2.39269,-3.25277 -0.8865,-1.18619 -2.28304,-3.09396 -2.37572,-3.2454 -0.0516,-0.0844 1.53287,-0.10583 7.81391,-0.10583 h 7.87869 l 3.80141,5.69383 c 3.70041,5.54253 8.37426,12.47183 11.78647,17.47424 0.92555,1.35689 1.70638,2.52846 1.73518,2.6035 0.0478,0.12452 -0.38731,0.13643 -4.98379,0.13643 h -5.03614 l 0.7629,1.29116 c 0.41959,0.71015 1.13412,1.90077 1.58784,2.64584 2.52419,4.14509 11.09935,18.42867 12.02122,20.02366 0.20186,0.34925 0.42221,0.72073 0.48968,0.8255 0.0675,0.10478 0.10637,0.1905 0.0865,0.1905 -0.0199,0 -0.3386,-0.27622 -0.70821,-0.61383 z';

/**
 * Minimal HTML page with the Qeda logo draw animation. No external JS or CSS
 * dependencies — everything is inlined for instant cold-start rendering.
 */
function buildSplashHtml(): string {
  const persisted = readPersistedTheme();
  const isDark = persisted
    ? persisted.mode !== 'light'
    : nativeTheme.shouldUseDarkColors;
  const bgColor = persisted?.background || (isDark ? '#0e0f14' : '#f4f4f5');
  const logoColor = isDark ? '#e4e4e7' : '#18181b';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    background: ${bgColor};
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  svg { color: ${logoColor}; }

  /* Draw animation — matches qeda-logo.css */
  .qeda-logo-draw__ring,
  .qeda-logo-draw__bolt {
    stroke-dasharray: 1;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .qeda-logo-draw__ring {
    animation: qeda-logo-ring 2400ms ease-in-out both;
  }
  .qeda-logo-draw__bolt {
    animation: qeda-logo-bolt 2400ms ease-in-out both;
  }
  .qeda-logo-draw--loop .qeda-logo-draw__ring,
  .qeda-logo-draw--loop .qeda-logo-draw__bolt {
    animation-direction: alternate;
    animation-iteration-count: infinite;
  }
  @keyframes qeda-logo-ring {
    0%   { stroke-dashoffset: 1; stroke-opacity: 1; fill-opacity: 0; }
    42%  { stroke-dashoffset: 0; stroke-opacity: 1; fill-opacity: 0; }
    52%  { stroke-dashoffset: 0; stroke-opacity: 0; fill-opacity: 1; }
    100% { stroke-dashoffset: 0; stroke-opacity: 0; fill-opacity: 1; }
  }
  @keyframes qeda-logo-bolt {
    0%, 42% { stroke-dashoffset: 1; stroke-opacity: 1; fill-opacity: 0; }
    78%     { stroke-dashoffset: 0; stroke-opacity: 1; fill-opacity: 0; }
    88%     { stroke-dashoffset: 0; stroke-opacity: 0; fill-opacity: 1; }
    100%    { stroke-dashoffset: 0; stroke-opacity: 0; fill-opacity: 1; }
  }

  /* Fade-out transition for graceful close */
  body.fade-out {
    opacity: 0;
    transition: opacity 400ms ease-in;
  }
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70.891411 91.762123"
     width="120" height="155"
     class="qeda-logo-draw--loop"
     style="transform: translate(-67.642249px, -97.588516px);">
  <path class="qeda-logo-draw__ring"
        d="${RING_PATH}"
        fill="currentColor" stroke="currentColor" stroke-width="2"/>
  <path class="qeda-logo-draw__bolt"
        d="${BOLT_PATH}"
        fill="currentColor" stroke="currentColor" stroke-width="2"/>
</svg>
</body>
</html>`;
}

/**
 * Create and show the splash screen window. Returns the window reference.
 * Call this early in app.whenReady(), before any heavy initialization.
 */
export function createSplashWindow(): BrowserWindow {
  // If already shown (e.g. rapid restart), reuse
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  // Write HTML to a temp file so loadFile works reliably on all platforms
  // (data: URLs fail with sandbox on Windows)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-splash-'));
  splashHtmlPath = path.join(tmpDir, 'splash.html');
  fs.writeFileSync(splashHtmlPath, buildSplashHtml(), 'utf-8');

  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: '',
    },
  });

  splashWindow.loadFile(splashHtmlPath);

  // Fallback: force-close after timeout to prevent hanging
  splashTimeout = setTimeout(() => {
    closeSplashWindow();
  }, SPLASH_TIMEOUT_MS);

  return splashWindow;
}

/**
 * Close the splash screen with a fade-out transition.
 * Call this after the main window fires `ready-to-show`.
 */
export function closeSplashWindow(): void {
  if (splashTimeout) {
    clearTimeout(splashTimeout);
    splashTimeout = null;
  }

  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }

  // Trigger CSS fade-out, then destroy after transition
  splashWindow.webContents
    .executeJavaScript(`
      document.body.classList.add('fade-out');
    `)
    .catch(() => {});

  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow.destroy();
      splashWindow = null;
    }
    // Clean up temp files
    if (splashHtmlPath) {
      try {
        const tmpDir = path.dirname(splashHtmlPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors — temp files will be reclaimed on reboot
      }
      splashHtmlPath = null;
    }
  }, 450);
}
