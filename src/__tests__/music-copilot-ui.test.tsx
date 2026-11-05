/**
 * __tests__/music-copilot-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * UI tests for MusicCopilotSheet: the DJ framing, the four starting points, and
 * the initial-prompt hand-off used by the command palette.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MusicCopilotSheet } from '../components/music/MusicCopilotSheet';

const mockSendMessage = jest.fn();
const mockClearMessages = jest.fn();

jest.mock('../hooks/use-music-copilot', () => ({
  useMusicCopilot: jest.fn(() => ({
    messages: [],
    status: 'ready',
    error: undefined,
    fallbackNotice: undefined,
    dismissFallbackNotice: jest.fn(),
    sendMessage: mockSendMessage,
    respondToApproval: jest.fn(),
    clearMessages: mockClearMessages,
  })),
}));

jest.mock('../hooks/use-ipc', () => ({
  useIpcEvent: jest.fn(),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('MusicCopilotSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderSheet = (ui?: React.ReactElement) =>
    render(<MemoryRouter>{ui}</MemoryRouter>);

  it('frames the copilot as a DJ and offers starting points', () => {
    renderSheet(
      <MusicCopilotSheet open={true} onOpenChange={jest.fn()} />,
    );

    expect(screen.getByText('Music Copilot')).toBeInTheDocument();
    expect(screen.getByText('Your listening concierge')).toBeInTheDocument();
    expect(screen.getByText('Build a deep-work set')).toBeInTheDocument();
    expect(screen.getByText('Rainy late-night set')).toBeInTheDocument();
    expect(screen.getByText('Score my next task')).toBeInTheDocument();
    expect(screen.getByText('Soften the room')).toBeInTheDocument();
  });

  it('sends the full deep-work prompt when its suggestion is clicked', () => {
    renderSheet(
      <MusicCopilotSheet open={true} onOpenChange={jest.fn()} />,
    );

    fireEvent.click(screen.getByText('Build a deep-work set'));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('90-minute deep-work set'),
    );
  });

  it('auto-dispatches an initial prompt once and acknowledges it', () => {
    const handled = jest.fn();

    renderSheet(
      <MusicCopilotSheet
        open={true}
        onOpenChange={jest.fn()}
        initialPrompt="Make the room quieter"
        onInitialPromptHandled={handled}
      />,
    );

    expect(mockSendMessage).toHaveBeenCalledWith('Make the room quieter');
    expect(handled).toHaveBeenCalledTimes(1);
  });
});
