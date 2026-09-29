/**
 * pty/osc133-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Semantic Shell Integration Parser (OSC 133 / OSC 7).
 *
 * Implements the FinalTerm/iTerm2/VSCode/Warp OSC 133 protocol:
 *   - \x1b]133;A\x07        : Prompt start
 *   - \x1b]133;B\x07        : Command input start (prompt printed, user typing)
 *   - \x1b]133;C\x07        : Command execution start (Enter pressed, output starts)
 *   - \x1b]133;D;{code}\x07 : Command execution end (exit code reported)
 *   - \x1b]7;file://{host}/{path}\x07 : Working directory notification (OSC 7)
 *
 * Slices raw PTY character streams into atomic Command Blocks with start times,
 * durations, exit codes, and output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ParsedBlockEvent {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  cwd?: string;
  status: 'running' | 'done' | 'error';
}

export interface Osc133Callbacks {
  onCommandStart?: (command: string, cwd?: string) => void;
  onCommandOutput?: (chunk: string) => void;
  onCommandEnd?: (event: ParsedBlockEvent) => void;
  onCwdChange?: (cwd: string) => void;
}

export class Osc133Parser {
  private state: 'prompt' | 'input' | 'running' = 'prompt';
  private currentCommand = '';
  private currentOutput = '';
  private currentCwd = '';
  private commandStartTime = 0;
  private currentBlockId = '';
  private buffer = '';
  private callbacks: Osc133Callbacks;

  constructor(callbacks: Osc133Callbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Feed a chunk of raw PTY data into the parser.
   * Returns the clean string stripped of OSC 133 and OSC 7 control sequences.
   */
  feed(chunk: string): string {
    this.buffer += chunk;
    let clean = '';
    let i = 0;

    while (i < this.buffer.length) {
      // Look for OSC sequence start: "\x1b]"
      const oscIndex = this.buffer.indexOf('\x1b]', i);

      if (oscIndex === -1) {
        // No more escape sequences in this buffer
        const rest = this.buffer.slice(i);
        this.handleOutput(rest);
        clean += rest;
        i = this.buffer.length;
        break;
      }

      // Append text preceding the escape sequence
      if (oscIndex > i) {
        const segment = this.buffer.slice(i, oscIndex);
        this.handleOutput(segment);
        clean += segment;
      }

      // Find terminator: either BEL (\x07) or ST (\x1b\\)
      const belIndex = this.buffer.indexOf('\x07', oscIndex);
      const stIndex = this.buffer.indexOf('\x1b\\', oscIndex);
      let termIndex = -1;
      let termLen = 1;

      if (belIndex !== -1 && stIndex !== -1) {
        if (belIndex < stIndex) {
          termIndex = belIndex;
          termLen = 1;
        } else {
          termIndex = stIndex;
          termLen = 2;
        }
      } else if (belIndex !== -1) {
        termIndex = belIndex;
        termLen = 1;
      } else if (stIndex !== -1) {
        termIndex = stIndex;
        termLen = 2;
      }

      if (termIndex === -1) {
        // Incomplete sequence across chunk boundary; wait for next feed
        this.buffer = this.buffer.slice(oscIndex);
        return clean;
      }

      // Extract full OSC sequence: e.g. "133;A" or "7;file://..."
      const oscPayload = this.buffer.slice(oscIndex + 2, termIndex);
      this.handleOscSequence(oscPayload);

      i = termIndex + termLen;
    }

    this.buffer = '';
    return clean;
  }

  private handleOscSequence(payload: string): void {
    if (payload.startsWith('133;')) {
      const type = payload.charAt(4);
      switch (type) {
        case 'A': // Prompt start
          this.state = 'prompt';
          break;

        case 'B': // Command input start
          this.state = 'input';
          break;

        case 'C': // Command execution start
          this.state = 'running';
          this.commandStartTime = Date.now();
          this.currentOutput = '';
          this.currentBlockId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          this.callbacks.onCommandStart?.(
            this.currentCommand.trim(),
            this.currentCwd,
          );
          break;

        case 'D': {
          // Command execution end
          const parts = payload.split(';');
          const code = parts.length > 2 ? parseInt(parts[2], 10) : 0;
          const exitCode = Number.isNaN(code) ? 0 : code;
          const durationMs =
            this.commandStartTime > 0 ? Date.now() - this.commandStartTime : 0;

          if (this.state === 'running' || this.currentBlockId) {
            this.callbacks.onCommandEnd?.({
              id: this.currentBlockId,
              command: this.currentCommand.trim(),
              output: this.currentOutput,
              exitCode,
              durationMs,
              cwd: this.currentCwd,
              status: exitCode === 0 ? 'done' : 'error',
            });
          }

          this.state = 'prompt';
          this.currentCommand = '';
          this.currentOutput = '';
          this.commandStartTime = 0;
          this.currentBlockId = '';
          break;
        }
      }
    } else if (payload.startsWith('7;file://')) {
      // OSC 7 working directory update: file://[hostname]/path
      const urlPart = payload.slice(9);
      const slashIndex = urlPart.indexOf('/');
      if (slashIndex !== -1) {
        const path = decodeURIComponent(urlPart.slice(slashIndex));
        this.currentCwd = path;
        this.callbacks.onCwdChange?.(path);
      }
    }
  }

  private handleOutput(text: string): void {
    if (this.state === 'running') {
      this.currentOutput += text;
      this.callbacks.onCommandOutput?.(text);
    } else if (this.state === 'input') {
      // Capturing typed command input
      this.currentCommand += text;
    }
  }

  /** Explicitly record the user's submitted command if known externally. */
  setCommand(cmd: string): void {
    this.currentCommand = cmd;
  }

  getState(): 'prompt' | 'input' | 'running' {
    return this.state;
  }

  getCurrentCwd(): string {
    return this.currentCwd;
  }
}
