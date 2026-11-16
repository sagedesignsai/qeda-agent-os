/**
 * __tests__/presence-browser.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Presence browser URL allowlist — isPresenceUrlAllowed.
 *
 * The allowlist prevents the embedded WebContentsView from loading arbitrary
 * sites. Only configured social platforms and known auth hosts are permitted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isPresenceUrlAllowed } from '../main/presence-browser';

describe('isPresenceUrlAllowed', () => {
  it('allows https URLs for configured social platforms', () => {
    expect(isPresenceUrlAllowed('https://www.linkedin.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://www.linkedin.com/feed/')).toBe(true);
    expect(isPresenceUrlAllowed('https://x.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://twitter.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://facebook.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://www.facebook.com/groups/123')).toBe(true);
    expect(isPresenceUrlAllowed('https://instagram.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://www.instagram.com/explore/')).toBe(true);
    expect(isPresenceUrlAllowed('https://discord.com')).toBe(true);
    expect(isPresenceUrlAllowed('https://discord.com/channels/123/456')).toBe(true);
  });

  it('rejects non-https URLs', () => {
    expect(isPresenceUrlAllowed('http://www.linkedin.com')).toBe(false);
    expect(isPresenceUrlAllowed('ftp://linkedin.com')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isPresenceUrlAllowed('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isPresenceUrlAllowed('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects arbitrary domains', () => {
    expect(isPresenceUrlAllowed('https://evil.com')).toBe(false);
    expect(isPresenceUrlAllowed('https://phishing-linkedin.com')).toBe(false);
    expect(isPresenceUrlAllowed('https://linkedin.evil.com')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isPresenceUrlAllowed('not-a-url')).toBe(false);
    expect(isPresenceUrlAllowed('')).toBe(false);
  });

  it('uses suffix matching for subdomains', () => {
    // www.linkedin.com matches because the host ends with linkedin.com
    expect(isPresenceUrlAllowed('https://www.linkedin.com/in/john')).toBe(true);
    // developer.twitter.com matches because it ends with twitter.com
    expect(isPresenceUrlAllowed('https://developer.twitter.com')).toBe(true);
  });
});
