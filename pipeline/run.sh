#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Scoring ==="
python3 "$SCRIPT_DIR/score.py"

echo "=== Exporting ==="
python3 "$SCRIPT_DIR/export.py"

echo "=== Building Next.js ==="
cd "$PROJECT_DIR/app"
pnpm build

echo "=== Done ==="
