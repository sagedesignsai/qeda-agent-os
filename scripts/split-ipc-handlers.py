#!/usr/bin/env python3
"""
One-shot refactor codemod: split src/main/ipc/handlers.ts into per-domain
modules under src/main/ipc/handlers/.

Handler bodies are copied BYTE-IDENTICALLY; only the banner, the import list and
the function wrapper are synthesised. Run from the repo root:

    python3 scripts/split-ipc-handlers.py

This is a migration aid, not part of the build. It is idempotent only in the
sense that it always reads the ORIGINAL handlers.ts — re-running after the file
has been replaced by ipc/index.ts will fail loudly rather than silently.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src/main/ipc/handlers.ts'
OUT = ROOT / 'src/main/ipc/handlers'
RULE = '─' * 76

lines = SRC.read_text().split('\n')

# ── locate the regions ────────────────────────────────────────────────────────
# 0-indexed. The agent runtime spans the doc comment above `const agentCache`
# through to the opening of registerIpcHandlers; PROLOGUE is 1-indexed inclusive.
IMPORT_END = next(i for i, l in enumerate(lines) if l.startswith('const agentCache'))
PROLOGUE = (IMPORT_END, next(i for i, l in enumerate(lines) if 'export function registerIpcHandlers' in l))


def rng(a, b):
    return lines[a - 1:b]


# ── parse the import block into (module, local_name, is_type) ────────────────
def parse_imports():
    text = '\n'.join(lines[:IMPORT_END])
    found, pos = [], 0
    pat_named = re.compile(r"import\s+(type\s+)?\{(.*?)\}\s+from\s+'([^']+)';", re.S)
    pat_default = re.compile(r"import\s+(\w+)\s+from\s+'([^']+)';")
    while pos < len(text):
        rest = text[pos:]
        if not rest.lstrip().startswith('import'):
            nl = rest.find('\n')
            pos = len(text) if nl == -1 else pos + nl + 1
            continue
        m = pat_named.match(rest)
        if m:
            all_type, body, mod = bool(m.group(1)), m.group(2), m.group(3)
            for part in body.split(','):
                part = part.strip()
                if not part:
                    continue
                is_type = part.startswith('type ') or all_type
                name = part[5:].strip() if part.startswith('type ') else part
                found.append((mod, name.split(' as ')[-1].strip(), is_type))
            pos += len(m.group(0))
            continue
        m = pat_default.match(rest)
        if m:
            found.append((m.group(2), m.group(1), False))
            pos += len(m.group(0))
            continue
        pos += 1
    return found


IMPORTS = parse_imports()

# ── per-module extras: the shared agent runtime ───────────────────────────────
EXTRA = {
    'settings':   [('resetAgents', '../agent-runtime')],
    'agent-chat': [('getAgent', '../agent-runtime'), ('detectMode', '../agent-runtime')],
}

TARGETS = [
    ('sessions', 'Sessions',
     'Chat session lifecycle and message persistence.',
     [(218, 263)]),
    ('settings', 'Settings',
     'Provider/model selection, fallback policy, and every encrypted API key.',
     [(264, 334), (335, 365), (366, 369)]),
    ('tools', 'Tools',
     'Tool listing and approval-gated direct execution from the Tools page.',
     [(370, 415)]),
    ('workspace', 'Workspace',
     'Notebooks, nested pages, and the block-editor save path.',
     [(416, 437), (438, 517)]),
    ('research', 'Research',
     'Deep-research run traces.',
     [(518, 529)]),
    ('agent-chat', 'Agent Chat',
     'The streaming chat agent turn.',
     [(530, 625)]),
    ('terminal', 'Terminal',
     'The agentic terminal: goal execution, command blocks, approvals.',
     [(626, 949)]),
    ('projects', 'Projects',
     'The productivity spine.',
     [(950, 1019)]),
    ('tasks', 'Tasks',
     'The focus manager: tasks, breakdown steps, time blocks, focus sessions.',
     [(1020, 1092), (1093, 1117), (1118, 1143), (1144, 1159)]),
    ('copilot', 'Copilot',
     'The focus copilot, in both its schema-validated and agent-with-tools forms.',
     [(1160, 1246), (1247, 1343)]),
]

# ── helpers ───────────────────────────────────────────────────────────────────
def strip_comments(src: str) -> str:
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', src)


def deepen(spec: str) -> str:
    """One directory deeper: './x' -> '../x', '../x' -> '../../x'."""
    if not spec.startswith('.'):
        return spec
    if spec.startswith('./'):
        return '../' + spec[2:]
    m = re.match(r'^(\.\./)+', spec)
    return '../' * (m.group(0).count('../') + 1) + spec[len(m.group(0)):]


def render_imports(used, slug, needs_window=False):
    by_mod = {}
    for mod, local, is_type in used:
        by_mod.setdefault(mod, []).append((local, is_type))
    out = []
    for mod in sorted(by_mod, key=lambda m: (m.startswith('.'), m)):
        names = {n for n, _ in by_mod[mod]}
        if mod == 'electron':
            # BrowserWindow is needed as a TYPE by the registrar signature
            # whenever the module takes the window, even if the body never
            # mentions it.
            if needs_window:
                names.add('BrowserWindow')
            items = [('type ' + n if n in ('IpcMainInvokeEvent', 'BrowserWindow') else n)
                     for n in ('ipcMain', 'dialog', 'shell', 'BrowserWindow', 'IpcMainInvokeEvent')
                     if n in names]
            out.append(f"import {{ {', '.join(items)} }} from 'electron';")
            continue
        items = sorted(f'type {n}' if t else n for n, t in by_mod[mod])
        inline = '{ ' + ', '.join(items) + ' }'
        spec = inline if len(inline) <= 68 else '{\n  ' + ',\n  '.join(items) + ',\n}'
        out.append(f"import {spec} from '{deepen(mod)}';")
    for name, mod in EXTRA.get(slug, []):
        out.append(f"import {{ {name} }} from '{mod}';")
    return out


def banner(slug, blurb):
    return (f"/**\n"
            f" * ipc/handlers/{slug}.ts\n"
            f" * {RULE}\n"
            f" * {blurb}\n"
            f" *\n"
            f" * Extracted verbatim from the former monolithic ipc/handlers.ts.\n"
            f" * Wired up by ipc/index.ts, which is the map of channel -> module.\n"
            f" * {RULE}\n"
            f" */")


def pascal(slug):
    return ''.join(w.capitalize() for w in slug.split('-'))


# ── integrity baseline ────────────────────────────────────────────────────────
def body_digest():
    h = hashlib.sha256()
    for _slug, _l, _b, ranges in TARGETS:
        for a, b in ranges:
            h.update(('\n'.join(rng(a, b))).encode())
    return h.hexdigest()


print(f'imports parsed : {len(IMPORTS)} symbols')
BEFORE = body_digest()
print(f'body sha256    : {BEFORE[:16]}…')
OUT.mkdir(parents=True, exist_ok=True)

plan = []
SEC_RE = re.compile(r'^\s*// ── .+ ─+\s*$')
for slug, label, blurb, ranges in TARGETS:
    body_lines = [l for a, b in ranges for l in rng(a, b)]
    # A single-section module's `// ── Name ──` marker just restates the banner,
    # so drop it (and the blank line after). Merged modules keep theirs, where
    # they still help navigate between the original sections.
    if len(ranges) == 1:
        while body_lines and (not body_lines[0].strip() or SEC_RE.match(body_lines[0])):
            body_lines.pop(0)
            if body_lines and not body_lines[0].strip():
                body_lines.pop(0)
                break
    body = strip_comments('\n'.join(body_lines))
    used = {(m, n, t) for m, n, t in IMPORTS if re.search(rf'\b{re.escape(n)}\b', body)}
    needs_window = 'mainWindow' in body
    fname = f'register{pascal(slug)}Handlers'
    text = '\n'.join(
        [banner(slug, blurb), ''] + render_imports(used, slug, needs_window) + ['']
        + [f'export function {fname}('
           + ('{ mainWindow }: { mainWindow: BrowserWindow }' if needs_window else '')
           + '): void {']
        + body_lines + ['}', '']
    )
    (OUT / f'{slug}.ts').write_text(text)
    plan.append((slug, fname, needs_window, sorted(n for _, n, _ in used)))
    print(f'  {slug:11} {fname:32} mainWindow={str(needs_window):5} '
          f'symbols={len(used):2} lines={len(body_lines)}')

# ── agent runtime, extracted from the prologue ────────────────────────────────
prologue = rng(*PROLOGUE)
prologue_src = '\n'.join(prologue)
# Only these three cross the module boundary. cacheKey/lastUserText stay private.
for fn in ('getAgent', 'resetAgents', 'detectMode'):
    prologue_src = prologue_src.replace(f'\nfunction {fn}(', f'\nexport function {fn}(')
    assert f'export function {fn}(' in prologue_src, f'failed to export {fn}'

RUNTIME_IMPORTS = '\n'.join([
    "import { type UIMessage } from 'ai';",
    "import { createDesktopAgent, type WorkspaceContext } from '../ai/agent';",
    "import { type ModelTarget } from '../ai/fallback';",
    "import { type ChatContext } from './channels';",
])
(ROOT / 'src/main/ipc/agent-runtime.ts').write_text(
    f"/**\n"
    f" * ipc/agent-runtime.ts\n"
    f" * {RULE}\n"
    f" * The cached chat agent and the pure helpers that go with it.\n"
    f" *\n"
    f" * WHY A SEPARATE MODULE: `agentCache` is the only mutable module-level\n"
    f" * state in the IPC layer. Settings must invalidate it when the user\n"
    f" * changes provider or model, and the chat handler must read from it, so\n"
    f" * both need access without importing each other.\n"
    f" *\n"
    f" * Deliberately NOT shared more widely: the terminal agent and the task\n"
    f" * copilot build their agents directly (ai/terminal-agent.ts,\n"
    f" * ai/task-copilot-agent.ts) and never touch this cache.\n"
    f" * {RULE}\n"
    f" */\n\n"
    + RUNTIME_IMPORTS + '\n\n'
    + prologue_src.strip() + '\n')

print(f'\nagent-runtime.ts: {len(prologue)} lines from handlers.ts:{PROLOGUE[0]}-{PROLOGUE[1]}')


# ── real integrity check: compare ORIGINAL bodies to what landed on disk ─────
# Normalisation drops comments and blank lines so the intentionally-stripped
# section markers do not register as drift, while any changed code line does.
def norm(src: str) -> list[str]:
    return [l.rstrip() for l in strip_comments(src).split('\n') if l.strip()]


def written_bodies() -> list[str]:
    out = []
    for slug, _l, _b, _r in TARGETS:
        text = (OUT / f'{slug}.ts').read_text()
        start = next(i for i, l in enumerate(text.split('\n'))
                     if l.startswith('export function register'))
        chunk = text.split('\n')[start + 1:]
        # drop the trailing `}` that closes the function
        while chunk and not chunk[-1].strip():
            chunk.pop()
        assert chunk and chunk[-1] == '}', f'{slug}: missing closing brace'
        out.append('\n'.join(chunk[:-1]))
    return out


original = norm('\n'.join(l for _s, _l, _b, ranges in TARGETS
                          for a, b in ranges for l in rng(a, b)))
on_disk = norm('\n'.join(written_bodies()))
if original != on_disk:
    import difflib
    for d in list(difflib.unified_diff(original, on_disk, 'original', 'on-disk', lineterm=''))[:40]:
        print(d)
    sys.exit('FATAL: handler bodies drifted from the original')
print(f'body integrity : OK ({len(original)} code lines identical, comments/blanks normalised)')

Path('/tmp/opencode/ipc-plan.txt').write_text(
    '\n'.join(f'{s}\t{f}\t{w}\t{",".join(syms)}' for s, f, w, syms in plan) + '\n')
print('wrote /tmp/opencode/ipc-plan.txt')
