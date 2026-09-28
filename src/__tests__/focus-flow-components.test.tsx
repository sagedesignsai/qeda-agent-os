/**
 * __tests__/focus-flow-components.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SingleTaskLens and FloatingFocusBar components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { SingleTaskLens } from '../components/tasks/SingleTaskLens';
import { FloatingFocusBar } from '../components/focus/FloatingFocusBar';
import type { Task } from '../main/ipc/channels';
import type { FocusTimerState } from '../hooks/use-focus-timer';
import type { UseFocusAudioReturn } from '../hooks/use-focus-audio';

const MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    project_id: 'inbox',
    title: 'Write executive summary',
    description: 'Summarize the core architecture and value prop',
    status: 'active',
    priority: 1,
    position: 0,
    estimate_mins: 45,
    due_at: null,
    pomodoro_count: 2,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: 'task-2',
    project_id: 'inbox',
    title: 'Review pull request',
    description: '',
    status: 'backlog',
    priority: 2,
    position: 1,
    estimate_mins: 15,
    due_at: null,
    pomodoro_count: 0,
    created_at: 1000,
    updated_at: 1000,
  },
];

const MOCK_TIMER_STATE: FocusTimerState = {
  phase: 'work',
  secondsLeft: 1495, // 24:55
  running: true,
  completed: 1,
  phaseTotal: 1500,
};

const MOCK_AUDIO: UseFocusAudioReturn = {
  config: {
    noise: 'brown',
    noiseVolume: 0.5,
    // `binaural` is the on/off flag; the beat character comes from `beatHz`.
    binaural: true,
    carrierHz: 200,
    beatHz: 10,
    binauralVolume: 0.3,
  },
  playing: false,
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  toggle: jest.fn().mockResolvedValue(undefined),
  setConfig: jest.fn(),
};

describe('SingleTaskLens', () => {
  it('renders the highest priority active task without peripheral distraction', () => {
    const onFocus = jest.fn();
    const onOpenSteps = jest.fn();
    const onComplete = jest.fn();
    const onExit = jest.fn();

    render(
      <SingleTaskLens
        tasks={MOCK_TASKS}
        stepProgress={{ 'task-1': { done: 2, total: 4 } }}
        onFocus={onFocus}
        onOpenSteps={onOpenSteps}
        onComplete={onComplete}
        onExit={onExit}
      />,
    );

    expect(screen.getByText('Write executive summary')).toBeInTheDocument();
    expect(screen.getByText('High Priority')).toBeInTheDocument();
    expect(screen.getByText('2/4 steps done')).toBeInTheDocument();
    expect(screen.getByText('Enter Flow State')).toBeInTheDocument();

    // Complete task action
    const completeBtn = screen.getByText(/Mark Done/);
    fireEvent.click(completeBtn);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      expect.anything(),
    );

    // Exit lens
    const exitBtn = screen.getByText('Show All');
    fireEvent.click(exitBtn);
    expect(onExit).toHaveBeenCalled();
  });
});

describe('FloatingFocusBar', () => {
  it('renders active countdown, title, and 1-click completion button', () => {
    const onStart = jest.fn();
    const onPause = jest.fn();
    const onSkip = jest.fn();
    const onExpand = jest.fn();
    const onClose = jest.fn();
    const onCompleteTask = jest.fn();

    render(
      <FloatingFocusBar
        task={MOCK_TASKS[0]}
        timerState={MOCK_TIMER_STATE}
        progress={0.2}
        audio={MOCK_AUDIO}
        onStart={onStart}
        onPause={onPause}
        onSkip={onSkip}
        onExpand={onExpand}
        onClose={onClose}
        onCompleteTask={onCompleteTask}
      />,
    );

    expect(screen.getByText('24:55')).toBeInTheDocument();
    expect(screen.getByText('Write executive summary')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('+100 XP')).toBeInTheDocument();

    const completeBtn = screen.getByText('Complete');
    fireEvent.click(completeBtn);
    expect(onCompleteTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      expect.anything(),
    );

    const pauseBtn = screen.getByTitle('Pause timer');
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalled();

    const expandBtn = screen.getByTitle('Maximize focus mode');
    fireEvent.click(expandBtn);
    expect(onExpand).toHaveBeenCalled();
  });
});
