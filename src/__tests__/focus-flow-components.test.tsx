/**
 * __tests__/focus-flow-components.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SingleTaskLens and the sidebar focus player.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { SingleTaskLens } from '../components/tasks/SingleTaskLens';
import { SidebarFocusPlayer } from '../components/focus/SidebarFocusPlayer';
import { SidebarProvider } from '../components/ui/sidebar';
import { useFocusStore } from '../stores/focus-store';
import type { Task } from '../main/ipc/channels';
import type { FocusTimerState } from '../lib/focus/timer';

// `SidebarProvider` reads `use-mobile`, which calls matchMedia. jsdom does not
// implement it, so every sidebar-hosted component needs the shim.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
});

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

describe('SingleTaskLens', () => {
  it('clamps the cursor when completing a task shrinks the list', () => {
    // Advancing to the *last* task and then completing it leaves the index past
    // the end of `openTasks`. Without a clamp the lens falls through to
    // "Clear Horizon! No open tasks left" while a task is still outstanding.
    const props = {
      stepProgress: {},
      onFocus: jest.fn(),
      onOpenSteps: jest.fn(),
      onComplete: jest.fn(),
      onExit: jest.fn(),
    };

    const { rerender } = render(
      <SingleTaskLens tasks={MOCK_TASKS} {...props} />,
    );

    // Page forward to the final task.
    fireEvent.click(screen.getByText(/Next Task/));
    expect(document.body.textContent).toMatch(/2 of 2/);

    // Completing it removes it from the open list, leaving only task-1.
    rerender(<SingleTaskLens tasks={[MOCK_TASKS[0]]} {...props} />);

    expect(screen.queryByText('Clear Horizon!')).toBeNull();
    expect(document.body.textContent).toMatch(/1 of 1/);
    expect(screen.getByText('Write executive summary')).toBeInTheDocument();
  });

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

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

describe('SidebarFocusPlayer', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', {
      writable: true,
      value: {
        ipc: {
          invoke: jest.fn((channel: string) => {
            if (channel === 'projects:get') {
              return Promise.resolve({ id: 'p1', name: 'Project One' });
            }
            if (channel === 'settings:get') {
              return Promise.resolve({ activeProjectId: '' });
            }
            if (channel === 'tasks:steps-list') {
              return Promise.resolve([
                {
                  id: 'step-1',
                  task_id: 'task-1',
                  title: 'Outline sections',
                  done: 0,
                  position: 0,
                  created_at: 1,
                },
                {
                  id: 'step-2',
                  task_id: 'task-1',
                  title: 'Draft the summary',
                  done: 1,
                  position: 1,
                  created_at: 2,
                },
              ]);
            }
            return Promise.resolve(undefined);
          }),
          on: () => () => {},
        },
      },
    });
    // The player reads the app-wide store rather than props; seed a session and
    // then pin the countdown so the assertion is deterministic. Store writes
    // outside `act` make React warn about updates it did not schedule.
    act(() => {
      useFocusStore.getState().clearFocus();
      useFocusStore.getState().startFocus(MOCK_TASKS[0]);
      useFocusStore.setState({ timer: MOCK_TIMER_STATE });
    });
  });

  afterEach(() => {
    act(() => {
      useFocusStore.getState().clearFocus();
    });
  });

  const renderPlayer = (entry = '/chat?project=p1') =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <SidebarProvider>
          <SidebarFocusPlayer />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>,
    );

  it('renders active countdown, title, and 1-click completion in the rail', () => {
    renderPlayer();

    expect(screen.getByText('24:55')).toBeInTheDocument();
    expect(screen.getByText('Write executive summary')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Pause timer'));
    expect(useFocusStore.getState().timer.running).toBe(false);
  });

  it('maximizes into the current project scope', () => {
    renderPlayer();

    fireEvent.click(screen.getByLabelText('Maximize focus mode'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/tasks?project=p1',
    );
    expect(useFocusStore.getState().displayMode).toBe('modal');
  });

  it('surfaces the next step and completes it from the rail', async () => {
    renderPlayer();

    expect(await screen.findByText(/1\/2 steps/)).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Outline sections'));

    await waitFor(() =>
      expect(window.electron.ipc.invoke).toHaveBeenCalledWith(
        'tasks:step-toggle',
        { id: 'step-1', done: true },
      ),
    );
  });

  it('marks the task done through IPC and clears the session', async () => {
    renderPlayer();

    fireEvent.click(screen.getByText('Complete'));

    await waitFor(() =>
      expect(window.electron.ipc.invoke).toHaveBeenCalledWith(
        'tasks:update',
        expect.objectContaining({ id: 'task-1', status: 'done' }),
      ),
    );
    await waitFor(() =>
      expect(useFocusStore.getState().focusedTask).toBeNull(),
    );
  });
});
