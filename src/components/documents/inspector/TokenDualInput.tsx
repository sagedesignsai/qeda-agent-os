/**
 * components/documents/inspector/TokenDualInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual-mode input component supporting Design System Tokens ($color-primary,
 * $radius-md, $font-body) alongside raw manual values (hex, px, numbers).
 *
 * Provides one-click switching between token binding and manual override.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { TagIcon, XIcon, PaletteIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { StyleValue, TokenReference } from '@/lib/pdf-studio/primitives-ast';
import { isToken } from '@/lib/pdf-studio/primitives-ast';

export interface TokenItem {
  name: string;
  label: string;
  value: string;
}

interface TokenDualInputProps {
  label?: string;
  value: StyleValue<string> | undefined;
  tokens: TokenItem[];
  type?: 'color' | 'text' | 'number';
  placeholder?: string;
  onChange: (val: StyleValue<string>) => void;
}

export function TokenDualInput({
  label,
  value,
  tokens,
  type = 'color',
  placeholder = 'Value...',
  onChange,
}: TokenDualInputProps) {
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);

  const isBoundToToken = isToken(value);
  const activeToken = isBoundToToken
    ? tokens.find((t) => t.name === (value as TokenReference).name)
    : null;

  const rawValue = typeof value === 'string' ? value : '';

  const handleSelectToken = (tokenName: string) => {
    onChange({ kind: 'token', name: tokenName });
    setTokenPickerOpen(false);
  };

  const handleClearToken = () => {
    // Revert to raw value of the token or empty string
    onChange(activeToken?.value || '');
  };

  return (
    <div className="flex flex-col gap-1 text-xs">
      {label && <span className="text-[11px] font-medium text-muted-foreground">{label}</span>}

      <div className="flex items-center gap-1.5">
        {isBoundToToken ? (
          /* Token Badge Chip */
          <div className="flex h-7 flex-1 items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-2 text-xs font-mono text-primary">
            <div className="flex items-center gap-1.5 truncate">
              {type === 'color' && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                  style={{ backgroundColor: activeToken?.value || '#3b82f6' }}
                />
              )}
              <span className="truncate font-medium">${value.name}</span>
            </div>
            <button
              type="button"
              onClick={handleClearToken}
              title="Detach token and edit manually"
              className="ml-1 rounded p-0.5 text-primary/70 hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          /* Manual Input */
          <div className="relative flex flex-1 items-center">
            {type === 'color' && (
              <div
                className="absolute left-2 h-3.5 w-3.5 rounded-full border border-border/80 shadow-xs pointer-events-none"
                style={{ backgroundColor: rawValue || '#ffffff' }}
              />
            )}
            <Input
              value={rawValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={`h-7 text-xs font-mono bg-background/50 ${type === 'color' ? 'pl-7' : 'pl-2'}`}
            />
          </div>
        )}

        {/* Token Picker Trigger */}
        <Popover open={tokenPickerOpen} onOpenChange={setTokenPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={isBoundToToken ? 'secondary' : 'outline'}
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              title="Bind Design System Token"
            >
              <TagIcon className="h-3.5 w-3.5 text-primary" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 text-xs" align="end">
            <div className="mb-1.5 flex items-center justify-between border-b border-border/40 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Design Tokens
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                Theme
              </Badge>
            </div>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {tokens.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => handleSelectToken(t.name)}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                    isBoundToToken && value.name === t.name
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {type === 'color' && (
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
                        style={{ backgroundColor: t.value }}
                      />
                    )}
                    <span className="font-mono text-[11px] truncate">${t.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">
                    {t.value}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
