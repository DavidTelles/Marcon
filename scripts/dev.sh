#!/usr/bin/env bash
# Sobe backend (3001) e frontend (3000) juntos em modo desenvolvimento.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/backend" && npm run dev) &
BACK=$!
(cd "$ROOT/frontend" && npm run dev) &
FRONT=$!

trap 'kill $BACK $FRONT 2>/dev/null' INT TERM
wait
