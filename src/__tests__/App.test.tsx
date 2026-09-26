import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from '../renderer/App';

// jsdom has neither of these; next-themes and Radix both expect them.
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

// The renderer reaches the main process only through this bridge. Responses
// mirror the real channel contracts so components receive realistic data.
const ipcInvoke = jest.fn((channel: string) => {
  switch (channel) {
    case 'settings:get':
      return Promise.resolve({
        activeProvider: 'gateway',
        activeModel: 'openai/gpt-4o',
        providers: {},
      });
    case 'sessions:create':
      return Promise.resolve({
        id: 'session-1',
        title: 'New Chat',
        created_at: 0,
        updated_at: 0,
      });
    case 'tools:list':
      return Promise.resolve([
        { name: 'runShell', description: '', requiresApproval: true },
      ]);
    // sessions:list, sessions:messages, settings:save, sessions:save-messages
    default:
      return Promise.resolve([]);
  }
});

beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke: ipcInvoke,
        on: () => () => {},
        once: () => {},
      },
    },
  });
});

// Full-app renders are heavy; under parallel suite load they can exceed Jest's
// 5s default, so the integration tests get a realistic budget.
const APP_TEST_TIMEOUT = 20_000;

describe('App', () => {
  it(
    'renders the agent shell with the primary sections',
    async () => {
      render(<App />);

      expect(await screen.findByText('Vellum')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Chat & Research/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Workspace/ }),
      ).toBeInTheDocument();
    },
    APP_TEST_TIMEOUT,
  );

  it(
    'shows the active model reported by the main process',
    async () => {
      render(<App />);

      expect(await screen.findByText('openai/gpt-4o')).toBeInTheDocument();
      expect(ipcInvoke).toHaveBeenCalledWith('settings:get');
    },
    APP_TEST_TIMEOUT,
  );
});
