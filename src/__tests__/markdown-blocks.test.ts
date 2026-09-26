import {
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
  updateBlock,
  insertBlockAfter,
  removeBlock,
  splitBlock,
  indentBlock,
  moveBlock,
  setBlockType,
  extractLinks,
  extractTags,
  extractOutline,
  extractDocLinks,
  extractDocTags,
  parseImageMarkdown,
  isBlockLevelMarkdown,
  insertParsedBlocksAt,
} from '../main/../lib/markdown-blocks';

describe('parseMarkdownToBlocks', () => {
  it('parses headings, lists, todos, quotes, code and dividers', () => {
    const blocks = parseMarkdownToBlocks(
      [
        '# Title',
        '',
        'A paragraph.',
        '',
        '- bullet one',
        '- bullet two',
        '',
        '1. first',
        '',
        '- [ ] open todo',
        '- [x] done todo',
        '',
        '> quoted line',
        '',
        '---',
        '',
        '```ts',
        'const x = 1;',
        '```',
      ].join('\n'),
    );

    expect(blocks.map((b) => b.type)).toEqual([
      'heading1',
      'paragraph',
      'bulleted-list',
      'bulleted-list',
      'numbered-list',
      'todo',
      'todo',
      'quote',
      'divider',
      'code',
    ]);
    expect(blocks[0].text).toBe('Title');
    expect(blocks[5].checked).toBe(false);
    expect(blocks[6].checked).toBe(true);
    expect(blocks[9].text).toBe('const x = 1;');
    expect(blocks[9].language).toBe('ts');
  });

  it('keeps markdown-looking lines inside code fences as code', () => {
    const blocks = parseMarkdownToBlocks('```\n# not a heading\n> not a quote\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].text).toBe('# not a heading\n> not a quote');
  });

  it('always returns at least one block', () => {
    expect(parseMarkdownToBlocks('')).toHaveLength(1);
  });

  it('normalises CRLF line endings', () => {
    const blocks = parseMarkdownToBlocks('# A\r\n\r\nB\r');
    expect(blocks.map((b) => b.text)).toEqual(['A', 'B']);
  });
});

describe('serializeBlocksToMarkdown round trip', () => {
  it('round-trips documents stably', () => {
    const doc = [
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '- a',
      '- b',
      '',
      '1. one',
      '',
      '- [ ] todo',
      '',
      '> quote',
      '',
      '---',
      '',
      '```js',
      'let x = 2;',
      '```',
    ].join('\n');

    const once = serializeBlocksToMarkdown(parseMarkdownToBlocks(doc));
    const twice = serializeBlocksToMarkdown(parseMarkdownToBlocks(once));
    expect(twice).toBe(once);
  });

  it('keeps adjacent list items contiguous', () => {
    const blocks = parseMarkdownToBlocks('- a\n- b\n- c');
    const md = serializeBlocksToMarkdown(blocks);
    expect(md).toBe('- a\n- b\n- c');
  });
});

describe('block transforms', () => {
  const doc = parseMarkdownToBlocks('# H\n\nA\n\nB');

  it('updateBlock patches only the target', () => {
    const next = updateBlock(doc, doc[1].id, { text: 'A2' });
    expect(next[1].text).toBe('A2');
    expect(next[0].text).toBe('H');
  });

  it('insertBlockAfter inserts and returns the new id', () => {
    const { blocks, id } = insertBlockAfter(doc, doc[1].id);
    expect(blocks[2].id).toBe(id);
    expect(blocks[2].type).toBe('paragraph');
  });

  it('removeBlock never leaves an empty document', () => {
    const only = parseMarkdownToBlocks('only');
    const next = removeBlock(only, only[0].id);
    expect(next).toHaveLength(1);
  });

  it('splitBlock continues todo and list types', () => {
    const todos = parseMarkdownToBlocks('- [ ] task');
    const { blocks, newId } = splitBlock(todos, todos[0].id);
    const fresh = blocks.find((b) => b.id === newId);
    expect(fresh?.type).toBe('todo');

    const numbered = parseMarkdownToBlocks('1. item');
    const split2 = splitBlock(numbered, numbered[0].id);
    expect(split2.blocks[1].type).toBe('numbered-list');
  });

  it('indentBlock cycles paragraph ↔ h3 ↔ h2 ↔ h1', () => {
    const paras = parseMarkdownToBlocks('text');
    const h3 = indentBlock(paras, paras[0].id, 1);
    expect(h3[0].type).toBe('heading3');
    const h2 = indentBlock(h3, h3[0].id, 1);
    expect(h2[0].type).toBe('heading2');
    const h1 = indentBlock(h2, h2[0].id, 1);
    expect(h1[0].type).toBe('heading1');
    const back = indentBlock(h1, h1[0].id, -1);
    expect(back[0].type).toBe('heading2');
  });

  it('moveBlock moves a row and clamps at the edges', () => {
    const moved = moveBlock(doc, doc[2].id, -1);
    expect(moved[1].text).toBe('B');
    expect(moveBlock(doc, doc[0].id, -1)).toEqual(doc);
  });

  it('setBlockType seeds todo checked state', () => {
    const next = setBlockType(doc, doc[1].id, 'todo');
    expect(next[1].checked).toBe(false);
  });
});

describe('link and tag extraction', () => {
  it('extracts markdown links and classifies them', () => {
    const links = extractLinks('See [docs](https://example.com) and [note](doc:abc-123).');
    expect(links).toEqual([
      { label: 'docs', target: 'https://example.com', kind: 'web' },
      { label: 'note', target: 'doc:abc-123', kind: 'doc' },
    ]);
  });

  it('extracts wiki links', () => {
    const links = extractLinks('Link to [[Meeting Notes]] and [[Page|alias]].');
    expect(links.map((l) => l.target)).toEqual(['wiki:Meeting Notes', 'wiki:Page']);
    expect(links[1].label).toBe('alias');
  });

  it('extracts tags without heading anchors', () => {
    expect(extractTags('value #alpha and #beta/gamma but not # heading')).toEqual([
      'alpha',
      'beta/gamma',
    ]);
  });

  it('extracts outline, doc links and doc tags from blocks', () => {
    const blocks = parseMarkdownToBlocks(
      ['# Plan', '', 'Research [x](https://x.example) #research', '', 'See [[Other Page]]'].join('\n'),
    );
    expect(extractOutline(blocks).map((h) => h.text)).toEqual(['Plan']);
    expect(extractDocLinks(blocks)).toHaveLength(2);
    expect(extractDocTags(blocks)).toEqual(['research']);
  });
});

describe('image blocks', () => {
  it('parses a standalone markdown image into an image block', () => {
    const blocks = parseMarkdownToBlocks('![A screenshot](https://img.example/a.png)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image');
    expect(blocks[0].text).toBe('![A screenshot](https://img.example/a.png)');
  });

  it('round-trips an image block through markdown', () => {
    const doc = '# Title\n\n![Cover](https://img.example/cover.jpg)\n\nAfter.';
    const once = serializeBlocksToMarkdown(parseMarkdownToBlocks(doc));
    expect(once).toContain('![Cover](https://img.example/cover.jpg)');
    expect(serializeBlocksToMarkdown(parseMarkdownToBlocks(once))).toBe(once);
  });

  it('parseImageMarkdown extracts alt and url, and rejects inline images', () => {
    expect(parseImageMarkdown('![Alt](https://x.example/y.png)')).toEqual({
      alt: 'Alt',
      url: 'https://x.example/y.png',
    });
    // An image embedded in a sentence is not a standalone image block.
    expect(parseImageMarkdown('see ![Alt](https://x.example/y.png) for more')).toBeNull();
    expect(parseMarkdownToBlocks('see ![Alt](https://x.example/y.png) for more')[0].type).toBe(
      'paragraph',
    );
  });

  it('does not treat image URLs as backlinks or tags', () => {
    const blocks = parseMarkdownToBlocks('![Cover](https://img.example/a.png)');
    expect(extractDocLinks(blocks)).toHaveLength(0);
    expect(extractDocTags(blocks)).toHaveLength(0);
  });
});

describe('markdown paste handling', () => {
  it('isBlockLevelMarkdown distinguishes block constructs from prose', () => {
    expect(isBlockLevelMarkdown('# Heading')).toBe(true);
    expect(isBlockLevelMarkdown('- item')).toBe(true);
    expect(isBlockLevelMarkdown('> quote')).toBe(true);
    expect(isBlockLevelMarkdown('```ts')).toBe(true);
    expect(isBlockLevelMarkdown('![a](https://x/y.png)')).toBe(true);
    expect(isBlockLevelMarkdown('line one\nline two')).toBe(true);

    expect(isBlockLevelMarkdown('just some prose')).toBe(false);
    expect(isBlockLevelMarkdown('https://example.com')).toBe(false);
    expect(isBlockLevelMarkdown('')).toBe(false);
    expect(isBlockLevelMarkdown('   ')).toBe(false);
  });

  it('replaces an empty paragraph with the pasted blocks', () => {
    const blocks = parseMarkdownToBlocks('');
    const result = insertParsedBlocksAt(blocks, blocks[0].id, '# Title\n\nBody', 0, 0);
    expect(result).not.toBeNull();
    expect(result!.blocks.map((b) => b.type)).toEqual(['heading1', 'paragraph']);
    expect(result!.blocks[0].text).toBe('Title');
    expect(result!.focusId).toBe(result!.blocks[0].id);
  });

  it('keeps text before the caret and inserts the blocks after it', () => {
    const blocks = parseMarkdownToBlocks('Intro: ');
    const startedAt = blocks[0].id;
    const result = insertParsedBlocksAt(blocks, startedAt, '## Section', 7, 7)!;
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({ id: startedAt, type: 'paragraph', text: 'Intro: ' });
    expect(result.blocks[1]).toMatchObject({ type: 'heading2', text: 'Section' });
  });

  it('rejoins trailing text as a paragraph when the paste ends in a block', () => {
    const blocks = parseMarkdownToBlocks('AB');
    const [first] = blocks;
    // Caret sits between A and B.
    const result = insertParsedBlocksAt(blocks, first.id, '# H', 1, 1)!;
    expect(result.blocks.map((b) => `${b.type}:${b.text}`)).toEqual([
      'paragraph:A',
      'heading1:H',
      'paragraph:B',
    ]);
  });

  it('folds trailing text into a trailing paragraph from the paste', () => {
    const blocks = parseMarkdownToBlocks('AB');
    const [first] = blocks;
    const result = insertParsedBlocksAt(blocks, first.id, '# H\n\nTail', 1, 1)!;
    expect(result.blocks[2]).toMatchObject({ type: 'paragraph', text: 'TailB' });
  });

  it('returns null for non-block pastes, code blocks and missing blocks', () => {
    const prose = parseMarkdownToBlocks('hello');
    expect(insertParsedBlocksAt(prose, prose[0].id, 'plain words', 5, 5)).toBeNull();

    const code = parseMarkdownToBlocks('```\nlet x = 1\n```');
    expect(insertParsedBlocksAt(code, code[0].id, '# H', 0, 0)).toBeNull();

    expect(insertParsedBlocksAt(prose, 'missing-id', '# H', 0, 0)).toBeNull();
  });

  it('gives inserted blocks fresh ids', () => {
    const blocks = parseMarkdownToBlocks('');
    const result = insertParsedBlocksAt(blocks, blocks[0].id, '# A\n\nB\n\nC', 0, 0)!;
    const ids = result.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(blocks[0].id);
  });
});
