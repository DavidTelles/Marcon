#!/usr/bin/env bash
# Sobe backend (3001) e frontend (3000) em modo produção (requer npm run build antes).
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/backend" && npm start) &
BACK=$!
(cd "$ROOT/frontend" && npm start) &
FRONT=$!

trap 'kill $BACK $FRONT 2>/dev/null' INT TERM
wait
