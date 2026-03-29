# Competitive Assessment: CRM-Azteca vs Salesforce Agentforce

> Living document. Updated each `/session-wrap` when competitive landscape changes.
> Last updated: 2026-03-25
> Purpose: Honest goalpost tracker — what we are, what they are, and what's missing to be a real corporate option.

## TL;DR

Salesforce Agentforce is a $500M ARR enterprise platform with 23,000 customers and 18 months in market. CRM-Azteca is a well-engineered prototype with 1,000+ tests and zero production hours. Comparing them feature-for-feature is premature — but measuring ourselves against the enterprise standard is how we find the gaps that matter.

---

## Current State Snapshot

| Dimension                 | Salesforce Agentforce                                               | CRM-Azteca                                                                   |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Stage**                 | GA product, 18 months in market                                     | Prototype, 0 production hours                                                |
| **Customers**             | ~23,000 (only 51% paid)                                             | 0                                                                            |
| **Revenue**               | $500M ARR (Agentforce alone)                                        | $0                                                                           |
| **Market share**          | ~23% of CRM market                                                  | N/A                                                                          |
| **AI Models**             | GPT-4o, Claude Sonnet 4, BYOLLM                                     | GLM-5 primary, Qwen 3.5+ fallback                                            |
| **Reasoning**             | Atlas Engine (ReAct + vector search + feedback loops)               | inferWithTools loop (tool-calling + conversation memory)                     |
| **Tools**                 | 15 actions/topic, 15 topics/agent, via Flows/Apex/MuleSoft          | 70 tools, role-scoped (AE:51, Ger:54, Dir:63, VP:61)                         |
| **Agent limits**          | 20 per org                                                          | 4 WhatsApp groups                                                            |
| **Channels**              | Web, SMS, WhatsApp, Messenger, Apple, LINE, Slack, Voice            | WhatsApp only (Baileys — unofficial API)                                     |
| **CRM depth**             | Native to Sales/Service/Marketing/Commerce Cloud                    | 28 SQLite tables, activities, proposals, quotas, relationships, intelligence |
| **RAG**                   | Data Cloud vector DB + semantic search                              | Hybrid FTS5 + sqlite-vec + reciprocal rank fusion                            |
| **Memory**                | Within-conversation context only                                    | Hindsight long-term memory (3 banks) + SQLite fallback + user_facts          |
| **Intelligence**          | Tableau analytics, Einstein predictions                             | Overnight analyst (6 analyzers), cross-agent patterns, warmth scoring        |
| **Test coverage**         | Enterprise proprietary (unknown)                                    | 1,000+ tests, 99%+ pass rate                                                 |
| **Trust/Security**        | Einstein Trust Layer, PII masking, zero retention, SOC2/HIPAA-ready | None — single VPS, no auth, no encryption at rest                            |
| **Pricing (per user/mo)** | $125–550 + Data Cloud + consulting                                  | ~$250/month total (VPS + inference)                                          |
| **Cost per interaction**  | $2/conversation or $0.10/action                                     | $0.04–0.11/query                                                             |

---

## Where CRM-Azteca Has an Edge

### 1. Cost — 100x Cheaper Per Interaction

- **Agentforce**: $2/conversation. A 5-person team at 70 conversations/day = ~$20K/month
- **CRM-Azteca**: $0.04–0.11/query. Same volume = ~$200/month
- For a Mexican media company, this is the entire argument. Salesforce licensing for 20 salespeople: $30K–130K/year. CRM-Azteca: ~$3K/year total.

### 2. Long-Term Memory Architecture

- **Agentforce**: within-conversation context only. No cross-session memory out of the box
- **CRM-Azteca**: Hindsight semantic memory (3 banks) + SQLite keyword recall + user_facts + 15-turn conversation buffer. The agent remembers what a client said 3 weeks ago

### 3. Domain Specificity

- **Agentforce**: generic platform — you build everything from scratch with Flows/Apex. An implementation for Mexican broadcast media ad sales would take 6–12 months of consulting at $200–400/hr
- **CRM-Azteca**: purpose-built. Proposal pipeline, inventory awareness, warmth scoring, overnight intelligence, cross-sell detection, package builder — all pre-wired for the domain

### 4. No Vendor Lock-In

- **Agentforce**: TCO estimated at $13,600/user/year including Data Cloud. Leaving is painful
- **CRM-Azteca**: SQLite, TypeScript, swap LLM providers with a config change. Total infrastructure: one VPS

### 5. Tool Chain Flexibility

- **Agentforce**: 15 actions/topic ceiling. Must use Flows/Apex framework
- **CRM-Azteca**: 70 tools with no artificial ceiling. Role-based scoping, dynamic tool injection per message. Add tools in TypeScript minutes, not Salesforce admin hours

### 6. Code Ownership and Auditability

- **Agentforce**: black box
- **CRM-Azteca**: 1,000+ tests, every line auditable, every decision traceable

---

## Where Salesforce Crushes Us

### 1. Production Reality (CRITICAL)

23,000 customers. 3.2 trillion tokens processed. Real money flowing. We have 0 production hours, 0 real users, 0 validated outcomes. No architectural elegance compensates for this.

**Goalpost**: Deploy to 3–5 real salespeople. Run 60 days. Measure adoption.

### 2. Multi-Channel (CRITICAL for corporate)

7+ channels: web, SMS, WhatsApp, Messenger, Apple, LINE, Slack, voice. We have WhatsApp only, via Baileys (unofficial, could break with one Meta policy change).

**Goalpost**: At minimum, add web chat + email channels. Migrate WhatsApp to official Business API.

### 3. Enterprise Security & Compliance (CRITICAL)

Einstein Trust Layer: PII masking, toxicity detection, prompt injection defense, zero data retention, SOC2, HIPAA. We have: nothing. No auth layer, no PII handling, no audit trails, no encryption at rest.

**Goalpost**: Auth layer, encryption at rest, audit logging, PII detection, role-based API access. Not optional for any corporate deployment.

### 4. Ecosystem Integration (HIGH)

Native R/W to the world's largest CRM platform. Sales Cloud, Service Cloud, Marketing Cloud objects. We're standalone — no ERP, no BI, no contracts system. Phase 12 (data connectors) is unbuilt.

**Goalpost**: Phase 12 — connect to Cubo (BI), live inventory feed, contracts system. This unlocks real commercial intelligence.

### 5. Human Escalation & Governance (HIGH)

Mature escalation flows, Omni-Channel routing, admin guardrails in a proven framework. Our approval workflow exists but has never been tested with real humans.

**Goalpost**: 60-day pilot validates the approval chain. Add escalation metrics and audit trail.

### 6. Scale & Infrastructure (MEDIUM)

Hyperforce infrastructure, auto-scaling, global presence. We run in a single Docker container on a single VPS.

**Goalpost**: Not urgent for pilot. Plan for multi-container deployment + backup when user count exceeds 20.

---

## Gap Closure Roadmap

What must be true before CRM-Azteca can be presented as a corporate option.

### Gate 1: Production Validation (blocks everything)

- [ ] Deploy to 3–5 real salespeople in one region with one director
- [ ] Run 60 days of real deal cycles
- [ ] Measure: time-to-first-feedback, insight accuracy, proposal acceptance rates
- [ ] Overnight engine runs on real data (not seed)
- [ ] Cross-agent patterns detected from real multi-agent activity
- [ ] Warmth scoring evolves from real interactions

**Status**: NOT STARTED. This is the single most important milestone.

### Gate 2: Security Minimum Viable (required for corporate presentation)

- [ ] Authentication layer (API keys at minimum, OAuth preferred)
- [ ] Encryption at rest (SQLite encryption extension or migrate to PostgreSQL)
- [ ] Audit logging (who did what, when, with what tool)
- [ ] PII detection and masking in LLM prompts
- [ ] Role-based API access (not just tool scoping)
- [ ] HTTPS for all endpoints
- [ ] Secret management (no .env files in production)

**Status**: NOT STARTED.

### Gate 3: WhatsApp Business API Migration (existential risk)

- [ ] Migrate from Baileys (unofficial, reverse-engineered) to WhatsApp Business API
- [ ] This removes the existential risk of Meta blocking the integration overnight
- [ ] Cost: WhatsApp Business API charges per conversation ($0.005–0.08 depending on category/country)
- [ ] Requires Meta Business Manager verification

**Status**: NOT STARTED. Baileys works perfectly but is a liability for any corporate pitch.

### Gate 4: Data Connectors (Phase 12 — unlocks real intelligence)

- [ ] Cubo BI integration (real revenue data)
- [ ] Live inventory feed (not manually seeded)
- [ ] Contracts system integration (renewal dates, terms)
- [ ] Programming schedule sync

**Status**: PLANNED, not started.

### Gate 5: Multi-Channel (competitive parity)

- [ ] Web chat widget (embedded in client portal or standalone)
- [ ] Email channel (receive + respond)
- [ ] Consider: SMS, Slack for internal team communication

**Status**: NOT STARTED. WhatsApp-only is a hard limitation for some corporate environments.

### Gate 6: Observability & Ops (required for SLA)

- [ ] Health monitoring dashboard (not just VP glance)
- [ ] Alerting on agent failures, latency spikes, budget overruns
- [ ] Backup strategy (automated SQLite backups, off-site)
- [ ] Uptime SLA tracking
- [ ] Cost attribution per team/region

**Status**: Partial. Agent-controller has health endpoint + provider metrics. CRM has VP glance. No unified ops view.

---

## Salesforce's Own Weaknesses (Our Opportunities)

These are real, documented problems with Agentforce that validate our approach:

1. **77% B2B implementation failure rate** — attributed to data quality. Our domain-specific schema avoids the "dirty org" problem
2. **Pricing confusion** — 3 pricing models in 18 months. $2/conversation scared buyers. We're 100x cheaper
3. **13% adoption after 18 months** — suggests product-market fit is unproven at scale
4. **Only 51% of deals are paid** — half are pilots/tire-kicking
5. **Inherits org technical debt** — governor limits, bad automations, dirty data. We start clean
6. **Locked ecosystem** — if you're not already a Salesforce shop, entry cost is enormous
7. **No long-term memory** — agents forget between conversations. We don't
8. **Generic, not domain-specific** — every implementation is a consulting project. We're pre-built for media ad sales
9. **Forrester skepticism** — "lots of potential but a long way to go for meaningful ROI"

---

## The Honest Bet

**If CRM-Azteca survives 60 days of production with 5 real salespeople and doesn't collapse**, it becomes a genuinely superior solution for Mexican broadcast media ad sales at 1/100th the cost of Salesforce.

The architectural advantages are real:

- Hybrid RAG more sophisticated than Data Cloud's default vector search
- Long-term memory that Salesforce doesn't offer natively
- Domain tools that would cost $100K+ in Salesforce consulting
- 100x cheaper per interaction

The gaps are also real:

- Zero production validation
- Zero security infrastructure
- Existential WhatsApp dependency (Baileys)
- Single-channel, single-VPS, single-developer

**The 60 days haven't started yet. That's what matters most.**

---

## Competitive Intelligence Sources

- Salesforce FY2026 earnings: $41.5B revenue, ~23% CRM market share
- Agentforce metrics: $500M ARR, 23K customers, 3.2T tokens processed (Q4 FY2026)
- Pricing: $2/conversation → $0.10/action → $125–550/user/mo (3 models in 18 months)
- Analyst coverage: Forrester (skeptical on ROI), The Register (seat-based pivot = agents not replacing people)
- Salesforce Ben community analysis (adoption, pain points, architecture)
- Monetizely pricing deep-dive (TCO analysis, hidden costs)

---

## Review Cadence

- **Monthly**: Update competitive snapshot (Salesforce releases, pricing changes, analyst reports)
- **Per gate closure**: Update status, add metrics from production validation
- **Quarterly**: Full reassessment of positioning and gap priorities
