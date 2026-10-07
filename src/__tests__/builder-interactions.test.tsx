/**
 * __tests__/builder-interactions.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises OpenCode form branching and permission/tool rendering contracts at
 * the renderer boundary, including the explicit human approval actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { BuilderFormCard } from '@/components/builder/tools/BuilderFormCard';
import { BuilderPermissionCard } from '@/components/builder/tools/BuilderPermissionCard';
import { BuilderToolCall } from '@/components/builder/tools/BuilderToolCall';
import type { BuilderFormRequest } from '@/lib/builder-interactions';
import type { ToolPart } from '@/components/ai-elements/tool';

jest.mock('@/components/ai-elements/tool', () => ({
  Tool: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ToolContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ToolHeader: ({ title, state }: { title?: string; state: string }) => (
    <button type="button">
      {title} {state}
    </button>
  ),
  ToolInput: ({ input }: { input: unknown }) => (
    <div>
      <span>Parameters</span>
      <pre>{JSON.stringify(input)}</pre>
    </div>
  ),
  ToolOutput: () => null,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    'aria-label': label,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

const form: BuilderFormRequest = {
  id: 'frm_123',
  sessionID: 'ses_123',
  title: 'Project setup',
  fields: [
    {
      key: 'name',
      title: 'Project name',
      type: 'string',
      required: true,
      placeholder: 'e.g. Northstar',
    },
    {
      key: 'includeDemo',
      title: 'Include a demo route',
      type: 'boolean',
      default: false,
    },
    {
      key: 'demoRoute',
      title: 'Demo route path',
      type: 'string',
      required: true,
      when: [{ key: 'includeDemo', op: 'eq', value: true }],
    },
  ],
};

describe('BuilderFormCard', () => {
  it('validates required fields and submits keyed answers', () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <BuilderFormCard form={form} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Project name/), {
      target: { value: 'Northstar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Northstar',
      includeDemo: false,
    });
    rerender(
      <BuilderFormCard form={form} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
  });

  it('shows conditionally requested fields when their condition becomes true', () => {
    render(
      <BuilderFormCard form={form} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.queryByLabelText(/Demo route path/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Include a demo route' }),
    );
    expect(screen.getByLabelText(/Demo route path/)).toBeInTheDocument();
  });
});

describe('BuilderPermissionCard', () => {
  it('surfaces explicit once, always, and reject decisions', () => {
    const onDecision = jest.fn();
    render(
      <BuilderPermissionCard
        request={{
          id: 'per_1',
          sessionID: 'ses_1',
          action: 'bash',
          resources: ['npm test'],
        }}
        onDecision={onDecision}
      />,
    );

    expect(screen.getByText('npm test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    fireEvent.click(screen.getByRole('button', { name: 'Always allow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDecision.mock.calls).toEqual([['once'], ['always'], ['reject']]);
  });
});

describe('BuilderToolCall', () => {
  it('renders a recognizable OpenCode file operation and inspectable input', () => {
    const part = {
      type: 'tool-edit',
      toolCallId: 'call_1',
      state: 'input-available',
      input: { filePath: 'src/App.tsx', oldString: 'Hello', newString: 'Hi' },
    } as ToolPart;

    render(<BuilderToolCall part={part} />);

    expect(
      screen.getByRole('button', { name: /Edit src\/App.tsx/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getAllByText(/src\/App.tsx/)).toHaveLength(2);
  });
});
