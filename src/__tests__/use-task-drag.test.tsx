/**
 * __tests__/use-task-drag.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Board drag-and-drop.
 *
 * The behaviours that actually break a native HTML5 drop are easy to get wrong
 * and invisible until a user drags: `preventDefault` missing on `dragover`
 * (no `drop` ever fires), `dropEffect` unset (cursor says "no drop"), and
 * `dragleave` firing when the pointer merely crosses a child card (highlight
 * flickers off mid-drag). Each is pinned below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { useTaskDrag, TASK_DRAG_MIME } from '@/hooks/use-task-drag';
import type { Task } from '@/main/ipc/channels';

type Status = Task['status'];

interface HarnessProps {
  onDrop: (taskId: string, to: Status) => void;
}

/** Two columns and two cards, wired exactly as the Board wires them. */
function Harness({ onDrop }: HarnessProps) {
  const drag = useTaskDrag({ onDrop });
  return (
    <div>
      <div
        data-testid="col-backlog"
        {...drag.getColumnProps('backlog')}
        data-over={drag.overColumn === 'backlog' ? 'yes' : 'no'}
      >
        <div
          data-testid="card-a"
          {...drag.getCardProps('task-a')}
          data-dragging={drag.isDragging('task-a') ? 'yes' : 'no'}
        >
          A
        </div>
        <div
          data-testid="card-b"
          {...drag.getCardProps('task-b')}
          data-dragging={drag.isDragging('task-b') ? 'yes' : 'no'}
        >
          B
        </div>
      </div>
      <div
        data-testid="col-active"
        {...drag.getColumnProps('active')}
        data-over={drag.overColumn === 'active' ? 'yes' : 'no'}
      />
    </div>
  );
}

/** Minimal DataTransfer stand-in; jsdom implements neither DragEvent nor it. */
function makeDataTransfer(types: string[] = [TASK_DRAG_MIME], data = '') {
  const store: Record<string, string> = data ? { [TASK_DRAG_MIME]: data } : {};
  return {
    types,
    effectAllowed: '',
    dropEffect: '',
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    getData: (k: string) => store[k] ?? '',
  };
}

type FakeDragEvent = Event & {
  dataTransfer: ReturnType<typeof makeDataTransfer>;
  relatedTarget: unknown;
};

/**
 * jsdom has no `DragEvent` constructor, and `Event.type` is read-only, so the
 * event is created with its real type up front.
 */
const fireDrag = (
  el: Element,
  type: string,
  dt: ReturnType<typeof makeDataTransfer>,
  relatedTarget: unknown = null,
): FakeDragEvent => {
  const e = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as FakeDragEvent;
  e.dataTransfer = dt;
  e.relatedTarget = relatedTarget;
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
};

describe('useTaskDrag', () => {
  it('marks the source card as dragging and clears it on drag end', () => {
    render(<Harness onDrop={jest.fn()} />);
    const card = screen.getByTestId('card-a');
    const dt = makeDataTransfer();

    fireDrag(card, 'dragstart', dt);
    expect(card).toHaveAttribute('data-dragging', 'yes');
    expect(dt.effectAllowed).toBe('move');
    expect(dt.getData(TASK_DRAG_MIME)).toBe('task-a');

    fireDrag(card, 'dragend', dt);
    expect(card).toHaveAttribute('data-dragging', 'no');
  });

  it('accepts a drop and reports the dragged id plus destination', () => {
    const onDrop = jest.fn();
    render(<Harness onDrop={onDrop} />);
    const card = screen.getByTestId('card-b');
    const active = screen.getByTestId('col-active');

    const dt = makeDataTransfer();
    fireDrag(card, 'dragstart', dt);
    fireDrag(active, 'drop', dt);

    expect(onDrop).toHaveBeenCalledWith('task-b', 'active');
    // State must not stay stuck after the drag ends.
    expect(card).toHaveAttribute('data-dragging', 'no');
  });

  it('calls preventDefault on dragover so the browser will fire drop', () => {
    render(<Harness onDrop={jest.fn()} />);
    const dt = makeDataTransfer();

    const over = fireDrag(screen.getByTestId('col-active'), 'dragover', dt);

    expect(over.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
  });

  it('ignores drags that are not tasks so foreign drops are not swallowed', () => {
    const onDrop = jest.fn();
    render(<Harness onDrop={onDrop} />);
    const active = screen.getByTestId('col-active');
    const foreign = makeDataTransfer(['text/plain'], 'hello');

    const over = fireDrag(active, 'dragover', foreign);

    expect(over.defaultPrevented).toBe(false);
    expect(active).toHaveAttribute('data-over', 'no');

    fireDrag(active, 'drop', foreign);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('keeps the highlight while the pointer moves onto a child card', () => {
    render(<Harness onDrop={jest.fn()} />);
    const column = screen.getByTestId('col-backlog');
    const dt = makeDataTransfer();

    fireDrag(column, 'dragenter', dt);
    expect(column).toHaveAttribute('data-over', 'yes');

    // dragleave with relatedTarget still inside the column (i.e. the pointer
    // merely crossed a child card) must NOT clear the highlight.
    fireDrag(column, 'dragleave', dt, screen.getByTestId('card-a'));
    expect(column).toHaveAttribute('data-over', 'yes');

    // Leaving the column entirely does clear it.
    fireDrag(column, 'dragleave', dt, document.body);
    expect(column).toHaveAttribute('data-over', 'no');
  });

  it('still reports the drop when dataTransfer.getData returns empty', () => {
    // Some browsers withhold getData until drop; the ref fallback covers it.
    const onDrop = jest.fn();
    render(<Harness onDrop={onDrop} />);
    const card = screen.getByTestId('card-a');
    const active = screen.getByTestId('col-active');

    const dt = makeDataTransfer();
    fireDrag(card, 'dragstart', dt);
    // Simulate the browser refusing to hand the payload back.
    dt.getData = () => '';
    fireDrag(active, 'drop', dt);

    expect(onDrop).toHaveBeenCalledWith('task-a', 'active');
  });
});
