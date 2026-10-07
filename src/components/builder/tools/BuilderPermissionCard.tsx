/**
 * components/builder/tools/BuilderPermissionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Presents OpenCode's real permission request as an explicit human decision.
 * The three outcomes map to OpenCode's once / always / reject replies; no
 * permission is silently inferred from a tool's name or presentation state.
 *
 * This is the card a user reads under pressure, so its copy is the *largest* type
 * in the Builder: `text-sm` for the request, `text-xs` only for the action label
 * and the resource list. It used to run down to 9px.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  AlertTriangleIcon,
  CheckIcon,
  Clock3Icon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  BuilderPermissionDecision,
  BuilderPermissionRequest,
} from '@/lib/builder-interactions';

interface BuilderPermissionCardProps {
  request: BuilderPermissionRequest;
  onDecision: (decision: BuilderPermissionDecision) => void;
  disabled?: boolean;
  submitting?: boolean;
}

export function BuilderPermissionCard({
  request,
  onDecision,
  disabled = false,
  submitting = false,
}: BuilderPermissionCardProps) {
  const busy = disabled || submitting;

  return (
    <Confirmation
      state="approval-requested"
      approval={{ id: request.id }}
      className="gap-0 overflow-hidden rounded-xl border-amber-500/25 bg-amber-500/[0.035] p-0"
      aria-label="OpenCode permission request"
    >
      <div className="flex items-start gap-3 border-b border-amber-500/15 px-3.5 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <AlertTriangleIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold">Permission needed</h3>
            <Badge
              variant="outline"
              className="h-5 gap-1 border-amber-500/25 px-1.5 text-xs text-amber-700 dark:text-amber-300"
            >
              <Clock3Icon className="size-2.5" />
              Paused
            </Badge>
          </div>
          <ConfirmationTitle className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {request.message || permissionSummary(request.action)}
          </ConfirmationTitle>
        </div>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldCheckIcon className="size-3" />
          {request.action}
        </div>
        <div className="space-y-1">
          {request.resources.map((resource, index) => (
            <code
              key={`${resource}-${index}`}
              className="block max-h-16 overflow-auto rounded-md border border-border/50 bg-background/70 px-2 py-1.5 font-mono text-xs leading-relaxed text-foreground/85"
            >
              {resource}
            </code>
          ))}
        </div>
        <ConfirmationRequest>
          <ConfirmationActions className="flex-wrap justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onDecision('reject')}
            >
              <XIcon className="size-3" />
              Deny
            </Button>
            <ConfirmationAction
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={busy}
              onClick={() => onDecision('always')}
              title="Allow this action and save the permission rule in OpenCode."
            >
              <CheckIcon className="size-3" />
              Always allow
            </ConfirmationAction>
            <ConfirmationAction
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={busy}
              onClick={() => onDecision('once')}
            >
              {submitting ? (
                <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <CheckIcon className="size-3" />
              )}
              Allow once
            </ConfirmationAction>
          </ConfirmationActions>
        </ConfirmationRequest>
      </div>
    </Confirmation>
  );
}

function permissionSummary(action: string) {
  if (action === 'bash') return 'OpenCode wants to run a command.';
  if (action === 'edit' || action === 'write') {
    return 'OpenCode wants to modify files in this workspace.';
  }
  if (action === 'external_directory') {
    return 'OpenCode wants to access a location outside the project.';
  }
  return `OpenCode is requesting permission for “${action}”.`;
}
