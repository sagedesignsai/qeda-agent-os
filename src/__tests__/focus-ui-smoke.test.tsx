/**
 * __tests__/focus-ui-smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Import-time smoke test for the focus-system UI.
 *
 * Rendering is covered elsewhere; here we only guarantee every new module
 * parses, resolves its imports (ui + ai-elements primitives), and exports the
 * components/hooks the page relies on. This catches the class of breakage that
 * a compile step would otherwise report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Tasks from '../renderer/pages/Tasks';
import { TodayTimeline } from '../components/tasks/TodayTimeline';
import { TaskStepsSheet } from '../components/tasks/TaskStepsSheet';
import { BrainDumpDialog } from '../components/tasks/BrainDumpDialog';
import { ScheduleBlockDialog } from '../components/tasks/ScheduleBlockDialog';
import { FocusAudioPanel } from '../components/tasks/FocusAudioPanel';
import { FocusStatsStrip } from '../components/tasks/FocusStatsStrip';
import { CopilotPanel } from '../components/copilot/CopilotPanel';
import { useCopilotChat } from '../hooks/use-copilot-chat';
import { useFocusTimer } from '../hooks/use-focus-timer';
import { useFocusAudio } from '../hooks/use-focus-audio';

describe('focus system UI modules', () => {
  it('exports the page and task components', () => {
    for (const component of [
      Tasks,
      TodayTimeline,
      TaskStepsSheet,
      BrainDumpDialog,
      ScheduleBlockDialog,
      FocusAudioPanel,
      FocusStatsStrip,
      CopilotPanel,
    ]) {
      expect(typeof component).toBe('function');
    }
  });

  it('exports the focus hooks', () => {
    expect(typeof useFocusTimer).toBe('function');
    expect(typeof useFocusAudio).toBe('function');
    expect(typeof useCopilotChat).toBe('function');
  });
});
