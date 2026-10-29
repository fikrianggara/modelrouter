# System Architecture Document & Technical Blueprint
## ModelRouter — High-Performance Neural Complexity Reverse Proxy

---

### Document Control
- **Document ID:** DOC-ARCH-001
- **Product Name:** ModelRouter
- **Version:** 1.0.0
- **Status:** Approved / Production-Ready
- **Classification:** Core Technical Architecture

---

## 1. High-Level Architectural Blueprint

ModelRouter is an ultra-low latency intelligent reverse proxy and developer console built for multi-agent workflows and high-volume AI applications. It sits transparently between downstream client applications and upstream model execution fleets.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       DOWNSTREAM CLIENT LAYER                                          │
│                                                                                                        │
│     ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐         │
│     │   OpenAI Python SDK    │      │   Anthropic TS SDK     │      │   Web Dashboard SPA    │         │
│     │ (POST /v1/chat/compl.) │      │ (POST /v1/messages)    │      │ (TanStack Router 8100) │         │
│     └───────────┬────────────┘      └───────────┬────────────┘      └───────────┬────────────┘         │
└─────────────────┼───────────────────────────────┼───────────────────────────────┼──────────────────────┘
                  │                               │                               │
                  ▼                               ▼                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                MODELROUTER GATEWAY RUNTIME (PORT 8100)                                 │
│                                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. INGRESS & CANONICAL ADAPTER LAYER (src/adapters/canonical.ts)                                 │  │
│  │    • Zero-copy payload parsing into CanonicalRequest                                             │  │
│  │    • Minimal prompt state extraction (trims conversation bloat before evaluation)                │  │
│  └──────────────────────────────────────────────┬───────────────────────────────────────────────────┘  │
│                                                 │                                                      │
│                                                 ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. NEURAL DECISION EVALUATOR (src/engine/d1-client.ts)                                           │  │
│  │    • Single forward-pass evaluation via Liquid AI d1 (Ollama /v1/systemone)                      │  │
│  │    • Output: Complexity (1.00 - 5.00), Domain, Tool necessity, Vision necessity                  │  │
│  │    • 10-Second AbortController Timeout Guard + Deterministic Heuristic Regex Fallback            │  │
│  └──────────────────────────────────────────────┬───────────────────────────────────────────────────┘  │
│                                                 │                                                      │
│                                                 ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. DETERMINISTIC POLICY RESOLUTION ENGINE (src/engine/policy.ts)                                 │  │
│  │    • Candidate filtering against capability tags (tools, vision, max_context)                    │  │
│  │    • Operational Policies: Balanced (Pareto), Cost-Optimized, Quality-Max, Local-First           │  │
│  └──────────────────────┬───────────────────────────────────────────────┬───────────────────────────┘  │
│                         │                                               │                              │
│                         ▼                                               ▼                              │
│  ┌──────────────────────────────────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │ 4. FLEET REGISTRY STORE (src/engine/registry)│  │ 5. TELEMETRY RING BUFFER (src/core/telemetry)  │  │
│  │    • Declarative YAML (config/registry.yaml) │  │    • Fixed-size 50-item bounded memory buffer  │  │
│  │    • Runtime model toggle & CRUD APIs        │  │    • Real-time savings ($ USD) vs Frontier     │  │
│  └──────────────────────┬───────────────────────┘  └────────────────────────────────────────────────┘  │
│                         │                                                                              │
│                         ▼                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 6. UPSTREAM DISPATCH & STREAM TRANSCODING (src/adapters/sse-transcoder.ts)                       │  │
│  │    • Provider header translation & credential isolation                                          │  │
│  │    • Zero-latency bi-directional SSE transcoding (OpenAI SSE <-> Anthropic SSE)                  │  │
│  │    • Response header enrichment: X-D1-Score, X-D1-Model, X-D1-Latency, X-D1-Fallback            │  │
│  └──────────────────────┬───────────────────────────────────────────────┬───────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┘
                          │                                               │
                          ▼                                               ▼
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────────────┐
│       LOCAL EXECUTION FLEET (PORT 11434)     │  │          REMOTE PROXY & CLOUD FLEET (PORT 20128)     │
│                                              │  │                                                      │
│    • Liquid AI d1 (Decision Evaluator)       │  │    • 9router Multi-Provider Gateway                  │
│    • Local Models: lfm3, qwen3.5, lfm2.5     │  │    • Claude 3.5 Sonnet, Claude Opus, DeepSeek-R1     │
└──────────────────────────────────────────────┘  └──────────────────────────────────────────────────────┘
```

---

## 2. Component Decomposition & Module Responsibilities

### 2.1. Ingress & Canonical Normalization (`src/adapters/canonical.ts`)
- **Protocol Agnosticism:** Downstream consumers communicate via their native SDK without modification.
- **Normalization:** Converts OpenAI `POST /v1/chat/completions` and Anthropic `POST /v1/messages` into a uniform `CanonicalRequest`.
- **State Extractor (`extractPromptState`):** Isolates prompt instructions and user queries while dropping repetitive system boilerplate. This prevents the neural evaluator from consuming hundreds of thousands of tokens when routing long multi-turn sessions.

### 2.2. Neural Decision Evaluator (`src/engine/d1-client.ts`)
- **Evaluator Mechanism:** Direct REST client to Ollama endpoint `http://localhost:11434/v1/systemone`.
- **System One Architecture:** Unlike generative LLMs (System Two) that produce text tokens token-by-token with high latency, Liquid d1 executes a single forward pass, returning structural JSON in ~14ms with **0 output tokens**.
- **Fault-Tolerant Heuristic Guard:** If Ollama is busy, uninstalled, or exceeds 10,000ms, the request is not dropped. The client runs regex classification across complexity tiers, flags `isFallback: true`, and proceeds seamlessly.

### 2.3. Policy Resolver Engine (`src/engine/policy.ts`)
- Evaluates filtered candidate engines against the active routing strategy:
  1. **Balanced:** Maximizes the objective function:
     $$\text{Score} = w_1 \cdot \left(\frac{1}{\text{Cost}}\right) + w_2 \cdot \left(\frac{\text{Capability}}{\Delta\text{Complexity}}\right)$$
  2. **Cost-Optimized:** Selects the lowest-cost model ($/1M tokens) satisfying the complexity lower bound.
  3. **Quality-Max:** Dispatches to the highest capability frontier model.
  4. **Local-First:** Prioritizes local Ollama execution ($0.00 cost) whenever complexity $\le 2.50$.

### 2.4. Bi-directional SSE Stream Transcoder (`src/adapters/sse-transcoder.ts`)
- Built on the Web-standard `TransformStream` API.
- Converts upstream chunk formats on the fly (e.g., OpenAI chunk `delta.content` $\leftrightarrow$ Anthropic `content_block_delta`).
- Emits bytes downstream immediately with zero memory buffering.

---

## 3. Network Topology & Port Mapping

```
[Local Host / Container Network]

Port 8100 (ModelRouter Core Gateway)
  ├── POST /v1/chat/completions  --> OpenAI Ingress
  ├── POST /v1/messages          --> Anthropic Ingress
  ├── GET  /v1/models            --> OpenAI Models Discovery
  ├── POST /api/evaluate         --> Test Bench Evaluation API
  ├── GET  /api/stats            --> Real-time Telemetry Polling
  ├── GET  /api/telemetry/recent --> Latest 50 Requests Feed
  ├── GET  /health               --> System Health Probe
  └── GET  /*                    --> Vite TanStack Router SPA

Port 11434 (Ollama Runtime Daemon)
  ├── POST /v1/systemone         --> Liquid d1 Neural Decision Model
  └── POST /v1/chat/completions  --> Local Models (lfm3, qwen3.5, lfm2.5)

Port 20128 (9router Remote Proxy)
  └── POST /v1/chat/completions  --> Upstream Frontier Engines (Sonnet, DeepSeek)
```

---

## 4. Frontend Architecture: Firecrawl Architectural Bento Grid

The ModelRouter dashboard (`src/web/`) is built using React 18, TanStack Router, and Tailwind CSS. It implements the **Firecrawl v2 Blueprint Design System**:

1. **Full-Bleed 3-Column Layout:**
   - Structured as `grid-cols-[1fr_minmax(0,1200px)_1fr]`.
   - Continuous 1px hairline side gutters (`border-r` and `border-l`) stretch to the edge of the viewport.
2. **Gapless Bento Grid (0px Gap):**
   - Interactive metric cards and pipeline steps have `gap: 0px`, joined tightly by `1px solid var(--fc-border-faint)`.
   - Prevents double-borders by applying directional single borders (`border-r`, `border-b`).
3. **Corner Crosshairs (`+`):**
   - Architectural blueprint aesthetic featuring monospace `+` ticks positioned at card intersections.
4. **Interactive States:**
   - Cards transition to pure white on hover (`hover:bg-white dark:hover:bg-[#1C1C1C]`) with signature Heat Orange underline indicators (`h-[2px] bg-heat-100`).
5. **ASCII Flame Ticker:**
   - Lightweight monospace ASCII flame visualizer running an 80ms matrix ticker with full `prefers-reduced-motion` compliance.

---

## 5. Security Architecture & Threat Modeling

1. **Credential Isolation:** Client applications authenticate against ModelRouter using a local bearer token. Upstream API keys (e.g., 9router token, Anthropic key) are stored in server environment variables and never returned to downstream clients.
2. **Egress Guardrails:** Prompts evaluated by Liquid d1 stay within the local loopback interface (`localhost:11434`), ensuring zero proprietary data leakage during the decision phase.
3. **DoS & Resource Exhaustion Defense:**
   - In-memory ring buffer is hard-capped at 50 items.
   - D1 evaluator enforces an immutable 10-second timeout guard.
   - Prompt state extraction truncates input evaluation contexts to avoid memory allocation spikes.

---

## 6. Verification, Test Coverage & Quality Gates

The ModelRouter codebase adheres to strict Test-Driven Development (TDD) with 100% test retention:

```bash
$ npx vitest run

 ✓ tests/unit/policy-engine.test.ts (15 tests)
 ✓ tests/unit/canonical.test.ts (8 tests)
 ✓ tests/unit/sse-transcoder.test.ts (8 tests)
 ✓ tests/unit/d1-client.test.ts (21 tests)
 ✓ tests/unit/registry.test.ts (17 tests)
 ✓ tests/integration/gateway.test.ts (14 tests)
 ✓ tests/unit/telemetry.test.ts (3 tests)
 ✓ tests/unit/sanity.test.ts (1 test)
 ✓ tests/unit/config.test.ts (6 tests)
 ✓ tests/integration/web-server.test.ts (7 tests)

 Test Files  10 passed (10)
      Tests  100 passed (100)
   Duration  2.08s
```
