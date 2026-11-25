/**
 * components/autonomous/AutonomousHUD.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-Driving Agent HUD & Ambient Shield.
 *
 * Appears as a bottom-center card hovering over a semi-transparent interaction
 * shield (top 80% transparent -> bottom 20% black gradient).
 * Uses the Qeda persona mark, reasoning, shimmer and controls.
 */

import { useEffect, useState, type FC } from 'react';
import { QedaPersona } from '@/components/ai-elements/qeda-persona';
import type { PersonaState } from '@/components/ai-elements/persona';
import { Reasoning } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
} from '@/components/ai-elements/prompt-input';
import { useAutonomousOperator } from '@/hooks/use-autonomous-operator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PauseIcon, PlayIcon, SquareIcon, XIcon, ShieldAlertIcon, SparklesIcon, BotIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const AutonomousHUD: FC = () => {
  const {
    overlayOpen,
    setOverlayOpen,
    status,
    latestThought,
    latestAction,
    isThinking,
    isExecuting,
    pause,
    stop,
    resume,
    dispatchInstruction,
  } = useAutonomousOperator();

  const [inputVal, setInputVal] = useState('');

  // Pressing Esc closes the overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlayOpen) {
        setOverlayOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [overlayOpen, setOverlayOpen]);

  if (!overlayOpen) return null;

  // Derive persona animation state
  const personaState: PersonaState = !status.running
    ? 'asleep'
    : status.paused
      ? 'idle'
      : isThinking
        ? 'thinking'
        : 'listening';

  const progressRatio = Math.min(100, Math.round((status.stepCount / (status.maxSteps || 30)) * 100));

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col justify-end items-center select-none animate-in fade-in duration-200',
      )}
      // Interaction shield blocks direct clicks through to the underlying app
      style={{
        background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.25) 75%, rgba(0, 0, 0, 0.95) 100%)',
      }}
    >
      {/* Top Banner Notice when active */}
      {isExecuting && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 border border-amber-500/30 text-amber-200/90 text-xs shadow-lg backdrop-blur-md">
          <ShieldAlertIcon className="size-3.5 text-amber-400 animate-pulse" />
          <span>Self-Driving Mode active — User input shielded</span>
        </div>
      )}

      {/* Center-Bottom Floating HUD Card */}
      <div
        className={cn(
          'relative w-[500px] max-w-[94vw] mb-8 p-4 rounded-2xl',
          'bg-card/95 border border-border/80 shadow-2xl backdrop-blur-xl',
          'text-foreground transition-all duration-300 ring-1 ring-white/10',
          isExecuting && 'ring-primary/40 shadow-primary/10',
        )}
      >
        {/* Dismiss / Close Button in top right */}
        <button
          type="button"
          onClick={() => setOverlayOpen(false)}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title="Minimize HUD (Esc)"
        >
          <XIcon className="size-4" />
        </button>

        {/* Persona & Title Section */}
        <div className="flex items-center gap-3.5 mb-3">
          <div className="relative size-12 shrink-0 rounded-full overflow-hidden border border-border/60 bg-accent/20 flex items-center justify-center shadow-inner">
            <QedaPersona state={personaState} className="size-full" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-foreground flex items-center gap-1.5">
                <SparklesIcon className="size-3.5 text-primary" />
                Qeda Autonomous Operator
              </span>
              <Badge
                variant={isExecuting ? 'default' : 'secondary'}
                className={cn(
                  'text-[10px] px-1.5 py-0 uppercase tracking-wider h-4',
                  isExecuting && 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                )}
              >
                {status.paused ? 'Paused' : isExecuting ? 'Active' : 'Standby'}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {status.currentTaskTitle ? (
                <>Task: <span className="text-foreground/90 font-medium">{status.currentTaskTitle}</span></>
              ) : (
                'No task currently running'
              )}
            </p>
          </div>
        </div>

        {/* Live Thought Trace (ai-elements reasoning) */}
        {latestThought && (
          <div className="mb-3">
            <Reasoning
              isStreaming={isThinking}
              defaultOpen={true}
              className="border border-border/40 bg-accent/20 rounded-xl p-2 text-xs"
            >
              <div className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3">
                {latestThought}
              </div>
            </Reasoning>
          </div>
        )}

        {/* Latest Action Message */}
        <div className="px-3 py-2 rounded-xl bg-accent/30 border border-border/50 text-xs mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <BotIcon className="size-3.5 text-primary shrink-0" />
            <div className="truncate text-foreground/90 font-medium">
              {isExecuting && isThinking ? (
                <Shimmer className="text-foreground font-medium">
                  {latestAction || 'Analyzing desktop and planning step...'}
                </Shimmer>
              ) : (
                <span>{latestAction || 'Ready for autonomous dispatch.'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Instruction / PromptInput */}
        <div className="mb-3">
          <PromptInput
            onSubmit={(message) => {
              const text = message.text || inputVal;
              if (text.trim()) {
                void dispatchInstruction(text.trim());
                setInputVal('');
              }
            }}
            className="rounded-xl border border-border/70 bg-background/80 shadow-inner"
          >
            <PromptInputTextarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={isExecuting ? "Steer or queue next autonomous instruction..." : "Direct the agent (e.g. 'Build new release demo in Studio')..."}
              className="min-h-[44px] text-xs py-2 px-3 resize-none bg-transparent"
            />
            <PromptInputFooter className="px-2 py-1 justify-between border-t border-border/30">
              <span className="text-[10px] text-muted-foreground">
                Press Enter to dispatch
              </span>
              <PromptInputSubmit
                size="icon-xs"
                status={isExecuting && isThinking ? 'streaming' : undefined}
                className="size-6 rounded-md"
              />
            </PromptInputFooter>
          </PromptInput>
        </div>

        {/* Step Budget & Controls Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
          {/* Step Budget Pill */}
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-accent rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressRatio}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Step {status.stepCount} / {status.maxSteps}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5">
            {isExecuting ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void pause()}
                className="h-7 px-2.5 text-xs gap-1 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              >
                <PauseIcon className="size-3" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void resume()}
                className="h-7 px-2.5 text-xs gap-1 text-primary hover:bg-primary/10"
              >
                <PlayIcon className="size-3" />
                Resume
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => void stop()}
              disabled={!status.running && !status.paused}
              className="h-7 px-2.5 text-xs gap-1 text-destructive hover:bg-destructive/10"
            >
              <SquareIcon className="size-3" />
              Stop
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOverlayOpen(false)}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              Hide
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
