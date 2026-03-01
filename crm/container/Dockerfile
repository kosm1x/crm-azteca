FROM nanoclaw-agent:latest

# Install sqlite3 CLI for agent database queries
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for better layer caching
COPY mcp/package.json mcp/package-lock.json* /app/crm-mcp/
RUN cd /app/crm-mcp && npm install

# Copy source and build — only this layer invalidates on code changes
COPY mcp/ /app/crm-mcp/
RUN cd /app/crm-mcp && npm run build
