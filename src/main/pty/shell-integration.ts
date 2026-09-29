/**
 * pty/shell-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates and manages shell integration scripts for bash and zsh.
 *
 * Implements OSC 133 and OSC 7 semantic hooks (Warp / VSCode terminal model):
 *   - Sources the user's original rc files (~/.bashrc, ~/.zshrc) so aliases,
 *     path, and prompts are fully preserved.
 *   - Injects preexec/precmd/PROMPT_COMMAND hooks emitting OSC 133 boundaries.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let integrationDir: string | null = null;

export function getIntegrationDir(): string {
  if (!integrationDir) {
    integrationDir = path.join(
      os.tmpdir(),
      `vellum-shell-integration-${process.pid}`,
    );
    fs.mkdirSync(integrationDir, { recursive: true });
  }
  return integrationDir;
}

/**
 * Returns the path to the bash integration script that sources ~/.bashrc and
 * registers OSC 133 hooks.
 */
export function getBashIntegrationPath(): string {
  const dir = getIntegrationDir();
  const filePath = path.join(dir, 'vellum-bash.sh');

  const content = `# Vellum Terminal Bash Integration
if [ -n "$VELLUM_SHELL_INTEGRATION" ]; then
  return 0
fi
export VELLUM_SHELL_INTEGRATION=1

# 1. Source user's standard bash configuration first
if [ -f /etc/bash.bashrc ]; then
  . /etc/bash.bashrc
fi
if [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi

# 2. OSC 133 Hook functions
__vellum_prompt_command() {
  local exit_code="$?"
  # 133;D (Command finished with exit code)
  printf "\\033]133;D;%s\\007" "$exit_code"
  # OSC 7 (Current directory notification)
  printf "\\033]7;file://%s%s\\007" "\${HOSTNAME:-localhost}" "$PWD"
  # 133;A (Prompt start)
  printf "\\033]133;A\\007"
}

# PS0 is emitted right after reading command and before execution
PS0="\\[\\033]133;C\\007\\]"

# Prepend our prompt command to existing PROMPT_COMMAND
if [ -n "$PROMPT_COMMAND" ]; then
  PROMPT_COMMAND="__vellum_prompt_command; $PROMPT_COMMAND"
else
  PROMPT_COMMAND="__vellum_prompt_command"
fi

# 133;B (Command input start) after prompt string finishes
PS1="\${PS1:-\\u@\\h:\\w\\$ }\\[\\033]133;B\\007\\]"
`;

  fs.writeFileSync(filePath, content, { mode: 0o755 });
  return filePath;
}

/**
 * Returns the path to the zsh integration directory (ZDOTDIR) that sources
 * ~/.zshrc and registers OSC 133 hooks.
 */
export function getZshIntegrationDir(): string {
  const dir = path.join(getIntegrationDir(), 'zsh');
  fs.mkdirSync(dir, { recursive: true });
  const zshrcPath = path.join(dir, '.zshrc');

  const content = `# Vellum Terminal Zsh Integration
if [[ -n "$VELLUM_SHELL_INTEGRATION" ]]; then
  return 0
fi
export VELLUM_SHELL_INTEGRATION=1

# 1. Source user's standard .zshrc from HOME
if [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi

# 2. Add precmd and preexec hooks
autoload -Uz add-zsh-hook 2>/dev/null

__vellum_precmd() {
  local exit_code="$?"
  printf "\\033]133;D;%s\\007" "$exit_code"
  printf "\\033]7;file://%s%s\\007" "\${HOST:-localhost}" "$PWD"
  printf "\\033]133;A\\007"
}

__vellum_preexec() {
  printf "\\033]133;C\\007"
}

if which add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook precmd __vellum_precmd
  add-zsh-hook preexec __vellum_preexec
fi

PS1="\${PS1:-%n@%m:%~%# }%{$(printf '\\033]133;B\\007')%}"
`;

  fs.writeFileSync(zshrcPath, content, { mode: 0o755 });
  return dir;
}

/** Cleanup integration files when main process exits. */
export function cleanupShellIntegration(): void {
  if (integrationDir && fs.existsSync(integrationDir)) {
    try {
      fs.rmSync(integrationDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on shutdown
    }
  }
}
