/**
 * components/terminal/XtermPane.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Raw shell terminal pane using xterm.js + node-pty over IPC.
 *
 * Ownership:
 *   - xterm.js Terminal widget lives here in the renderer.
 *   - node-pty process lives in the main process (PtyManager).
 *   - They communicate via pty:write (renderer→main) and pty:data (main→renderer).
 *
 * Lifecycle:
 *   1. Mount → invoke pty:create → get ptyId
 *   2. Subscribe to pty:data events → write to xterm Terminal
 *   3. xterm.onData → invoke pty:write
 *   4. ResizeObserver → invoke pty:resize + xterm.resize
 *   5. Unmount → invoke pty:kill, remove pty:data listener
 *
 * Addons loaded:
 *   - FitAddon    — fits terminal dimensions to the container element
 *   - WebLinksAddon — makes URLs in output clickable
 *
 * Theming:
 *   The emulator is token-driven (see `buildXtermTheme`) and re-reads the
 *   design tokens when the theme changes, so Shell Mode follows the rest of the
 *   app instead of pinning itself to a dark palette.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type HTMLAttributes,
} from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';
import { useIpcEvent } from '@/hooks/use-ipc';

// ─── Public handle ────────────────────────────────────────────────────────────

export interface XtermPaneHandle {
  /** Focus the terminal input. */
  focus(): void;
  /** Re-fit the terminal to its container. */
  fit(): void;
  /** Write data directly to the xterm display (without going to PTY). */
  writeRaw(data: string): void;
  /** Current ptyId, or null if not yet spawned. */
  ptyId: string | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface XtermPaneProps extends HTMLAttributes<HTMLDivElement> {
  /** Session ID to link shell commands to terminal_blocks via OSC 133. */
  sessionId?: string;
  /** Working directory for the shell. Defaults to HOME. */
  cwd?: string;
  /** Override the shell binary. Defaults to $SHELL / /bin/bash. */
  shell?: string;
  /** Called when the PTY process exits. */
  onExit?: (exitCode: number) => void;
  /** Called when the PTY has been created and has a ptyId. */
  onReady?: (ptyId: string) => void;
}

// ─── Theme ─────────────────────────────────────────────────────────────────────

/**
 * Shell Mode paints to a canvas, so it cannot use Tailwind classes — the colour
 * has to be handed to xterm as a JS value. It is still driven by the same design
 * tokens as the rest of the app, just read at runtime.
 *
 * Two constraints shape this:
 *
 *   1. xterm's Color.toColor() only parses `#rgb[a]` / `#rrggbb[aa]` and
 *      `rgb()`/`rgba()` directly. Anything else falls through to a canvas
 *      `fillStyle` round-trip, which Chromium *can* normalise from `oklch()` —
 *      but that path throws on any colour whose alpha is not fully opaque
 *      ("color hue gets lost when drawn to the canvas"). Tokens such as
 *      `--border` (oklch … / 11%) would therefore blow up, so only opaque
 *      tokens are used below.
 *   2. Because the values are captured once, a theme toggle would otherwise
 *      leave the emulator on the old palette. `useXtermTheme` re-reads on the
 *      `.dark` class mutation that next-themes applies to <html>.
 */

/** Read a CSS custom property off the document root. */
function readToken(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || 'currentColor';
}

/**
 * The ANSI 16 slots are a terminal protocol rather than UI chrome — they are
 * what `ls --color` and friends emit — so they stay fixed. Everything the
 * emulator draws as *chrome* is token-driven.
 */
const ANSI_COLORS = {
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#d4d4d8',
  brightBlack: '#3f3f46',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
} as const;

/** Build an xterm theme from the live design tokens. */
function buildXtermTheme(): ITheme {
  return {
    // Opaque structural tokens only — see constraint 1 above.
    background: readToken('--background'),
    foreground: readToken('--foreground'),
    cursor: readToken('--primary'),
    cursorAccent: readToken('--background'),
    selectionBackground: readToken('--accent'),
    ...ANSI_COLORS,
  };
}

/**
 * Re-apply the token theme whenever next-themes swaps the `dark` class on <html>.
 * Without this the emulator would keep the palette it was constructed with,
 * which is the one thing a hardcoded theme could not do either.
 */
function useXtermTheme(term: Terminal | null): void {
  useEffect(() => {
    if (!term) return;

    const apply = () => {
      // `options.theme` is a live setter — xterm repaints on assignment. The
      // react-hooks/immutability rule flags mutating a hook argument, but this
      // mutation *is* xterm's public API for changing theme at runtime; there is
      // no imperative alternative.
      // eslint-disable-next-line react-hooks/immutability
      term.options.theme = buildXtermTheme();
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    });

    return () => observer.disconnect();
  }, [term]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const XtermPane = forwardRef<XtermPaneHandle, XtermPaneProps>(
  function XtermPane(
    { sessionId, cwd, shell: shellBin, onExit, onReady, className, ...props },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const ptyIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | undefined>(sessionId);
    sessionIdRef.current = sessionId;
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // The xterm instance is built in a mount effect, but the theme has to be
    // re-applied reactively. State bridges the two so `useXtermTheme` can hold
    // the observer open for as long as the emulator is alive.
    const [term, setTerm] = useState<Terminal | null>(null);
    useXtermTheme(term);

    // Track session promotion from OSC 133
    useIpcEvent('pty:session-assigned', (...args: unknown[]) => {
      const { ptyId, sessionId: sid } = args[0] as {
        ptyId: string;
        sessionId: string;
      };
      if (ptyId === ptyIdRef.current) {
        sessionIdRef.current = sid;
      }
    });

    // Expose handle to parent
    useImperativeHandle(ref, () => ({
      focus() {
        termRef.current?.focus();
      },
      fit() {
        if (
          containerRef.current &&
          containerRef.current.clientWidth > 0 &&
          containerRef.current.clientHeight > 0
        ) {
          fitAddonRef.current?.fit();
          const { cols: c, rows: r } = termRef.current ?? {};
          if (ptyIdRef.current && c && r) {
            void window.electron.ipc.invoke('pty:resize', {
              ptyId: ptyIdRef.current,
              cols: c,
              rows: r,
            });
          }
        }
      },
      writeRaw(data: string) {
        termRef.current?.write(data);
      },
      get ptyId() {
        return ptyIdRef.current;
      },
    }));

    // ── PTY data event → write to xterm ───────────────────────────────────
    useIpcEvent('pty:data', (...args: unknown[]) => {
      const { ptyId, data } = args[0] as { ptyId: string; data: string };
      if (ptyId === ptyIdRef.current) {
        termRef.current?.write(data);
      }
    });

    // ── PTY exit event ────────────────────────────────────────────────────
    useIpcEvent('pty:exit', (...args: unknown[]) => {
      const { ptyId, exitCode } = args[0] as {
        ptyId: string;
        exitCode: number;
      };
      if (ptyId === ptyIdRef.current) {
        termRef.current?.write(
          `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
        );
        ptyIdRef.current = null;
        onExit?.(exitCode);
      }
    });

    // ── Mount: create xterm + PTY ─────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;

      // Create xterm Terminal
      const term = new Terminal({
        theme: buildXtermTheme(),
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 13,
        lineHeight: 1.3,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        scrollOnUserInput: true,
        smoothScrollDuration: 0,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      setTerm(term);

      const { cols, rows } = term;

      // Spawn PTY in main with OSC 133 shell integration
      void window.electron.ipc
        .invoke<{ ptyId: string }>('pty:create', {
          cols,
          rows,
          cwd,
          shell: shellBin,
          sessionId,
          enableShellIntegration: true,
        })
        .then(({ ptyId }) => {
          ptyIdRef.current = ptyId;
          onReady?.(ptyId);
        });

      // xterm input → PTY write
      const onDataDispose = term.onData((data) => {
        if (ptyIdRef.current) {
          void window.electron.ipc.invoke('pty:write', {
            ptyId: ptyIdRef.current,
            data,
          });
        }
      });

      // ResizeObserver → fit + PTY resize
      const observer = new ResizeObserver(() => {
        // Defer slightly so the container has settled its new dimensions
        requestAnimationFrame(() => {
          if (!termRef.current || !fitAddonRef.current) return;
          if (
            !containerRef.current ||
            containerRef.current.clientWidth === 0 ||
            containerRef.current.clientHeight === 0
          ) {
            return;
          }
          fitAddonRef.current.fit();
          const { cols: c, rows: r } = termRef.current;
          if (ptyIdRef.current) {
            void window.electron.ipc.invoke('pty:resize', {
              ptyId: ptyIdRef.current,
              cols: c,
              rows: r,
            });
          }
        });
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;

      term.focus();

      // ── Cleanup ─────────────────────────────────────────────────────────
      return () => {
        onDataDispose.dispose();
        observer.disconnect();
        // Only kill the PTY process if this was an ephemeral scratchpad without a session.
        // Saved sessions keep their background processes alive across sidebar/tab switches.
        if (ptyIdRef.current && !sessionIdRef.current) {
          void window.electron.ipc.invoke('pty:kill', {
            ptyId: ptyIdRef.current,
          });
        }
        ptyIdRef.current = null;
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
        setTerm(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount/unmount — cwd and shell are initial values

    return (
      <div
        ref={containerRef}
        className={cn('size-full overflow-hidden bg-background p-1', className)}
        // Let clicks through to xterm's own event handling
        onClick={() => termRef.current?.focus()}
        {...props}
      />
    );
  },
);
