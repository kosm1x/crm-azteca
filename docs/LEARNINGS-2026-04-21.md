# Learnings — 2026-04-21 Inference Resilience Port + Ops Incidents

Cross-cutting lessons from porting 8 resilience modules from
mission-control and the missing-container-image outage. For the
module-by-module details see the commit history (9974ddf, d16d172).

## 1. Container rebuild is an invariant, not a step

On 2026-04-21 morning the service had been running for a week while
every container spawn failed with exit 125 (`Unable to find image
'agentic-crm-agent:latest' locally`). The image had been deleted at
some point between the last rebuild and today; the service itself
stayed healthy so nothing alerted.

Root cause: the ops runbook in `CLAUDE.md` already says "Always rebuild
container with `--no-cache` when source files change." We added 8 new
modules in commit 9974ddf and never ran `npm run build:container`. The
systemd service keeps running (engine + dashboard are fine) but every
WhatsApp message hits the container path and fails silently after 6
retries.

**Rule:** Any commit that adds or edits files under `crm/src/` ends
with `npm run build:container`. Non-negotiable. The dashboard staying
green does not mean the agents work — the agents run in a separate
image and have to be rebuilt to pick up any source change.

**Additionally**: add a health probe that exercises the full message
path, not just the HTTP dashboard. A synthetic test message to a test
group every 5 minutes would have caught this in minutes instead of
days.

## 2. Structured diagnosis beats fix-first under time pressure

The missing-image symptom had four plausible explanations: daemon
broken, Dockerfile invalid, disk full, or image missing. The
`/diagnose` skill forced listing **all four** before checking any,
which caught that three were immediately falsifiable (`docker ps` shows
containers, `df` shows 24 GB free, Dockerfile un-touched). Root cause
verified in one targeted command (`docker images | grep agent`).

**Rule:** Before writing the fix, list every failure point that could
produce the symptom. If you can falsify 3 of 4 in under a minute, do
that first. The one you can't falsify is your root cause.

**Anti-pattern:** Reading the error message, assuming the most recent
code change broke something, and editing the Dockerfile. Half the
time the cause is operational (disk, image pruned, daemon restart),
not code.

## 3. Eviction must not run before security scanning

In the first version of the inference-adapter integration, the order
was: execute tool → evict oversized result to temp file (keep 2 KB
preview) → scan for injection. That means a malicious payload placed
at byte 3000 of a 10 KB tool result escapes detection entirely — the
scanner only sees the preview.

**Rule:** Run every security check on the full, untrusted content.
Compression, eviction, and truncation all come **after** content is
classified as safe or flagged.

```ts
// WRONG — payload at byte 3000+ never seen
result = maybeEvict(result, toolName); // truncates to 2 KB preview
if (isUntrustedTool(toolName)) {
  const injection = analyzeInjection(result, toolName);
}

// RIGHT — scan full content first
if (isUntrustedTool(toolName)) {
  const injection = analyzeInjection(result, toolName);
  if (injection.risk === "high")
    result = buildInjectionWarning(injection) + result;
}
result = maybeEvict(result, toolName); // now safe to truncate
```

Same principle applies to any future compression/summarization of
tool results — always scan first.

## 4. Global-flag regex with `.test()` is a latent state leak

`/foo/g.test(text)` mutates the regex's `lastIndex` property. On the
next call with a different `text`, the match starts from the old
`lastIndex` — which may be past the new string's length, silently
returning `false` for a pattern that does match.

In `injection-guard.ts` the `ZERO_WIDTH_RE` was defined once with `/g`
(needed for `.replace()`) and reused for `.test()`. The current code
path happened to call `.replace()` first (resetting lastIndex), so the
bug was latent. Any future refactor that called `detectZeroWidth()`
twice in a row without an intervening `.replace()` would have
intermittently missed detections.

**Rule:** When a regex serves both `.replace()` (needs `/g`) and
`.test()` (must not have `/g`), define two regexes:

```ts
const FOO_RE = /pattern/g; // for .replace(), .matchAll()
const FOO_TEST_RE = /pattern/; // for .test(), .match()
```

Same literal, different flags. The cost is one extra line; the
benefit is no lastIndex surprise.

## 5. MC ports land in their own commit, audit in the next

Porting the 8 resilience modules produced a 2955-line diff. Running
`simplify` on it found 7 real issues — one security (issue #3 above),
one latent bug (issue #4), and five quality/efficiency fixes.

If we'd tried to land a "perfect first version" we'd still be
iterating. The pattern that worked:

1. **First commit (9974ddf)**: port the module as-is from MC, wire
   into the inference adapter, write basic tests, make sure full
   suite passes. Ship it.
2. **Second commit (d16d172)**: run `simplify`, aggregate findings
   across parallel reviewers, fix the real issues. Ship it.

The `simplify` reviewers disagreed on about 30% of findings. Useful
ones surfaced in at least two reviews. A finding flagged by only one
reviewer was usually a stylistic preference, not a bug.

**Rule:** For large ports, plan for a follow-up audit commit. Don't
hold the first one waiting for perfection.

## 6. Delegate, don't duplicate — `sanitizeToolPairs` edition

The first version of `context-compressor.ts` reimplemented 50 lines
of orphaned-tool-result cleanup that already existed in
`session-repair.ts`. Same algorithm, slightly different stub message,
both running on every round.

The audit fix: delete the duplicate and call `repairSession(messages)`.
Net diff: -50 lines, one synthetic-stub message instead of two.

**Rule:** When you're writing a new module that touches the same data
structure as an existing module, grep for the related operations
before starting. `repairSession`, `sanitizeToolPairs`, `fixOrphans`,
`dedup*`, `merge*` are all likely to already exist. Most "new" data
plumbing is just delegation.

## 7. Disk growth is cumulative — retention policies matter

Today's investigation found 74 GB / 96 GB used (77%), with:

- Hindsight image: 26.9 GB (single largest consumer, ~36% of disk)
- MC daily backups: 873 MB across 5 days, growing ~175 MB/day
- Docker build cache: 3.8 GB (1.75 GB reclaimable)
- Syslog uncompressed rotation: 250 MB (compresses to 22 MB)

The backup growth is the most concerning pattern — linear, silent,
and will keep going until disk fills. The fix isn't periodic cleanup;
it's a retention policy enforced by the thing writing the backups.

**Rule:** Any daemon that writes files on a schedule needs a
retention policy baked in — delete anything older than N. Don't rely
on humans remembering to prune.

**Easy reclaim tactics verified today:**

- `journalctl --vacuum-time=7d` — 0 MB today (journal was already <7
  days), but free insurance.
- `docker builder prune -f` — 1.75 GB after a recent rebuild. Safe to
  run any time; next build re-caches.
- `gzip /var/log/syslog.1` — 228 MB. Logrotate does this normally;
  manually accelerating is harmless.
- Deleting one-time tarballs in `/root/backups/` that pre-date the
  last 30 days. Always check first: `ls -la` to confirm dates, nothing
  in `docker inspect` mounts these paths.
