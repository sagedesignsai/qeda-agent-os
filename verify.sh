#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== schema sanity (before tests) ==="
python3 - <<'PY'
from pathlib import Path
import re

lines = Path('src/main/db/schema.ts').read_text().split('\n')
start = lines.index('/** DDL applied in order; every statement must be idempotent. */')
end = lines.index('];', start) + 1
array = lines[start:end]
got = [ln.strip().removesuffix(',') for ln in array[2:-1] if ln.strip()]

if len(got) != len(set(got)):
    duplicates = sorted({name for name in got if got.count(name) > 1})
    print('FAIL: MIGRATION_STATEMENTS contains duplicates:', ', '.join(duplicates))
    raise SystemExit(1)

source = '\n'.join(lines)
exported = set(re.findall(r'^export const (CREATE_[A-Z0-9_]+) =', source, re.M))
# These are helpers, not tables in the ordered migration list.
managed = exported - {'CREATE_EMBEDDINGS', 'CREATE_MIGRATIONS'}

missing = sorted(managed - set(got))
extra = sorted(set(got) - managed)
if missing or extra:
    print('FAIL: MIGRATION_STATEMENTS out of sync with exported DDL')
    if missing:
        print('  missing from the array:', ', '.join(missing))
    if extra:
        print('  not exported by schema.ts:', ', '.join(extra))
    raise SystemExit(1)

for name in got:
    n = source.count(f'export const {name} =')
    assert n == 1, f'{name} exported {n} times'
print('OK: MIGRATION_STATEMENTS (%d entries, all exported exactly once)' % len(got))
PY

echo
echo "=== full test suite ==="
bun run test 2>&1 | tail -10
