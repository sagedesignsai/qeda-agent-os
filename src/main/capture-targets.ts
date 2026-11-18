/**
 * main/capture-targets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolving "what should this demo record" into a concrete pixel region.
 *
 * The recorder used to capture the primary display, full stop. That is correct
 * for a manual screen take (the user chose a source), but wrong for an agent
 * demo: a notification, another app, or an overlapping window all land in the
 * video. This module turns a requested target — a window we own, a display, or
 * an explicit rect — into:
 *
 *   • `captureRect` — what the platform grabber is handed. On Linux/Windows the
 *     grabbers accept an arbitrary region, so this is the window itself. On
 *     macOS `avfoundation` only offers whole displays, so this stays the full
 *     display and the difference is carried by `videoCrop`.
 *   • `regionRect` — the frame the viewer actually sees. Cursor telemetry and
 *     zoom math are normalized against this, which is what keeps a zoom aimed
 *     at the right pixel once the capture is cropped.
 *   • `videoCrop` — the normalized sub-region for the display-level path.
 *
 * Only Electron-owned windows can be targeted, because only they expose
 * `getBounds()` and can be kept in front while recording. `windowId` is
 * therefore the id `browser-use.openBrowser` returns, not a desktopCapturer
 * source id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BrowserWindow, screen } from 'electron';
import type {
  StudioCaptureRect,
  StudioCaptureRequest,
  StudioVideoCrop,
} from '../lib/studio/types.js';

export interface CaptureDisplay {
  id: string;
  bounds: StudioCaptureRect;
  scaleFactor: number;
  primary: boolean;
}

export interface ResolvedCapture {
  kind: 'display' | 'window' | 'region';
  label: string;
  /** What the grabber captures, in absolute DIP. */
  captureRect: StudioCaptureRect;
  /** The visible frame after any display-level crop, in absolute DIP. */
  regionRect: StudioCaptureRect;
  display: CaptureDisplay;
  /** Electron window to keep above others for the session, when we own it. */
  windowId?: number;
  /** Set when the grabber covers more than the visible region (macOS). */
  videoCrop?: StudioVideoCrop;
}

export interface RecordableWindow {
  id: string;
  title: string;
  bounds: StudioCaptureRect;
  visible: boolean;
}

/** A window owned by the OS rather than by Electron. */
export interface NativeWindowInfo {
  title: string;
  /** Bounds converted to DIP, so callers can compare them with Electron's. */
  bounds: StudioCaptureRect;
}

/** Raw region as reported by the OS automation provider, in physical pixels. */
export interface PhysicalRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A window smaller than this is almost certainly a mis-resolved handle. */
const MIN_CAPTURE_EDGE = 64;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function sameRect(a: StudioCaptureRect, b: StudioCaptureRect): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

/**
 * Convert a DIP region into the physical-pixel geometry the grabbers expect.
 *
 * The grabbers capture physical pixels while Electron reports DIP bounds, so a
 * 2x display would otherwise record the top-left quarter of the window.
 */
export function toCaptureGeometry(
  rect: StudioCaptureRect,
  scaleFactor: number,
  fps: number,
): { x: number; y: number; width: number; height: number; fps: number } {
  const scale = scaleFactor || 1;
  // libx264 with yuv420p rejects odd dimensions. Window bounds are whatever
  // the app chose, so round down to the nearest even pixel rather than letting
  // ffmpeg fail on an 801px-wide window.
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: even(Math.round(rect.width * scale)),
    height: even(Math.round(rect.height * scale)),
    fps,
  };
}

/** Intersect a rect with a display's bounds, or null when they do not touch. */
export function clampRectToBounds(
  rect: StudioCaptureRect,
  bounds: StudioCaptureRect,
): StudioCaptureRect | null {
  const left = Math.max(rect.x, bounds.x);
  const top = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function isUsableRegion(
  region: StudioCaptureRect | null,
): region is StudioCaptureRect {
  return (
    region !== null &&
    region.width >= MIN_CAPTURE_EDGE &&
    region.height >= MIN_CAPTURE_EDGE
  );
}

/** The display a rect belongs to, judged by its center. */
export function displayContaining(
  rect: StudioCaptureRect,
  displays: CaptureDisplay[],
): CaptureDisplay | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    displays.find(
      (d) =>
        cx >= d.bounds.x &&
        cx <= d.bounds.x + d.bounds.width &&
        cy >= d.bounds.y &&
        cy <= d.bounds.y + d.bounds.height,
    ) ?? null
  );
}

function displayContainingPhysical(
  region: PhysicalRegion,
  displays: CaptureDisplay[],
): CaptureDisplay | null {
  const cx = region.left + region.width / 2;
  const cy = region.top + region.height / 2;
  return (
    displays.find((d) => {
      const scale = d.scaleFactor || 1;
      return (
        cx >= d.bounds.x * scale &&
        cx <= (d.bounds.x + d.bounds.width) * scale &&
        cy >= d.bounds.y * scale &&
        cy <= (d.bounds.y + d.bounds.height) * scale
      );
    }) ?? null
  );
}

/**
 * Convert an OS-provided physical region into DIP.
 *
 * Native window APIs report pixels while Electron reports DIP, so the scale
 * factor of the display hosting the window is the conversion rate. Picking the
 * hosting display rather than the primary one keeps mixed-DPI setups honest.
 */
export function physicalRectToDip(
  region: PhysicalRegion,
  displays: CaptureDisplay[],
): StudioCaptureRect {
  const host =
    displayContainingPhysical(region, displays) ?? displays[0] ?? undefined;
  const scale = host?.scaleFactor || 1;
  return {
    x: region.left / scale,
    y: region.top / scale,
    width: region.width / scale,
    height: region.height / scale,
  };
}

/** nut-js is lazy-required: a build without its native core still boots. */
function loadNut(): any {
  try {
    return require('@nut-tree-fork/nut-js');
  } catch {
    return null;
  }
}

function readTitle(win: any): Promise<string> {
  // nut-js exposes `title` as a promise-backed getter, with `getTitle()` as the
  // explicit method. Accept both so the call site is not version-sensitive.
  return Promise.resolve(typeof win.getTitle === 'function' ? win.getTitle() : win.title);
}

/**
 * Enumerate native (non-Electron) windows that can be recorded.
 *
 * Returns [] when the automation module is missing or the OS refuses the
 * listing — this is an enhancement, not a requirement for recording.
 */
export async function listNativeWindows(
  displays: CaptureDisplay[] = listCaptureDisplays(),
): Promise<NativeWindowInfo[]> {
  const nut = loadNut();
  if (!nut?.getWindows) return [];

  try {
    const windows = await nut.getWindows();
    const out: NativeWindowInfo[] = [];
    for (const win of windows) {
      try {
        const title = String(await readTitle(win));
        const region = (await win.getRegion()) as PhysicalRegion;
        const bounds = physicalRectToDip(region, displays);
        if (!title.trim()) continue;
        if (
          bounds.width < MIN_CAPTURE_EDGE ||
          bounds.height < MIN_CAPTURE_EDGE
        ) {
          continue;
        }
        out.push({ title, bounds });
      } catch {
        // A window that closed mid-enumeration is not worth failing over.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Resolve a native window by (case-insensitive) title fragment.
 *
 * The window is focused before its bounds are returned: a native window cannot
 * be pinned always-on-top the way an Electron one can, so bringing it forward
 * once is the best guarantee available that the first frames show it.
 * Returns null when no window matches.
 */
export async function resolveNativeWindowRect(
  title: string,
  displays: CaptureDisplay[] = listCaptureDisplays(),
): Promise<StudioCaptureRect | null> {
  const nut = loadNut();
  if (!nut?.getWindows) {
    throw new Error(
      'Recording a native window needs the desktop automation module, which is not available in this build. Record a browser window instead.',
    );
  }

  const needle = title.trim().toLowerCase();
  if (!needle) throw new Error('A window title is required.');

  let windows: any[];
  try {
    windows = await nut.getWindows();
  } catch (error) {
    throw new Error(
      `Could not enumerate windows: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const win of windows) {
    try {
      const winTitle = String(await readTitle(win));
      if (!winTitle.toLowerCase().includes(needle)) continue;

      const region = (await win.getRegion()) as PhysicalRegion;
      const rect = physicalRectToDip(region, displays);
      if (
        rect.width < MIN_CAPTURE_EDGE ||
        rect.height < MIN_CAPTURE_EDGE
      ) {
        continue;
      }

      try {
        await win.focus();
      } catch {
        // Focus is best-effort; the rect is still valid.
      }
      return rect;
    } catch {
      // A window that vanished between listing and measuring.
    }
  }

  return null;
}

/** Express a region as a 0..1 crop of the display that contains it. */
export function normalizeVideoCrop(
  region: StudioCaptureRect,
  bounds: StudioCaptureRect,
): StudioVideoCrop | undefined {
  if (bounds.width <= 0 || bounds.height <= 0) return undefined;
  if (sameRect(region, bounds)) return undefined;

  const x = clamp01((region.x - bounds.x) / bounds.width);
  const y = clamp01((region.y - bounds.y) / bounds.height);
  return {
    x,
    y,
    // Keep the crop inside the frame even when DIP rounding nudges the edge.
    width: Math.max(
      0.01,
      Math.min(clamp01(region.width / bounds.width), 1 - x),
    ),
    height: Math.max(
      0.01,
      Math.min(clamp01(region.height / bounds.height), 1 - y),
    ),
  };
}

function toDisplayInfo(
  display: Electron.Display,
  primaryId: number,
): CaptureDisplay {
  return {
    id: String(display.id),
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    scaleFactor: display.scaleFactor || 1,
    primary: display.id === primaryId,
  };
}

export function listCaptureDisplays(): CaptureDisplay[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => toDisplayInfo(d, primaryId));
}

/** Windows a demo could record: every live Electron window we can crop to. */
export function listRecordableWindows(): RecordableWindow[] {
  return BrowserWindow.getAllWindows()
    .filter((win) => !win.isDestroyed())
    .map((win) => ({
      id: String(win.id),
      title: win.getTitle() || 'Untitled window',
      bounds: {
        x: win.getBounds().x,
        y: win.getBounds().y,
        width: win.getBounds().width,
        height: win.getBounds().height,
      },
      visible: win.isVisible(),
    }));
}

function finishCapture(
  kind: ResolvedCapture['kind'],
  label: string,
  display: CaptureDisplay,
  region: StudioCaptureRect,
  windowId?: number,
): ResolvedCapture {
  // avfoundation exposes whole displays only, so the crop has to happen at
  // render/export time instead of in the grabber.
  const videoCrop =
    process.platform === 'darwin'
      ? normalizeVideoCrop(region, display.bounds)
      : undefined;

  return {
    kind,
    label,
    captureRect: videoCrop ? display.bounds : region,
    regionRect: region,
    display,
    windowId,
    videoCrop,
  };
}

/**
 * Resolve a requested capture target into a concrete region.
 *
 * `displays` is injectable so the recorder's unit tests can supply a fake
 * display without mocking Electron's `screen` module.
 */
export function resolveCaptureRequest(
  request?: StudioCaptureRequest,
  displays: CaptureDisplay[] = listCaptureDisplays(),
): ResolvedCapture {
  const primary = displays.find((d) => d.primary) ?? displays[0];
  if (!primary) {
    throw new Error('No display is available to record.');
  }

  if (request?.windowId) {
    const win = BrowserWindow.fromId(Number(request.windowId));
    if (!win || win.isDestroyed()) {
      throw new Error(
        `Window ${request.windowId} is not available. Use listCaptureTargets to find a recordable window id.`,
      );
    }
    if (!win.isVisible()) win.show();

    const bounds = win.getBounds();
    const display = displayContaining(bounds, displays) ?? primary;
    const region = clampRectToBounds(bounds, display.bounds);
    if (!isUsableRegion(region)) {
      throw new Error(
        `Window ${request.windowId} is too small or off-screen to record (${bounds.width}x${bounds.height}).`,
      );
    }
    return finishCapture(
      'window',
      win.getTitle() || 'Window',
      display,
      region,
      win.id,
    );
  }

  if (request?.rect) {
    const display = displayContaining(request.rect, displays) ?? primary;
    const region = clampRectToBounds(request.rect, display.bounds);
    if (!isUsableRegion(region)) {
      throw new Error(
        'The requested capture region is empty, off-screen, or too small to record.',
      );
    }
    return finishCapture(
      request.kindHint ?? 'region',
      request.label?.trim() || 'Region',
      display,
      region,
    );
  }

  if (request?.displayId) {
    const display = displays.find((d) => d.id === request.displayId);
    if (!display) {
      throw new Error(`Display ${request.displayId} is not connected.`);
    }
    return finishCapture(
      'display',
      display.primary ? 'Primary display' : `Display ${display.id}`,
      display,
      display.bounds,
    );
  }

  return finishCapture('display', 'Primary display', primary, primary.bounds);
}

/**
 * Keep the recorded window in front for the session.
 *
 * A crop is only as good as what is inside it: if the user clicks another app,
 * the recorded region shows that app instead. Always-on-top removes the most
 * common way a window demo goes wrong. The returned function restores the
 * window's previous stacking, so recording is not a mode the app stays in.
 */
export function pinCaptureWindow(windowId?: number): () => void {
  if (windowId === undefined) return () => {};
  try {
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return () => {};
    const wasOnTop = win.isAlwaysOnTop();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    return () => {
      try {
        if (!win.isDestroyed()) win.setAlwaysOnTop(wasOnTop);
      } catch {
        // The window closed mid-session; nothing left to restore.
      }
    };
  } catch {
    return () => {};
  }
}
