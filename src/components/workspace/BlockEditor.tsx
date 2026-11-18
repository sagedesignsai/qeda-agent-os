/**
 * components/workspace/BlockEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The block editor: a custom markdown-backed editor where every block is a
 * typed row (paragraph, headings, lists, todo, quote, code, divider).
 *
 * Pages open in a reading view that renders markdown. Editing is opt-in; in
 * edit mode each block renders a textarea styled to look like rich text, and
 * markdown markers are typed literally and re-classified on change, which keeps
 * the model honest and the implementation dependency-free.
 *
 * Keyboard:
 *   Enter          – split block (todo/list rows continue their type)
 *   Backspace      – empty row switches to paragraph, then merges up
 *   Tab/Shift+Tab  – cycle heading ↔ paragraph
 *   Alt+↑/↓        – move block
 *   "/" at row start – slash menu with block types
 *
 * Saves are debounced and go through IPC 'pages:save-blocks'.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  updateBlock,
  insertBlockAfter,
  removeBlock,
  splitBlock,
  indentBlock,
  moveBlock,
  setBlockType,
  newBlockId,
  extractDocTags,
  parseImageMarkdown,
  isBlockLevelMarkdown,
  insertParsedBlocksAt,
  emptyTableMarkdown,
  normalizeBlocks,
  type Block,
  type BlockType,
} from '../../lib/markdown-blocks';
import { BlockRenderer } from './renderers/BlockRenderer';
import { TableBlockEditor } from './editors/TableBlockEditor';
import { ImageBlockEditor } from './editors/ImageBlockEditor';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  CheckSquareIcon,
  QuoteIcon,
  CodeIcon,
  ImageIcon,
  MinusIcon,
  TypeIcon,
  ChevronDownIcon,
  LoaderIcon,
  RefreshCwIcon,
  CheckIcon,
  PlusIcon,
  MoreHorizontalIcon,
  TableIcon,
  EyeIcon,
  CopyIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePages } from '@/hooks/use-workspace';

const BLOCK_TYPE_ITEMS: {
  type: BlockType;
  label: string;
  icon: typeof TypeIcon;
  marker: string;
}[] = [
  { type: 'paragraph', label: 'Text', icon: TypeIcon, marker: '' },
  { type: 'heading1', label: 'Heading 1', icon: Heading1Icon, marker: '# ' },
  { type: 'heading2', label: 'Heading 2', icon: Heading2Icon, marker: '## ' },
  { type: 'heading3', label: 'Heading 3', icon: Heading3Icon, marker: '### ' },
  {
    type: 'bulleted-list',
    label: 'Bulleted list',
    icon: ListIcon,
    marker: '- ',
  },
  {
    type: 'numbered-list',
    label: 'Numbered list',
    icon: ListOrderedIcon,
    marker: '1. ',
  },
  { type: 'todo', label: 'To-do', icon: CheckSquareIcon, marker: '- [ ] ' },
  { type: 'quote', label: 'Quote', icon: QuoteIcon, marker: '> ' },
  { type: 'code', label: 'Code', icon: CodeIcon, marker: '```' },
  { type: 'image', label: 'Image', icon: ImageIcon, marker: '![' },
  { type: 'table', label: 'Table', icon: TableIcon, marker: '| ' },
  { type: 'divider', label: 'Divider', icon: MinusIcon, marker: '---' },
];

interface BlockEditorProps {
  pageId: string;
  notebookId?: string | null;
  title: string;
  initialBlocks: Block[];
  onTitleChange?: (title: string) => void;
  onSaved?: () => void;
  previewMode?: boolean;
  onPreviewModeChange?: (mode: boolean) => void;
}

const SAVE_DEBOUNCE_MS = 800;

export function BlockEditor({
  pageId,
  notebookId,
  title,
  initialBlocks,
  onTitleChange,
  onSaved,
  previewMode = false,
  onPreviewModeChange,
}: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() =>
    normalizeBlocks(initialBlocks),
  );
  const [localTitle, setLocalTitle] = useState(title);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedBlockRef = useRef<string | null>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  /** Block to focus after leaving preview mode via a click. */
  const pendingFocusRef = useRef<string | null>(null);

  // ── [[ wiki-link autocomplete ─────────────────────────────────────────
  const { pages: notebookPages } = usePages(notebookId ?? null);
  const [linkComposer, setLinkComposer] = useState<{
    isOpen: boolean;
    blockId: string;
    triggerPos: number; // index of the first '[' of '[['
    query: string;
    suggestions: { id: string; title: string }[];
    selectedIndex: number;
  } | null>(null);

  const closeLinkComposer = () => setLinkComposer(null);

  // Re-bind when switching pages. Legacy table rows are folded into a table
  // block here as well, so the renderer never sees a half-table.
  useEffect(() => {
    setBlocks(normalizeBlocks(initialBlocks));
    setLocalTitle(title);
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced save ──────────────────────────────────────────────────────

  const scheduleSave = useMemo(
    () => (nextBlocks: Block[], nextTitle: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(() => {
        window.electron.ipc
          .invoke('pages:save-blocks', {
            id: pageId,
            blocks: nextBlocks,
            title: nextTitle,
          })
          .then(() => {
            setSaveState('saved');
            setSaveError(null);
            setLastSavedAt(new Date());
            onSaved?.();
            setTimeout(() => setSaveState('idle'), 1500);
          })
          .catch((err) => {
            setSaveState('error');
            setSaveError(err instanceof Error ? err.message : 'Save failed.');
          });
      }, SAVE_DEBOUNCE_MS);
    },
    [pageId, onSaved],
  );

  /** Re-attempt the pending save (used after a failure). */
  const retrySave = () => {
    if (saveState === 'saving') return;
    setSaveState('saving');
    setSaveError(null);
    void window.electron.ipc
      .invoke('pages:save-blocks', {
        id: pageId,
        blocks,
        title: localTitle,
      })
      .then(() => {
        setSaveState('saved');
        setSaveError(null);
        setLastSavedAt(new Date());
        onSaved?.();
        setTimeout(() => setSaveState('idle'), 1500);
      })
      .catch((err) => {
        setSaveState('error');
        setSaveError(err instanceof Error ? err.message : 'Save failed.');
      });
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // A click in preview mode switches back to editing and focuses the block
  // that was clicked. The textareas only exist after the mode prop flips.
  useEffect(() => {
    if (previewMode) return;
    const id = pendingFocusRef.current;
    if (!id) return;
    pendingFocusRef.current = null;
    requestAnimationFrame(() => {
      textareaRefs.current.get(id)?.focus();
    });
  }, [previewMode]);

  // ── Mutations ───────────────────────────────────────────────────────────

  const applyBlocks = (next: Block[]) => {
    setBlocks(next);
    scheduleSave(next, localTitle);
  };

  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    onTitleChange?.(value);
    scheduleSave(blocks, value);
  };

  const handleTextChange = (id: string, text: string) => {
    // Re-classify markdown markers typed at the start of a paragraph.
    let next = blocks;
    const block = blocks.find((b) => b.id === id);
    if (block?.type === 'paragraph') {
      if (text.startsWith('# ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(2) }),
          id,
          'heading1',
        );
      } else if (text.startsWith('## ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(3) }),
          id,
          'heading2',
        );
      } else if (text.startsWith('### ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(4) }),
          id,
          'heading3',
        );
      } else if (text.startsWith('- [ ] ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(6), checked: false }),
          id,
          'todo',
        );
      } else if (text.startsWith('- ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(2) }),
          id,
          'bulleted-list',
        );
      } else if (text.startsWith('1. ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(3) }),
          id,
          'numbered-list',
        );
      } else if (text.startsWith('> ')) {
        next = setBlockType(
          updateBlock(blocks, id, { text: text.slice(2) }),
          id,
          'quote',
        );
      } else if (text === '---') {
        next = setBlockType(
          updateBlock(blocks, id, { text: '' }),
          id,
          'divider',
        );
        const after = insertBlockAfter(next, id);
        next = after.blocks;
        focusBlock(after.id);
      } else if (text === '```') {
        next = setBlockType(updateBlock(blocks, id, { text: '' }), id, 'code');
      } else if (parseImageMarkdown(text)) {
        // A paragraph that has become exactly `![alt](url)` turns into an image.
        next = setBlockType(updateBlock(blocks, id, { text }), id, 'image');
      } else {
        next = updateBlock(blocks, id, { text });
      }
    } else {
      next = updateBlock(blocks, id, { text });
    }
    applyBlocks(next);

    // ── [[ wiki-link autocomplete detection ───────────────────────────
    const lastTrigger = text.lastIndexOf('[[');
    if (lastTrigger >= 0) {
      const afterTrigger = text.slice(lastTrigger + 2);
      const closing = afterTrigger.indexOf(']]');
      if (closing < 0) {
        // Unclosed [[ — offer page suggestions scoped to this notebook.
        const query = afterTrigger;
        const suggestions = notebookPages
          .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((p) => ({ id: p.id, title: p.title }));
        setLinkComposer({
          isOpen: true,
          blockId: id,
          triggerPos: lastTrigger,
          query,
          suggestions,
          selectedIndex: 0,
        });
        return;
      }
    }
    closeLinkComposer();
  };

  /** Insert the selected page as a [[Page Title]] wiki link at the trigger. */
  const handleLinkSelect = (pageId: string, pageTitle: string) => {
    if (!linkComposer) return;
    const block = blocks.find((b) => b.id === linkComposer.blockId);
    if (!block) return;
    const before = block.text.slice(0, linkComposer.triggerPos);
    const after = block.text.slice(
      linkComposer.triggerPos + 2 + linkComposer.query.length,
    );
    const next = updateBlock(blocks, linkComposer.blockId, {
      text: `${before}[[${pageTitle}]]${after}`,
    });
    applyBlocks(next);
    closeLinkComposer();
    focusBlock(
      linkComposer.blockId,
      linkComposer.triggerPos + 2 + pageTitle.length + 2,
    );
  };

  /** Create a new page with the query as its title and link to it. */
  const handleLinkCreate = async () => {
    if (!linkComposer) return;
    const title = linkComposer.query.trim();
    if (!title) return;
    try {
      const created = await window.electron.ipc.invoke<{ id: string }>(
        'pages:create',
        { title, notebookId: notebookId ?? undefined },
      );
      handleLinkSelect(created.id, title);
      toast.success(`Created page “${title}”.`);
    } catch {
      toast.error(`Failed to create page “${title}”.`);
    }
  };

  const handleToggleTodo = (id: string, checked: boolean) => {
    applyBlocks(updateBlock(blocks, id, { checked }));
  };

  /**
   * Paste markdown as real blocks. Multi-line (or block-level single-line)
   * text splits into typed rows at the caret; anything else falls through to
   * the browser's normal inline paste.
   */
  const handlePaste = (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
    id: string,
  ) => {
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === 'code') return;

    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (!isBlockLevelMarkdown(pasted)) return;

    const el = event.currentTarget;
    const result = insertParsedBlocksAt(
      blocks,
      id,
      pasted,
      el.selectionStart,
      el.selectionEnd,
    );
    if (!result) return;

    event.preventDefault();
    applyBlocks(result.blocks);
    focusBlock(result.focusId);
  };

  const duplicateBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const copy: Block = { ...blocks[index], id: newBlockId() };
    const next = blocks.slice();
    next.splice(index + 1, 0, copy);
    applyBlocks(next);
    focusBlock(copy.id);
  };

  const deleteBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    const next = removeBlock(blocks, id);
    applyBlocks(next);
    const fallback = next[Math.min(Math.max(index, 0), next.length - 1)];
    if (fallback) focusBlock(fallback.id);
  };

  const focusBlock = (id: string, caret?: number) => {
    requestAnimationFrame(() => {
      const el = textareaRefs.current.get(id);
      if (el) {
        el.focus();
        const pos = caret ?? el.value.length;
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    id: string,
  ) => {
    const el = event.currentTarget;

    // ── [[ composer keyboard nav ───────────────────────────────────────
    if (linkComposer && linkComposer.blockId === id) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLinkComposer();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setLinkComposer((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  (prev.selectedIndex + 1) % prev.suggestions.length,
              }
            : null,
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setLinkComposer((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  (prev.selectedIndex - 1 + prev.suggestions.length) %
                  prev.suggestions.length,
              }
            : null,
        );
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = linkComposer.suggestions[linkComposer.selectedIndex];
        if (selected) {
          handleLinkSelect(selected.id, selected.title);
        } else if (linkComposer.query.trim()) {
          void handleLinkCreate();
        }
        return;
      }
    }

    // Slash menu shortcut hint is handled by typing "/" — the menu is a
    // lightweight dropdown rendered below the block toolbar.

    if (event.key === 'Enter' && !event.shiftKey) {
      if (
        el.tagName === 'TEXTAREA' &&
        blocks.find((b) => b.id === id)?.type === 'code'
      ) {
        return; // allow newlines inside code
      }
      event.preventDefault();
      const { blocks: next, newId } = splitBlock(blocks, id);
      applyBlocks(next);
      focusBlock(newId);
      return;
    }

    if (
      event.key === 'Backspace' &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0
    ) {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      const index = blocks.findIndex((b) => b.id === id);
      if (block.type !== 'paragraph' && block.text === '') {
        event.preventDefault();
        // Code blocks are structural — never collapse them to a paragraph on
        // backspace; just delete the row instead so the fence doesn't survive.
        if (block.type === 'code') {
          const index = blocks.findIndex((b) => b.id === id);
          const next = removeBlock(blocks, id);
          applyBlocks(next);
          const fallback = next[Math.min(Math.max(index, 0), next.length - 1)];
          if (fallback) focusBlock(fallback.id);
          return;
        }
        applyBlocks(setBlockType(blocks, id, 'paragraph'));
        return;
      }
      if (index > 0) {
        const prev = blocks[index - 1];
        // An empty row just disappears.
        if (block.text === '') {
          event.preventDefault();
          applyBlocks(removeBlock(blocks, id));
          focusBlock(prev.id);
          return;
        }
        // Otherwise merge this row into the previous one, landing the caret at
        // the seam. Code rows are structural, so they never merge.
        if (block.type !== 'code' && prev.type !== 'code') {
          event.preventDefault();
          const caret = prev.text.length;
          const withoutCurrent = removeBlock(blocks, id);
          applyBlocks(
            updateBlock(withoutCurrent, prev.id, {
              text: prev.text + block.text,
            }),
          );
          focusBlock(prev.id, caret);
          return;
        }
      }
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      applyBlocks(indentBlock(blocks, id, event.shiftKey ? -1 : 1));
      return;
    }

    if (
      event.altKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      applyBlocks(moveBlock(blocks, id, event.key === 'ArrowUp' ? -1 : 1));
      return;
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────

  const registerRef = (id: string) => (el: HTMLTextAreaElement | null) => {
    if (el) textareaRefs.current.set(id, el);
    else textareaRefs.current.delete(id);
  };

  /** Leave preview mode and put the caret in the clicked block. */
  const editBlockFromPreview = (id: string) => {
    pendingFocusRef.current = id;
    onPreviewModeChange?.(false);
  };

  const renderBlock = (block: Block, index: number) => {
    // In preview mode, use BlockRenderer instead of textarea.
    if (previewMode) {
      return (
        <div
          key={block.id}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${block.type} block`}
          className={cn(
            'group relative -mx-2 cursor-text rounded-md px-2 py-0.5',
            'transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          onClick={(event) => {
            // Links, copy buttons and other controls keep their own behaviour.
            if (
              (event.target as HTMLElement).closest(
                'button, a, input, textarea',
              )
            ) {
              return;
            }
            editBlockFromPreview(block.id);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              editBlockFromPreview(block.id);
            }
          }}
          title="Click to edit"
        >
          <BlockRenderer
            block={block}
            listNumber={listNumberFor(blocks, index)}
          />
        </div>
      );
    }

    // Edit mode: render textareas as before
    const common = {
      ref: registerRef(block.id),
      value: block.text,
      'aria-label': `${block.type} block`,
      onFocus: () => {
        focusedBlockRef.current = block.id;
        setFocusedId(block.id);
      },
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        handleTextChange(block.id, e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) =>
        handleKeyDown(e, block.id),
      onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) =>
        handlePaste(e, block.id),
      rows: Math.max(1, block.text.split('\n').length),
      spellCheck: false,
      className:
        'field-sizing-content w-full resize-none bg-transparent outline-none',
    };

    return (
      <div
        key={block.id}
        className={cn(
          'group relative -mx-2 flex items-start gap-1 rounded-md px-2 py-0.5 transition-colors',
          'hover:bg-accent/40 focus-within:bg-accent/30',
        )}
      >
        {/* Accent marks the row the caret is in, so the active block is obvious
            in a long page. */}
        {focusedId === block.id && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary/60"
          />
        )}

        {/* Row controls — revealed on hover OR when the row has keyboard focus,
            so they are reachable without a mouse. */}
        <div className="flex h-7 w-10 shrink-0 items-center justify-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Block options"
              >
                <MoreHorizontalIcon className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {BLOCK_TYPE_ITEMS.map(({ type, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={type}
                  onSelect={() => {
                    applyBlocks(setBlockType(blocks, block.id, type));
                    focusBlock(block.id);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => duplicateBlock(block.id)}>
                <CopyIcon className="h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => deleteBlock(block.id)}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="min-w-0 flex-1">
          {block.type === 'heading1' && (
            <textarea
              {...common}
              rows={1}
              placeholder="Heading 1"
              className={cn(
                common.className,
                'text-xl font-bold tracking-tight',
              )}
            />
          )}
          {block.type === 'heading2' && (
            <textarea
              {...common}
              rows={1}
              placeholder="Heading 2"
              className={cn(
                common.className,
                'text-lg font-bold tracking-tight',
              )}
            />
          )}
          {block.type === 'heading3' && (
            <textarea
              {...common}
              rows={1}
              placeholder="Heading 3"
              className={cn(common.className, 'text-base font-semibold')}
            />
          )}
          {block.type === 'paragraph' && (
            <textarea
              {...common}
              placeholder={
                index === 0
                  ? 'Write, press "/" for blocks…'
                  : "Type '/' for blocks"
              }
              className={cn(common.className, 'py-0.5 leading-7')}
            />
          )}
          {block.type === 'quote' && (
            <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
              <textarea
                {...common}
                placeholder="Quote"
                className={cn(common.className, 'italic')}
              />
            </blockquote>
          )}
          {block.type === 'todo' && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={Boolean(block.checked)}
                onChange={(e) => handleToggleTodo(block.id, e.target.checked)}
                className="mt-2 h-3.5 w-3.5 accent-primary"
                aria-label="Toggle todo"
              />
              <textarea
                {...common}
                className={cn(
                  common.className,
                  block.checked ? 'text-muted-foreground line-through' : '',
                )}
              />
            </div>
          )}
          {(block.type === 'bulleted-list' ||
            block.type === 'numbered-list') && (
            <div className="flex items-start gap-2">
              <span className="mt-2 select-none text-muted-foreground">
                {block.type === 'bulleted-list'
                  ? '•'
                  : `${listNumberFor(blocks, index)}.`}
              </span>
              <textarea {...common} className={common.className} />
            </div>
          )}
          {block.type === 'code' && (
            <div className="overflow-hidden rounded-md border bg-muted/40">
              <div className="flex items-center justify-between border-b bg-muted/60 px-2 py-1">
                <input
                  value={block.language ?? ''}
                  onChange={(e) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, {
                        language: e.target.value,
                      }),
                    )
                  }
                  placeholder="language"
                  className="w-24 bg-transparent text-[10px] font-mono uppercase text-muted-foreground outline-none"
                  aria-label="Code language"
                />
              </div>
              <textarea
                {...common}
                rows={Math.max(2, block.text.split('\n').length)}
                placeholder="Type code…"
                className={cn(
                  common.className,
                  'px-3 py-2 font-mono text-xs',
                  !block.text && 'min-h-[4rem] text-muted-foreground',
                )}
              />
            </div>
          )}
          {block.type === 'image' && (
            <ImageBlockEditor
              block={block}
              onChange={(text) =>
                applyBlocks(updateBlock(blocks, block.id, { text }))
              }
            />
          )}
          {block.type === 'table' && (
            <TableBlockEditor
              block={block}
              onChange={(text) =>
                applyBlocks(updateBlock(blocks, block.id, { text }))
              }
            />
          )}
          {block.type === 'divider' && <hr className="my-2 border-border" />}
        </div>
      </div>
    );
  };

  const tags = extractDocTags(blocks);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Title + save state */}
      <div className="shrink-0 px-8 pt-6">
        <Input
          value={localTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="border-none bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
          placeholder="Untitled"
          aria-label="Page title"
        />
        <div className="flex items-center gap-2 pb-3 pt-1 text-xs text-muted-foreground">
          {tags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                >
                  #{tag}
                </span>
              ))}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {saveState === 'saving' && (
              <>
                <LoaderIcon className="h-3 w-3 animate-spin" /> Saving…
              </>
            )}
            {saveState === 'saved' && (
              <>
                <CheckIcon className="h-3 w-3 text-green-500" /> Saved
                {lastSavedAt && (
                  <span className="text-muted-foreground">
                    · {formatSaveTime(lastSavedAt)}
                  </span>
                )}
              </>
            )}
            {saveState === 'error' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={retrySave}
                className="h-6 px-1.5 text-[10px]"
                title={saveError ?? 'Save failed.'}
                aria-label="Retry save"
              >
                <RefreshCwIcon className="h-3 w-3" /> Retry
              </Button>
            )}
          </span>
        </div>
      </div>

      {/* Toolbar — editing controls are meaningless while previewing. */}
      {previewMode ? (
        <div className="flex shrink-0 items-center gap-3 border-y bg-card/20 px-4 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <EyeIcon className="h-3.5 w-3.5" />
            Reading view — click any block to edit it.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => onPreviewModeChange?.(false)}
          >
            Edit page
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y bg-card/20 px-4 py-1.5">
          {/* Block type buttons */}
          <div className="flex items-center gap-0.5 border-r border-border pr-1">
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'heading1' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'heading1'),
                  );
                }
              }}
              title="Heading 1"
            >
              <Heading1Icon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'heading2' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'heading2'),
                  );
                }
              }}
              title="Heading 2"
            >
              <Heading2Icon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'heading3' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'heading3'),
                  );
                }
              }}
              title="Heading 3"
            >
              <Heading3Icon className="h-4 w-4" />
            </Button>
          </div>

          {/* List and formatting buttons */}
          <div className="flex items-center gap-0.5 border-r border-border pr-1">
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'bulleted-list' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(
                      blocks,
                      focusedBlockRef.current,
                      'bulleted-list',
                    ),
                  );
                }
              }}
              title="Bulleted list"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'numbered-list' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(
                      blocks,
                      focusedBlockRef.current,
                      'numbered-list',
                    ),
                  );
                }
              }}
              title="Numbered list"
            >
              <ListOrderedIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'todo' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'todo'),
                  );
                }
              }}
              title="To-do"
            >
              <CheckSquareIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Quote, code, and other blocks */}
          <div className="flex items-center gap-0.5 border-r border-border pr-1">
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'quote' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'quote'),
                  );
                }
              }}
              title="Quote"
            >
              <QuoteIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'code' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'code'),
                  );
                }
              }}
              title="Code block"
            >
              <CodeIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'image' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'image'),
                  );
                }
              }}
              title="Image"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'table' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'table'),
                  );
                }
              }}
              title="Table"
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={
                blocks.some(
                  (b) =>
                    b.type === 'divider' &&
                    b === blocks.find((b) => b.id === focusedId),
                )
                  ? 'secondary'
                  : 'ghost'
              }
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (focusedBlockRef.current) {
                  applyBlocks(
                    setBlockType(blocks, focusedBlockRef.current, 'divider'),
                  );
                }
              }}
              title="Divider"
            >
              <MinusIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Add block button */}
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  title="Add new block"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {BLOCK_TYPE_ITEMS.filter(
                  (item) => item.type !== 'paragraph',
                ).map(({ type, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() => {
                      const { blocks: next, id } = insertBlockAfter(
                        blocks,
                        focusedBlockRef.current,
                        {
                          id: newBlockId(),
                          type,
                          text: type === 'table' ? emptyTableMarkdown() : '',
                        },
                      );
                      applyBlocks(next);
                      focusBlock(id);
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
            {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
          </span>
        </div>
      )}

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        <div className="mx-auto max-w-5xl space-y-0.5 pb-24">
          {blocks.map(renderBlock)}
        </div>
      </div>
    </div>
  );
}

/** 1-based number for the numbered-list row at `index`. */
function listNumberFor(blocks: Block[], index: number): number {
  let n = 1;
  for (let i = 0; i < index; i += 1) {
    if (blocks[i].type === 'numbered-list') n += 1;
    else if (blocks[i].type !== 'bulleted-list' && blocks[i].type !== 'todo')
      n = 1;
  }
  return n;
}

/** Format a save timestamp as a short relative label (e.g. "2m ago"). */
function formatSaveTime(at: Date): string {
  const seconds = (Date.now() - at.getTime()) / 1000;
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
