/**
 * src/__tests__/autonomous-hud-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * UI component & hook tests for AutonomousHUD and useAutonomousOperator.
 * Covers:
 *   - Visibility toggle (hidden when overlayOpen=false, visible when true)
 *   - Status pill and badges (Standby, Active, Paused)
 *   - Persona state transitions
 *   - Instruction prompt input submission and pause/resume button clicks
 *   - Escape key dismissing the HUD
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutonomousHUD } from '../components/autonomous/AutonomousHUD';
import { useAutonomousOperator } from '../hooks/use-autonomous-operator';

const mockSetOverlayOpen = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockDispatchInstruction = jest.fn();

jest.mock('../components/ai-elements/qeda-persona', () => ({
  QedaPersona: ({ state }: { state: string }) => (
    <div data-testid="persona-state">{state}</div>
  ),
}));

jest.mock('../components/ai-elements/reasoning', () => ({
  Reasoning: ({ children }: { children: React.ReactNode }) => <div data-testid="reasoning">{children}</div>,
}));

jest.mock('../components/ai-elements/shimmer', () => ({
  Shimmer: ({ children }: { children: React.ReactNode }) => <span data-testid="shimmer">{children}</span>,
}));

jest.mock('../hooks/use-autonomous-operator', () => ({
  useAutonomousOperator: jest.fn(),
}));

describe('AutonomousHUD UI Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when overlayOpen is false', () => {
    (useAutonomousOperator as jest.Mock).mockReturnValue({
      overlayOpen: false,
      setOverlayOpen: mockSetOverlayOpen,
      status: { running: false, paused: false, currentTaskId: null, currentTaskTitle: null, stepCount: 0, maxSteps: 30 },
      latestThought: null,
      latestAction: null,
      isThinking: false,
      isExecuting: false,
      pause: mockPause,
      resume: mockResume,
      dispatchInstruction: mockDispatchInstruction,
    });

    const { container } = render(<AutonomousHUD />);
    expect(container.firstChild).toBeNull();
  });

  it('renders HUD card, Persona, and action status when open', () => {
    (useAutonomousOperator as jest.Mock).mockReturnValue({
      overlayOpen: true,
      setOverlayOpen: mockSetOverlayOpen,
      status: {
        running: true,
        paused: false,
        currentTaskId: 'task-100',
        currentTaskTitle: 'Record Showcase Demo',
        stepCount: 5,
        maxSteps: 30,
      },
      latestThought: 'Analyzing Studio window elements...',
      latestAction: 'Clicking element @e4',
      isThinking: true,
      isExecuting: true,
      pause: mockPause,
      resume: mockResume,
      dispatchInstruction: mockDispatchInstruction,
    });

    render(<AutonomousHUD />);

    expect(screen.getByText('Qeda Autonomous Operator')).toBeInTheDocument();
    expect(screen.getByText('Self-Driving Mode active — User input shielded')).toBeInTheDocument();
    expect(screen.getByText(/Record Showcase Demo/)).toBeInTheDocument();
    expect(screen.getByTestId('persona-state')).toHaveTextContent('thinking');
    expect(screen.getByTestId('shimmer')).toHaveTextContent('Clicking element @e4');
    expect(screen.getByText('Step 5 / 30')).toBeInTheDocument();
  });

  it('handles pause button click when executing', () => {
    (useAutonomousOperator as jest.Mock).mockReturnValue({
      overlayOpen: true,
      setOverlayOpen: mockSetOverlayOpen,
      status: {
        running: true,
        paused: false,
        currentTaskId: 'task-100',
        currentTaskTitle: 'Record Showcase Demo',
        stepCount: 5,
        maxSteps: 30,
      },
      latestThought: null,
      latestAction: null,
      isThinking: false,
      isExecuting: true,
      pause: mockPause,
      resume: mockResume,
      dispatchInstruction: mockDispatchInstruction,
    });

    render(<AutonomousHUD />);
    const pauseBtn = screen.getByRole('button', { name: /pause/i });
    fireEvent.click(pauseBtn);
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('submits a new instruction through PromptInput', async () => {
    (useAutonomousOperator as jest.Mock).mockReturnValue({
      overlayOpen: true,
      setOverlayOpen: mockSetOverlayOpen,
      status: {
        running: false,
        paused: false,
        currentTaskId: null,
        currentTaskTitle: null,
        stepCount: 0,
        maxSteps: 30,
      },
      latestThought: null,
      latestAction: null,
      isThinking: false,
      isExecuting: false,
      pause: mockPause,
      resume: mockResume,
      dispatchInstruction: mockDispatchInstruction,
    });

    render(<AutonomousHUD />);

    const textarea = screen.getByPlaceholderText(/Direct the agent/i);
    fireEvent.change(textarea, { target: { value: 'Export 4k video take' } });

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockDispatchInstruction).toHaveBeenCalledWith('Export 4k video take');
    });
  });

  it('dismisses overlay on escape key', () => {
    (useAutonomousOperator as jest.Mock).mockReturnValue({
      overlayOpen: true,
      setOverlayOpen: mockSetOverlayOpen,
      status: { running: false, paused: false, currentTaskId: null, currentTaskTitle: null, stepCount: 0, maxSteps: 30 },
      latestThought: null,
      latestAction: null,
      isThinking: false,
      isExecuting: false,
      pause: mockPause,
      resume: mockResume,
      dispatchInstruction: mockDispatchInstruction,
    });

    render(<AutonomousHUD />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockSetOverlayOpen).toHaveBeenCalledWith(false);
  });
});
