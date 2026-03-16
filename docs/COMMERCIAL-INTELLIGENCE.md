# Commercial Intelligence: From Tracking to Thinking

> A prospective on where Pulso goes once it starts thinking commercially.
> Written 2026-03-16. Grounded in what exists, aimed at what's achievable.

---

## Where We Are

Pulso today is a reactive system. It captures interactions, tracks pipeline, alerts on risks, gates record creation, and answers questions. It does these things well — 52 tools, 22 tables, a per-person agent architecture that adapts to each salesperson, and an approval workflow that enforces data quality.

But it is, fundamentally, a clerk. An exceptionally organized, tireless, never-forgets-anything clerk — but a clerk. It records what the humans decide. It doesn't originate ideas.

The foundation is solid. The question is: what happens when the clerk starts thinking?

---

## The Shift

The transition from tracking to thinking is not a feature. It's a change in the agent's relationship to commercial activity.

Today's relationship:

```
Human sees opportunity → Human creates proposal → Agent tracks it
Human talks to client  → Human registers activity → Agent stores it
Human notices risk     → Human asks agent        → Agent queries data
```

Tomorrow's relationship:

```
Agent sees opportunity → Agent drafts proposal → Human refines and sends
Agent detects risk     → Agent recommends action → Human decides
Agent spots pattern    → Agent generates insight → Human develops intuition
```

The inversion is subtle but profound. The agent becomes the prospector, not the record-keeper. The human becomes the editor, not the author. Neither is diminished — both are elevated. The agent gains commercial relevance; the human gains analytical leverage.

---

## Five Capabilities

### 1. Pattern Recognition

The simplest form of commercial thinking: seeing what's there but buried in volume.

An AE managing 10 accounts can deeply think about maybe 3. The other 7 get serviced but not prospected. The agent has no such attention limit. It can, every night, scan all accounts against all events, all inventory, and all historical behavior to produce hypotheses:

- "Coca-Cola bought TV abierta for Dia de las Madres last year but hasn't been contacted about it this year. Flight window opens in 6 weeks."
- "3 of your 5 lost proposals this quarter cited 'precio' as the reason. Your average deal size is 30% above the team median. Consider smaller entry packages."
- "Bimbo's billing gap has been growing for 4 weeks. Historically, when gap exceeds 15%, the client renegotiates the upfront. Preemptive contact recommended."

These are not alerts. Alerts detect symptoms (stale proposal, low quota). Commercial patterns detect opportunities with causal reasoning and recommended actions.

The data already exists. The missing piece is a nightly analytical engine that produces _insights_ rather than _notifications_.

### 2. Opportunity Origination

The philosophical core. What if the agent could propose deals?

Five trigger types:

**Calendar-driven.** Events have dates. Brands that bought last year should be contacted N weeks before the next edition. Brands in similar verticals that didn't buy could be prospected.

**Inventory-driven.** Unsold inventory approaching a date threshold loses value. The agent matches unsold slots to accounts whose profile and history suggest a fit.

**Gap-driven.** A client's billing is below plan. Instead of just alerting the AE, the agent drafts a recovery proposal — a smaller package at an adjusted price to close the gap before year-end.

**Cross-sell driven.** The existing analysis already identifies gaps in a client's media mix. The next step is turning those recommendations into draft proposals with specific inventory, pricing, and flight dates.

**Market-driven.** A brand launches a new product (detected via web search). A competitor loses a major account. A regulatory change opens a category. The agent connects external signals to internal inventory.

The critical design principle: the agent never sends a proposal without human approval. It drafts; the human refines. This is the copilot boundary that makes adoption possible. The approval workflow we built today is a prerequisite — it establishes the pattern of "agent proposes, human authorizes" that extends naturally from record creation to deal origination.

### 3. Package Building

Media sales is not "sell a spot." It's constructing packages — combinations of TV abierta, CTV, radio, and digital that achieve a client's reach and frequency goals within their budget.

A good AE assembles this intuitively. But intuition doesn't scale. An AE with 10 accounts can craft bespoke packages for their top 3. The other 7 get templates.

Given:
- The client's historical media mix (from past propuestas)
- Available inventory (from the inventario table)
- The event calendar (from crm_events)
- Industry benchmarks (from win/loss analysis)
- Budget signals (from contrato monto_comprometido)

The agent can generate a first-draft package: "Based on Coca-Cola's last 3 campaigns (avg $14M, 60% TV, 25% digital, 15% radio) and available Copa del Mundo inventory (TV abierta 40% available, CTV 70% available), here's a draft package at $13.5M with a recommended media mix shift toward CTV given the younger demo indexing."

This doesn't replace the AE's craft. It gives them a starting point that would take 2-3 hours to assemble manually. The AE spends 20 minutes refining instead of 3 hours building from scratch. And crucially, every account gets a commercially intelligent first draft — not just the favorites.

### 4. Lateral Intelligence

Each agent today operates in isolation. AE1's agent doesn't know what AE2's agent is seeing. But the patterns across agents are where the strategic gold lies.

- "3 agencies under WPP have asked about CTV pricing this week. This looks like a holding-level initiative. Escalate to Director for a holding-wide package."
- "Automotive vertical: 4 of 6 accounts reduced Q2 budgets. Industry headwind detected. Proactive retention outreach recommended for the remaining 2."
- "Unilever (AE1) and Procter & Gamble (AE3) both targeting the same tentpole inventory block. Director should orchestrate allocation."

This requires aggregated signals across agents — visible to gerentes, directors, and VP. Not violating individual conversation privacy, but surfacing commercial patterns that no single agent can see.

The gerente's agent becomes a coaching tool informed by team-wide data. The director's agent becomes a resource allocator. The VP's agent becomes genuinely strategic — it sees the forest.

### 5. Revenue Optimization

Beyond individual deals, there's an organization-level optimization: maximize total revenue from a finite inventory pool across all accounts, time periods, and media types.

**Yield management.** As an event approaches and inventory sells, remaining slots become scarce. The agent recommends dynamic pricing: "Copa del Mundo TV abierta is 85% sold with 3 weeks to go. Floor price for remaining inventory should increase 15%."

**Portfolio balancing.** "$80M in pipeline, but 70% concentrated in 3 mega-deals. If any one falls through, quota misses by 25%. Diversification recommended: 5-8 mid-market proposals to reduce concentration risk."

**Discount discipline.** "Deals closed with >10% discount had 40% lower renewal rates the following year. Short-term revenue gain doesn't offset lifetime value impact. Hold firm on pricing for accounts with renewal potential."

**Timing optimization.** "Based on 2 years of data, proposals sent on Tuesdays convert 23% better than Fridays. Optimal follow-up cadence for this buyer (14 past interactions analyzed): 5-7 business days."

All derivable from existing data. The agent doesn't need magic — it needs analytical models running against the tables we already have.

---

## The Virtuous Cycle

Here's where it gets interesting. Commercial thinking improves itself.

Each cycle of "agent proposes, human refines, outcome observed" generates signal. When an AE modifies an agent-drafted proposal before sending, the delta between draft and final IS the commercial judgment the agent lacks. Over hundreds of cycles:

- "For automotive clients, I consistently overestimate the digital component — AEs reduce it by 30%"
- "My Copa del Mundo packages start too high — AEs cut prices by 15% on average"
- "When I suggest CTV for traditional buyers, the AE removes it 80% of the time"

These aren't stored as model weights. They're stored as memories — durable observations that the agent injects as context on the next draft. The system becomes sharper without retraining.

And the virtuous cycle runs in both directions. The AE receives an insight: "Your lost deals share 3 characteristics." The AE develops commercial intuition they wouldn't have reached from experience alone. The agent learns from the human's corrections; the human learns from the agent's analysis. Both get commercially smarter.

This is the real vision. Not an agent that replaces judgment, but a human-agent symbiosis where each sharpens the other. The agent has perfect recall and tireless attention. The human has relationship intuition, cultural context, and creative negotiation instinct. Together, they're a better commercial mind than either alone.

---

## The Horizon

**Stage 1 — The Organized Clerk (now).** Captures, queries, alerts, gates. Value: time savings, data quality, visibility. The org knows what it's doing.

**Stage 2 — The Proactive Advisor (6-12 months).** Originates opportunities, drafts proposals, detects patterns. Value: revenue from opportunities that would have been missed. Faster deal cycles. Better inventory utilization. The org starts doing things it wouldn't have thought to do.

**Stage 3 — The Strategic Partner (12-18 months).** Cross-agent intelligence informs organizational decisions. The VP's agent synthesizes signals from 20+ account-level agents into market insights. Value: strategic decision quality, competitive positioning, portfolio optimization. The org thinks better.

**Stage 4 — The Commercial Nervous System (18-24 months).** The agent network becomes the organization's commercial intelligence layer. Agents negotiate internally (inventory allocation, pricing coordination) before surfacing recommendations. The boundary between "the CRM" and "the commercial strategy team" begins to dissolve. The org acts as a coherent commercial entity rather than a collection of individual salespeople.

Each stage builds on the previous one. None requires a technology leap — just disciplined application of the architecture we already have: per-agent memory, hierarchical visibility, approval workflows, and nightly analytical processing.

---

## Guardrails

Commercial intelligence without guardrails is dangerous. Five principles:

**1. Human authorization on all external actions.** The agent drafts; the human sends. The agent recommends; the human decides. This is not negotiable. The approval workflow pattern (agent creates, human approves) extends from record creation to deal origination.

**2. Transparency of reasoning.** Every insight includes the data it's based on and the confidence level. "Based on 14 historical interactions with this buyer (high confidence)" vs. "Based on 2 similar accounts in the vertical (low confidence, treat as hypothesis)." The agent never presents a guess as a fact.

**3. Active engagement monitoring.** If AEs consistently accept agent drafts without modification, it's a signal that they've stopped thinking. Track the delta between draft and sent. A healthy delta means the human is engaged. Zero delta means the human has abdicated judgment.

**4. Minimum sample sizes.** No pattern claim without statistical foundation. "Proposals sent on Tuesdays convert better" requires N>30 proposals across multiple accounts, not a coincidence from last month. The agent states its sample size and expresses uncertainty when it's low.

**5. The framing matters.** The agent is the AE's secret weapon, not their replacement. It does the analytical grunt work so they can spend more time in human connection — the part of selling that no machine can replicate. Commercial intelligence amplifies the human advantage in relationships, not substitutes for it.

---

## What Makes This Different

Enterprise AI CRM products (Salesforce Einstein, HubSpot Breeze, Microsoft Copilot for Sales) share a common architecture: centralized platforms with AI features layered on top. The AI is a feature. The database is the product.

Pulso is architecturally different in three ways:

**Agent-per-person, not AI-per-org.** Each salesperson has their own agent with isolated memory, conversation history, and learned preferences. Maria's agent adapts to her style differently than Carlos's. Enterprise tools give everyone the same model with the same prompts. Commercial intelligence that adapts to individual selling styles is impossible in a centralized architecture.

**Conversational-first, not dashboard-first.** The interface is WhatsApp. The agent meets the salesperson where they already work — no context switch, no app to open, no dashboard to learn. The insight arrives in the conversation at the moment it's relevant. Enterprise tools require the salesperson to go to the insight; Pulso brings the insight to the salesperson.

**Bottom-up intelligence, not top-down analytics.** Enterprise AI CRM does analytics on aggregated data and pushes dashboards to managers. Pulso builds intelligence from individual conversations upward. The AE's agent learns from their specific interactions; the gerente's agent synthesizes team patterns; the VP's agent sees organizational patterns. Intelligence is emergent, not imposed.

The positioning: Pulso is not a CRM with AI bolted on. It's an AI that needs CRM data to think. The tables are memory. The agent is the entity. Commercial thinking is not a feature added to a database — it's the natural consequence of an architecture that puts the agent at the center.

---

## The Path

Concrete phases that deliver incremental value, each building on the last. Each phase is independently useful — you don't need to complete all four to capture value.

### Phase A: The Overnight Analyst (2-3 sessions)

A nightly batch process (2-4 AM MX) that scans all accounts against events, inventory, historical behavior, and peer comparisons. Produces structured insights stored in a new table (`insight_comercial`), each with:

- Type (opportunity, risk, pattern, recommendation)
- Confidence score
- Affected entities (account, proposal, event)
- Recommended action
- Supporting data points

These are injected into the morning briefing: "3 opportunities identified overnight." The AE can dismiss, act on, or refine each one.

This alone — overnight analysis surfacing opportunities that would otherwise be missed — delivers immediate revenue impact.

### Phase B: The Draft Proposal Engine (2-3 sessions)

Takes an insight from Phase A and generates a draft propuesta (`estado = 'borrador_agente'`). Includes title, estimated value, media mix, flight dates, and a written rationale.

The AE reviews via WhatsApp: "Your agent drafted a Copa del Mundo proposal for Bimbo. Review: $8.2M, TV abierta + CTV, Jun 11 - Jul 19. Accept/modify/dismiss?"

The delta between draft and final version is stored as a learning signal in memory. Over time, the agent's drafts get closer to what the AE would have written.

### Phase C: Cross-Agent Signals (2-3 sessions)

Nightly aggregation across all accounts: vertical trends, holding-level patterns, inventory conflicts, systemic win/loss signals. Stored in `patron_detectado`.

Director and VP briefings are enriched with intelligence no individual agent can see. The VP's morning briefing includes: "Automotive vertical budget contraction detected across 4 of 6 accounts. WPP holding showing coordinated CTV buying interest. Inventory conflict on tentpole block 3."

Privacy-preserving by design: patterns are aggregated, never individual conversation contents.

### Phase D: The Feedback Loop (1-2 sessions)

Closes the virtuous cycle:

- Track conversion rates: agent-originated proposals vs. human-originated
- Track modification patterns: what does the agent consistently get wrong?
- Store corrections as persistent memory
- Generate quarterly "commercial learning reports" for the team

The system gets commercially sharper with every cycle. Not through retraining, but through accumulated memory of human corrections.

---

## A Final Thought

The question "where can we take commercial thinking once harnessed?" has a deceptively simple answer: everywhere the organization currently relies on individual attention spans.

A sales team of 20 AEs, each managing 10 accounts, faces 200 commercial relationships. No human can hold 200 relationships in active consideration simultaneously. Today, maybe 60 get real attention. The other 140 are serviced but not prospected — revenue left on the table by the limits of human cognition.

Twenty agents, each with perfect recall and tireless analytical capacity, can hold all 200 in active commercial consideration every single night. Not with the depth and nuance of human relationship building — but with the consistency and analytical rigor that identifies which of the 200 deserve the human's scarce attention tomorrow morning.

That's the commercial intelligence proposition: not replacing human judgment, but ensuring it's always applied where it matters most.
