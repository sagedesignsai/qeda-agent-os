import fs from 'node:fs';
import path from 'node:path';

export const CODING_CLI_PROFILES = {
  opencode: { executable: 'opencode', args: ['acp'] },
  cline: { executable: 'cline', args: ['--acp'] },
  kiro: { executable: 'kiro-cli', args: ['acp'] },
} as const;

export type CodingCliProvider = keyof typeof CODING_CLI_PROFILES;

function isRunnableFile(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(
  executable: string,
  env: Record<string, string | undefined>,
): string | null {
  if (path.isAbsolute(executable)) {
    return isRunnableFile(executable) ? executable : null;
  }

  const searchPath = env.PATH ?? '';
  const extensions =
    process.platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
      : [''];

  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(
        directory,
        process.platform === 'win32' && !path.extname(executable)
          ? `${executable}${extension}`
          : executable,
      );
      if (isRunnableFile(candidate)) return candidate;
    }
  }

  return null;
}

export function discoverCodingClis(
  env: Record<string, string | undefined>,
  overrides: Partial<Record<CodingCliProvider, string>> = {},
): Record<CodingCliProvider, string | null> {
  return Object.fromEntries(
    Object.entries(CODING_CLI_PROFILES).map(([provider, profile]) => [
      provider,
      resolveExecutable(
        overrides[provider as CodingCliProvider]?.trim() || profile.executable,
        env,
      ),
    ]),
  ) as Record<CodingCliProvider, string | null>;
}
