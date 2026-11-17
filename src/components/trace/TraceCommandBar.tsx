/**
 * components/trace/TraceCommandBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Searchable command bar for Trace-specific actions and add-ons.
 */

import { useState } from 'react';
import { DownloadIcon, SearchIcon, SparklesIcon, UploadIcon } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type TraceCommandBarProps = {
  onAnimateSvg: () => void;
  onImportSvg: () => void;
  onExport: () => void;
};

export function TraceCommandBar({
  onAnimateSvg,
  onImportSvg,
  onExport,
}: TraceCommandBarProps) {
  const [open, setOpen] = useState(false);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-[150px] shrink-0 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/40 px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search Trace commands"
          title="Search Trace commands"
        >
          <SearchIcon className="size-3 shrink-0" />
          <span className="truncate">Commands...</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center" side="bottom" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Search Trace commands…" />
          <CommandList>
            <CommandEmpty>No Trace commands found.</CommandEmpty>
            <CommandGroup heading="Add-ons">
              <CommandItem onSelect={() => run(onAnimateSvg)}>
                <SparklesIcon className="text-orange-300" />
                <span>Animate SVG</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Artwork">
              <CommandItem onSelect={() => run(onImportSvg)}>
                <UploadIcon />
                <span>Import SVG</span>
              </CommandItem>
              <CommandItem onSelect={() => run(onExport)}>
                <DownloadIcon />
                <span>Export composition</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
