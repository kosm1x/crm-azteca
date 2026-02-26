FROM nanoclaw-agent:latest

# Install sqlite3 CLI for agent database queries
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy CRM MCP servers
COPY mcp/ /app/crm-mcp/
RUN cd /app/crm-mcp && npm install && npm run build
