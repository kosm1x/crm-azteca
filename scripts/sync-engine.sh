#!/bin/bash
set -euo pipefail

# Pull NanoClaw upstream updates into engine/ subtree
#
# Usage: ./scripts/sync-engine.sh
#
# This pulls the latest changes from the NanoClaw main branch
# and merges them into the engine/ directory.
#
# After pulling, check for conflicts in the 5 hook files:
#   engine/src/db.ts
#   engine/src/index.ts
#   engine/src/ipc.ts
#   engine/container/agent-runner/src/index.ts
#   engine/src/container-runner.ts

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "Pulling NanoClaw upstream updates..."
git subtree pull --prefix=engine https://github.com/qwibitai/nanoclaw.git main --squash

echo ""
echo "Check for conflicts in hook files:"
echo "  engine/src/db.ts"
echo "  engine/src/index.ts"
echo "  engine/src/ipc.ts"
echo "  engine/container/agent-runner/src/index.ts"
echo "  engine/src/container-runner.ts"
echo ""
echo "See docs/UPSTREAM-SYNC.md for conflict resolution guidance."
