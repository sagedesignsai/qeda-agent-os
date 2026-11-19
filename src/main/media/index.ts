/**
 * main/media/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The `qeda-media://` protocol: one scheme, many hosts.
 *
 * Every host is an allow-listed resolver (a DB id, not a filesystem path), and
 * this module only dispatches on `url.hostname`. Studio, motion and music each
 * own their resolver; none of them registers the scheme, so adding a host is a
 * one-line change here rather than another branch in a growing if-chain.
 *
 * `registerSchemesAsPrivileged` runs at module import on purpose: `main.ts`
 * imports this module at the top, which is before `app.ready`, and Chromium
 * requires the privilege declaration by then. Moving it into the ready
 * callback silently breaks video seeking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { protocol } from 'electron';
import { MUSIC_ART_HOST, MUSIC_MEDIA_HOST } from '../../lib/music/media.js';
import { PROJECT_FILE_HOST } from '../../lib/project-files.js';
import { BLENDER_PREVIEW_HOST } from '../../lib/blender-preview.js';
import { MOTION_LIBRARY_HOST } from '../../lib/motion/local-library.js';
import {
  STUDIO_COMPOSITION_ASSET_HOST,
  STUDIO_OVERLAY_HOST,
  STUDIO_TAKE_HOST,
} from '../../lib/studio/media.js';
import { serveBlenderPreview } from './blender-preview.js';
import { serveLocalModel } from './local-library.js';
import { serveMotionMedia } from './motion.js';
import { serveMusicArt, serveMusicMedia } from './music.js';
import { serveProjectFile } from './project-files.js';
import {
  serveOverlay,
  serveStudioCompositionAsset,
  serveStudioTake,
} from './studio.js';
import { TTS_MEDIA_HOST } from '../../lib/tts/media.js';
import { serveTtsAsset } from '../tts/media.js';

export const MEDIA_SCHEME = 'qeda-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      corsEnabled: true,
      supportFetchAPI: true,
    },
  },
]);

export type MediaHostHandler = (
  request: Request,
) => Promise<Response> | Response;

const HOSTS: Record<string, MediaHostHandler> = {
  [STUDIO_TAKE_HOST]: serveStudioTake,
  [STUDIO_OVERLAY_HOST]: serveOverlay,
  [STUDIO_COMPOSITION_ASSET_HOST]: serveStudioCompositionAsset,
  [PROJECT_FILE_HOST]: serveProjectFile,
  motion: serveMotionMedia,
  'motion-staging': serveMotionMedia,
  [MOTION_LIBRARY_HOST]: serveLocalModel,
  [BLENDER_PREVIEW_HOST]: serveBlenderPreview,
  [MUSIC_MEDIA_HOST]: serveMusicMedia,
  [MUSIC_ART_HOST]: serveMusicArt,
  [TTS_MEDIA_HOST]: serveTtsAsset,
};

let registered = false;

export function registerMediaHandler(): void {
  if (registered) return;
  registered = true;
  protocol.handle(MEDIA_SCHEME, (request) => {
    let hostname: string;
    try {
      hostname = new URL(request.url).hostname;
    } catch {
      return new Response(null, { status: 400 });
    }
    const handler = HOSTS[hostname];
    return handler ? handler(request) : new Response(null, { status: 404 });
  });
}
