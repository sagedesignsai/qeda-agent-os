/**
 * __tests__/task-dialog.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The shared create/edit dialog: create sends the full form (including the
 * project picker), edit sends only the changed fields.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskDialog } from '../components/tasks/TaskDialog';
import type { Project, Task } from '../main/ipc/channels';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Alpha',
    description: '',
    status: 'active',
    color: '',
    icon: 'folder',
    deadline: null,
    repo_path: null,
    notebook_id: null,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Existing task',
    description: 'Original text',
    status: 'backlog',
    priority: 2,
    due_at: null,
    estimate_mins: 45,
    project_id: 'proj-1',
    pomodoro_count: 0,
    position: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('TaskDialog', () => {
  it('creates with the full form and honours the scoped project default', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <TaskDialog
        open
        onOpenChange={() => {}}
        projects={[makeProject()]}
        defaultProjectId="proj-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Write the changelog' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Keep it short' },
    });
    // Estimate chip.
    fireEvent.click(screen.getByRole('button', { name: '25m' }));
    // Due date.
    fireEvent.change(screen.getByLabelText('Due date'), {
      target: { value: '2026-12-01' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Add task/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Write the changelog',
        description: 'Keep it short',
        estimate_mins: 25,
        due_at: new Date(2026, 11, 1).getTime() / 1000,
        // The scoped project is the default, not "none".
        project_id: 'proj-1',
      }),
    );
  });

  it('creates into the Inbox when no project is selected', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <TaskDialog open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Unsorted thought' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add task/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: null }),
    );
  });

  it('submits only changed fields when editing', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <TaskDialog
        open
        onOpenChange={() => {}}
        task={makeTask()}
        projects={[makeProject()]}
        onSubmit={onSubmit}
      />,
    );

    // Change only the title; everything else stays as seeded.
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Renamed task' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Renamed task' });
  });

  it('can clear the due date and estimate on edit (nulls are sent)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <TaskDialog
        open
        onOpenChange={() => {}}
        task={makeTask({ due_at: new Date(2026, 11, 1).getTime() / 1000 })}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Due date'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '15m' })); // 45 → 15
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ due_at: null, estimate_mins: 15 }),
    );
  });

  it('disables submit without a title', () => {
    render(<TaskDialog open onOpenChange={() => {}} onSubmit={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Add task/i })).toBeDisabled();
  });
});
