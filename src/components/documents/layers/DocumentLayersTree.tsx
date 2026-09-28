/**
 * components/documents/layers/DocumentLayersTree.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible Document Layers Tree for navigating and organizing the
 * hierarchical Yoga-flexbox node tree.
 *
 * Exposes:
 *   - Recursive tree view with indentation and expandable containers
 *   - Node type badges/icons (Box, Row, Column, Text, Icon, Image, etc.)
 *   - Quick inline actions (Lock, Hide/Show, Delete)
 *   - Direct selection synchronization with canvas and inspector
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SquareIcon,
  ColumnsIcon,
  RowsIcon,
  TypeIcon,
  SmileIcon,
  ImageIcon,
  MinusIcon,
  ScissorsIcon,
  ArrowUpDownIcon,
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  PlusIcon,
  XIcon,
  LayersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DocNode, DocNodeType } from '@/lib/pdf-studio/primitives-ast';
import { isContainerNode } from '@/lib/pdf-studio/primitives-ast';

interface DocumentLayersTreeProps {
  nodes: DocNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<DocNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddChild?: (parentId: string, type: DocNodeType) => void;
  onClose?: () => void;
}

function getNodeIcon(type: DocNodeType) {
  switch (type) {
    case 'box':
      return <SquareIcon className="h-3.5 w-3.5 text-blue-500" />;
    case 'row':
      return <ColumnsIcon className="h-3.5 w-3.5 text-emerald-500" />;
    case 'column':
      return <RowsIcon className="h-3.5 w-3.5 text-purple-500" />;
    case 'text':
      return <TypeIcon className="h-3.5 w-3.5 text-amber-500" />;
    case 'icon':
      return <SmileIcon className="h-3.5 w-3.5 text-cyan-500" />;
    case 'image':
      return <ImageIcon className="h-3.5 w-3.5 text-pink-500" />;
    case 'spacer':
      return <ArrowUpDownIcon className="h-3.5 w-3.5 text-gray-400" />;
    case 'divider':
      return <MinusIcon className="h-3.5 w-3.5 text-gray-400" />;
    case 'page-break':
      return <ScissorsIcon className="h-3.5 w-3.5 text-rose-500" />;
  }
}

interface LayerItemProps {
  node: DocNode;
  depth: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<DocNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddChild?: (parentId: string, type: DocNodeType) => void;
}

function LayerItem({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onAddChild,
}: LayerItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isContainer = isContainerNode(node);
  const isSelected = selectedNodeId === node.id;
  const children = isContainer ? node.children : [];

  const displayName =
    node.name ||
    (node.type === 'text' && (node as any).content
      ? `"${(node as any).content.slice(0, 14)}..."`
      : `${node.type}`);

  return (
    <div className="flex flex-col select-none">
      <div
        className={`group flex items-center justify-between py-1 px-1.5 rounded-md text-xs cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary/15 text-primary font-medium border-l-2 border-primary'
            : 'hover:bg-muted/50 text-foreground/80'
        } ${node.hidden ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode(node.id);
        }}
      >
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          {/* Container chevron */}
          {isContainer ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {expanded ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Node Icon */}
          <span className="shrink-0">{getNodeIcon(node.type)}</span>

          {/* Node Label */}
          <span className="truncate text-[11px]">{displayName}</span>

          {node.locked && <LockIcon className="h-2.5 w-2.5 text-amber-500 shrink-0 ml-1" />}
        </div>

        {/* Hover Action Buttons */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
          {isContainer && onAddChild && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  title="Add child primitive"
                >
                  <PlusIcon className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'text')}>
                  <TypeIcon className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                  Text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'box')}>
                  <SquareIcon className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
                  Box
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'row')}>
                  <ColumnsIcon className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  Row
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'column')}>
                  <RowsIcon className="mr-1.5 h-3.5 w-3.5 text-purple-500" />
                  Column
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'icon')}>
                  <SmileIcon className="mr-1.5 h-3.5 w-3.5 text-cyan-500" />
                  Icon
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'divider')}>
                  <MinusIcon className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
                  Divider
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node.id, 'spacer')}>
                  <ArrowUpDownIcon className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
                  Spacer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateNode(node.id, { hidden: !node.hidden });
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            title={node.hidden ? 'Unhide' : 'Hide'}
          >
            {node.hidden ? <EyeOffIcon className="h-3 w-3" /> : <EyeIcon className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode(node.id);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive cursor-pointer"
            title="Delete"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Render children if container and expanded */}
      {isContainer && expanded && children.length > 0 && (
        <div className="flex flex-col">
          {children.map((child) => (
            <LayerItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentLayersTree({
  nodes,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onAddChild,
  onClose,
}: DocumentLayersTreeProps) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border/70 bg-card/60 backdrop-blur-xs text-card-foreground select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5 bg-muted/20">
        <div className="flex items-center gap-1.5">
          <LayersIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Document Layers</span>
        </div>

        <div className="flex items-center gap-1">
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClose}
              title="Close layers panel"
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto p-2">
        {nodes.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center text-muted-foreground">
            <p className="text-xs">No elements in document</p>
          </div>
        ) : (
          nodes.map((node) => (
            <LayerItem
              key={node.id}
              node={node}
              depth={0}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              onAddChild={onAddChild}
            />
          ))
        )}
      </div>
    </div>
  );
}
