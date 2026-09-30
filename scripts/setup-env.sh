#!/usr/bin/env bash
# Cria os arquivos .env a partir dos exemplos, se ainda não existirem.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "backend/.env criado — revise DB_* e JWT_SECRET."
else
  echo "backend/.env já existe."
fi

if [ ! -f "$ROOT/frontend/.env.local" ]; then
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env.local"
  echo "frontend/.env.local criado — revise DB_* e SESSION_SECRET."
else
  echo "frontend/.env.local já existe."
fi
