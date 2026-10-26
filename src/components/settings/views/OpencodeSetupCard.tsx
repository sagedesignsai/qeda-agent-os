/**
 * components/settings/views/OpencodeSetupCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenCode installation detection + Qeda Builder plugin registration.
 * Shown in Settings → "Builder & MCP" when the OpenCode engine is selected.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  DownloadIcon,
  PlugIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useOpencodeSetup } from '@/hooks/use-opencode-setup';
import { toast } from 'sonner';

export function OpencodeSetupCard() {
  const {
    detection,
    detecting,
    registeredPlugins,
    registering,
    error,
    detect,
    registerPlugin,
    openInstallPage,
  } = useOpencodeSetup();

  const handleRegister = async () => {
    // Bundled mode: resourcePath is resolved by the main process from app resources.
    const result = await registerPlugin('bundled');
    if (result.ok) {
      toast.success(
        result.added
          ? 'Qeda Builder plugin installed. Restart OpenCode to load it.'
          : 'Qeda Builder plugin updated. Restart OpenCode to load it.',
      );
    } else {
      toast.error(result.message || 'Failed to register plugin.');
    }
  };

  const handleInstallOpencode = () => {
    void openInstallPage().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const state = detection?.state ?? 'error';
  const isInstalled =
    state === 'installed-not-running' ||
    state === 'installed-unsupported' ||
    state === 'connected' ||
    state === 'running-unsupported';
  const isConnected = state === 'connected';
  const canRegister =
    state === 'connected' || state === 'installed-not-running';
  const qedaPluginEntries = registeredPlugins.filter(
    (entry) =>
      entry === '@qeda/opencode-builder' ||
      entry.replaceAll('\\', '/').endsWith('/plugins/qeda-builder'),
  );
  const pluginRegistered = qedaPluginEntries.length > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlugIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">OpenCode setup</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void detect()}
          disabled={detecting}
        >
          <RefreshCwIcon
            className={`size-3.5 ${detecting ? 'animate-spin' : ''}`}
          />
          Re-check
        </Button>
      </div>

      {/* Detection status */}
      <div className="rounded-md border border-border/60 bg-card p-3 text-xs">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <CheckCircleIcon className="size-3.5 text-emerald-500" />
          ) : (
            <AlertCircleIcon className="size-3.5 text-amber-500" />
          )}
          <span className="font-medium">
            {detection?.message ?? 'Detecting…'}
          </span>
          {detection?.version && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              v{detection.version}
            </Badge>
          )}
        </div>
        {detection?.binaryPath && (
          <p
            className="mt-1 truncate text-muted-foreground"
            title={detection.binaryPath}
          >
            {detection.binaryPath}
          </p>
        )}
        {detection?.serviceUrl && (
          <p className="mt-0.5 text-muted-foreground">{detection.serviceUrl}</p>
        )}
      </div>

      {/* Install / upgrade CTA */}
      {!isInstalled && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void handleInstallOpencode()}
            disabled={false}
          >
            <DownloadIcon className="size-3.5" />
            OpenCode download page
          </Button>
          <span className="text-xs text-muted-foreground">
            OpenCode must be installed before the OpenCode engine can run.
          </span>
        </div>
      )}
      {isInstalled && !canRegister && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleInstallOpencode()}>
            <DownloadIcon className="size-3.5" />
            Get OpenCode 2.x
          </Button>
          <span className="text-xs text-muted-foreground">
            The Qeda Builder plugin requires OpenCode 2.x.
          </span>
        </div>
      )}

      {/* Plugin registration */}
      {canRegister && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Qeda Builder plugin</span>
            <Badge
              variant={pluginRegistered ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {pluginRegistered
                ? 'registered · restart OpenCode'
                : 'not registered'}
            </Badge>
          </div>
          {pluginRegistered && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {qedaPluginEntries.map((entry) => (
                <li key={entry} className="truncate" title={entry}>
                  {entry}
                </li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            variant={pluginRegistered ? 'outline' : 'default'}
            onClick={() => void handleRegister()}
            disabled={registering}
          >
            {registering
              ? 'Installing…'
              : pluginRegistered
                ? 'Re-register'
                : 'Register plugin'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Installs the bundled plugin, registers the Qeda Builder agent, and
            mirrors your enabled MCP servers into OpenCode. Qeda tools cover
            preview, codebase indexing, project info, and the visible plan.
            Re-register after changing MCP servers or the Builder step budget.
            Restart the OpenCode service after installation to load changes.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
