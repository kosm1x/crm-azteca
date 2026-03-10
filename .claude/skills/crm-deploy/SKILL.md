---
name: crm-deploy
description: >
  Container rebuild and service deployment checklist for crm-azteca. Use when the user
  says "deploy", "rebuild", "restart", "rebuild container", "redeploy", or after any
  change to files under crm/src/ or crm/container/. Also use when diagnosing container
  errors like "pull access denied" or "Container exited with code 125". Do NOT use for
  code-only changes that don't need deployment.
---

# CRM Deploy — Rebuild & Restart Workflow

## CRITICAL: When is a Rebuild Required?

| Change | Rebuild? | Restart? | Session Purge? |
|--------|:--------:|:--------:|:--------------:|
| `crm/src/**` (tool code, schema, helpers) | **YES** | YES | If schema changed |
| `crm/container/agent-runner/**` | **YES** | YES | No |
| `package.json` / `package-lock.json` | **YES** | YES | No |
| `.env` (API keys, config) | No | YES | No |
| `crm/groups/*.md` (persona templates) | No | YES | **YES** (purge old LLM context) |
| `groups/*/CLAUDE.md` (live persona files) | No | No | **YES** |
| Engine code in hook points | **YES** (base image) | YES | No |

**Rule of thumb**: If the file is under `crm/src/` or `crm/container/`, rebuild. Everything else is restart-only or session purge.

## Step 1: Pre-Deploy Verification

Run tests BEFORE building. A broken build wastes 2-3 minutes.

```bash
cd /root/claude/crm-azteca
npm run typecheck && npm run test
```

Both must pass. Do not proceed if tests fail.

## Step 2: Rebuild Container

### Option A: Full rebuild (recommended after source changes)
```bash
crm-ctl rebuild-restart
```
This runs: build base image -> build CRM image -> restart systemd service.

### Option B: Manual (if crm-ctl is unavailable)
```bash
cd /root/claude/crm-azteca
# Build base + CRM image
./crm/container/build.sh

# Restart service
sudo systemctl restart agentic-crm.service
```

### Option C: Restart only (no source changes)
```bash
crm-ctl restart
```

## Step 3: Session Purge (When Needed)

Purge if persona templates changed or terminology was renamed:
```bash
crm-ctl clear-sessions
```

This removes `groups/*/.crm-sessions/*.json` so the LLM doesn't mimic old behavior.

## Step 4: Verify Deployment

### 4A. Service is running
```bash
systemctl status agentic-crm.service | head -15
```
Expect: `Active: active (running)`

### 4B. No errors in startup logs
```bash
journalctl -u agentic-crm.service --since "2 min ago" --no-pager | tail -30
```
Look for:
- `Connected to WhatsApp` — WhatsApp auth OK
- `Alerts evaluated and sent` — CRM bootstrap OK
- `NanoClaw running` — engine ready
- NO `ERROR` or `Container exited with code` lines

### 4C. Container image exists
```bash
docker images | grep agentic-crm-agent
```
Expect: `agentic-crm-agent:latest` with recent timestamp.

### 4D. Test with a message (optional)
Send a test message in the WhatsApp group and check logs:
```bash
crm-ctl follow
```

## Troubleshooting

### "pull access denied for agentic-crm-agent"
**Cause**: Docker image was pruned or never built.
**Fix**: `./crm/container/build.sh` (rebuilds both base + CRM images)

### "Container exited with code 125"
**Cause**: Docker can't find image, or image is corrupt.
**Fix**: `docker rmi agentic-crm-agent:latest nanoclaw-agent:latest 2>/dev/null; ./crm/container/build.sh`

### "Stream Errored (conflict)"
**Cause**: Multiple engine processes fighting for the WhatsApp socket.
**Fix**: Kill all, then start clean:
```bash
pkill -f 'tsx.*engine' 2>/dev/null
docker kill $(docker ps -q --filter "name=nanoclaw-") 2>/dev/null
crm-ctl start
```

### Container starts but tools fail
**Cause**: Stale code baked into image (Docker build cache).
**Fix**: Force no-cache rebuild:
```bash
cd /root/claude/crm-azteca
docker buildx prune -f
./crm/container/build.sh
crm-ctl restart
```

### New env var not available in container
**Cause**: 3-place secret registration incomplete.
**Fix**: A new secret must be added in ALL 3 places:
1. `.env` file — the actual value
2. `engine/src/container-runner.ts` `readSecrets()` — add key to the array
3. `engine/src/container-runner.ts` `buildContainerArgs()` — pass via `-e` flag

### Agent uses old persona/behavior after template change
**Cause**: Session history files contain old LLM responses that get mimicked.
**Fix**: `crm-ctl clear-sessions && crm-ctl restart`

## Quick Reference

| Task | Command |
|------|---------|
| Full rebuild + restart | `crm-ctl rebuild-restart` |
| Restart only | `crm-ctl restart` |
| Purge sessions | `crm-ctl clear-sessions` |
| View logs | `crm-ctl logs 100` |
| Follow logs | `crm-ctl follow` |
| Check status | `crm-ctl status` |
| Query database | `crm-ctl db "SELECT ..."` |
| List personas | `crm-ctl personas` |
