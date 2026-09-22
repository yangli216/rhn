#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream="$root/.runtime/jev-pilot/upstream"
revision=1231850a0bf1a0c0341fe408ef1668dbbfdfac46
if [[ ! -d "$upstream/.git" ]]; then
  mkdir -p "$(dirname "$upstream")"
  git clone https://github.com/browser-use/jev-ultrafast.git "$upstream"
  git -C "$upstream" checkout --detach "$revision"
fi
if [[ "$(git -C "$upstream" rev-parse HEAD)" != "$revision" ]] || [[ -n "$(git -C "$upstream" status --porcelain --untracked-files=no)" ]]; then
  echo 'Jev source differs from the reviewed revision; refusing to run.' >&2
  exit 2
fi
uv sync --project "$upstream" --frozen
if [[ "${1:-}" == "--test" ]]; then
  exec "$upstream/.venv/bin/python" -m unittest discover -s "$root/scripts/jev" -p 'test_*.py'
fi
exec "$upstream/.venv/bin/python" "$root/scripts/jev/run.py" "$@"
