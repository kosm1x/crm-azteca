# Upstream Sync Guide

## How NanoClaw Updates Work

The engine (`engine/`) is a [git subtree](https://www.atlassian.com/git/tutorials/git-subtree) of [NanoClaw](https://github.com/qwibitai/nanoclaw). This means:

- The full NanoClaw source lives at `engine/` in our repo
- We can pull upstream updates with a single command
- Our CRM-specific modifications to engine files are preserved as normal git history
- Conflicts are resolved via standard git merge

## Pulling Updates

```bash
# From the repo root:
./scripts/sync-engine.sh

# Or manually:
git subtree pull --prefix=engine https://github.com/qwibitai/nanoclaw.git main --squash
```

## Hook Files to Watch

We modify exactly 5 engine files. These are the only files where merge conflicts can occur:

| File | Our Change | Conflict Risk |
|------|-----------|---------------|
| `engine/src/db.ts` | Added `getDatabase()` export | Low — one line at the end |
| `engine/src/index.ts` | Added `bootstrapCrm()` call in `main()` | Medium — main() may change |
| `engine/src/ipc.ts` | CRM delegation in `default` case of `processTaskIpc()` | Medium — switch may change |
| `engine/container/agent-runner/src/index.ts` | Added CRM MCP servers + allowed tools | High — MCP config area |
| `engine/src/container-runner.ts` | Added CRM document store mount | Low — append to mounts |

## Resolving Conflicts

### General Strategy

1. **Pull the update** — conflicts will be marked in files
2. **For each conflicted hook file**: keep both our changes AND the upstream changes
3. **Never remove our hook modifications** — they're the integration points
4. **Run tests after resolving**: `npm run test`

### Example: `engine/src/index.ts` Conflict

If upstream modifies `main()`, you'll see something like:

```
<<<<<<< HEAD
import { bootstrapCrm } from '../../crm/src/bootstrap.js';
// ...
initDatabase();
bootstrapCrm();  // CRM hook
=======
initDatabase();
// upstream's new code here
>>>>>>> squash
```

Resolution: Keep the CRM import and the `bootstrapCrm()` call, integrate upstream's new code around it.

### Example: `engine/container/agent-runner/src/index.ts` Conflict

This is the highest-risk file because MCP server configuration may change upstream. Look for changes in:
- The `mcpServers` object
- The `allowedTools` array
- The SDK `query()` call options

Keep our CRM MCP server entries and merge any upstream changes to the structure.

## When NOT to Sync

- During active development of a CRM phase — finish and test first
- If upstream has a breaking change — read the NanoClaw changelog first
- If you have uncommitted changes — commit or stash first

## Checking for Updates

```bash
# See what's changed upstream since our last sync:
git log --oneline engine/..FETCH_HEAD
```
