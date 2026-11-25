/**
 * __tests__/studio-copilot-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * UI tests for StudioCopilotPanel:
 *   - Docked panel presentation, header badges, project notice
 *   - Empty state suggestions and prompt input interactions
 *   - Initial prompt auto-dispatch and smart bridge handling
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { StudioCopilotPanel } from '../components/studio/copilot/StudioCopilotPanel';
import { useStudioCopilot } from '../hooks/use-studio-copilot';
import type { StudioTake } from '../lib/studio-types';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';

const mockSendMessage = jest.fn();
const mockClearMessages = jest.fn();
const mockRespondToApproval = jest.fn();
const mockIpcInvoke = jest.fn();
const mockIpcListeners = new Map<string, (...args: unknown[]) => void>();

jest.mock('../hooks/use-studio-copilot', () => ({
  useStudioCopilot: jest.fn(() => ({
    messages: [],
    status: 'ready',
    error: undefined,
    fallbackNotice: undefined,
    dismissFallbackNotice: jest.fn(),
    sendMessage: mockSendMessage,
    respondToApproval: mockRespondToApproval,
    clearMessages: mockClearMessages,
    plan: null,
    clearPlan: jest.fn(),
  })),
}));

jest.mock('../hooks/use-ipc', () => ({
  useIpcInvoke: () => mockIpcInvoke,
  useIpcEvent: jest.fn((channel: string, listener: (...args: unknown[]) => void) => {
    mockIpcListeners.set(channel, listener);
  }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const mockUseStudioCopilot = useStudioCopilot as jest.MockedFunction<
  typeof useStudioCopilot
>;

describe('StudioCopilotPanel UI Component', () => {
  const sampleTake: StudioTake = {
    id: 'take-ui-copilot-1',
    projectId: 'proj-123',
    projectName: 'Qeda Platform',
    title: 'Showcase Demo Walkthrough',
    description: 'Testing copilot sheet UI',
    sourceType: 'window',
    sourceName: 'Chrome Window',
    durationMs: 20000,
    videoPath: '/path/to/video.webm',
    audioPath: null,
    mouseEventsPath: null,
    cuts: [],
    zooms: [],
    captions: [],
    styling: DEFAULT_STUDIO_STYLING,
    socialKit: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcListeners.clear();
    mockIpcInvoke.mockResolvedValue({ accepted: true });
  });

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  it('renders docked panel header with take title, suggestions, and prompt input', () => {
    renderWithRouter(
      <StudioCopilotPanel
        open={true}
        onOpenChange={jest.fn()}
        activeTake={sampleTake}
        currentTimeMs={5000}
      />
    );

    expect(screen.getByText('Studio Copilot')).toBeInTheDocument();
    expect(screen.getByText('Showcase Demo Walkthrough')).toBeInTheDocument();
    expect(
      screen.getByText('Studio AI Video Director')
    ).toBeInTheDocument();
    expect(screen.getByText('Run Magic Draft')).toBeInTheDocument();
    expect(screen.getByText('Zoom at Playhead')).toBeInTheDocument();
    expect(screen.getByText('Generate Subtitles')).toBeInTheDocument();
    expect(screen.getByText('Draft Release Kit')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Copilot mode' })).toHaveTextContent(
      'Edit',
    );
    expect(
      screen.queryByText(/Autonomous video director over timeline cuts/),
    ).not.toBeInTheDocument();
    const copilotPanel = screen.getByRole('complementary', {
      name: 'Studio Copilot',
    });
    expect(copilotPanel).toBeInTheDocument();
    expect(copilotPanel).toHaveClass('w-[clamp(320px,35vw,420px)]');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the docked panel through its header control', () => {
    const onOpenChange = jest.fn();
    renderWithRouter(
      <StudioCopilotPanel
        open
        onOpenChange={onOpenChange}
        activeTake={sampleTake}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Studio Copilot' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking a suggestion chip sends the prompt', () => {
    renderWithRouter(
      <StudioCopilotPanel
        open={true}
        onOpenChange={jest.fn()}
        activeTake={sampleTake}
        currentTimeMs={5000}
      />
    );

    const magicDraftBtn = screen.getByText('Run Magic Draft');
    fireEvent.click(magicDraftBtn);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Run a complete Magic Draft on this take')
    );
  });

  it('switches to showcase mode and threads it into the agent context', () => {
    renderWithRouter(
      <StudioCopilotPanel
        open={true}
        onOpenChange={jest.fn()}
        activeTake={sampleTake}
        currentTimeMs={5000}
      />,
    );

    fireEvent.click(
      screen.getByRole('combobox', { name: 'Copilot mode' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Showcase' }));

    expect(mockUseStudioCopilot).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'showcase' }),
    );
    expect(
      screen.getByRole('combobox', { name: 'Copilot mode' }),
    ).toHaveTextContent('Showcase');
    expect(screen.getByText('Showcase Builder')).toBeInTheDocument();
    expect(screen.getByText('Build Showcase')).toBeInTheDocument();
  });

  it('auto-dispatches initialPrompt when opened and calls onInitialPromptHandled', () => {
    const handlePromptHandled = jest.fn();
    renderWithRouter(
      <StudioCopilotPanel
        open={true}
        onOpenChange={jest.fn()}
        activeTake={sampleTake}
        currentTimeMs={5000}
        initialPrompt="Analyze key moments and apply smart kinetic zooms"
        onInitialPromptHandled={handlePromptHandled}
      />
    );

    expect(mockSendMessage).toHaveBeenCalledWith(
      'Analyze key moments and apply smart kinetic zooms'
    );
    expect(handlePromptHandled).toHaveBeenCalledTimes(1);
  });

  it('shows a clear sign-in handoff and confirms only through the IPC reply', async () => {
    renderWithRouter(
      <StudioCopilotPanel
        open={true}
        onOpenChange={jest.fn()}
        activeTake={sampleTake}
      />,
    );

    act(() => {
      mockIpcListeners.get('studio-copilot:sign-in-request')?.({
        requestId: 'signin-1',
        browserId: 'browser-1',
        expiresAt: Date.now() + 60_000,
      });
    });

    expect(screen.getByText('Sign in before recording')).toBeInTheDocument();
    expect(
      screen.getByText(/Keep credentials in the browser, not in chat/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'I’m signed in' }));

    expect(mockIpcInvoke).toHaveBeenCalledWith(
      'studio-copilot:sign-in-reply',
      { requestId: 'signin-1', decision: 'continue' },
    );
  });
});
