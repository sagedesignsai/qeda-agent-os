/**
 * __tests__/active-launchpad.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Component tests for ActiveLaunchpad and TodayEmptyHero components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveLaunchpad } from '@/components/tasks/ActiveLaunchpad';
import { TodayEmptyHero } from '@/components/tasks/TodayEmptyHero';
import type { Task } from '@/main/ipc/channels';

const mockTask: Task = {
  id: 'task-launch-1',
  // `Task['project_id']` is non-nullable (the DB always stores the Inbox), but
  // this fixture exercises the "no project" render path, so the null is forced
  // past the type. The runtime value under test is unchanged.
  project_id: null as unknown as string,
  title: 'Implement OAuth Token Refresh',
  description: 'Need to secure credentials and handle rotation',
  status: 'backlog',
  priority: 1,
  estimate_mins: 25,
  due_at: null,
  pomodoro_count: 0,
  position: 0,
  created_at: 1000,
  updated_at: 1000,
};

describe('ActiveLaunchpad', () => {
  it('renders nothing when recommendation has no task', () => {
    const { container } = render(
      <ActiveLaunchpad
        recommendation={{ task: null, rationale: 'None', totalCandidates: 0 }}
        onStartFlow={jest.fn()}
        onOpenSteps={jest.fn()}
        onShuffle={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders task details, rationale, XP reward, and triggers action callbacks', () => {
    const onStartFlow = jest.fn();
    const onOpenSteps = jest.fn();
    const onShuffle = jest.fn();

    render(
      <ActiveLaunchpad
        recommendation={{
          task: mockTask,
          rationale: 'Quick Win (25m): lowest activation barrier to build flow',
          totalCandidates: 3,
        }}
        onStartFlow={onStartFlow}
        onOpenSteps={onOpenSteps}
        onShuffle={onShuffle}
      />,
    );

    expect(screen.getByText('Implement OAuth Token Refresh')).toBeInTheDocument();
    expect(
      screen.getByText('Quick Win (25m): lowest activation barrier to build flow'),
    ).toBeInTheDocument();
    expect(screen.getByText('Recommended Next Move')).toBeInTheDocument();
    expect(screen.getByText('+100 XP')).toBeInTheDocument();

    // Trigger Start Flow
    const startBtn = screen.getByRole('button', { name: /start flow/i });
    fireEvent.click(startBtn);
    expect(onStartFlow).toHaveBeenCalledWith(mockTask, expect.anything());

    // Trigger Break Down
    const breakdownBtn = screen.getByRole('button', { name: /break down/i });
    fireEvent.click(breakdownBtn);
    expect(onOpenSteps).toHaveBeenCalledWith(mockTask);

    // Trigger Shuffle
    const shuffleBtn = screen.getByRole('button', { name: /suggest another/i });
    fireEvent.click(shuffleBtn);
    expect(onShuffle).toHaveBeenCalledTimes(1);
  });
});

describe('TodayEmptyHero', () => {
  it('renders empty day hero and initiates flow, kickoff, or auto-plan', () => {
    const onStartFlow = jest.fn();
    const onOpenKickoff = jest.fn();
    const onAutoPlan = jest.fn();

    render(
      <TodayEmptyHero
        recommendation={{
          task: mockTask,
          rationale: 'High priority candidate',
          totalCandidates: 5,
        }}
        openTasksCount={5}
        streakDays={3}
        onStartFlow={onStartFlow}
        onOpenKickoff={onOpenKickoff}
        onAutoPlan={onAutoPlan}
      />,
    );

    expect(
      screen.getByText(/Ready to kick off today's flow\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/3d streak/i)).toBeInTheDocument();
    expect(screen.getByText(/5 tasks/i)).toBeInTheDocument();
    expect(screen.getByText('Implement OAuth Token Refresh')).toBeInTheDocument();

    // Flow button
    const flowBtn = screen.getByRole('button', { name: /quick start/i });
    fireEvent.click(flowBtn);
    expect(onStartFlow).toHaveBeenCalledWith(mockTask, expect.anything());

    // Kickoff button
    const kickoffBtn = screen.getByRole('button', { name: /morning kickoff/i });
    fireEvent.click(kickoffBtn);
    expect(onOpenKickoff).toHaveBeenCalled();

    // Auto-Plan button
    const autoPlanBtn = screen.getByRole('button', { name: /auto-plan day with ai/i });
    fireEvent.click(autoPlanBtn);
    expect(onAutoPlan).toHaveBeenCalled();
  });

  it('submits conversational prompt and executes suggestion chips', () => {
    const onSendPrompt = jest.fn();
    const onOpenBrainDump = jest.fn();

    render(
      <TodayEmptyHero
        recommendation={{
          task: mockTask,
          rationale: 'Quick win',
          totalCandidates: 1,
        }}
        openTasksCount={1}
        streakDays={1}
        onStartFlow={jest.fn()}
        onOpenKickoff={jest.fn()}
        onAutoPlan={jest.fn()}
        onSendPrompt={onSendPrompt}
        onOpenBrainDump={onOpenBrainDump}
      />,
    );

    // Type in composer and submit
    const textarea = screen.getByPlaceholderText(/Ask Copilot: plan my day/i);
    fireEvent.change(textarea, {
      target: { value: 'Schedule 2 hours for deep work' },
    });
    const submitBtn = screen.getByRole('button', { name: /send/i });
    fireEvent.click(submitBtn);
    expect(onSendPrompt).toHaveBeenCalledWith('Schedule 2 hours for deep work');

    // Click suggestion chip for planning
    const planChip = screen.getByRole('button', { name: /plan today's top 3/i });
    fireEvent.click(planChip);
    expect(onSendPrompt).toHaveBeenCalledWith(
      expect.stringContaining('top 3 priorities'),
    );

    // Click brain dump chip
    const brainDumpChip = screen.getByRole('button', {
      name: /brain dump thoughts/i,
    });
    fireEvent.click(brainDumpChip);
    expect(onOpenBrainDump).toHaveBeenCalled();
  });
});

