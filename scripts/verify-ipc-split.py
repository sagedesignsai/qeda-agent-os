#!/usr/bin/env python3
"""
Verify the IPC split without invoking tsc/build/jest.

Checks, in order of importance:
  1. CHANNEL COVERAGE  — every channel declared in channels.ts still has
     exactly one handler (request) or at least one send site (event), and no
     handler/send references an undeclared channel.
  2. IMPORT RESOLUTION — every relative import in the new modules points at a
     file that exists (catches the wrong `../` depth after moving a level down).
  3. NO MISSING SYMBOLS — any identifier that a module body uses from the
     original top-level import list, or from the old module-level helpers, must
     now be imported or declared locally. This is the failure mode a pure move
     actually produces.
  4. NO UNUSED IMPORTS  — an import a module never references would fail lint.

Usage:  python3 scripts/verify-ipc-split.py
Exit code 0 = all clear.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IPC = ROOT / 'src/main/ipc'
MODULES = sorted((IPC / 'handlers').glob('*.ts'))
RUNTIME = IPC / 'agent-runtime.ts'
CHANNELS = IPC / 'channels.ts'

fail = []


def err(msg):
    fail.append(msg)
    print(f'  FAIL  {msg}')


def ok(msg):
    print(f'  ok    {msg}')


def strip_comments(src):
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', src)


# ── the original header import list + old module-level helpers ────────────────
BACKUP = Path('/tmp/opencode/ipc-backup/handlers.ts.orig')
if not BACKUP.exists():
    sys.exit('missing backup of the original handlers.ts — cannot verify')
orig_src = BACKUP.read_text()
head = orig_src[:orig_src.index('const agentCache')]
ORIG_SYMBOLS = set()
for m in re.finditer(r"import\s+(?:type\s+)?\{(.*?)\}\s+from\s+'[^']+';", head, re.S):
    for part in m.group(1).split(','):
        part = part.strip()
        if not part:
            continue
        part = part[5:].strip() if part.startswith('type ') else part
        ORIG_SYMBOLS.add(part.split(' as ')[-1].strip())
for m in re.finditer(r"import\s+(\w+)\s+from\s+'[^']+';", head):
    ORIG_SYMBOLS.add(m.group(1))
SHARED = {'agentCache', 'cacheKey', 'getAgent', 'resetAgents', 'lastUserText',
          'detectMode', 'mainWindow'}

# ── 1. channel coverage ──────────────────────────────────────────────────────
print('\n[1] channel coverage')
clines = CHANNELS.read_text().split('\n')
s = next(i for i, l in enumerate(clines) if l.startswith('export interface IpcChannels'))
e = next(i for i, l in enumerate(clines) if l.startswith('export type ChannelName'))
decl = re.compile(r"^  '([\w:-]+)':")
idx = [(i, decl.match(l).group(1)) for i, l in enumerate(clines[s:e], s) if decl.match(l)]
declared, req, evt = set(), set(), set()
for k, (i, name) in enumerate(idx):
    stop = idx[k + 1][0] if k + 1 < len(idx) else e
    (req if re.search(r'\breq\s*:', '\n'.join(clines[i:stop])) else evt).add(name)
    declared.add(name)

handled, sent = {}, {}
for f in MODULES + [RUNTIME, IPC / 'index.ts', ROOT / 'src/main/pty/manager.ts']:
    src = f.read_text()
    for n in re.findall(r"ipcMain\.handle\(\s*'([\w:-]+)'", src):
        handled.setdefault(n, []).append(f.name)
    for n in re.findall(r"webContents\.send\(\s*'([\w:-]+)'", src):
        sent.setdefault(n, []).append(f.name)

missing = sorted(req - set(handled))
if missing:
    err(f'{len(missing)} request channel(s) with no handler: {missing}')
else:
    ok(f'all {len(req)} request channels have a handler')
missing = sorted(evt - set(sent))
if missing:
    err(f'{len(evt) and len(missing)} event(s) never sent: {missing}')
else:
    ok(f'all {len(evt)} event channels have a send site')
orphan = sorted(set(handled) - declared)
if orphan:
    err(f'handlers for undeclared channels: {orphan}')
else:
    ok('no handler references an undeclared channel')
orphan = sorted(set(sent) - declared)
if orphan:
    err(f'sends for undeclared channels: {orphan}')
else:
    ok('no send references an undeclared channel')
dupe = {k: v for k, v in handled.items() if len(v) > 1}
if dupe:
    err(f'channel registered more than once: {dupe}')
else:
    ok('no channel is registered twice')

# ── 2 & 3 & 4. per-module import hygiene ─────────────────────────────────────
print('\n[2-4] import resolution, missing symbols, unused imports')
before_24 = len(fail)
FILES = MODULES + [RUNTIME]
for f in FILES:
    text = f.read_text()
    body_all = strip_comments(text)
    imported, spec = {}, {}
    for m in re.finditer(r"import\s+(?:type\s+)?\{(.*?)\}\s+from\s+'([^']+)';", text, re.S):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            local = (part[5:].strip() if part.startswith('type ') else part).split(' as ')[-1].strip()
            imported[local] = True
            spec[local] = m.group(2)
    for m in re.finditer(r"import\s+(\w+)\s+from\s+'([^']+)';", text):
        imported[m.group(1)] = True
        spec[m.group(1)] = m.group(2)

    # 2. relative import targets must exist
    for local, mod in spec.items():
        if not mod.startswith('.'):
            continue
        target = (f.parent / mod).resolve()
        if not (target.exists() or target.with_suffix('.ts').exists()):
            err(f'{f.name}: import {mod!r} does not resolve')

    # body = everything after the last import statement
    last = max((text.rfind('\n', 0, m.end()) for m in re.finditer(r"^import\b.*?;\s*$", text, re.S | re.M)), default=0)
    body = strip_comments(text[last:])

    # identifiers bound by the registrar's own parameter destructuring, e.g.
    # `({ mainWindow }: { mainWindow: BrowserWindow })` binds `mainWindow` but
    # does NOT provide `BrowserWindow` — the type in the annotation still has to
    # be imported. Only the part before the `:` counts as a binding.
    sig = re.search(r'export function \w+\((.*?)\)\s*:', text, re.S)
    bound = set()
    if sig:
        head = sig.group(1).lstrip()
        if head.startswith('{'):
            bound = {w.strip() for w in head[1:head.index('}')].split(',') if w.strip()}

    # 3. symbols the body uses from the original header / old helpers
    for sym in sorted(ORIG_SYMBOLS | SHARED):
        if not re.search(rf'\b{re.escape(sym)}\b', body):
            continue
        if sym in imported or sym in bound:
            continue
        if re.search(rf'\b(const|let|function|type|interface|class)\s+{re.escape(sym)}\b', body):
            continue
        # NOTE: deliberately no "is it maybe a parameter?" fallback. A local
        # binding shadowing an import is itself a lint error in this repo
        # (@typescript-eslint/no-shadow), and a loose heuristic here is exactly
        # what let a missing `type BrowserWindow` import through undetected.
        err(f'{f.name}: uses {sym!r} but neither imports, declares, nor binds it')

    # 4. unused imports
    for local in sorted(imported):
        if not re.search(rf'\b{re.escape(local)}\b', body):
            err(f'{f.name}: imports {local!r} but never uses it')

if len(fail) == before_24:
    ok(f'{len(FILES)} files: every relative import resolves, no missing or unused imports')

# ── index.ts wiring ──────────────────────────────────────────────────────────
print('\n[5] composition root')
idx_src = (IPC / 'index.ts').read_text()
for f in MODULES:
    fname = 'register' + ''.join(w.capitalize() for w in f.stem.split('-')) + 'Handlers'
    if fname not in idx_src:
        err(f'index.ts does not register {fname} ({f.stem})')
# `registerIpcHandlers` is the composition root's own export, not a module
# registrar, so exclude it when checking that nothing unexpected is called.
called = set(re.findall(r'register\w+Handlers\(', idx_src)) - {'registerIpcHandlers('}
expected = {'register' + ''.join(w.capitalize() for w in f.stem.split('-')) + 'Handlers('
            for f in MODULES}
if called - expected:
    err(f'index.ts calls unknown registrars: {called - expected}')
elif expected - called:
    err(f'index.ts never calls: {expected - called}')
else:
    ok(f'index.ts registers all {len(MODULES)} modules, and only those')

print()
if fail:
    print(f'RESULT: {len(fail)} problem(s)')
    sys.exit(1)
print('RESULT: all checks passed')
