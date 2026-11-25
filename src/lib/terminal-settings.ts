import type { CodingCliProvider } from './terminal-acp';

export type PreferredCodingCli = CodingCliProvider | 'ask';

export interface TerminalSettings {
  shellPath?: string;
  preferredCodingCli: PreferredCodingCli;
  codingCliPaths: Partial<Record<CodingCliProvider, string>>;
  commandTimeoutMs: number;
  maxAgentSteps: number;
  scrollbackLines: number;
  ptyReplayBufferBytes: number;
  fontSize: number;
  historyLimit: number;
  autoRouteInteractiveCommandsToPty: boolean;
  shellIntegration: boolean;
}

export const TERMINAL_COMMAND_TIMEOUTS_MS = [
  15_000, 30_000, 60_000, 90_000, 120_000,
] as const;
export const TERMINAL_AGENT_STEP_LIMITS = [10, 20, 30, 40] as const;
export const TERMINAL_SCROLLBACK_OPTIONS = [
  1_000, 2_500, 5_000, 10_000, 20_000,
] as const;
export const TERMINAL_REPLAY_BUFFER_OPTIONS_BYTES = [
  64_000, 120_000, 256_000, 512_000,
] as const;
export const TERMINAL_FONT_SIZES = [11, 12, 13, 14, 16, 18] as const;
export const TERMINAL_HISTORY_LIMITS = [100, 250, 500, 1_000] as const;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  preferredCodingCli: 'ask',
  codingCliPaths: {},
  commandTimeoutMs: 60_000,
  maxAgentSteps: 20,
  scrollbackLines: 5_000,
  ptyReplayBufferBytes: 120_000,
  fontSize: 13,
  historyLimit: 500,
  autoRouteInteractiveCommandsToPty: true,
  shellIntegration: true,
};

const CODING_CLI_PROVIDERS: CodingCliProvider[] = [
  'opencode',
  'cline',
  'kiro',
];

function choose<T extends string | number>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.find((option) => option === value) ?? fallback;
}

function normalizeCliPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000\r\n]/.test(trimmed)) return undefined;
  return trimmed.slice(0, 4_096);
}

export function normalizeTerminalSettings(
  input?: Partial<TerminalSettings> | null,
): TerminalSettings {
  const codingCliPaths: Partial<Record<CodingCliProvider, string>> = {};
  for (const provider of CODING_CLI_PROVIDERS) {
    const configuredPath = normalizeCliPath(input?.codingCliPaths?.[provider]);
    if (configuredPath) codingCliPaths[provider] = configuredPath;
  }

  const preferredCodingCli = choose(
    input?.preferredCodingCli,
    ['ask', ...CODING_CLI_PROVIDERS],
    DEFAULT_TERMINAL_SETTINGS.preferredCodingCli,
  );

  return {
    shellPath: normalizeCliPath(input?.shellPath),
    preferredCodingCli,
    codingCliPaths,
    commandTimeoutMs: choose(
      input?.commandTimeoutMs,
      TERMINAL_COMMAND_TIMEOUTS_MS,
      DEFAULT_TERMINAL_SETTINGS.commandTimeoutMs,
    ),
    maxAgentSteps: choose(
      input?.maxAgentSteps,
      TERMINAL_AGENT_STEP_LIMITS,
      DEFAULT_TERMINAL_SETTINGS.maxAgentSteps,
    ),
    scrollbackLines: choose(
      input?.scrollbackLines,
      TERMINAL_SCROLLBACK_OPTIONS,
      DEFAULT_TERMINAL_SETTINGS.scrollbackLines,
    ),
    ptyReplayBufferBytes: choose(
      input?.ptyReplayBufferBytes,
      TERMINAL_REPLAY_BUFFER_OPTIONS_BYTES,
      DEFAULT_TERMINAL_SETTINGS.ptyReplayBufferBytes,
    ),
    fontSize: choose(
      input?.fontSize,
      TERMINAL_FONT_SIZES,
      DEFAULT_TERMINAL_SETTINGS.fontSize,
    ),
    historyLimit: choose(
      input?.historyLimit,
      TERMINAL_HISTORY_LIMITS,
      DEFAULT_TERMINAL_SETTINGS.historyLimit,
    ),
    autoRouteInteractiveCommandsToPty:
      typeof input?.autoRouteInteractiveCommandsToPty === 'boolean'
        ? input.autoRouteInteractiveCommandsToPty
        : DEFAULT_TERMINAL_SETTINGS.autoRouteInteractiveCommandsToPty,
    shellIntegration:
      typeof input?.shellIntegration === 'boolean'
        ? input.shellIntegration
        : DEFAULT_TERMINAL_SETTINGS.shellIntegration,
  };
}

export function mergeTerminalSettings(
  current?: Partial<TerminalSettings> | null,
  patch?: Partial<TerminalSettings> | null,
): TerminalSettings {
  return normalizeTerminalSettings({
    ...current,
    ...patch,
    codingCliPaths: patch?.codingCliPaths ?? current?.codingCliPaths,
  });
}
