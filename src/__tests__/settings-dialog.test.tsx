/**
 * __tests__/settings-dialog.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The multiview Settings dialog. Two behaviours are load-bearing enough to pin:
 *
 * 1. Switching sections must NOT discard in-progress work. The shell keeps every
 *    section mounted and hides the inactive ones, precisely so a half-typed API
 *    key survives a trip to another section and back. A refactor that swaps
 *    `hidden` for conditional rendering would silently reintroduce data loss.
 * 2. Per-section saves must send ONLY their own fields, and an untouched key
 *    input must be omitted entirely so the encrypted key already on disk
 *    survives. `settings:save` merges rather than replaces, which is what makes
 *    both of these safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { SettingsDialog } from '../components/settings/SettingsDialog';

// jsdom lacks these; Radix (Dialog/Select/ToggleGroup) expects them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const invoke = jest.fn((channel: string) => {
  switch (channel) {
    case 'settings:get':
      return Promise.resolve({
        activeProvider: 'groq',
        activeModel: 'openai/gpt-oss-120b',
        fallbackEnabled: true,
        braveApiKeySet: true,
        embeddingProvider: '',
        embeddingModel: '',
      });
    case 'providers:list':
      return Promise.resolve([
        {
          id: 'groq',
          name: 'Groq',
          apiKeySet: true,
          apiKeySource: 'environment',
          freeModels: ['openai/gpt-oss-120b'],
        },
      ]);
    case 'services:list':
      return Promise.resolve([]);
    case 'providers:models':
      return Promise.resolve({ models: ['openai/gpt-oss-120b'] });
    default:
      return Promise.resolve(undefined);
  }
});

beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke,
        on: () => () => {},
        once: () => {},
      },
    },
  });
});

beforeEach(() => {
  invoke.mockClear();
});

const TEST_TIMEOUT = 20_000;

function renderDialog() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SettingsDialog open onOpenChange={() => {}} />
    </ThemeProvider>,
  );
}

/** Every `settings:save` payload recorded so far. */
function savePayloads(): Record<string, unknown>[] {
  // `invoke` is declared with only its `channel` parameter, so jest types the
  // recorded calls as `[channel]`. The renderer really does pass a second
  // payload argument, so widen the tuple here to read it back.
  return invoke.mock.calls
    .filter((call) => call[0] === 'settings:save')
    .map((call) => (call as unknown as [string, Record<string, unknown>])[1]);
}

/**
 * Scope queries to one section. Every section stays mounted (inactive ones are
 * `hidden`), so an unscoped `getByRole('button', {name: 'Save'})` would be
 * ambiguous by design.
 */
function panel(id: 'models' | 'embeddings' | 'appearance') {
  const el = document.getElementById(`settings-panel-${id}`);
  if (!el) throw new Error(`settings panel "${id}" is not mounted`);
  return within(el);
}

describe('SettingsDialog', () => {
  it('renders a section rail and starts on AI & Models', async () => {
    renderDialog();

    const rail = screen.getByRole('navigation', { name: /settings sections/i });
    expect(rail).toBeInTheDocument();

    for (const label of ['AI & Models', 'Embeddings', 'Appearance']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // The active section is the current page, and its panel is the visible one.
    expect(screen.getByRole('button', { name: 'AI & Models' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByRole('heading', { name: 'AI & Models' })).toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('keeps a half-typed key when the user visits another section and returns', async () => {
    renderDialog();

    const brave = await screen.findByLabelText('Brave Search API key');
    fireEvent.change(brave, { target: { value: 'typed-but-not-saved' } });

    // Leave and come back.
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI & Models' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Brave Search API key')).toHaveValue(
        'typed-but-not-saved',
      );
    });
  }, TEST_TIMEOUT);

  it('omits untouched key fields so the stored key survives', async () => {
    renderDialog();

    await screen.findByLabelText('Brave Search API key');
    fireEvent.click(panel('models').getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(savePayloads()).toHaveLength(1);
    });

    const payload = savePayloads()[0];
    // The provider/model selection is saved…
    expect(payload).toMatchObject({
      activeProvider: 'groq',
      activeModel: 'openai/gpt-oss-120b',
    });
    // …but the untouched key fields are not part of the payload at all. Sending
    // an empty string would clear the encrypted key on disk.
    expect(payload).not.toHaveProperty('braveApiKey');
    expect(payload).not.toHaveProperty('serviceKeys');
  }, TEST_TIMEOUT);

  it('saves embeddings without disturbing the chat model', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Embeddings' }));
    const model = await screen.findByLabelText('Embedding model');
    fireEvent.change(model, { target: { value: 'text-embedding-3-small' } });
    fireEvent.click(panel('embeddings').getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(savePayloads()).toHaveLength(1);
    });

    // Only the embedding fields. No activeProvider/activeModel, so changing
    // the embedding model cannot reset the chat model.
    expect(savePayloads()[0]).toEqual({
      embeddingProvider: '',
      embeddingModel: 'text-embedding-3-small',
    });
  }, TEST_TIMEOUT);
});
