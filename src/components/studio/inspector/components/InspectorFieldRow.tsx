/**
 * components/studio/inspector/components/InspectorFieldRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Standardized field row layout for property controls:
 *   - Left: Label with optional icon
 *   - Right: Optional monospace readout / badge
 *   - Body: Control element(s)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Label } from '@/components/ui/label';

interface InspectorFieldRowProps {
  label: string;
  icon?: React.ReactNode;
  readout?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}

export function InspectorFieldRow({
  label,
  icon,
  readout,
  children,
  className = '',
  inline = false,
}: InspectorFieldRowProps) {
  if (inline) {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`}>
        <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 shrink-0">
          {icon && <span className="text-muted-foreground/80">{icon}</span>}
          {label}
        </Label>
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          {icon && <span className="text-muted-foreground/80">{icon}</span>}
          {label}
        </Label>
        {readout !== undefined && (
          <span className="font-mono text-[10px] text-muted-foreground/80">
            {readout}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
