/**
 * components/motion/MotionScenePanelHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Header bar for Motion Scene Panel with search, filter, and quick actions.
 * Inspired by VS Code's Explorer header with a clean, minimal design.
 */

import { useCallback, useState } from 'react';
import {
  SearchIcon,
  XIcon,
  MoreVerticalIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MotionScenePanelHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  sortBy?: 'name' | 'type' | 'animated';
  onSortChange?: (sort: 'name' | 'type' | 'animated') => void;
  groupByType?: boolean;
  onGroupByTypeChange?: (groupByType: boolean) => void;
}

export function MotionScenePanelHeader({
  searchValue,
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  sortBy = 'name',
  onSortChange,
  groupByType = false,
  onGroupByTypeChange,
}: MotionScenePanelHeaderProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-2">
      {/* Search Field */}
      <div
        className={cn(
          'flex flex-1 items-center gap-1 rounded bg-background px-2',
          isSearchFocused && 'ring-1 ring-ring',
        )}
      >
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search nodes…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          className="h-6 border-0 bg-transparent px-0 text-xs placeholder-muted-foreground/60 focus-visible:outline-none focus-visible:ring-0"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground"
            aria-label="Clear search"
            title="Clear search (Escape)"
          >
            <XIcon className="size-3" />
          </button>
        )}
      </div>

      {/* View Options Menu */}
      <DropdownMenu>
        <button
          type="button"
          className={cn(
            'flex size-7 items-center justify-center rounded text-muted-foreground/70 outline-none hover:bg-accent/40 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
          )}
          title="View options"
          aria-label="View options"
        >
          <MoreVerticalIcon className="size-3.5" />
        </button>
        <DropdownMenuContent align="end" className="w-48">
          {onExpandAll && onCollapseAll && (
            <>
              <DropdownMenuItem onSelect={onExpandAll}>
                <ChevronDownIcon className="size-3.5" />
                <span className="ml-2">Expand All</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCollapseAll}>
                <ChevronUpIcon className="size-3.5" />
                <span className="ml-2">Collapse All</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {onSortChange && (
            <>
              <DropdownMenuCheckboxItem
                checked={sortBy === 'name'}
                onSelect={() => onSortChange('name')}
              >
                Sort by Name
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sortBy === 'type'}
                onSelect={() => onSortChange('type')}
              >
                Sort by Type
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sortBy === 'animated'}
                onSelect={() => onSortChange('animated')}
              >
                Sort by Animated
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>
          )}

          {onGroupByTypeChange && (
            <DropdownMenuCheckboxItem
              checked={groupByType}
              onSelect={() => onGroupByTypeChange(!groupByType)}
            >
              Group by Type
            </DropdownMenuCheckboxItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
