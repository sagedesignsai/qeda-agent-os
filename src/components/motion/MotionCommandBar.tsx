/**
 * components/motion/MotionCommandBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline command bar for the Motion editor toolbar.  Uses a Popover + Command
 * pattern so the user can type to find and execute Motion-specific actions
 * without hunting for toolbar buttons.
 *
 * Command groups: Toggle Panels, Open Dialogs, Scene Management,
 * Add Nodes/Tracks, and History (Undo / Redo / Save).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SearchIcon } from 'lucide-react';
import { useState } from 'react';

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
import { listMotionNodeTypes } from '@/lib/motion/node-registry';

/* ── Props ─────────────────────────────────────────────────────────────── */

interface MotionCommandBarProps {
  /** Toggle scene panel visibility */
  onToggleScenePanel: () => void;
  /** Toggle inspector visibility */
  onToggleInspector: () => void;
  /** Toggle timeline collapse */
  onToggleTimeline: () => void;
  /** Whether scene panel is currently collapsed */
  scenePanelCollapsed: boolean;
  /** Whether inspector is currently collapsed */
  inspectorCollapsed: boolean;
  /** Whether timeline is currently collapsed */
  timelineCollapsed: boolean;

  /** Open the asset marketplace dialog */
  onOpenMarketplace: () => void;
  /** Open the export dialog */
  onOpenExport: () => void;

  /** Create a new scene */
  onCreateScene: () => void;
  /** Duplicate the active scene */
  onDuplicateScene: () => void;
  /** Switch to a scene by ID */
  onSwitchScene: (sceneId: string) => void;
  /** Delete the active scene (if >1 scenes exist) */
  onDeleteScene: () => void;
  /** List of scenes for switching */
  scenes: Array<{ id: string; name: string }>;
  /** Active scene ID */
  activeSceneId: string;

  /** Add a node of the given type */
  onAddNode: (type: string) => void;
  /** Add an animation track */
  onAddTrack: () => void;

  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Save the project now */
  onSave: () => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function MotionCommandBar({
  onToggleScenePanel,
  onToggleInspector,
  onToggleTimeline,
  scenePanelCollapsed,
  inspectorCollapsed,
  timelineCollapsed,
  onOpenMarketplace,
  onOpenExport,
  onCreateScene,
  onDuplicateScene,
  onSwitchScene,
  onDeleteScene,
  scenes,
  activeSceneId,
  onAddNode,
  onAddTrack,
  canUndo,
  canRedo,
  onSave,
}: MotionCommandBarProps) {
  const [open, setOpen] = useState(false);

  const nodeTypes = listMotionNodeTypes();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-20 shrink-0 items-center gap-1 rounded border border-border/40 bg-input/30 px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Search commands"
          title="Search commands"
        >
          <SearchIcon className="size-3 shrink-0" />
          <span className="truncate">Commands...</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>

            {/* Toggle Panels */}
            <CommandGroup heading="Toggle Panels">
              <CommandItem
                onSelect={() => {
                  onToggleScenePanel();
                  setOpen(false);
                }}
              >
                {scenePanelCollapsed ? 'Show' : 'Hide'} scene panel
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onToggleInspector();
                  setOpen(false);
                }}
              >
                {inspectorCollapsed ? 'Show' : 'Hide'} inspector
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onToggleTimeline();
                  setOpen(false);
                }}
              >
                {timelineCollapsed ? 'Expand' : 'Collapse'} timeline
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Open Dialogs */}
            <CommandGroup heading="Open Dialogs">
              <CommandItem
                onSelect={() => {
                  onOpenMarketplace();
                  setOpen(false);
                }}
              >
                Asset marketplace
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onOpenExport();
                  setOpen(false);
                }}
              >
                Export...
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Scene Management */}
            <CommandGroup heading="Scene Management">
              <CommandItem
                onSelect={() => {
                  onCreateScene();
                  setOpen(false);
                }}
              >
                New scene
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onDuplicateScene();
                  setOpen(false);
                }}
              >
                Duplicate scene
              </CommandItem>
              {scenes.length > 1 &&
                scenes.map((scene) => (
                  <CommandItem
                    key={scene.id}
                    onSelect={() => {
                      onSwitchScene(scene.id);
                      setOpen(false);
                    }}
                  >
                    {scene.id === activeSceneId ? '\u2713 ' : ''}{scene.name}
                  </CommandItem>
                ))}
              {scenes.length > 1 && (
                <CommandItem
                  onSelect={() => {
                    onDeleteScene();
                    setOpen(false);
                  }}
                >
                  Delete scene...
                </CommandItem>
              )}
            </CommandGroup>

            <CommandSeparator />

            {/* Add Nodes/Tracks */}
            <CommandGroup heading="Add Nodes & Tracks">
              <CommandItem
                onSelect={() => {
                  onAddTrack();
                  setOpen(false);
                }}
              >
                Animation track
              </CommandItem>
              {(['scene', 'camera', 'geometry', 'surface', 'model', 'lighting', 'stage'] as const).map(
                (category) => {
                  const categoryNodes = nodeTypes.filter(
                    (node) => node.category === category,
                  );
                  if (!categoryNodes.length) return null;
                  return categoryNodes.map((node) => (
                    <CommandItem
                      key={node.id}
                      onSelect={() => {
                        onAddNode(node.id);
                        setOpen(false);
                      }}
                    >
                      {node.label}
                    </CommandItem>
                  ));
                },
              )}
            </CommandGroup>

            <CommandSeparator />

            {/* History */}
            <CommandGroup heading="History">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                }}
                disabled={!canUndo}
              >
                Undo
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                }}
                disabled={!canRedo}
              >
                Redo
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onSave();
                  setOpen(false);
                }}
              >
                Save
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
