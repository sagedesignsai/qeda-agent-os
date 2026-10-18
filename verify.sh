#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== schema sanity (before tests) ==="
python3 - <<'PY'
from pathlib import Path
lines = Path('src/main/db/schema.ts').read_text().split('\n')
start = lines.index('/** DDL applied in order; every statement must be idempotent. */')
end = lines.index('];', start) + 1
array = lines[start:end]
expected = [
    'CREATE_SESSIONS','CREATE_MESSAGES','CREATE_CHUNKS','CREATE_NOTEBOOKS',
    'CREATE_PAGES','CREATE_BLOCKS','CREATE_TAGS','CREATE_PAGE_TAGS',
    'CREATE_BACKLINKS','CREATE_PAGE_VERSIONS','CREATE_RESEARCH_RUNS',
    'CREATE_RESEARCH_SOURCES','CREATE_RESEARCH_EVIDENCE','CREATE_PAGES_FTS',
    'CREATE_TERMINAL_SESSIONS','CREATE_TERMINAL_BLOCKS','CREATE_PROJECTS',
    'CREATE_TASKS','CREATE_TASK_STEPS','CREATE_TASK_BLOCKS','CREATE_FOCUS_SESSIONS',
    'CREATE_GAMIFICATION_STATE','CREATE_XP_LEDGER','CREATE_DOCUMENTS',
    'CREATE_STUDIO_TAKES','CREATE_SOUNDLAB_SESSIONS','CREATE_SOUNDLAB_TRACKS',
    'CREATE_BUILDER_SESSIONS','CREATE_CONTACTS','CREATE_CONTACT_CHANNELS',
    'CREATE_CORRESPONDENCE_MESSAGES','CREATE_MESSAGE_ATTACHMENTS',
    'CREATE_MESSAGE_RECIPIENTS','CREATE_CORRESPONDENCE_EVENTS','CREATE_SEQUENCES',
    'CREATE_SEQUENCE_STEPS','CREATE_SEQUENCE_RUNS','CREATE_SEQUENCE_STEP_RUNS',
]
got = [ln.strip().removesuffix(',') for ln in array[2:-1] if ln.strip()]
if got != expected:
    print('FAIL: MIGRATION_STATEMENTS order/contents out of sync')
    for i in range(min(len(got), len(expected))):
        if got[i] != expected[i]:
            print(f'  {i+1:>2}. expected {expected[i]: <40} got {got[i]}')
    if len(got) != len(expected):
        print(f'  length: expected {len(expected)} got {len(got)}')
    raise SystemExit(1)
print('OK: MIGRATION_STATEMENTS (%d entries, correct order)' % len(expected))

exports = '\n'.join(lines)
for name in expected:
    n = exports.count(f'export const {name} =')
    assert n == 1, f'{name} exported {n} times'
print('OK: every CREATE_* exported exactly once')
PY

echo
echo "=== full test suite ==="
npm test 2>&1 | tail -10
