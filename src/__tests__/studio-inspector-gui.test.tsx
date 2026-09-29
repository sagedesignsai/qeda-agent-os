/**
 * __tests__/studio-inspector-gui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for the modular Studio GUI Inspector:
 *   - Inspector GUI primitives (Section, Slider, SegmentedGroup, CoordinatePad, TimecodeNudge)
 *   - Master StudioInspector context-aware rendering
 *   - Dynamic clip properties editing and timelineStore synchronization
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  InspectorSection,
  InspectorSliderInput,
  InspectorSegmentedGroup,
  InspectorCoordinatePad,
  TimecodeNudgeInput,
} from '../components/studio/inspector/components';
import { StudioInspector } from '../components/studio/inspector/StudioInspector';
import { timelineStore } from '../hooks/use-timeline-store';
import type { StudioStyling } from '../lib/studio-types';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('Studio Inspector GUI Primitives', () => {
  describe('InspectorSection', () => {
    it('renders title, badge, and content when open', () => {
      render(
        <InspectorSection title="Framing Settings" badge="16:9" defaultOpen={true}>
          <div data-testid="section-content">Interior Fields</div>
        </InspectorSection>
      );

      expect(screen.getByText('Framing Settings')).toBeInTheDocument();
      expect(screen.getByText('16:9')).toBeInTheDocument();
      expect(screen.getByTestId('section-content')).toBeInTheDocument();
    });

    it('collapses and hides content on toggle click', () => {
      render(
        <InspectorSection title="Collapsible Panel" defaultOpen={true}>
          <div data-testid="toggle-content">Collapsible Content</div>
        </InspectorSection>
      );

      expect(screen.getByTestId('toggle-content')).toBeInTheDocument();

      // Click toggle button
      const toggleBtn = screen.getByRole('button', { name: /collapse section/i });
      fireEvent.click(toggleBtn);

      expect(screen.queryByTestId('toggle-content')).not.toBeInTheDocument();

      // Click title to expand again
      fireEvent.click(screen.getByText('Collapsible Panel'));
      expect(screen.getByTestId('toggle-content')).toBeInTheDocument();
    });
  });

  describe('InspectorSliderInput', () => {
    it('renders label, unit readout, and invokes onChange on manual input', () => {
      const handleChange = jest.fn();
      render(
        <InspectorSliderInput
          label="Border Radius"
          value={16}
          min={0}
          max={32}
          unit="px"
          onChange={handleChange}
        />
      );

      expect(screen.getByText('Border Radius')).toBeInTheDocument();
      expect(screen.getByText('16px')).toBeInTheDocument();

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(16);

      fireEvent.change(input, { target: { value: '24' } });
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(24);
    });

    it('clamps values exceeding max boundary', () => {
      const handleChange = jest.fn();
      render(
        <InspectorSliderInput
          label="Padding"
          value={20}
          min={10}
          max={65}
          unit="%"
          onChange={handleChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(65);
    });
  });

  describe('InspectorSegmentedGroup', () => {
    it('renders all options and fires onChange when clicked', () => {
      const handleChange = jest.fn();
      const options = [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '1:1', label: '1:1' },
      ];

      render(
        <InspectorSegmentedGroup
          value="16:9"
          options={options}
          onChange={handleChange}
        />
      );

      const optBtn = screen.getByRole('button', { name: '9:16' });
      fireEvent.click(optBtn);

      expect(handleChange).toHaveBeenCalledWith('9:16');
    });
  });

  describe('InspectorCoordinatePad', () => {
    it('renders coordinate pad with target percentages and resets to center', () => {
      const handleChange = jest.fn();
      render(
        <InspectorCoordinatePad
          targetX={0.25}
          targetY={0.75}
          onChange={handleChange}
        />
      );

      expect(screen.getByText('25%, 75%')).toBeInTheDocument();

      const centerBtn = screen.getByRole('button', { name: /center/i });
      fireEvent.click(centerBtn);

      expect(handleChange).toHaveBeenCalledWith(0.5, 0.5);
    });

    it('updates coordinate when typing into manual inputs', () => {
      const handleChange = jest.fn();
      render(
        <InspectorCoordinatePad
          targetX={0.4}
          targetY={0.6}
          onChange={handleChange}
        />
      );

      const inputs = screen.getAllByRole('spinbutton');
      const xInput = inputs[0];

      fireEvent.change(xInput, { target: { value: '0.85' } });
      expect(handleChange).toHaveBeenCalledWith(0.85, 0.6);
    });
  });

  describe('TimecodeNudgeInput', () => {
    it('formats milliseconds and executes +/- 100ms and +/- 1s nudges', () => {
      const handleChange = jest.fn();
      render(
        <TimecodeNudgeInput
          label="Start Time"
          timeMs={2500}
          onChange={handleChange}
        />
      );

      // Readout: 00:02.500
      expect(screen.getByText('00:02.500')).toBeInTheDocument();

      // Nudge +100ms
      const forward100 = screen.getByTitle('Nudge forward 100 milliseconds');
      fireEvent.click(forward100);
      expect(handleChange).toHaveBeenCalledWith(2600);

      // Nudge -1s
      const back1s = screen.getByTitle('Nudge back 1 second (-1000ms)');
      fireEvent.click(back1s);
      expect(handleChange).toHaveBeenCalledWith(1500);
    });
  });
});

describe('Master StudioInspector Component', () => {
  const mockStyling: StudioStyling = {
    ...DEFAULT_STUDIO_STYLING,
    aspectRatio: '16:9',
    borderRadius: 16,
    padding: 30,
  };

  const defaultProps = {
    styling: mockStyling,
    isProcessingDraft: false,
    isGeneratingSocialKit: false,
    onUpdateStyling: jest.fn(),
    onRunMagicDraft: jest.fn(),
    onGenerateSocialKit: jest.fn(),
    onExportVideo: jest.fn(),
    onAddZoomAtPlayhead: jest.fn(),
    onToggleCollapse: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    timelineStore.setSelectedClipId(null);
  });

  it('renders Global Canvas mode by default when no clip is selected', () => {
    render(<StudioInspector {...defaultProps} />);

    expect(screen.getByText('Studio Inspector')).toBeInTheDocument();
    expect(screen.getByText('GLOBAL')).toBeInTheDocument();
    expect(screen.getByText('Magic Agent & Export')).toBeInTheDocument();
    expect(screen.getByText('Canvas & Framing')).toBeInTheDocument();
    expect(screen.getByText('Wallpaper & Background')).toBeInTheDocument();
  });

  it('triggers onUpdateStyling when aspect ratio is clicked', () => {
    render(<StudioInspector {...defaultProps} />);

    const ratio916 = screen.getByRole('button', { name: '9:16' });
    fireEvent.click(ratio916);

    expect(defaultProps.onUpdateStyling).toHaveBeenCalledWith({
      aspectRatio: '9:16',
    });
  });

  it('triggers onRunMagicDraft when Re-Run Magic Draft button is clicked', () => {
    render(<StudioInspector {...defaultProps} />);

    const magicBtn = screen.getByRole('button', { name: /re-run magic draft/i });
    fireEvent.click(magicBtn);

    expect(defaultProps.onRunMagicDraft).toHaveBeenCalledTimes(1);
  });

  it('triggers onExportVideo when Export MP4 is clicked', () => {
    render(<StudioInspector {...defaultProps} />);

    const exportBtn = screen.getByRole('button', { name: /export mp4/i });
    fireEvent.click(exportBtn);

    expect(defaultProps.onExportVideo).toHaveBeenCalledWith('mp4');
  });

  it('docks Clip Properties section at the top when a Zoom clip is selected', () => {
    // Seed timeline store with a Zoom clip
    timelineStore.setTracksAndDuration(
      [
        {
          id: 'track-effects',
          type: 'effects',
          name: 'Kinetic Zooms',
          locked: false,
          visible: true,
          clips: [
            {
              id: 'zoom-clip-test-1',
              trackId: 'track-effects',
              name: 'Zoom 1.8x',
              startMs: 1000,
              durationMs: 3000,
              sourceStartMs: 1000,
              sourceDurationMs: 3000,
              payload: {
                scale: 1.8,
                targetX: 0.3,
                targetY: 0.4,
              },
            },
          ],
        },
      ],
      12000
    );

    // Select the zoom clip
    timelineStore.setSelectedClipId('zoom-clip-test-1');

    render(<StudioInspector {...defaultProps} />);

    // Header badge changes to CLIP ACTIVE
    expect(screen.getByText('CLIP ACTIVE')).toBeInTheDocument();

    // Clip Properties section is visible with Zoom badge
    expect(screen.getByText('Clip: Zoom 1.8x')).toBeInTheDocument();
    expect(screen.getByText('ZOOM 1.8X')).toBeInTheDocument();
    expect(screen.getByText('Zoom Scale')).toBeInTheDocument();
    expect(screen.getByText('Focal Center (X, Y)')).toBeInTheDocument();

    // Deselecting clip returns to global mode
    const deselectBtn = screen.getByTitle('Deselect clip');
    fireEvent.click(deselectBtn);

    expect(screen.queryByText('CLIP ACTIVE')).not.toBeInTheDocument();
    expect(screen.getByText('GLOBAL')).toBeInTheDocument();
  });
});
