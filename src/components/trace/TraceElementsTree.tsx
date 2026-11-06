/**
 * components/trace/TraceElementsTree.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer hierarchy and layer creation.
 *
 * The tree is the authoring surface for the element graph: visibility, lock,
 * ordering, duplication, grouping and the add menu all compile to semantic ops.
 */

import { createElement, useMemo, useState } from 'react';
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GroupIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  Maximize2Icon,
  MinusIcon,
  MoveDownIcon,
  MoveUpIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
  UnlockIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

function Row({
  element,
  depth,
  project,
  selectedElementId,
  collapsedElementIds,
  onSelect,
  onToggleCollapse,
}: {
  element: TraceElement;
  depth: number;
  project: TraceProject;
  selectedElementId: string | null;
  collapsedElementIds: string[];
  onSelect: (elementId: string) => void;
  onToggleCollapse: (elementId: string) => void;
}) {
  const dispatch = useTraceStore((state) => state.dispatch);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(element.name);

  const children = (element.childrenIds ?? [])
    .map((childId) => project.elements[childId])
    .filter((child): child is TraceElement => Boolean(child));
  const collapsed = collapsedElementIds.includes(element.id);
  const selected = selectedElementId === element.id;

  const commitName = () => {
    const next = name.trim();
    setRenaming(false);
    if (next && next !== element.name) {
      dispatch([{ type: 'updateElement', id: element.id, name: next }]);
    } else {
      setName(element.name);
    }
  };

  return (
    <>
      <div
        className={
          'group flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] ' +
          (selected
            ? 'bg-sky-500/15 text-slate-100'
            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200')
        }
        style={{ paddingLeft: 2 + depth * 10 }}
      >
        <button
          type="button"
          className="flex size-4 shrink-0 items-center justify-center text-slate-500 disabled:opacity-0"
          disabled={children.length === 0}
          onClick={() => onToggleCollapse(element.id)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3" />
          ) : (
            <ChevronDownIcon className="size-3" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelect(element.id)}
          onDoubleClick={() => {
            setName(element.name);
            setRenaming(true);
          }}
          className="min-w-0 flex-1 truncate text-left"
        >
          <span className="flex items-center gap-1">
            {createElement(iconFor(element), {
              className: 'size-3 shrink-0 text-slate-600',
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
                }}
                className="h-5 flex-1 border-white/10 bg-black/30 px-1 text-[11px] text-slate-100"
              />
            ) : (
              <span className="truncate">{element.name}</span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            dispatch([
              {
                type: 'updateElement',
                id: element.id,
                visible: !element.visible,
              },
            ])
          }
          className={
            'shrink-0 rounded p-0.5 hover:bg-white/10 ' +
            (element.visible
              ? 'text-slate-500 opacity-0 group-hover:opacity-100'
              : 'text-amber-300')
          }
          aria-label={element.visible ? 'Hide layer' : 'Show layer'}
        >
          {element.visible ? (
            <EyeIcon className="size-3" />
          ) : (
            <EyeOffIcon className="size-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch([
              {
                type: 'updateElement',
                id: element.id,
                locked: !element.locked,
              },
            ])
          }
          className={
            'shrink-0 rounded p-0.5 hover:bg-white/10 ' +
            (element.locked
              ? 'text-amber-300'
              : 'text-slate-500 opacity-0 group-hover:opacity-100')
          }
          aria-label={element.locked ? 'Unlock layer' : 'Lock layer'}
        >
          {element.locked ? (
            <LockIcon className="size-3" />
          ) : (
            <UnlockIcon className="size-3" />
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
              aria-label="Layer actions"
            >
              <GroupIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                dispatch([
                  { type: 'reorderElement', id: element.id, to: 'forward' },
                ])
              }
            >
              <MoveUpIcon /> Bring forward
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                dispatch([
                  { type: 'reorderElement', id: element.id, to: 'backward' },
                ])
              }
            >
              <MoveDownIcon /> Send backward
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                dispatch([{ type: 'deleteElement', id: element.id }])
              }
            >
              <Trash2Icon /> Delete layer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!collapsed
        ? children.map((child) => (
            <Row
              key={child.id}
              element={child}
              depth={depth + 1}
              project={project}
              selectedElementId={selectedElementId}
              collapsedElementIds={collapsedElementIds}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))
        : null}
    </>
  );
}

export function TraceElementsTree() {
  const project = useTraceStore((state) => state.project);
  const selection = useTraceStore((state) => state.selection);
  const dispatch = useTraceStore((state) => state.dispatch);
  const selectElement = useTraceStore((state) => state.selectElement);
  const toggleCollapseElement = useTraceStore(
    (state) => state.toggleCollapseElement,
  );
  const [query, setQuery] = useState('');

  const roots = useMemo(() => {
    if (!project) return [];
    const all = project.rootElementIds
      .map((elementId) => project.elements[elementId])
      .filter((element): element is TraceElement => Boolean(element));
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return Object.values(project.elements).filter((element) =>
      element.name.toLowerCase().includes(needle),
    );
  }, [project, query]);

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
    const added = result?.diff.added[0];
    if (added) selectElement(added);
  };

  return (
    <aside className="flex w-[252px] shrink-0 flex-col border-r border-white/10 bg-[#080e1a] text-slate-200">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Layers
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <PlusIcon className="size-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-400">
              Primitives
            </DropdownMenuLabel>
            {PRIMITIVE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.type}
                onSelect={() => addElement(option.type)}
              >
                <option.icon /> {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-purple-400">
              Prefab Recipes
            </DropdownMenuLabel>
            {RECIPE_OPTIONS.map((recipe) => (
              <DropdownMenuItem
                key={recipe.id}
                onSelect={() => applyPrefabRecipe(recipe.id)}
              >
                <recipe.icon className="text-purple-400" /> {recipe.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-2 py-1.5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-slate-600" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter layers"
            className="h-6 border-white/10 bg-white/[0.03] pl-6 text-[10px] text-slate-300 placeholder:text-slate-600"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-px px-1 pb-2">
          {roots.length === 0 ? (
            <p className="px-2 py-4 text-[11px] text-slate-600">
              No layers. Use Add, or start from a template.
            </p>
          ) : (
            roots.map((element) => (
              <Row
                key={element.id}
                element={element}
                depth={0}
                project={project}
                selectedElementId={selection.selectedElementId}
                collapsedElementIds={selection.collapsedElementIds}
                onSelect={selectElement}
                onToggleCollapse={toggleCollapseElement}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-white/10 px-2 py-1 text-[9px] text-slate-600">
        <span>{Object.keys(project.elements).length} layers</span>
        <span className="font-mono">
          {project.width}×{project.height}
        </span>
      </div>
    </aside>
  );
}
