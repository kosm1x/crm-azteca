#!/bin/bash
# CRM Simulator — Cron Setup
#
# Installs 3 daily cron jobs:
#   3:00 AM MX (9:00 UTC) — Full regression + dynamic scenarios
#   10:30 AM MX (16:30 UTC) — Morning workflow focus (briefings, pipeline)
#   6:30 PM MX (00:30 UTC+1) — Evening review (insights, approvals, security)
#
# Usage: bash scripts/simulator/cron-setup.sh

set -euo pipefail

REPO_DIR="/root/claude/crm-azteca"
SIMULATOR="cd ${REPO_DIR} && /root/.local/share/npm/bin/tsx scripts/simulator/index.ts"
LOG_DIR="${REPO_DIR}/scripts/simulator/reports"
MARKER="# CRM-SIMULATOR"

# Remove existing simulator cron entries
crontab -l 2>/dev/null | grep -v "${MARKER}" > /tmp/crontab-clean || true

# Add new entries
cat >> /tmp/crontab-clean <<EOF
# --- CRM Simulator Daily Stress Tests ---
0 9 * * * ${SIMULATOR} --mode full >> ${LOG_DIR}/cron.log 2>&1 ${MARKER}
30 16 * * * ${SIMULATOR} --mode morning >> ${LOG_DIR}/cron.log 2>&1 ${MARKER}
30 0 * * * ${SIMULATOR} --mode evening >> ${LOG_DIR}/cron.log 2>&1 ${MARKER}
EOF

crontab /tmp/crontab-clean
rm /tmp/crontab-clean

echo "Cron jobs installed:"
crontab -l | grep "${MARKER}"
echo ""
echo "Schedule (Mexico City time):"
echo "  3:00 AM — Full regression + dynamic"
echo "  10:30 AM — Morning workflow"
echo "  6:30 PM — Evening review"
