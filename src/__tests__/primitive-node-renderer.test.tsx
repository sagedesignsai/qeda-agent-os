/**
 * __tests__/primitive-node-renderer.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for PrimitiveNodeRenderer:
 *   - Text primitive inline editing and blur handling
 *   - Verifies selection badge does not pollute contentEditable textContent on blur
 *   - Empty state placeholder rendering
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, fireEvent } from '@testing-library/react';
import { PrimitiveNodeRenderer } from '../components/documents/primitives/PrimitiveNodeRenderer';
import type { TextNode } from '../lib/pdf-studio/primitives-ast';

describe('PrimitiveNodeRenderer - Text Primitive', () => {
  const baseTextNode: TextNode = {
    id: 'text-node-1',
    type: 'text',
    content: '+42%',
    fontSize: 18,
    fontWeight: 800,
  };

  it('renders text content accurately when not selected', () => {
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText, queryByText } = render(
      <PrimitiveNodeRenderer
        node={baseTextNode}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    expect(getByText('+42%')).toBeInTheDocument();
    // Selection pill should not be rendered
    expect(queryByText('Text')).not.toBeInTheDocument();
  });

  it('renders selection pill "Text" when selected', () => {
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText } = render(
      <PrimitiveNodeRenderer
        node={baseTextNode}
        selectedNodeId="text-node-1"
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    expect(getByText('+42%')).toBeInTheDocument();
    expect(getByText('Text')).toBeInTheDocument();
  });

  it('does NOT prepend "Text" to content on blur when selected', () => {
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText } = render(
      <PrimitiveNodeRenderer
        node={baseTextNode}
        selectedNodeId="text-node-1"
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    const editableEl = getByText('+42%');
    expect(editableEl).toHaveAttribute('contenteditable', 'true');

    // Blur without changing text
    fireEvent.blur(editableEl);

    // onUpdateNode should NOT be called because content is unchanged
    expect(onUpdateNode).not.toHaveBeenCalledWith(
      'text-node-1',
      expect.objectContaining({ content: expect.stringContaining('Text') }),
    );
  });

  it('updates node with exact user text on blur without prepending "Text"', () => {
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText } = render(
      <PrimitiveNodeRenderer
        node={baseTextNode}
        selectedNodeId="text-node-1"
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    const editableEl = getByText('+42%');
    editableEl.textContent = '+50%';

    fireEvent.blur(editableEl);

    expect(onUpdateNode).toHaveBeenCalledTimes(1);
    expect(onUpdateNode).toHaveBeenCalledWith('text-node-1', {
      content: '+50%',
    });
  });

  it('multiple focus and blur cycles never prepend "Text"', () => {
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText } = render(
      <PrimitiveNodeRenderer
        node={baseTextNode}
        selectedNodeId="text-node-1"
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    const editableEl = getByText('+42%');

    // Focus and blur 5 times
    for (let i = 0; i < 5; i++) {
      fireEvent.focus(editableEl);
      fireEvent.blur(editableEl);
    }

    // None of the blur cycles should have prepended "Text" or triggered false updates
    expect(onUpdateNode).not.toHaveBeenCalled();
  });

  it('renders placeholder when text content is empty', () => {
    const emptyNode: TextNode = {
      id: 'text-node-empty',
      type: 'text',
      content: '',
    };
    const onSelectNode = jest.fn();
    const onUpdateNode = jest.fn();

    const { getByText } = render(
      <PrimitiveNodeRenderer
        node={emptyNode}
        selectedNodeId="text-node-empty"
        onSelectNode={onSelectNode}
        onUpdateNode={onUpdateNode}
      />,
    );

    expect(getByText('Type something...')).toBeInTheDocument();
  });
});
