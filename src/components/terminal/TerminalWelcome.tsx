/**
 * components/terminal/TerminalWelcome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displayed when a new/empty terminal session is open — no blocks yet.
 * Shows capability examples and feature hints.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { motion } from 'motion/react';
import {
  BugIcon,
  FolderSearchIcon,
  ScanSearchIcon,
  ShieldIcon,
  TerminalSquareIcon,
  ZapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QedaLogomark } from '@/components/QedaLogo';

const EXAMPLES = [
  {
    icon: FolderSearchIcon,
    title: 'Explore a folder',
    description: '"What is this project?"',
    color: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
  },
  {
    icon: BugIcon,
    title: 'Diagnose issues',
    description: '"Fix my sound issues"',
    color: 'text-rose-400 bg-rose-950/40 border-rose-800/40',
  },
  {
    icon: ScanSearchIcon,
    title: 'System intelligence',
    description: '"What\'s eating my disk?"',
    color: 'text-orange-400 bg-orange-950/40 border-orange-800/40',
  },
  {
    icon: ShieldIcon,
    title: 'Safe & inspectable',
    description: 'Every command needs your approval',
    color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
  },
];

interface TerminalWelcomeProps {
  className?: string;
}

export function TerminalWelcome({ className }: TerminalWelcomeProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-8 py-16 px-8',
        className,
      )}
    >
      {/* Icon + headline */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-md">
          <QedaLogomark
            size="md"
            ringClassName="text-foreground"
            boltClassName="text-emerald-400"
            animated
          />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Qeda Agentic Terminal</h2>
          <p className="mt-1 text-sm text-muted-foreground/75">
            Describe a goal. The agent plans, approves, and completes the commands.
          </p>
        </div>
      </motion.div>

      {/* Capability cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid w-full max-w-xl grid-cols-2 gap-2.5"
      >
        {EXAMPLES.map((ex, i) => (
          <motion.div
            key={ex.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.12 + i * 0.05 }}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3',
              ex.color,
            )}
          >
            <ex.icon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{ex.title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {ex.description}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/60"
      >
        <ZapIcon className="size-3" />
        Type a goal below or pick from Quick goals
      </motion.p>
    </div>
  );
}
