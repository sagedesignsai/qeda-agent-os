import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '../settings-store';
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
  TERMINAL_AGENT_STEP_LIMITS,
  TERMINAL_COMMAND_TIMEOUTS_MS,
  TERMINAL_FONT_SIZES,
  TERMINAL_HISTORY_LIMITS,
  TERMINAL_REPLAY_BUFFER_OPTIONS_BYTES,
  TERMINAL_SCROLLBACK_OPTIONS,
  type TerminalSettings,
} from '@/lib/terminal-settings';
import type { CodingCliProvider } from '@/lib/terminal-acp';

const CODING_CLIS: Array<{ provider: CodingCliProvider; label: string }> = [
  { provider: 'opencode', label: 'OpenCode' },
  { provider: 'cline', label: 'Cline' },
  { provider: 'kiro', label: 'Kiro CLI' },
];

function isPreferredCodingCli(
  value: string,
): value is TerminalSettings['preferredCodingCli'] {
  return (
    value === 'ask' || CODING_CLIS.some(({ provider }) => provider === value)
  );
}

function ChoiceField({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-36 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0"
      />
    </Field>
  );
}

export function TerminalView() {
  const { snapshot, save } = useSettingsStore();
  const [preferences, setPreferences] = useState<TerminalSettings>(
    DEFAULT_TERMINAL_SETTINGS,
  );
  const preferencesRef = useRef(preferences);
  const [shellPathDraft, setShellPathDraft] = useState('');
  const [cliPathDrafts, setCliPathDrafts] = useState<
    Partial<Record<CodingCliProvider, string>>
  >({});

  useEffect(() => {
    if (!snapshot) return;
    const next = normalizeTerminalSettings(snapshot.terminal);
    preferencesRef.current = next;
    setPreferences(next);
    setShellPathDraft(next.shellPath ?? '');
    setCliPathDrafts({ ...next.codingCliPaths });
  }, [snapshot]);

  const persist = useCallback(
    async (patch: Partial<TerminalSettings>) => {
      const previous = preferencesRef.current;
      const next = normalizeTerminalSettings({ ...previous, ...patch });
      preferencesRef.current = next;
      setPreferences(next);
      try {
        await save({ terminal: next });
      } catch (error) {
        if (preferencesRef.current === next) {
          preferencesRef.current = previous;
          setPreferences(previous);
        }
        toast.error(
          error instanceof Error
            ? error.message
            : 'Could not save Terminal preferences.',
        );
      }
    },
    [save],
  );

  const saveCodingCliPath = (provider: CodingCliProvider) => {
    const paths = { ...preferencesRef.current.codingCliPaths };
    const value = cliPathDrafts[provider]?.trim();
    if (value) paths[provider] = value;
    else delete paths[provider];
    void persist({ codingCliPaths: paths });
  };

  if (!snapshot) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading Terminal preferences…
      </p>
    );
  }

  const timeoutOptions = TERMINAL_COMMAND_TIMEOUTS_MS.map((value) => ({
    value: String(value),
    label: `${value / 1_000} seconds`,
  }));
  const stepOptions = TERMINAL_AGENT_STEP_LIMITS.map((value) => ({
    value: String(value),
    label: `${value} steps`,
  }));
  const scrollbackOptions = TERMINAL_SCROLLBACK_OPTIONS.map((value) => ({
    value: String(value),
    label: `${value.toLocaleString()} lines`,
  }));
  const replayOptions = TERMINAL_REPLAY_BUFFER_OPTIONS_BYTES.map((value) => ({
    value: String(value),
    label: `${value / 1_000} KB`,
  }));
  const fontOptions = TERMINAL_FONT_SIZES.map((value) => ({
    value: String(value),
    label: `${value} px`,
  }));
  const historyOptions = TERMINAL_HISTORY_LIMITS.map((value) => ({
    value: String(value),
    label: `${value.toLocaleString()} entries`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Adjust shell sessions, agent execution limits, and terminal retention.
        Font size and visible scrollback update in open terminals; shell and
        process settings apply to new sessions.
      </p>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="flex flex-col gap-8">
          <FieldSet>
            <FieldLegend variant="label">Shell execution</FieldLegend>
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="terminal-shell-path">
                    Shell executable
                  </FieldLabel>
                  <FieldDescription>
                    Absolute path or executable name. Blank uses the system
                    login shell.
                  </FieldDescription>
                </FieldContent>
                <Input
                  id="terminal-shell-path"
                  value={shellPathDraft}
                  onChange={(event) => setShellPathDraft(event.target.value)}
                  onBlur={() =>
                    void persist({
                      shellPath: shellPathDraft.trim() || undefined,
                    })
                  }
                  placeholder="Use system shell"
                  className="w-52 shrink-0"
                />
              </Field>
              <SwitchField
                id="terminal-shell-integration"
                label="Shell tracking"
                description="Track prompt state and directory changes for terminal commands."
                checked={preferences.shellIntegration}
                onCheckedChange={(checked) =>
                  void persist({ shellIntegration: checked })
                }
              />
              <SwitchField
                id="terminal-auto-pty"
                label="Auto-route interactive commands"
                description="Run recognized coding CLIs and interactive commands in a PTY without an extra confirmation."
                checked={preferences.autoRouteInteractiveCommandsToPty}
                onCheckedChange={(checked) =>
                  void persist({ autoRouteInteractiveCommandsToPty: checked })
                }
              />
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Agent execution</FieldLegend>
            <FieldGroup>
              <ChoiceField
                id="terminal-command-timeout"
                label="Command timeout"
                description="Maximum time allowed for one agent-run command."
                value={String(preferences.commandTimeoutMs)}
                options={timeoutOptions}
                onChange={(value) =>
                  void persist({ commandTimeoutMs: Number(value) })
                }
              />
              <ChoiceField
                id="terminal-agent-steps"
                label="Agent step limit"
                description="Maximum tool steps allowed in one terminal goal."
                value={String(preferences.maxAgentSteps)}
                options={stepOptions}
                onChange={(value) =>
                  void persist({ maxAgentSteps: Number(value) })
                }
              />
            </FieldGroup>
          </FieldSet>
        </div>

        <div className="flex flex-col gap-8">
          <FieldSet>
            <FieldLegend variant="label">Display and history</FieldLegend>
            <FieldGroup>
              <ChoiceField
                id="terminal-font-size"
                label="Font size"
                description="Text size for open and new terminal panes."
                value={String(preferences.fontSize)}
                options={fontOptions}
                onChange={(value) => void persist({ fontSize: Number(value) })}
              />
              <ChoiceField
                id="terminal-scrollback"
                label="Visible scrollback"
                description="Lines retained by the terminal display."
                value={String(preferences.scrollbackLines)}
                options={scrollbackOptions}
                onChange={(value) =>
                  void persist({ scrollbackLines: Number(value) })
                }
              />
              <ChoiceField
                id="terminal-replay-buffer"
                label="Reconnect output"
                description="Recent PTY output kept for reconnecting to a session."
                value={String(preferences.ptyReplayBufferBytes)}
                options={replayOptions}
                onChange={(value) =>
                  void persist({ ptyReplayBufferBytes: Number(value) })
                }
              />
              <ChoiceField
                id="terminal-history-limit"
                label="Command history"
                description="Maximum commands kept for search and suggestions."
                value={String(preferences.historyLimit)}
                options={historyOptions}
                onChange={(value) =>
                  void persist({ historyLimit: Number(value) })
                }
              />
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Coding CLI integrations</FieldLegend>
            <FieldGroup>
              <ChoiceField
                id="terminal-preferred-cli"
                label="Preferred CLI"
                description="Shown first in the coding CLI picker."
                value={preferences.preferredCodingCli}
                options={[
                  { value: 'ask', label: 'Ask each time' },
                  ...CODING_CLIS.map(({ provider, label }) => ({
                    value: provider,
                    label,
                  })),
                ]}
                onChange={(value) => {
                  if (isPreferredCodingCli(value)) {
                    void persist({ preferredCodingCli: value });
                  }
                }}
              />
              {CODING_CLIS.map(({ provider, label }) => (
                <Field key={provider} orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={`terminal-cli-path-${provider}`}>
                      {label} executable
                    </FieldLabel>
                    <FieldDescription>
                      Blank searches the login-shell PATH.
                    </FieldDescription>
                  </FieldContent>
                  <Input
                    id={`terminal-cli-path-${provider}`}
                    value={cliPathDrafts[provider] ?? ''}
                    onChange={(event) =>
                      setCliPathDrafts((current) => ({
                        ...current,
                        [provider]: event.target.value,
                      }))
                    }
                    onBlur={() => saveCodingCliPath(provider)}
                    placeholder={provider}
                    className="w-52 shrink-0"
                  />
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        </div>
      </div>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        New sessions default to the active project repository. Agent commands
        and coding CLI permission requests continue to require your approval.
      </p>
    </div>
  );
}
