# Agentic CRM

An agentic CRM for media ad sales teams. AI agents that do the CRM work for your sales team.

## How It Works

Salespeople chat with AI agents via WhatsApp. Each person gets a personal CRM assistant that:

- **Logs interactions** — After every client call, the AE tells their agent what happened. The agent logs it, updates deal stages, and flags follow-ups.
- **Tracks quotas** — Agents know each AE's monthly/quarterly quota and proactively surface pipeline gaps.
- **Suggests deals** — Based on historical data, seasonal patterns, and the current pipeline, agents recommend which accounts to prioritize.
- **Escalates risks** — When a deal is stalled, a renewal is at risk, or quota attainment is low, the agent notifies the right manager.

## Architecture

The system mirrors the org chart:

```
VP of Sales
├── Director (Region A)
│   ├── Manager (Team 1)
│   │   ├── AE 1  ←→  Personal WhatsApp group + AI agent
│   │   ├── AE 2  ←→  Personal WhatsApp group + AI agent
│   │   └── ...
│   ├── Manager (Team 2)
│   │   └── ...
│   └── Manager Team Group  ←→  AI agent (coaching, rollups)
├── Director (Region B)
│   └── ...
├── Director Team Group  ←→  AI agent (strategic insights)
└── VP Team Group  ←→  AI agent (chief of staff)
```

For a team of 50 salespeople, this creates ~68 WhatsApp groups, each with an isolated AI agent that has role-appropriate access to CRM data.

## Project Structure

```
agentic-crm/
├── engine/          # NanoClaw — the AI agent platform (git subtree)
├── crm/             # All CRM-specific code
│   ├── src/         # Schema, hierarchy, IPC handlers, bootstrap
│   ├── container/   # CRM container image (extends engine)
│   ├── groups/      # CLAUDE.md templates per role
│   └── tests/       # CRM unit tests
├── scripts/         # Bootstrap, registration, data import
├── docs/            # Architecture, deployment, upstream sync
└── groups/          # Live group folders (created at runtime)
```

## Getting Started

1. **Clone and install**
   ```bash
   git clone https://github.com/kosm1x/agentic-crm.git
   cd agentic-crm
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and settings
   ```

3. **Bootstrap the CRM**
   ```bash
   npm run bootstrap
   ```

4. **Register your team**
   ```bash
   npm run register-team -- --file team.csv
   ```

5. **Start the system**
   ```bash
   npm run dev
   ```

## Engine

This project is powered by [NanoClaw](https://github.com/qwibitai/nanoclaw), an open-source platform for building AI agent systems on WhatsApp. NanoClaw handles the messaging infrastructure, container isolation, and agent orchestration. The CRM layer adds sales-specific schema, tools, personas, and hierarchy management on top.

The engine lives at `engine/` as a git subtree. See [docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md) for how to pull updates.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Full CRM design (17 sections)
- [Deployment](docs/DEPLOYMENT.md) — AWS EC2 setup, systemd, backups
- [Upstream Sync](docs/UPSTREAM-SYNC.md) — Pulling NanoClaw updates
