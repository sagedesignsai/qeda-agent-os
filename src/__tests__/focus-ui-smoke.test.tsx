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
import Music from '../renderer/pages/Music';
import { TodayTimeline } from '../components/tasks/TodayTimeline';
import { TaskStepsSheet } from '../components/tasks/TaskStepsSheet';
import { BrainDumpDialog } from '../components/tasks/BrainDumpDialog';
import { ScheduleBlockDialog } from '../components/tasks/ScheduleBlockDialog';
import { FocusAudioPanel } from '../components/tasks/FocusAudioPanel';
import { FocusStatsStrip } from '../components/tasks/FocusStatsStrip';
import { CopilotPanel } from '../components/copilot/CopilotPanel';
import { HeaderLevelChip } from '../components/gamification/HeaderLevelChip';
import { ParticleCanvas } from '../components/gamification/ParticleCanvas';
import { FloatingFocusBar } from '../components/focus/FloatingFocusBar';
import { FocusRuntime } from '../components/focus/FocusRuntime';
import { SingleTaskLens } from '../components/tasks/SingleTaskLens';
import { MorningKickoffDialog } from '../components/tasks/MorningKickoffDialog';
import { ActiveLaunchpad } from '../components/tasks/ActiveLaunchpad';
import { TodayEmptyHero } from '../components/tasks/TodayEmptyHero';
import { GlobalAudioDock } from '../components/music/GlobalAudioDock';
import { SidebarMusicPlayer } from '../components/music/SidebarMusicPlayer';
import { PlayerTransport } from '../components/music/PlayerTransport';
import { QueuePanel } from '../components/music/QueuePanel';
import { ScenePicker } from '../components/music/ScenePicker';
import { SoundscapeMixer } from '../components/music/SoundscapeMixer';
import { TrackList } from '../components/music/TrackList';
import { useCopilotChat } from '../hooks/use-copilot-chat';
import { useFocusSession } from '../hooks/use-focus-session';
import { useSoundscape } from '../hooks/use-soundscape';
import { useMusicPlayer } from '../hooks/use-music-player';
import { useGamification } from '../hooks/use-gamification';

describe('focus system UI modules', () => {
  it('exports the page and task components', () => {
    for (const component of [
      Tasks,
      Music,
      TodayTimeline,
      TaskStepsSheet,
      BrainDumpDialog,
      ScheduleBlockDialog,
      FocusAudioPanel,
      FocusStatsStrip,
      CopilotPanel,
      HeaderLevelChip,
      ParticleCanvas,
      FloatingFocusBar,
      FocusRuntime,
      SingleTaskLens,
      MorningKickoffDialog,
      ActiveLaunchpad,
      TodayEmptyHero,
      GlobalAudioDock,
      SidebarMusicPlayer,
      PlayerTransport,
      QueuePanel,
      ScenePicker,
      SoundscapeMixer,
      TrackList,
    ]) {
      // `memo()` returns an object with $$typeof; plain components are functions.
      expect(
        typeof component === 'function' ||
          (typeof component === 'object' && component !== null),
      ).toBe(true);
    }
  });

  it('exports the focus and audio hooks', () => {
    expect(typeof useFocusSession).toBe('function');
    expect(typeof useSoundscape).toBe('function');
    expect(typeof useMusicPlayer).toBe('function');
    expect(typeof useCopilotChat).toBe('function');
    expect(typeof useGamification).toBe('function');
  });
});
