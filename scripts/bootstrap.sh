#!/bin/bash
set -euo pipefail

# Agentic CRM First-Time Setup
#
# 1. Install dependencies
# 2. Set up environment file
# 3. Initialize database with CRM schema
# 4. Build container image
# 5. Authenticate WhatsApp
#
# Usage: npm run bootstrap

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Agentic CRM Bootstrap ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: Docker is required"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
cd "$ROOT_DIR" && npm install
cd "$ROOT_DIR/engine" && npm install

# Set up .env if it doesn't exist
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Creating .env from template..."
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "Please edit .env with your API keys and settings."
  echo ""
fi

# Build container image
echo "Building container image..."
"$ROOT_DIR/crm/container/build.sh"

echo ""
echo "=== Bootstrap Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys"
echo "  2. Run: npm run dev (to authenticate WhatsApp)"
echo "  3. Run: npm run register-team -- --file team.csv"
