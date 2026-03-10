---
name: crm-add-tool
description: >
  Sequential workflow for adding a new CRM tool to crm-azteca. Use when creating
  a new tool handler, registering a tool in the inference adapter, or when the user
  says "add tool", "new tool", "crear herramienta", or "agregar tool". Covers all
  7 steps: handler, registration, role assignment, persona templates, test counts,
  typecheck, and test run. Do NOT use for modifying existing tools or schema-only changes.
---

# Add CRM Tool — Sequential Workflow

Adding a CRM tool requires changes in 7 files across 3 layers (source, templates, tests).
Skipping any step results in a broken deploy or silent test failure.

## CRITICAL: Pre-Flight

Before starting, confirm with the user:
1. **Tool name** (snake_case, Spanish — e.g. `consultar_sentimiento`)
2. **Which roles** get it (AE, Gerente, Director, VP — or subset)
3. **What it does** (query, write, analysis, scheduled)
4. **Parameters** (name, type, required/optional)

## Step 1: Create Tool Handler

**File**: `crm/src/tools/<module>.ts` (new file or add to existing module)

Pattern:
```typescript
import { getDatabase } from '../db.js';
import type { ToolContext } from './index.js';
import { scopeFilter, findCuentaId, getCurrentWeek, dateCutoff } from './helpers.js';

export function tool_name(args: Record<string, unknown>, ctx: ToolContext): string {
  const db = getDatabase();
  const param = args.param as string | undefined;

  // Role-based scope filter (mandatory for any data query)
  const scope = scopeFilter(ctx, 'table_alias.ae_id');

  let where = `WHERE 1=1 ${scope.where}`;
  const params: unknown[] = [...scope.params];

  if (param) {
    where += ' AND field = ?';
    params.push(param);
  }

  const rows = db.prepare(`SELECT ... ${where}`).all(...params) as any[];

  return JSON.stringify({ ok: true, data: rows, mensaje: 'Descripcion del resultado' });
}
```

### Rules
- Always use `scopeFilter(ctx, alias)` for data queries — never skip role scoping
- Use `findCuentaId()` for fuzzy account lookups, `dateCutoff(days)` for date filters
- Return `JSON.stringify()` — never raw objects
- Tool descriptions in TOOL_* definitions must be in **Spanish**
- Never interpolate dates into SQL — use `?` parameters

## Step 2: Register in Tool Index

**File**: `crm/src/tools/index.ts`

### 2A. Import handler (top of file, with other imports)
```typescript
import { tool_name } from './module.js';
```

### 2B. Add TOOL_* constant (after existing TOOL_* definitions, ~line 585)
```typescript
const TOOL_TOOL_NAME: ToolDefinition = {
  type: 'function',
  function: {
    name: 'tool_name',
    description: 'Descripcion en espanol. Incluir que datos devuelve y cuando usarla.',
    parameters: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'Descripcion del parametro' },
      },
      required: ['param'],
    },
  },
};
```

### 2C. Add to role arrays (lines ~591-640)

Role assignment guide:
| Tool Type | AE | Gerente | Director | VP |
|-----------|:--:|:-------:|:--------:|:--:|
| Write (create/update/delete) | Yes | - | - | - |
| Read-only queries | Yes | Yes | Yes | Yes |
| Briefing/coaching | - | Yes | Yes | Yes |
| Calendar writes | Yes | Yes | Yes | - |
| Swarm/advanced analysis | - | Yes | Yes | Yes |

Add `TOOL_TOOL_NAME` to the appropriate `*_TOOLS` arrays.

### 2D. Add to TOOL_HANDLERS map (lines ~655-687)
```typescript
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ... existing ...
  tool_name,
};
```

## Step 3: Update Persona Templates

Add tool reference to each role template that has access:

| Role | File |
|------|------|
| AE | `crm/groups/ae.md` |
| Gerente | `crm/groups/manager.md` |
| Director | `crm/groups/director.md` |
| VP | `crm/groups/vp.md` |

Add under the appropriate section (Registro, Consulta, Analisis, etc.):
```markdown
- *tool_name* -- Breve descripcion de cuando y como usar esta herramienta.
```

Templates are organizational docs for the LLM. Tool **availability** is controlled by the `*_TOOLS` arrays, not templates — but the LLM won't use a tool it doesn't know about.

## Step 4: Update Test Counts

### 4A. Agent runner test counts
**File**: `crm/tests/agent-runner.test.ts` (lines ~150-168)

Update the `.toBe(N)` assertion for each role that gained the new tool:
- AE: currently 29
- Gerente: currently 22
- Director: currently 21
- VP: currently 20

### 4B. Template coverage test counts
**File**: `crm/tests/templates.test.ts`

- Line ~150: total unique tool count (currently 31)
- Lines ~165-222: per-role counts matching agent-runner counts

## Step 5: Write Tool Tests

**File**: `crm/tests/<module>.test.ts` (new or existing test file)

Minimum test coverage:
1. Tool returns valid JSON
2. Role scoping works (AE sees only own data, Gerente sees team, VP sees all)
3. Required parameters validated
4. Edge case: empty results return `{ ok: true, data: [] }`

## Step 6: Verify

```bash
cd /root/claude/crm-azteca
npm run typecheck    # Must pass — catches import/type errors
npm run test         # Must pass — catches count mismatches
```

Both must pass before proceeding to deploy.

## Step 7: Deploy (if running on VPS)

Only after tests pass:
```bash
crm-ctl rebuild-restart    # Rebuilds container + restarts engine
```

Then verify in logs:
```bash
crm-ctl logs 50 | grep -i error
```

## Checklist

- [ ] Handler in `crm/src/tools/<module>.ts` with scopeFilter
- [ ] Import added in `crm/src/tools/index.ts`
- [ ] `TOOL_*` definition with Spanish description
- [ ] Added to correct role arrays (`AE_TOOLS`, `GERENTE_TOOLS`, `DIRECTOR_TOOLS`, `VP_TOOLS`)
- [ ] Added to `TOOL_HANDLERS` map
- [ ] Persona templates updated (`crm/groups/*.md`)
- [ ] Test counts updated in `agent-runner.test.ts`
- [ ] Test counts updated in `templates.test.ts`
- [ ] Tool tests written
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Container rebuilt (if deploying)
