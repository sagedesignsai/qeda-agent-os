/**
 * __tests__/blender-preview.test.ts
 * The Blender tool cards address preview renders via qeda-media. These
 * tests pin the run-id extraction + URL shape the main-process host
 * allow-lists, so a path-layout change fails loudly instead of silently
 * rendering "no preview".
 */

import {
  BLENDER_PREVIEW_HOST,
  blenderPreviewRunId,
  blenderPreviewUrl,
  blenderPreviewUrlForPath,
} from '../lib/blender-preview';

describe('blender-preview URL helpers', () => {
  it('builds a qeda-media URL for a run', () => {
    expect(blenderPreviewUrl('1712345678901-a1b2c3d4')).toBe(
      `qeda-media://${BLENDER_PREVIEW_HOST}/1712345678901-a1b2c3d4/preview.png`,
    );
  });

  it('extracts the run id from a job preview path', () => {
    expect(
      blenderPreviewRunId(
        '/Users/test/Library/Application Support/Qeda/blender-jobs/1712345678901-a1b2c3d4/preview.png',
      ),
    ).toBe('1712345678901-a1b2c3d4');
  });

  it('extracts the run id from a Windows-style path', () => {
    expect(
      blenderPreviewRunId(
        'C:\\Users\\test\\AppData\\Roaming\\Qeda\\blender-jobs\\1712345678901-a1b2c3d4\\preview.png',
      ),
    ).toBe('1712345678901-a1b2c3d4');
  });

  it('rejects paths outside the blender-jobs layout', () => {
    expect(blenderPreviewRunId('/tmp/random/preview.png')).toBeNull();
    expect(blenderPreviewRunId('/tmp/blender-jobs/../escape/preview.png')).toBeNull();
    expect(blenderPreviewRunId('/tmp/blender-jobs/only-run-dir')).toBeNull();
  });

  it('round-trips path -> URL', () => {
    expect(
      blenderPreviewUrlForPath(
        '/data/blender-jobs/1712345678901-a1b2c3d4/preview.png',
      ),
    ).toBe(blenderPreviewUrl('1712345678901-a1b2c3d4'));
  });

  it('returns undefined for missing paths', () => {
    expect(blenderPreviewUrlForPath()).toBeUndefined();
    expect(blenderPreviewUrlForPath('/elsewhere/preview.png')).toBeUndefined();
  });
});
