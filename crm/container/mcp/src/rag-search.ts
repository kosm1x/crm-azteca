/**
 * RAG Search MCP Server (Phase 7)
 *
 * Runs inside the agent container. Provides semantic document search:
 * - search_documents: Semantic search across synced documents
 * - get_document: Retrieve a specific document by ID
 *
 * Reads from the CRM document store mounted at /workspace/extra/crm-documents.
 * Uses pre-computed embeddings stored in crm_embeddings table.
 *
 * TODO: Phase 7 implementation
 * - Embedding generation (OpenAI or local model)
 * - Cosine similarity search
 * - Result ranking and snippet extraction
 */

// TODO: Implement RAG search MCP server
console.error('[rag-search] MCP server not yet implemented (Phase 7)');
process.exit(1);
