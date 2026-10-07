/**
 * components/builder/tools/BuilderToolCall.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenCode coding-tool presentation on top of AI Elements' typed tool card.
 * Tool names are summarized for humans while the complete arguments/results
 * remain inspectable in the expandable detail view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from '@/components/ai-elements/tool';
import { BuilderPermissionCard } from './BuilderPermissionCard';
import type {
  BuilderPermissionDecision,
  BuilderPermissionRequest,
} from '@/lib/builder-interactions';

export interface BuilderToolCallProps {
  part: ToolPart;
  permission?: BuilderPermissionRequest;
  onPermissionDecision?: (decision: BuilderPermissionDecision) => void;
  permissionSubmitting?: boolean;
}

export function BuilderToolCall({
  part,
  permission,
  onPermissionDecision,
  permissionSubmitting,
}: BuilderToolCallProps) {
  const name = getToolName(part);
  const summary = summarizeTool(name, part.input);
  const pending =
    part.state === 'approval-requested' ||
    part.state === 'input-available' ||
    part.state === 'input-streaming';
  const output = 'output' in part ? part.output : undefined;
  const errorText = 'errorText' in part ? part.errorText : undefined;

  return (
    <div className="space-y-2" data-builder-tool-name={name}>
      <Tool
        defaultOpen={pending || part.state === 'output-error'}
        className="mb-0 overflow-hidden rounded-xl border-border/60 bg-card/55"
      >
        {part.type === 'dynamic-tool' ? (
          <ToolHeader
            type="dynamic-tool"
            toolName={part.toolName}
            state={part.state}
            title={summary}
            className="min-h-10 px-3 py-2 text-left"
          />
        ) : (
          <ToolHeader
            type={part.type}
            state={part.state}
            title={summary}
            className="min-h-10 px-3 py-2 text-left"
          />
        )}
        <ToolContent className="space-y-3 border-t border-border/40 p-3">
          <ToolInput input={part.input} />
          <ToolOutput output={output} errorText={errorText} />
          {part.state === 'output-denied' && (
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              This action was denied. The agent can continue without it.
            </p>
          )}
        </ToolContent>
      </Tool>

      {permission && onPermissionDecision && (
        <BuilderPermissionCard
          request={permission}
          onDecision={onPermissionDecision}
          submitting={permissionSubmitting}
        />
      )}
    </div>
  );
}

function getToolName(part: ToolPart): string {
  return part.type === 'dynamic-tool'
    ? part.toolName
    : part.type.slice('tool-'.length);
}

function summarizeTool(name: string, input: unknown): string {
  const args = isRecord(input) ? input : {};
  const path = stringValue(args.filePath ?? args.path ?? args.file);

  switch (name) {
    case 'bash':
    case 'shell':
      return compact(`Run command · ${stringValue(args.command) || 'shell'}`);
    case 'read':
      return path ? `Read ${path}` : 'Read file';
    case 'write':
      return path ? `Create ${path}` : 'Create file';
    case 'edit':
      return path ? `Edit ${path}` : 'Edit file';
    case 'glob':
      return `Find files · ${stringValue(args.pattern) || '**/*'}`;
    case 'grep':
      return `Search code · ${stringValue(args.pattern) || 'pattern'}`;
    case 'task':
      return compact(
        `Delegate task · ${stringValue(args.description) || stringValue(args.prompt) || 'subtask'}`,
      );
    case 'webfetch':
      return compact(`Fetch page · ${stringValue(args.url) || 'URL'}`);
    case 'websearch':
      return compact(`Search web · ${stringValue(args.query) || 'query'}`);
    case 'question':
      return 'Ask for your input';
    default:
      return `OpenCode · ${name}`;
  }
}

function compact(value: string, maxLength = 72) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
