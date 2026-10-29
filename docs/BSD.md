# Business System Document (BSD)
## ModelRouter — Business Architecture, Unit Economics & Operational Governance

---

### Document Control
- **Document ID:** DOC-BSD-001
- **Product Name:** ModelRouter
- **Version:** 1.0.0
- **Status:** Approved / Production-Ready
- **Domain:** AI Infrastructure & FinOps Governance

---

## 1. Business Vision & Market Rationale

### 1.1. Market Context
Enterprise adoption of Generative AI has transitioned from exploratory pilots to high-volume production deployments. Autonomous multi-agent pipelines, developer assistants, and customer intelligence bots generate millions of LLM requests daily. However, **unmanaged model utilization creates exponential operational expenditure**—commonly called the "Frontier Tax."

### 1.2. The "Frontier Tax" Problem
When an application routes 100% of its prompt volume to premium frontier models (e.g., Claude 3.5 Sonnet, GPT-4o, OpenAI o1), organizations pay premium rates for mundane tasks:
- 40% of queries are basic classification, entity extraction, or conversational pleasantries (Complexity 1.0–1.8).
- 35% of queries are routine code refactoring, data transformation, or summarization (Complexity 1.9–3.2).
- Only 25% of queries genuinely require frontier reasoning, architectural planning, or formal verification (Complexity 3.3–5.0).

By deploying **ModelRouter**, organizations apply **System One neural triage**: routing the bottom 75% of query volume to local or mid-tier engines while preserving premium frontier budgets strictly for high-complexity cognitive challenges.

---

## 2. Unit Economics & Cost Comparison Matrix

### 2.1. Pricing Tier Breakdown

| Tier | Category | Sample Engines | Input Cost / 1M | Output Cost / 1M | Latency (TTFT) | Typical Workloads |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | Local Ollama | `lfm3`, `qwen3.5:1.5b` | **$0.000** | **$0.000** | $50 - 150\text{ ms}$ | Factual QA, greetings, JSON sanitization, regex |
| **Tier 2** | Mid-Tier / Frugal | `qwen3.7-plus`, `minimax-m3` | **$0.150** | **$0.600** | $250 - 600\text{ ms}$ | CRUD endpoints, standard code gen, translation |
| **Tier 3** | Frontier Cloud | `claude-sonnet-4-6`, `deepseek-r1` | **$3.000** | **$15.000** | $1,200 - 3,500\text{ ms}$ | System architecture, formal proofs, multi-agent consensus |

### 2.2. Enterprise ROI Simulation (1,000,000 Monthly Queries)
*Assumptions: Average query size = 500 input tokens, 250 output tokens.*

```
Traffic Distribution Scenario:
- 40% Tier 1 (400,000 queries)
- 35% Tier 2 (350,000 queries)
- 25% Tier 3 (250,000 queries)
```

#### Without ModelRouter (100% Frontier Routing):
- **Total Input Tokens:** $1,000,000 \times 500 = 500\text{M tokens} \times \$3.00/\text{M} = \$1,500$
- **Total Output Tokens:** $1,000,000 \times 250 = 250\text{M tokens} \times \$15.00/\text{M} = \$3,750$
- **Total Monthly Spend:** **$5,250.00 / month**

#### With ModelRouter (Dynamic System One Routing):
- **Tier 1 (40%):** $400,000 \text{ queries} \times \$0.00 = \mathbf{\$0.00}$
- **Tier 2 (35%):**
  - Input: $350,000 \times 500 = 175\text{M} \times \$0.15/\text{M} = \$26.25$
  - Output: $350,000 \times 250 = 87.5\text{M} \times \$0.60/\text{M} = \$52.50$
  - Subtotal: $\mathbf{\$78.75}$
- **Tier 3 (25%):**
  - Input: $250,000 \times 500 = 125\text{M} \times \$3.00/\text{M} = \$375.00$
  - Output: $250,000 \times 250 = 62.5\text{M} \times \$15.00/\text{M} = \$937.50$
  - Subtotal: $\mathbf{\$1,312.50}$
- **Total Monthly Spend:** **$1,391.25 / month**

#### Net Financial Impact:
- **Net Monthly Savings:** **$3,858.75 / month**
- **Overall Cost Reduction:** **73.5% Cost Reduction**
- **Evaluator Cost:** **$0.00** (Liquid d1 runs locally on existing Ollama CPU/GPU).

---

## 3. Domain-Driven Design (DDD) Bounded Contexts

ModelRouter's business domain is structured into five distinct Bounded Contexts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MODELROUTER DOMAIN MAP                          │
│                                                                        │
│  ┌───────────────────────────┐          ┌───────────────────────────┐  │
│  │   Ingress & Protocol      │          │     Neural Evaluation     │  │
│  │         Context           │─────────►│          Context          │  │
│  │ (OpenAI/Anthropic Ingress)│          │ (System One / Liquid d1)  │  │
│  └───────────────────────────┘          └─────────────┬─────────────┘  │
│                                                       │                │
│                                                       ▼                │
│  ┌───────────────────────────┐          ┌───────────────────────────┐  │
│  │   Upstream Dispatch &     │◄─────────┤     Fleet Policy &        │  │
│  │    Streaming Context      │          │     Routing Context       │  │
│  │(SSE Transcoder / Adapters)│          │  (Registry / Policy Rules)│  │
│  └─────────────┬─────────────┘          └───────────────────────────┘  │
│                │                                                       │
│                ▼                                                       │
│  ┌───────────────────────────┐                                         │
│  │ Observability & Telemetry │                                         │
│  │          Context          │                                         │
│  │ (FinOps / $ Saved Metrics)│                                         │
│  └───────────────────────────┘                                         │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Ingress & Protocol Context:** Responsible for consuming client HTTP requests and translating diverse provider semantics into canonical representations.
2. **Neural Evaluation Context:** Evaluates prompt cognitive complexity in constant time ($O(1)$) without generating text.
3. **Fleet Policy & Routing Context:** Governs business optimization goals (cost minimization, quality maximization, data sovereignty/local first).
4. **Upstream Dispatch & Streaming Context:** Manages provider network connections, authorization headers, and real-time SSE stream transcoding.
5. **Observability & Telemetry Context:** Computes financial metrics, cost baselines, latency percentiles, and provides real-time auditability.

---

## 4. Business Risk Management & Trade-offs

| Risk Factor | Probability | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Evaluator Latency Spike** | Low | Medium | Enforce a strict 10-second timeout guard with immediate fallback to regex heuristics ($<1\text{ms}$). |
| **Model Under-routing (Capability Deficit)** | Low | High | Use conservative complexity boundaries (e.g., any detected code or multi-step logic instantly jumps to Complexity $\ge 2.7$). |
| **Vendor Outage / Upstream 429** | Medium | High | Multi-provider registry allows toggling failed models off in the UI in 1 click; gateway routes to next Pareto match. |
| **Context Bloat on Upstream Proxy** | Low | High | Minimal prompt state isolation ensures full context history is never needlessly duplicated into the evaluator pass. |

---

## 5. Operational Governance & Service Level Agreements (SLA)

1. **Availability SLA:** $99.95\%$ uptime for gateway endpoints.
2. **Routing Overhead Budget:** The proxy will add no more than $20\text{ms}$ average overhead to standard upstream inference.
3. **Data Sovereignty:** Enterprise customers can select the `local_first` policy to enforce that proprietary company prompts never leave on-premise Ollama instances unless explicit administrative override is configured.
4. **Transparent Auditability:** Every outgoing HTTP response is branded with `X-D1-Complexity-Score`, `X-D1-Selected-Model`, and `X-D1-Routing-Latency`, allowing engineering teams to audit routing decisions deterministically.
