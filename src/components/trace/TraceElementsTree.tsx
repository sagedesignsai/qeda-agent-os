/**
 * components/trace/TraceElementsTree.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer hierarchy and layer creation.
 *
 * The tree is the authoring surface for the element graph: visibility, lock,
 * ordering, duplication, grouping, drag-and-drop and the add menu all compile to
 * semantic ops.
 *
 * Paint order is bottom→top, but layers are listed top→bottom (topmost layer
 * first), matching every other editor. Drop indices are converted back to paint
 * order in `handleDragEnd`.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ActivityIcon,
  BringToFrontIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GripVerticalIcon,
  GroupIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  Maximize2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  MoveDownIcon,
  MoveUpIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendToBackIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
  UngroupIcon,
  UnlockIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  TraceElement,
  TraceElementType,
  TraceProject,
} from '@/lib/trace/types';
import { ADDABLE_ELEMENT_TYPES } from '@/lib/trace/elements/registry';
import { ELEMENT_RECIPES } from '@/lib/trace/ops/elements';
import {
  checkReparent,
  isElementDescendant,
  siblingIds,
  topmostSelectedIds,
} from '@/lib/trace/hierarchy';
import {
  groupSelectedElements,
  ungroupableIds,
  ungroupSelectedElements,
} from '@/components/trace/grouping';
import { useTraceStore } from '@/stores/trace-store';

type ElementTypeOption = {
  type: TraceElementType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type RecipeOption = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type DisplayRow = {
  element: TraceElement;
  depth: number;
  parentId: string | null;
};

type DragState = {
  id: string | null;
  overId: string | null;
  before: boolean;
};

const ROOT_DROP_ID = 'trace-drop-root';
const EMPTY_DRAG: DragState = { id: null, overId: null, before: true };

const PRIMITIVE_METADATA: Record<
  TraceElementType,
  Omit<ElementTypeOption, 'type'>
> = {
  rect: { label: 'Rectangle', icon: SquareIcon },
  circle: { label: 'Circle', icon: CircleIcon },
  ellipse: { label: 'Ellipse', icon: CircleIcon },
  line: { label: 'Line', icon: MinusIcon },
  polyline: { label: 'Polyline', icon: ActivityIcon },
  polygon: { label: 'Polygon', icon: Maximize2Icon },
  path: { label: 'Vector path', icon: PencilIcon },
  text: { label: 'Text', icon: TypeIcon },
  image: { label: 'Image', icon: ImageIcon },
  use: { label: 'Use / Symbol', icon: CopyIcon },
  group: { label: 'Group', icon: FolderIcon },
};

const PRIMITIVE_OPTIONS: ElementTypeOption[] = ADDABLE_ELEMENT_TYPES.map(
  (type) => ({ type, ...PRIMITIVE_METADATA[type] }),
);

const RECIPE_ICONS: Record<string, RecipeOption['icon']> = {
  'lower-third': MinusIcon,
  'progress-ring': CircleIcon,
  'bar-chart': LayersIcon,
  'kinetic-text': TypeIcon,
  counter: HashIcon,
};
const RECIPE_OPTIONS: RecipeOption[] = ELEMENT_RECIPES.map((recipe) => ({
  id: recipe.id,
  label: recipe.title,
  icon: RECIPE_ICONS[recipe.id] ?? LayersIcon,
}));

function iconFor(element: TraceElement) {
  switch (element.type) {
    case 'text':
      return TypeIcon;
    case 'circle':
    case 'ellipse':
      return CircleIcon;
    case 'line':
      return MinusIcon;
    case 'polyline':
      return ActivityIcon;
    case 'image':
      return ImageIcon;
    case 'use':
      return CopyIcon;
    case 'path':
      return PencilIcon;
    case 'group':
      return FolderIcon;
    default:
      return SquareIcon;
  }
}

function specFor(type: TraceElementType, project: TraceProject) {
  const x = Math.round(project.width / 2 - 120);
  const y = Math.round(project.height / 2 - 60);
  const centerX = Math.round(project.width / 2);
  const centerY = Math.round(project.height / 2);

  switch (type) {
    case 'text':
      return {
        type: 'text' as const,
        text: 'New text',
        x: centerX,
        y: centerY,
        fontSize: 64,
        fill: '#f8fafc',
        textAnchor: 'middle' as const,
        name: 'Text',
      };
    case 'circle':
      return {
        type: 'circle' as const,
        x: x + 60,
        y,
        width: 180,
        height: 180,
        fill: 'rgba(56, 189, 248, 0.18)',
        stroke: '#38bdf8',
        strokeWidth: 2,
        name: 'Circle',
      };
    case 'ellipse':
      return {
        type: 'ellipse' as const,
        x: x + 40,
        y,
        width: 200,
        height: 120,
        fill: 'rgba(56, 189, 248, 0.18)',
        stroke: '#38bdf8',
        strokeWidth: 2,
        name: 'Ellipse',
      };
    case 'line':
      return {
        type: 'line' as const,
        x,
        y: centerY,
        x1: 0,
        y1: 0,
        x2: 240,
        y2: 0,
        stroke: '#38bdf8',
        strokeWidth: 3,
        name: 'Line',
      };
    case 'polyline':
      return {
        type: 'polyline' as const,
        x,
        y,
        points: '0,80 80,10 160,80 240,10 320,80',
        fill: 'none',
        stroke: '#38bdf8',
        strokeWidth: 3,
        name: 'Polyline',
      };
    case 'image':
      return {
        type: 'image' as const,
        x,
        y,
        width: 240,
        height: 160,
        href: '',
        name: 'Image',
      };
    case 'use':
      return {
        type: 'use' as const,
        x,
        y,
        width: 100,
        height: 100,
        href: '',
        name: 'Symbol',
      };
    case 'polygon':
      return {
        type: 'polygon' as const,
        x: x + 60,
        y,
        width: 180,
        height: 180,
        fill: 'rgba(129, 140, 248, 0.2)',
        stroke: '#818cf8',
        strokeWidth: 2,
        name: 'Polygon',
      };
    case 'path':
      return {
        type: 'path' as const,
        d: 'M 0 120 C 120 0 240 240 360 60',
        x,
        y,
        fill: 'none',
        stroke: '#38bdf8',
        strokeWidth: 4,
        trimStart: 0,
        trimEnd: 100,
        name: 'Path',
      };
    case 'group':
      return { type: 'group' as const, x: 0, y: 0, name: 'Group' };
    default:
      return {
        type: 'rect' as const,
        x,
        y,
        width: 240,
        height: 160,
        rx: 12,
        fill: 'rgba(56, 189, 248, 0.2)',
        stroke: '#38bdf8',
        strokeWidth: 2,
        name: 'Rectangle',
      };
  }
}

/**
 * Flatten the element graph into visible rows, topmost layer first.
 *
 * With a query, keep every node on a match's ancestor chain plus the match's
 * whole subtree, and ignore collapse so results are never hidden.
 */
function buildDisplayRows(
  project: TraceProject,
  collapsedElementIds: string[],
  query: string,
): DisplayRow[] {
  const needle = query.trim().toLowerCase();
  let included: Set<string> | null = null;

  if (needle) {
    included = new Set<string>();
    const matches = Object.values(project.elements).filter((element) =>
      element.name.toLowerCase().includes(needle),
    );

    // Keep the path from each match up to the root so rows stay reachable.
    for (const match of matches) {
      let cursor: string | null | undefined = match.id;
      const chainGuard = new Set<string>();
      while (cursor && !chainGuard.has(cursor)) {
        chainGuard.add(cursor);
        included.add(cursor);
        cursor = project.elements[cursor]?.parentId ?? null;
      }
    }

    // Keep every match's whole subtree, independent of shared ancestors.
    const stack = matches.map((match) => match.id);
    const subtreeSeen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (subtreeSeen.has(id)) continue;
      subtreeSeen.add(id);
      included.add(id);
      stack.push(...(project.elements[id]?.childrenIds ?? []));
    }
  }

  const rows: DisplayRow[] = [];
  const visit = (elementId: string, depth: number) => {
    const element = project.elements[elementId];
    if (!element) return;
    if (included && !included.has(elementId)) return;

    rows.push({
      element,
      depth,
      parentId: element.parentId ?? null,
    });

    const collapsed =
      !needle && collapsedElementIds.includes(elementId);
    if (collapsed) return;

    // Topmost child first.
    for (const childId of [...(element.childrenIds ?? [])].reverse()) {
      visit(childId, depth + 1);
    }
  };

  for (const rootId of [...(project.rootElementIds ?? [])].reverse()) {
    visit(rootId, 0);
  }
  return rows;
}

function Row({
  row,
  project,
  selected,
  primary,
  collapsed,
  dragState,
  altKey,
  dragEnabled,
  onSelect,
  onToggleCollapse,
}: {
  row: DisplayRow;
  project: TraceProject;
  selected: boolean;
  primary: boolean;
  collapsed: boolean;
  dragState: DragState;
  altKey: boolean;
  dragEnabled: boolean;
  onSelect: (
    elementId: string,
    options?: { additive?: boolean; range?: boolean },
  ) => void;
  onToggleCollapse: (elementId: string) => void;
}) {
  const { element, depth } = row;
  const dispatch = useTraceStore((state) => state.dispatch);
  const selectedElementIds = useTraceStore(
    (state) => state.selection.selectedElementIds,
  );
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(element.name);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const children = (element.childrenIds ?? [])
    .map((childId) => project.elements[childId])
    .filter((child): child is TraceElement => Boolean(child));
  const hasChildren = children.length > 0;
  const isDragging = dragState.id === element.id;
  const isOver = dragState.overId === `trace-drop-${element.id}`;
  const dropInside =
    isOver &&
    altKey &&
    Boolean(dragState.id) &&
    checkReparent(project, dragState.id as string, element.id).allowed;
  const dropBefore = isOver && !dropInside && dragState.before;
  const dropAfter = isOver && !dropInside && !dragState.before;

  const dragDisabled = !dragState.id
    ? false
    : dragState.id === element.id ||
      isElementDescendant(project, element.id, dragState.id);

  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: `trace-drag-${element.id}`,
    data: { elementId: element.id },
    disabled: !dragEnabled,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `trace-drop-${element.id}`,
    data: { elementId: element.id },
    disabled: !dragEnabled || dragDisabled,
  });

  const commitName = () => {
    const next = name.trim();
    setRenaming(false);
    if (next && next !== element.name) {
      dispatch([{ type: 'updateElement', id: element.id, name: next }]);
    } else {
      setName(element.name);
    }
  };

  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setContextMenuOpen(true);
  };

  return (
    <div
      ref={setDropRef}
      role="treeitem"
      aria-selected={selected}
      aria-level={depth + 1}
      className={
        'group relative flex items-center rounded px-1 py-0.5 text-[11px] cursor-pointer ' +
        (primary
          ? 'bg-sky-500/20 text-foreground'
          : selected
            ? 'bg-sky-500/10 text-foreground'
            : 'text-muted-foreground hover:bg-accent/20 hover:text-foreground') +
        (isDragging ? ' opacity-40' : '') +
        (dropInside ? ' ring-1 ring-inset ring-sky-400/70' : '')
      }
      style={{ paddingLeft: 2 + depth * 12 }}
      onClick={(event) =>
        onSelect(element.id, {
          additive: event.metaKey || event.ctrlKey,
          range: event.shiftKey,
        })
      }
      onDoubleClick={() => {
        setName(element.name);
        setRenaming(true);
      }}
      onContextMenu={onContextMenu}
    >
      {dropBefore ? (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-sky-400" />
      ) : null}
      {dropAfter ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-sky-400" />
      ) : null}

      {/* Drag handle */}
      <button
        ref={setDragRef}
        {...listeners}
        {...attributes}
        type="button"
        aria-label={`Drag ${element.name}`}
        title="Drag to reorder · Alt+drop to nest"
        onClick={(event) => event.stopPropagation()}
        className="flex size-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 opacity-0 outline-none hover:bg-accent/30 hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
        hidden={!dragEnabled}
      >
        <GripVerticalIcon className="size-3" />
      </button>

      {/* Collapse/Expand */}
      <button
        type="button"
        className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent/30 hover:text-muted-foreground disabled:opacity-0"
        disabled={!hasChildren}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapse(element.id);
        }}
        aria-label={collapsed ? 'Expand' : 'Collapse'}
      >
        {hasChildren ? (
          collapsed ? (
            <ChevronRightIcon className="size-2.5" />
          ) : (
            <ChevronDownIcon className="size-2.5" />
          )
        ) : null}
      </button>

      {/* Icon + Name */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {createElement(iconFor(element), {
          className: 'size-3 shrink-0 text-muted-foreground/50',
        })}
        {renaming ? (
          <Input
            ref={(node) => {
              if (node && document.activeElement !== node) node.focus();
            }}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitName();
              if (event.key === 'Escape') {
                setName(element.name);
                setRenaming(false);
              }
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
            className="h-5 flex-1 rounded border-border/50 bg-accent/20 px-1.5 text-[11px] text-foreground"
          />
        ) : (
          <span className="truncate">{element.name}</span>
        )}
      </span>

      {/* Visibility Toggle */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          dispatch([
            {
              type: 'updateElement',
              id: element.id,
              visible: !element.visible,
            },
          ]);
        }}
        className={
          'shrink-0 rounded p-0.5 transition-opacity hover:bg-accent/30 ' +
          (element.visible
            ? 'text-muted-foreground/40 opacity-0 group-hover:opacity-100'
            : 'text-muted-foreground/60 opacity-60 group-hover:opacity-100')
        }
        aria-label={element.visible ? 'Hide layer' : 'Show layer'}
      >
        {element.visible ? (
          <EyeIcon className="size-3" />
        ) : (
          <EyeOffIcon className="size-3" />
        )}
      </button>

      {/* Lock Toggle */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          dispatch([
            {
              type: 'updateElement',
              id: element.id,
              locked: !element.locked,
            },
          ]);
        }}
        className={
          'shrink-0 rounded p-0.5 transition-opacity hover:bg-accent/30 ' +
          (element.locked
            ? 'text-muted-foreground/60 opacity-60 group-hover:opacity-100'
            : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100')
        }
        aria-label={element.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {element.locked ? (
          <LockIcon className="size-3" />
        ) : (
          <UnlockIcon className="size-3" />
        )}
      </button>

      {/* Actions Menu (hover button) */}
      <DropdownMenu onOpenChange={(open) => {
        if (!open) setContextMenuOpen(false);
      }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-accent/30 hover:text-foreground group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
            aria-label="Layer actions"
          >
            <MoreHorizontalIcon className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() =>
              dispatch([
                {
                  type: 'duplicateElement',
                  id: element.id,
                  offset: { x: 20, y: 20 },
                },
              ])
            }
          >
            <CopyIcon className="size-3" /> Duplicate
          </DropdownMenuItem>

          {element.type === 'group' && hasChildren ? (
            <DropdownMenuItem
              onSelect={() =>
                dispatch([{ type: 'ungroupElement', id: element.id }])
              }
            >
              <UngroupIcon className="size-3" /> Ungroup
            </DropdownMenuItem>
          ) : null}
          {selectedElementIds.length >= 2 &&
          selectedElementIds.includes(element.id) ? (
            <DropdownMenuItem onSelect={() => groupSelectedElements()}>
              <GroupIcon className="size-3" /> Group selection
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'front' }])
            }
          >
            <BringToFrontIcon className="size-3" /> Bring to front
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'forward' }])
            }
          >
            <MoveUpIcon className="size-3" /> Bring forward
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'backward' }])
            }
          >
            <MoveDownIcon className="size-3" /> Send backward
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'back' }])
            }
          >
            <SendToBackIcon className="size-3" /> Send to back
          </DropdownMenuItem>

          {project.storyboard?.scenes?.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LayersIcon className="size-3" /> Move to scene
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch([
                        { type: 'setElementScene', id: element.id, sceneId: null },
                      ])
                    }
                  >
                    No scene
                  </DropdownMenuItem>
                  {project.storyboard.scenes.map((scene) => (
                    <DropdownMenuItem
                      key={scene.id}
                      onSelect={() =>
                        dispatch([
                          {
                            type: 'setElementScene',
                            id: element.id,
                            sceneId: scene.id,
                          },
                        ])
                      }
                    >
                      {scene.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              dispatch([{ type: 'deleteElement', id: element.id }])
            }
          >
            <Trash2Icon className="size-3" /> Delete layer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right-click Context Menu */}
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <DropdownMenuTrigger asChild style={{ display: 'none' }}>
          <button type="button" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-48"
          style={{
            position: 'fixed',
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
        >
          <DropdownMenuItem
            onSelect={() =>
              dispatch([
                {
                  type: 'duplicateElement',
                  id: element.id,
                  offset: { x: 20, y: 20 },
                },
              ])
            }
          >
            <CopyIcon className="size-3" /> Duplicate
          </DropdownMenuItem>

          {element.type === 'group' && hasChildren ? (
            <DropdownMenuItem
              onSelect={() =>
                dispatch([{ type: 'ungroupElement', id: element.id }])
              }
            >
              <UngroupIcon className="size-3" /> Ungroup
            </DropdownMenuItem>
          ) : null}
          {selectedElementIds.length >= 2 &&
          selectedElementIds.includes(element.id) ? (
            <DropdownMenuItem onSelect={() => groupSelectedElements()}>
              <GroupIcon className="size-3" /> Group selection
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'front' }])
            }
          >
            <BringToFrontIcon className="size-3" /> Bring to front
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'forward' }])
            }
          >
            <MoveUpIcon className="size-3" /> Bring forward
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'backward' }])
            }
          >
            <MoveDownIcon className="size-3" /> Send backward
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch([{ type: 'reorderElement', id: element.id, to: 'back' }])
            }
          >
            <SendToBackIcon className="size-3" /> Send to back
          </DropdownMenuItem>

          {project.storyboard?.scenes?.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LayersIcon className="size-3" /> Move to scene
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch([
                        { type: 'setElementScene', id: element.id, sceneId: null },
                      ])
                    }
                  >
                    No scene
                  </DropdownMenuItem>
                  {project.storyboard.scenes.map((scene) => (
                    <DropdownMenuItem
                      key={scene.id}
                      onSelect={() =>
                        dispatch([
                          {
                            type: 'setElementScene',
                            id: element.id,
                            sceneId: scene.id,
                          },
                        ])
                      }
                    >
                      {scene.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              dispatch([{ type: 'deleteElement', id: element.id }])
            }
          >
            <Trash2Icon className="size-3" /> Delete layer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef } = useDroppable({
    id: ROOT_DROP_ID,
    data: { root: true },
  });
  return (
    <div
      ref={setNodeRef}
      className={
        'my-1 flex h-6 items-center justify-center rounded border border-dashed text-[10px] transition-colors ' +
        (active
          ? 'border-sky-400 bg-sky-400/10 text-sky-300'
          : 'border-border/70 text-muted-foreground')
      }
    >
      Drop here to move to the artboard root
    </div>
  );
}

export function TraceElementsTree() {
  const project = useTraceStore((state) => state.project);
  const selection = useTraceStore((state) => state.selection);
  const dispatch = useTraceStore((state) => state.dispatch);
  const selectElement = useTraceStore((state) => state.selectElement);
  const selectElements = useTraceStore((state) => state.selectElements);
  const toggleCollapseElement = useTraceStore(
    (state) => state.toggleCollapseElement,
  );
  const [query, setQuery] = useState('');
  const anchorRef = useRef<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(EMPTY_DRAG);
  const [altKey, setAltKey] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => setAltKey(event.altKey);
    const onBlur = () => setAltKey(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const rows = useMemo(
    () =>
      project
        ? buildDisplayRows(project, selection.collapsedElementIds, query)
        : [],
    [project, selection.collapsedElementIds, query],
  );

  const selectedIds = selection.selectedElementIds ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const canGroup = useMemo(
    () => (project ? topmostSelectedIds(project, selectedIds).length >= 2 : false),
    [project, selectedIds],
  );
  const canUngroup = useMemo(
    () => (project ? ungroupableIds(project, selectedIds).length > 0 : false),
    [project, selectedIds],
  );

  const onSelectRow = useCallback(
    (
      elementId: string,
      options: { additive?: boolean; range?: boolean } = {},
    ) => {
      if (options.range && anchorRef.current) {
        const ids = rows.map((row) => row.element.id);
        const from = ids.indexOf(anchorRef.current);
        const to = ids.indexOf(elementId);
        if (from >= 0 && to >= 0) {
          const range = ids.slice(
            Math.min(from, to),
            Math.max(from, to) + 1,
          );
          selectElements(range, elementId);
          return;
        }
      }
      selectElement(elementId, { additive: options.additive });
      anchorRef.current = elementId;
    },
    [rows, selectElement, selectElements],
  );

  if (!project) return null;

  const addElement = (type: TraceElementType) => {
    const result = dispatch([
      { type: 'addElement', element: specFor(type, project) },
    ]);
    const added = result?.recipeRootIds[0];
    if (added) selectElement(added);
  };

  const applyPrefabRecipe = (recipeId: string) => {
    const result = dispatch([
      {
        type: 'applyRecipe',
        recipeId,
        x: Math.round(project.width / 2 - 200),
        y: Math.round(project.height / 2 - 100),
      },
    ]);
    const added = result?.recipeRootIds[0] ?? result?.diff.added[0];
    if (added) selectElement(added);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const elementId = event.active.data.current?.elementId;
    setDragState({
      id: typeof elementId === 'string' ? elementId : null,
      overId: null,
      before: true,
    });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const over = event.over;
    if (!over) {
      setDragState((state) =>
        state.overId === null ? state : { ...state, overId: null },
      );
      return;
    }
    const activator = event.activatorEvent as PointerEvent | undefined;
    const pointerY = (activator?.clientY ?? 0) + event.delta.y;
    const before = pointerY < over.rect.top + over.rect.height / 2;
    const overId = String(over.id);
    setDragState((state) =>
      state.overId === overId && state.before === before
        ? state
        : { ...state, overId, before },
    );
  };

  const handleDragCancel = () => setDragState(EMPTY_DRAG);

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = event.active.data.current?.elementId;
    const over = event.over;
    setDragState(EMPTY_DRAG);
    if (typeof activeId !== 'string' || !over) return;

    const state = useTraceStore.getState();
    const currentProject = state.project;
    if (!currentProject) return;

    const data = over.data.current as
      | { elementId?: string; root?: boolean }
      | undefined;

    if (data?.root) {
      state.dispatch([
        { type: 'reparentElement', id: activeId, parentId: null, index: 0 },
      ]);
      return;
    }

    const targetId = data?.elementId;
    if (!targetId || targetId === activeId) return;
    const target = currentProject.elements[targetId];
    if (!target) return;

    // Alt drops *into* a layer; a plain drop reorders next to it.
    if (altKey) {
      const check = checkReparent(currentProject, activeId, targetId);
      if (!check.allowed) return;
      const index = siblingIds(currentProject, targetId).filter(
        (id) => id !== activeId,
      ).length;
      state.dispatch([
        { type: 'reparentElement', id: activeId, parentId: targetId, index },
      ]);
      if (state.selection.collapsedElementIds.includes(targetId)) {
        state.toggleCollapseElement(targetId);
      }
      return;
    }

    const parentId = target.parentId ?? null;
    if (!checkReparent(currentProject, activeId, parentId).allowed) return;

    const siblings = siblingIds(currentProject, parentId).filter(
      (id) => id !== activeId,
    );
    const targetIndex = siblings.indexOf(targetId);
    if (targetIndex < 0) return;

    const activator = event.activatorEvent as PointerEvent | undefined;
    const pointerY = (activator?.clientY ?? 0) + event.delta.y;
    const before = pointerY < over.rect.top + over.rect.height / 2;

    // Display is top→bottom, paint order is bottom→top: dropping *above* the
    // target means a higher paint index.
    const index = before ? targetIndex + 1 : targetIndex;
    state.dispatch([
      { type: 'reparentElement', id: activeId, parentId, index },
    ]);
  };

  const layerCount = Object.keys(project.elements).length;

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-border/50 bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Scene
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canGroup}
            onClick={() => groupSelectedElements()}
            title="Group selection (⌘G)"
            aria-label="Group selection"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <GroupIcon className="size-3" />
          </button>
          <button
            type="button"
            disabled={!canUngroup}
            onClick={() => ungroupSelectedElements()}
            title="Ungroup selection (⇧⌘G)"
            aria-label="Ungroup selection"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <UngroupIcon className="size-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-0.5 px-1.5 text-[10px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
              >
                <PlusIcon className="size-2.5" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Primitives
              </DropdownMenuLabel>
              {PRIMITIVE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.type}
                  onSelect={() => addElement(option.type)}
                  className="text-[11px]"
                >
                  <option.icon className="size-3 text-muted-foreground/60" /> {option.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-[0.12em] text-violet-400/80">
                Recipes
              </DropdownMenuLabel>
              {RECIPE_OPTIONS.map((recipe) => (
                <DropdownMenuItem
                  key={recipe.id}
                  onSelect={() => applyPrefabRecipe(recipe.id)}
                  className="text-[11px]"
                >
                  <recipe.icon className="size-3 text-violet-400/80" /> {recipe.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers"
            className="h-6 rounded border-border/50 bg-accent/10 pl-7 text-[11px] text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Layer List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 py-1 pb-2">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-muted-foreground/40">
              {query.trim()
                ? `No layers match "${query.trim()}".`
                : 'No layers yet. Click Add to create one.'}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div role="tree" aria-label="Scene layers">
                {rows.map((row) => (
                  <Row
                    key={row.element.id}
                    row={row}
                    project={project}
                    selected={selectedSet.has(row.element.id)}
                    primary={selection.selectedElementId === row.element.id}
                    collapsed={selection.collapsedElementIds.includes(
                      row.element.id,
                    )}
                    dragState={dragState}
                    altKey={altKey}
                    dragEnabled={!query.trim()}
                    onSelect={onSelectRow}
                    onToggleCollapse={toggleCollapseElement}
                  />
                ))}
                {dragState.id ? (
                  <RootDropZone active={dragState.overId === ROOT_DROP_ID} />
                ) : null}
              </div>
            </DndContext>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5 text-[9px] text-muted-foreground/40">
        <span>
          {layerCount} layer{layerCount !== 1 ? 's' : ''}
          {selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ''}
        </span>
        <span className="font-mono">
          {project.width}×{project.height}
        </span>
      </div>
    </aside>
  );
}
