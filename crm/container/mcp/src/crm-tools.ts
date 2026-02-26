/**
 * CRM Tools MCP Server
 *
 * Runs inside the agent container. Provides CRM write tools:
 * - log_interaction: Log a client interaction (call, meeting, email)
 * - update_opportunity: Update deal stage, amount, probability
 * - create_crm_task: Create a follow-up task
 * - update_crm_task: Mark a task as completed
 * - create_proposal: Create/update a proposal
 *
 * These tools write JSON files to the IPC directory which are
 * picked up by the host's IPC watcher and processed by crm/src/ipc-handlers.ts.
 *
 * TODO: Implement MCP server using @modelcontextprotocol/sdk
 * - Define tool schemas with input validation
 * - Write IPC files to /workspace/ipc/tasks/
 * - Return confirmation messages
 */

// TODO: Implement CRM tools MCP server
console.error('[crm-tools] MCP server not yet implemented');
process.exit(1);
