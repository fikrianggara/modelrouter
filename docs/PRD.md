# Product Requirements Document (PRD)
## ModelRouter — Intelligent Prompt-Complexity AI Reverse Proxy

---

### Document Control
- **Document ID:** DOC-PRD-001
- **Product Name:** ModelRouter
- **Version:** 1.0.0
- **Status:** Approved / Production-Ready
- **Author:** Senior Systems Analyst
- **Target Audience:** Engineering Leads, Product Managers, Platform Architects, DevOps Engineers

---

## 1. Executive Summary & Problem Statement

### 1.1. Background
Modern enterprise AI applications and autonomous multi-agent frameworks make heavy use of Large Language Models (LLMs) via OpenAI and Anthropic APIs. However, in standard setups, applications send all incoming user queries to a single frontier model (e.g., Claude 3.5 Sonnet, GPT-4o, or o1) regardless of the prompt's inherent difficulty.

### 1.2. The Problem
1. **Severe Cost Inefficiency:** Over 60–75% of routine prompts (formatting JSON, simple factual QA, conversational small talk, basic regex) require low cognitive capability, yet are billed at frontier rates ($3.00–$15.00+ per 1M tokens) instead of local or mid-tier rates ($0.00–$0.20 per 1M tokens).
2. **Unnecessary Latency Overhead:** Frontier models have significant Time-To-First-Token (TTFT) and inference overhead (1,000–3,000ms), whereas small local or specialized models can respond in 150–400ms.
3. **Context & Token Bloat:** Agents often dump extensive conversation history, system instructions, and schemas into every call, incurring large token bills when simple routing could trim or isolate requests.
4. **API & SDK Fragmentation:** Engineering teams face operational friction when integrating diverse upstream providers (OpenAI, Anthropic, Ollama, 9router, vLLM) due to incompatible request shapes, tool calling specs, and Server-Sent Event (SSE) streaming formats.

### 1.3. The Solution
**ModelRouter** is an ultra-low latency (<30ms overhead) reverse proxy that evaluates the intrinsic complexity of incoming prompts in a single forward pass using a specialized System One Neural Decision Model (**Liquid AI `d1`**). It deterministically selects the optimal upstream engine from a declarative Model Registry according to user-defined routing policies (Balanced, Cost-Optimized, Quality-Max, Local-First) and provides bi-directional SSE stream transcoding between OpenAI and Anthropic protocols.

---

## 2. Product Vision & Goals

### 2.1. Product Vision
To serve as the default intelligent ingress gateway for enterprise AI systems—making model execution cost-efficient, resilient, and transparent without changing application code.

### 2.2. Core Objectives & Key Results (OKRs)
- **Objective 1: Drastically Reduce LLM Operational Costs**
  - *KR 1.1:* Achieve 40–70% overall cost reduction across typical production traffic distributions compared to routing 100% of queries to frontier models.
- **Objective 2: Minimize Gateway Latency Overhead**
  - *KR 2.1:* Keep mean routing evaluation latency strictly below 20ms (P95 <30ms, P99 <50ms) using single forward-pass System One neural classification.
- **Objective 3: Provide Frictionless Dual-Protocol Ingress**
  - *KR 3.1:* Achieve 100% drop-in compatibility with standard OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) SDKs.
- **Objective 4: High Reliability & Zero Outages**
  - *KR 4.1:* Guarantee 99.99% gateway availability via deterministic rule-based heuristic fallbacks if the primary neural evaluator times out or is unreachable.

---

## 3. User Personas & Target Audiences

| Persona | Role | Key Pain Points | Core Value Derived |
| :--- | :--- | :--- | :--- |
| **Agent / Backend Developer** | Builds AI-native apps, workflows, and tools | Incompatible provider SDKs, complicated fallback logic in app code | Single unified gateway URL, automatic model selection, drop-in SDK integration |
| **Platform & DevOps Engineer** | Manages LLM infrastructure, API keys, and rate limits | Upstream rate limiting, vendor lock-in, hardcoded credentials | Centralized model switchboard, unified API key management, seamless provider toggles |
| **Finance / FinOps Lead** | Monitors cloud infrastructure and AI API expenses | Unpredictable, soaring monthly LLM token bills | Real-time cost telemetry, configurable policy gates, verified $ saved metrics |

---

## 4. Functional Requirements (FR)

### 4.1. Dual Protocol Ingress Gateway
- **FR-01 (OpenAI Ingress):** Must accept standard `POST /v1/chat/completions` requests conforming to the OpenAI Chat Completion specification, including `messages`, `model`, `stream`, `temperature`, `max_tokens`, and `tools`.
- **FR-02 (Anthropic Ingress):** Must accept standard `POST /v1/messages` requests conforming to the Anthropic Messages API specification, including `messages`, `system`, `max_tokens`, `tools`, and `stream`.
- **FR-03 (Virtual Models):** Must recognize virtual model identifiers (`d1-router-auto`, `d1-router-cost`, `d1-router-quality`, `d1-router-local`) and dynamically bind them to corresponding routing policies.
- **FR-04 (Direct Model Passthrough):** Must allow direct execution of specific registered model IDs (e.g., `claude-sonnet-4-6`, `qwen3.5:latest`) bypassing dynamic complexity routing when explicitly requested.

### 4.2. Neural Complexity Evaluation (System One)
- **FR-05 (Prompt State Isolation):** Must extract minimal instruction text from incoming requests without dumping redundant system instructions or full conversational history into the evaluator.
- **FR-06 (Liquid d1 Protocol Integration):** Must query Ollama endpoint `POST /v1/systemone` using JSON payload `{"prompt": "..."}` to obtain continuous complexity scores (1.00–5.00), domain classification, and tool/vision flags.
- **FR-07 (Evaluation Timeout Guard):** Must enforce a configurable timeout (default: 10,000ms) for neural evaluation.
- **FR-08 (Deterministic Heuristic Fallback):** Must automatically fall back to rule-based regex and structural heuristic classification if the D1 evaluator encounters a network error, HTTP error, or timeout.
- **FR-09 (Zero Output Tokens):** Must ensure the evaluation stage produces zero generative output tokens, maintaining fixed computational overhead.

### 4.3. Policy Resolution & Candidate Matching
- **FR-10 (Policy Modes):** Must support four explicit operational routing strategies:
  1. `balanced`: Pareto-optimal trade-off between reasoning capability, cost per token, and processing latency.
  2. `cost_optimized`: Minimum $/1M token rate meeting the evaluated complexity lower bound.
  3. `quality_max`: Highest capability score frontier engine matching the domain.
  4. `local_first`: Prefer local Ollama instances ($0.00 cost, private) for complexity $\le 2.50$, only escalating to cloud when required.
- **FR-11 (Capability Filtering):** Must filter candidate engines against mandatory query requirements (`tools`, `vision`, `max_context`).

### 4.4. Upstream Dispatch & Bi-directional SSE Streaming
- **FR-12 (Provider Header & Auth Translation):** Must translate canonical requests to upstream provider formats (Ollama local, 9router proxy, direct OpenAI/Anthropic cloud) with isolated authorization headers.
- **FR-13 (Stream Transcoding):** Must transcode SSE chunks on-the-fly (e.g., Anthropic SSE format to OpenAI SSE format, or vice-versa) using Web-standard `TransformStream` without request/response buffering.
- **FR-14 (Egress Header Enrichment):** Must inject evaluation metadata headers into downstream HTTP responses: `X-D1-Complexity-Score`, `X-D1-Selected-Model`, `X-D1-Routing-Latency`, `X-D1-Fallback`.

### 4.5. Management & Developer Console (UI/UX)
- **FR-15 (Interactive Workbench / Playground):** Must provide a real-time testing console to input prompts, inspect complexity scores, observe the 5-stage decision flow, and view token streaming.
- **FR-16 (Model Switchboard / Registry CRUD):** Must provide runtime capabilities to inspect registered models, toggle model active states, edit complexity boundaries, and view raw YAML configuration.
- **FR-17 (Real-time Telemetry Dashboard):** Must display live counters for routed queries, decision latency, cumulative cost savings ($ USD), and active engines via 4-second polling.

---

## 5. Non-Functional Requirements (NFR)

### 5.1. Performance & Latency Budgets
- **NFR-01 (Decision Latency):** Gateway routing overhead must not exceed 30ms P95 in standard operation.
- **NFR-02 (Zero Memory Buffering):** Streaming responses must pass chunks directly through `TransformStream` without memory accumulation.
- **NFR-03 (Single Process Footprint):** The core service must run as a unified Node.js process consuming <150MB RSS under normal load.

### 5.2. Security & Data Isolation
- **NFR-04 (Credential Isolation):** Upstream API keys must be isolated on the server; clients never receive upstream provider keys.
- **NFR-05 (Prompt Confidentiality):** Prompts sent to local Ollama D1 never egress to external clouds during the evaluation phase.
- **NFR-06 (No Secret Logging):** Telemetry stores must truncate prompts to safe snippets (max 80 chars) and must never log authorization headers.

### 5.3. Usability & UI Design System
- **NFR-07 (Firecrawl Architectural Blueprint Aesthetic):** Must adhere to Firecrawl.dev design tokens: Paper `#F9F9F9` canvas, Graphite `#262626` text, Heat Orange `#FA5D19` accent, full-bleed 3-column layout (`grid-cols-[1fr_minmax(0,1200px)_1fr]`), gapless 0px bento cards, and 1px hairline borders (`#EDEDED`).

---

## 6. Success Metrics & Telemetry

| Metric | Target | Measurement Method |
| :--- | :--- | :--- |
| **Average Cost Reduction** | $\ge 50\%$ vs Frontier baseline | `(Frontier Cost - Actual Cost) / Frontier Cost * 100` |
| **Routing Decision Latency** | $\le 20\text{ ms}$ mean | `performance.now()` delta across D1 evaluator pass |
| **Fallback Occurrence Rate** | $< 1.0\%$ | `fallbackCount / totalRequests` |
| **Streaming TTFT Delta** | $< 35\text{ ms}$ additional delay | Client-observed TTFT compared to direct upstream TTFT |

---

## 7. Assumptions & Constraints

1. **Local Ollama Availability:** Assumes Ollama is running on `http://localhost:11434` with the `d1` model loaded for optimal sub-20ms evaluation.
2. **Stateless Gateway:** The gateway maintains telemetry in-memory (ring buffer of 50 records) without requiring an external PostgreSQL/Redis setup for core routing operations.
3. **Port Reservation:** Default service port is `8100` to prevent conflict with local development environments.
