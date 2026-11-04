/**
 * components/motion/MotionAddNodeDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Specialized dialog for adding and configuring a scene node before it enters
 * the scene graph. Replaces the flat toolbar "Add" dropdown with a searchable,
 * category-filtered browser that lets users set a name, choose a parent, and
 * configure key props — including importing a file asset — all in one step.
 *
 * The dialog is data-driven: node types, their categories, property hints and
 * default props all come from listMotionNodeTypes() so it stays in sync with
 * the registry automatically. It issues a single atomic op batch on confirm:
 * one `asset.add` (if a file was imported) followed by one `scene.node.add`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindowIcon,
  BoxIcon,
  CameraIcon,
  CircleDotIcon,
  CircleIcon,
  CodeIcon,
  CylinderIcon,
  FolderIcon,
  ImageIcon,
  LayoutPanelTopIcon,
  LightbulbIcon,
  MessageSquareIcon,
  MonitorIcon,
  PackageIcon,
  PillIcon,
  SearchIcon,
  SmartphoneIcon,
  TabletIcon,
  TriangleIcon,
  TypeIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react';

import { MotionPropertyFields } from '@/components/motion/inspector/MotionPropertyFields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { createMotionId } from '@/lib/motion/ids';
import {
  listMotionNodeTypes,
  type MotionNodeCategory,
  type MotionNodeTypeDescription,
  type MotionPropertyHint,
} from '@/lib/motion/node-registry';
import type { MotionAsset } from '@/lib/motion/types';

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_ORDER: MotionNodeCategory[] = [
  'geometry',
  'product',
  'surface',
  'ui',
  'model',
  'lighting',
  'camera',
  'scene',
  'stage',
];

const CATEGORY_LABELS: Record<MotionNodeCategory, string> = {
  geometry: 'Geometry',
  product: 'Merch',
  surface: 'Surfaces & Text',
  ui: 'Software UI',
  model: '3D Models',
  lighting: 'Lighting',
  camera: 'Camera',
  scene: 'Containers',
  stage: 'Stage',
};

// ── Node-type icon map ────────────────────────────────────────────────────────

function nodeTypeIcon(nodeId: string) {
  if (nodeId === 'device.phone') return SmartphoneIcon;
  if (nodeId === 'device.tablet') return TabletIcon;
  if (nodeId === 'device.laptop' || nodeId === 'device.monitor') return MonitorIcon;
  if (nodeId === 'geometry.box') return BoxIcon;
  if (nodeId === 'geometry.sphere') return CircleIcon;
  if (nodeId === 'geometry.cylinder') return CylinderIcon;
  if (nodeId === 'geometry.torus') return CircleDotIcon;
  if (nodeId === 'geometry.cone') return TriangleIcon;
  if (nodeId === 'geometry.capsule') return PillIcon;
  if (nodeId.startsWith('screen.image')) return ImageIcon;
  if (nodeId.startsWith('screen.video')) return VideoIcon;
  if (nodeId.startsWith('product.')) return PackageIcon;
  if (nodeId.startsWith('ui.browser')) return LayoutPanelTopIcon;
  if (nodeId.startsWith('ui.code')) return CodeIcon;
  if (nodeId.startsWith('ui.annotation')) return MessageSquareIcon;
  if (nodeId.startsWith('text.')) return TypeIcon;
  if (nodeId.startsWith('light.')) return LightbulbIcon;
  if (nodeId.startsWith('camera.')) return CameraIcon;
  if (nodeId.startsWith('scene.')) return FolderIcon;
  if (nodeId.startsWith('shape.')) return AppWindowIcon;
  return BoxIcon;
}

// ── Prop filtering ────────────────────────────────────────────────────────────

/**
 * Which props to show in the configure step. We skip layout-only props
 * (width/height/depth/bezel on devices) since they usually stay at defaults,
 * and always show asset-binding props so users can import a file right away.
 * We also skip missingAsset which is an internal sentinel.
 */
const SKIP_PROPS = new Set(['missingAsset', 'source']);
const PRIORITY_CONTROLS: MotionPropertyHint['control'][] = ['asset', 'color', 'select'];

function orderHints(
  hints: Readonly<Record<string, MotionPropertyHint>>,
): Array<[string, MotionPropertyHint]> {
  const entries = Object.entries(hints).filter(([k]) => !SKIP_PROPS.has(k));
  // Asset / color / select pickers first, then the rest
  entries.sort(([, a], [, b]) => {
    const aPrio = PRIORITY_CONTROLS.indexOf(a.control as MotionPropertyHint['control']);
    const bPrio = PRIORITY_CONTROLS.indexOf(b.control as MotionPropertyHint['control']);
    const aRank = aPrio === -1 ? 999 : aPrio;
    const bRank = bPrio === -1 ? 999 : bPrio;
    return aRank - bRank;
  });
  return entries;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Called when the dialog should close (cancel or after successful add). */
  onClose: () => void;
  /** If a node is selected when the dialog opens, offer it as the default parent. */
  defaultParentId?: string | null;
  /** Existing assets from the open document, forwarded to the property fields. */
  assets: readonly MotionAsset[];
  /** Project id — required so the asset import flow can stage files. */
  projectId: string;
};

// ── Main component ────────────────────────────────────────────────────────────

export function MotionAddNodeDialog({
  onClose,
  defaultParentId,
  assets,
  projectId,
}: Props) {
  const { doc } = useMotionSnapshot();
  const allTypes = useMemo(() => listMotionNodeTypes(), []);

  // ── Step state ────────────────────────────────────────────────────────────

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MotionNodeCategory | 'all'>('all');
  const [selectedType, setSelectedType] = useState<MotionNodeTypeDescription | null>(null);

  // ── Configure step state ──────────────────────────────────────────────────

  const [nodeName, setNodeName] = useState('');
  const [parentId, setParentId] = useState<string | 'root'>(
    defaultParentId ?? 'root',
  );
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [isImporting, setIsImporting] = useState(false);

  // Reset config when the type changes
  useEffect(() => {
    if (!selectedType) return;
    setNodeName(selectedType.label);
    setProps({ ...selectedType.defaultProps });
  }, [selectedType]);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTypes.filter((t) => {
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      if (q && !t.label.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allTypes, query, selectedCategory]);

  // Group by category, respecting CATEGORY_ORDER
  const grouped = useMemo(() => {
    const map = new Map<MotionNodeCategory, MotionNodeTypeDescription[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter((t) => t.category === cat);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  // ── Auto-select first visible type when query narrows the list ────────────

  const prevQuery = useRef(query);
  useEffect(() => {
    if (query !== prevQuery.current && filtered.length === 1) {
      setSelectedType(filtered[0]);
    }
    prevQuery.current = query;
  }, [query, filtered]);

  // ── Valid parent nodes for the selected type ──────────────────────────────

  const validParents = useMemo(() => {
    // A new node cannot create a cycle, so only `allowedParents` applies here.
    const allowed = selectedType?.allowedParents;
    if (!allowed) return doc.scene.nodes;
    return doc.scene.nodes.filter((node) => allowed.includes(node.type));
  }, [doc.scene.nodes, selectedType]);

  // ── Import and add ────────────────────────────────────────────────────────

  const handleImportAsset = useCallback(async () => {
    setIsImporting(true);
    try {
      const staged = await window.electron.ipc.invoke<{
        items: Array<{
          importId: string;
          kind: string;
          sourceName: string;
          probeUrl: string;
        }>;
        errors: Array<{ name: string; code: string; message: string }>;
      }>('motion:pick-assets', { projectId });

      if (!staged.items.length) return;

      const item = staged.items[0];
      const committed = await window.electron.ipc.invoke<{
        assets: MotionAsset[];
        errors: Array<{ name: string; code: string; message: string }>;
      }>('motion:commit-assets', {
        projectId,
        items: [{ importId: item.importId, kind: item.kind }],
      });

      if (committed.assets.length) {
        // Apply asset.add to the doc immediately so it shows in the picker
        motionStore.commit('Import asset', [
          { op: 'asset.add', ...committed.assets[0] },
        ]);
        // Pre-fill assetId in props so the add step uses this asset
        setProps((p) => ({ ...p, assetId: committed.assets[0].id }));
      }
    } finally {
      setIsImporting(false);
    }
  }, [projectId]);

  const handleAdd = useCallback(() => {
    if (!selectedType) return;

    const nodeId = createMotionId('scene');
    const resolvedName = nodeName.trim() || selectedType.label;
    const resolvedParentId = parentId === 'root' ? null : parentId;

    motionStore.commit(`Add ${resolvedName}`, [
      {
        op: 'scene.node.add',
        nodeId,
        type: selectedType.id,
        name: resolvedName,
        ...(resolvedParentId ? { parentId: resolvedParentId } : {}),
        props,
      },
    ]);

    // Select the new node so the inspector opens it immediately
    motionStore.setSelection({ kind: 'node', nodeId });
    onClose();
  }, [selectedType, nodeName, parentId, props, onClose]);

  // ── Keyboard: Escape closes, Enter confirms if a type is chosen ───────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && selectedType && !isImporting) handleAdd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selectedType, isImporting, handleAdd]);

  // ── Render ────────────────────────────────────────────────────────────────

  const hintsForType = selectedType?.propertyHints ?? {};
  const orderedHints = orderHints(hintsForType);
  const hasAssetProp = orderedHints.some(([, h]) => h.control === 'asset');
  const currentAssets = doc.assets;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[80vh] w-[720px] max-w-[95vw] flex-col gap-0 overflow-hidden p-0"
        aria-label="Add scene node"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-sm font-semibold">Add Node</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* ── Left: type browser ─────────────────────────────────────── */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border/60">
            {/* Search */}
            <div className="relative shrink-0 border-b border-border/40 px-2 py-2">
              <SearchIcon className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search nodes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-border/40 px-2 py-1.5">
              {(['all', ...CATEGORY_ORDER] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Type list */}
            <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Node types">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                  No nodes match "{query}"
                </p>
              ) : (
                [...grouped.entries()].map(([cat, items]) => (
                  <div key={cat}>
                    {selectedCategory === 'all' && (
                      <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[cat]}
                      </p>
                    )}
                    {items.map((t) => {
                      const Icon = nodeTypeIcon(t.id);
                      const active = selectedType?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => setSelectedType(t)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                            active
                              ? 'bg-accent text-accent-foreground'
                              : 'text-foreground hover:bg-muted'
                          }`}
                        >
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-xs">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Right: configuration panel ─────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {!selectedType ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <BoxIcon className="size-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Select a node type to configure it
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                {/* Type header */}
                <div className="flex items-start gap-3">
                  {(() => {
                    const Icon = nodeTypeIcon(selectedType.id);
                    return <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />;
                  })()}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{selectedType.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                      {selectedType.description}
                    </p>
                  </div>
                </div>

                <hr className="border-border/60" />

                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="add-node-name"
                    className="text-[10px] font-medium text-muted-foreground"
                  >
                    Name
                  </label>
                  <Input
                    id="add-node-name"
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    className="h-7 text-xs"
                    placeholder={selectedType.label}
                  />
                </div>

                {/* Parent */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="add-node-parent"
                    className="text-[10px] font-medium text-muted-foreground"
                  >
                    Parent
                  </label>
                  <Select
                    value={parentId}
                    onValueChange={setParentId}
                  >
                    <SelectTrigger id="add-node-parent" size="sm" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="root">
                          Scene root
                        </SelectItem>
                        {validParents.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {selectedType.allowedParents && selectedType.allowedParents.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      This node must be placed inside a compatible parent.
                    </p>
                  )}
                </div>

                {/* Props driven by propertyHints */}
                {orderedHints.length > 0 && (
                  <>
                    <hr className="border-border/60" />
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Initial Properties
                      </p>

                      {/* Import file shortcut for asset-backed nodes */}
                      {hasAssetProp && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mb-2 h-7 gap-1.5 text-xs"
                          onClick={handleImportAsset}
                          disabled={isImporting}
                        >
                          <UploadIcon className="size-3" />
                          {isImporting ? 'Importing…' : 'Import file…'}
                        </Button>
                      )}

                      <MotionPropertyFields
                        hints={Object.fromEntries(orderedHints)}
                        values={props}
                        assets={currentAssets}
                        idPrefix="add-node-prop-"
                        onChange={(property, value) =>
                          setProps((p) => ({ ...p, [property]: value }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedType || isImporting}
            onClick={handleAdd}
          >
            Insert Node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
