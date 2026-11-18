# Workspace Markdown Rendering & Inline Editors

## Overview

The Notebook Workspace supports two modes over the same block document:

- **Reading view (default)** — blocks are rendered as formatted markdown:
  headings, emphasis, links, syntax-highlighted code, images, and real HTML
  tables. Every page opens in this mode.
- **Edit mode** — each block is edited in place. Simple text blocks use the
  auto-sizing textarea-style row editor; complex blocks (tables, images, code)
  get specialized fields.

Markdown remains the source of truth. Rendering is an additive layer; no new
block metadata is persisted.

## Block model

`src/lib/markdown-blocks.ts` is a pure, dependency-free codec between markdown
and typed blocks.

| Block type | Stored `text` | Extra |
| --- | --- | --- |
| `paragraph`, `heading1-3` | inline markdown | — |
| `bulleted-list`, `numbered-list` | item text | — |
| `todo` | item text | `checked` |
| `quote` | quoted text | — |
| `code` | code body | `language` |
| `image` | `![alt](url)` | — |
| `table` | the whole pipe table | — |
| `divider` | empty | — |

### Tables

A table block's `text` holds canonical pipe-table markdown, for example:

```markdown
| Audience | Angle |
| --- | --- |
| Developers | Craft |
| Clients | Proof |
```

`parseMarkdownToBlocks` recognises a header row followed by a delimiter row
(`| --- | :---: |`) and consumes the contiguous body rows into one block.
`serializeBlocksToMarkdown` writes the block text back verbatim, so
parse → serialize is stable and existing page storage, IPC validation, FTS,
version history and backlink extraction keep working unchanged.

Helpers: `parseTableMarkdown`, `serializeTableMarkdown`,
`emptyTableMarkdown`, `formatImageMarkdown`.

## Rendering layer

`src/components/workspace/renderers/`

- `BlockRenderer.tsx` — dispatches by block type.
- `ParagraphRenderer.tsx`, `HeadingRenderer.tsx`, `QuoteRenderer.tsx` — inline
  markdown in semantic tags.
- `ListRenderer.tsx` — marker plus item; numbered rows receive their position
  from the editor so numbering survives reading view.
- `TodoRenderer.tsx` — checkbox state and strikethrough.
- `CodeRenderer.tsx` — Shiki highlighting with a plain `<pre>` fallback and a
  copy button.
- `ImageRenderer.tsx` — image with alt caption and a load-error fallback.
- `TableRenderer.tsx` — real `<table>` with a horizontal scroll container.
- `DividerRenderer.tsx` — horizontal rule.

Inline parsing lives in `src/lib/inline-markdown.tsx` and supports `**bold**`,
`*italic*`, `` `code` ``, `[links](url)`, `[[wiki links]]` /
`[[page|alias]]`, nesting and backslash escapes. Links with unsafe URL schemes
are rendered as text.

## Specialized inline editors

`src/components/workspace/editors/`

- `TableBlockEditor.tsx` — a grid of inputs for headers and cells, with add /
  remove row and column controls. Every edit re-serialises the block to pipe
  markdown, so the table is always saved in the portable format.
- `ImageBlockEditor.tsx` — separate alt-text and URL fields with a live
  preview; the block is only rewritten once the URL is non-empty.

Simple element-specific fields remain in `BlockEditor.tsx`: the todo checkbox,
the code language input, and list markers.

## Reading view / edit mode

- `src/renderer/pages/Workspace.tsx` starts every page in reading view and
  resets to it when the page changes; edit mode is an explicit choice.
- The page header shows a labelled, primary **Edit** button (pencil icon) in
  reading view and **Done** in edit mode, so the current mode is always visible.
- In reading view, the editing toolbar is replaced by a short reading bar that
  says clicking a block starts editing.
- Clicking a block switches to edit mode and focuses that block. Clicks on
  links or buttons inside a block are left to those controls.
- The reading view is a view mode only: block ids, text and metadata are
  untouched, and autosave is not triggered by switching modes.

## Editor sizing

- The block column uses the full width available in the centre pane up to
  `max-w-5xl`.
- Row textareas use `field-sizing: content`, so a paragraph that wraps to more
  lines grows with its content instead of keeping a fixed one-row height and
  scrolling internally.

## Adding another block type

1. Extend `BlockType` / `BLOCK_TYPES` and `classify` / `serializeBlock`.
2. Add any grid helpers (as done for tables) to `markdown-blocks.ts`.
3. Add a renderer and, if the plain textarea is not appropriate, an editor.
4. Wire both into `BlockRenderer` and `BlockEditor`.
5. Cover the parse/serialize round trip in
   `src/__tests__/markdown-blocks.test.ts`.

## Known limits

- Wiki links render as styled internal references; resolving them to a page
  needs notebook context the inline renderer does not receive.
- Tables have one header row, no cell alignment (alignment markers are
  preserved in the raw text but not applied), and no cell-level rich editor.
- Code highlighting uses the Shiki `github-dark` theme regardless of app theme.
- Nested lists are not represented; indentation cycles headings today.
