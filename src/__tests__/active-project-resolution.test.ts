/**
 * __tests__/active-project-resolution.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Which project a turn belongs to.
 *
 * Two concepts that are easy to conflate, and this test keeps them apart:
 *
 *  • the SCOPE — a transient `?project=<id>` on one surface. Deliberate, and it
 *    must win while present.
 *  • the DEFAULT — `settings.json`'s `activeProjectId`, written when the user
 *    picks a project. What survives a restart.
 *
 * The default exists because the renderer's scope lives in `MemoryRouter` memory
 * and is therefore empty on every launch. Without a fallback, main could never
 * name a project, the "Active project" prompt block would be blank, and the repo
 * tools — which resolve `projectId → repo_path` — would have nothing to resolve
 * and would (correctly) refuse rather than guess.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('../main/ai/settings', () => ({
  getRawSettings: jest.fn(() => ({ activeProjectId: 'proj-default' })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const settingsMock = require('../main/ai/settings') as { getRawSettings: jest.Mock };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { resolveActiveProjectId } = require('../main/ai/project-context') as {
  resolveActiveProjectId: (scoped?: string | null) => string | null;
};

function setDefault(id: string | null | undefined): void {
  settingsMock.getRawSettings.mockReturnValue({ activeProjectId: id });
}

describe('resolveActiveProjectId', () => {
  beforeEach(() => setDefault('proj-default'));

  it('prefers an explicit scope over the persisted default', () => {
    // This is the whole point of keeping them separate: looking at a different
    // project on one page must not silently retarget the agent.
    expect(resolveActiveProjectId('proj-scoped')).toBe('proj-scoped');
  });

  it('falls back to the default when the surface is unscoped', () => {
    // The normal state on a fresh launch.
    expect(resolveActiveProjectId()).toBe('proj-default');
    expect(resolveActiveProjectId(null)).toBe('proj-default');
  });

  it('returns null when there is neither a scope nor a default', () => {
    setDefault(null);
    expect(resolveActiveProjectId()).toBeNull();
    setDefault(undefined);
    expect(resolveActiveProjectId()).toBeNull();
    setDefault('');
    expect(resolveActiveProjectId()).toBeNull();
  });

  it('treats an empty scope string as "not scoped" rather than an id', () => {
    // `?project=` with no value should fall through to the default, not
    // resolve to a project whose id is "".
    expect(resolveActiveProjectId('')).toBe('proj-default');
  });

  it('does not throw when settings are unreadable', () => {
    settingsMock.getRawSettings.mockImplementation(() => {
      throw new Error('settings.json corrupt');
    });
    expect(resolveActiveProjectId()).toBeNull();
    // A corrupt settings file must not break a turn.
    expect(resolveActiveProjectId('proj-scoped')).toBe('proj-scoped');
  });
});
