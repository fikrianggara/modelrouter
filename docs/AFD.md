# Application Flow Document (AFD)
## ModelRouter — End-to-End System Logic & Process Flows

---

### Document Control
- **Document ID:** DOC-AFD-001
- **Product Name:** ModelRouter
- **Version:** 1.0.0
- **Status:** Approved / Production-Ready
- **Type:** Process & Architecture Flow Specification

---

## 1. High-Level System Flow Overview

The lifecycle of an inference request in ModelRouter proceeds through 5 deterministic, sequential stages:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 1: Ingress & Normalization                     │
│  Client sends request (OpenAI / Anthropic format) ──────────────────┐  │
│  Gateway parses body into zero-copy CanonicalRequest                │  │
│  Minimal instruction state extracted (prevents token bloat)         │  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 2: Neural Decision Pass (d1)                   │
│  Query Ollama POST /v1/systemone (Zero output tokens generated)     │  │
│  10-second timeout guard with deterministic heuristic fallback     │  │
│  Output: Complexity score (1.00 - 5.00), Domain, Tools/Vision flags │  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 3: Policy Resolution Filter                    │
│  Retrieve active models from ModelRegistry matching tags & ranges   │  │
│  Execute Policy: Balanced | Cost-Optimized | Quality-Max | Local-1st│  │
│  Select unique optimal upstream target model                        │  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 4: Upstream Engine Dispatch                    │
│  Translate CanonicalRequest to target endpoint format               │  │
│  Inject credentials and upstream provider headers                   │  │
│  Dispatch fetch request to selected provider (Ollama / 9router)     │  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STAGE 5: Stream Transcoding & Egress                 │
│  If streaming, transcode SSE event format on-the-fly via Web Streams│  │
│  Enrich response headers with X-D1 metadata                         │  │
│  Record telemetry into in-memory ring buffer (50 records)           │  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sequence Diagrams

### 2.1. Standard Inference Flow (Happy Path)

```mermaid
sequenceDiagram
    autonumber
    actor Client as AI Client (OpenAI SDK)
    participant Gateway as ModelRouter (Hono)
    participant Adapter as Canonical Adapter
    participant D1 as Liquid AI d1 (Ollama)
    participant Policy as Policy Engine
    participant Registry as Model Registry
    participant Upstream as Target Engine (9router / Ollama)
    participant Telemetry as Telemetry Store

    Client->>Gateway: POST /v1/chat/completions {model: "d1-router-auto", messages: [...]}
    Gateway->>Adapter: toCanonicalRequest(req)
    Adapter-->>Gateway: CanonicalRequest (normalized)
    
    Gateway->>Adapter: extractPromptState(canonical)
    Adapter-->>Gateway: Minimal prompt text
    
    Gateway->>D1: POST /v1/systemone {prompt: "..."}
    Note over D1: Single Forward-Pass (~14ms)<br/>Zero output tokens
    D1-->>Gateway: {score: 2.7, domain: "coding", requires_tools: false}
    
    Gateway->>Registry: getAvailableModels()
    Registry-->>Gateway: List of active ModelSpecs
    
    Gateway->>Policy: resolve(candidates, score: 2.7, policy: "balanced")
    Note over Policy: Pareto-frontier balance:<br/>quality vs cost vs latency
    Policy-->>Gateway: Selected Model: "qwen3.7-plus" (9router)
    
    Gateway->>Upstream: POST /v1/chat/completions (with 9router Bearer token)
    Upstream-->>Gateway: 200 OK (JSON or SSE stream)
    
    Gateway->>Telemetry: record({latency, cost, saving, score, model})
    Gateway-->>Client: 200 OK + [X-D1-Complexity-Score: 2.7] + Body
```

---

### 2.2. Bi-directional SSE Stream Transcoding Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Anthropic Client (SDK)
    participant Gateway as ModelRouter Gateway
    participant D1 as Liquid AI d1
    participant Transcoder as SSE Transcoder (TransformStream)
    participant Upstream as OpenAI-Compatible Model (9router)

    Client->>Gateway: POST /v1/messages {model: "d1-router-auto", stream: true}
    Gateway->>D1: Evaluate Complexity
    D1-->>Gateway: Score 3.2 (Tier 2)
    Note over Gateway: Target chosen is OpenAI format engine
    
    Gateway->>Upstream: POST /v1/chat/completions {stream: true}
    Upstream-->>Gateway: Response 200 OK (OpenAI SSE chunks)
    
    activate Transcoder
    Gateway->>Transcoder: Pipe readable stream
    loop Chunk by Chunk (Zero Buffering)
        Upstream->>Transcoder: data: {"choices":[{"delta":{"content":"Hello"}}]}
        Note over Transcoder: Web-standard TransformStream translation
        Transcoder->>Client: event: content_block_delta<br/>data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
    end
    Upstream->>Transcoder: data: [DONE]
    Transcoder->>Client: event: message_stop<br/>data: {"type":"message_stop"}
    deactivate Transcoder
```

---

### 2.3. Heuristic Fallback Flow (Resilience Path)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App
    participant Gateway as ModelRouter Gateway
    participant D1 as Liquid AI d1
    participant Fallback as Heuristic Rule Evaluator
    participant Policy as Policy Engine
    participant Upstream as Target Engine

    Client->>Gateway: POST /v1/chat/completions
    Gateway->>D1: POST /v1/systemone (Timeout set to 10,000ms)
    
    alt D1 Times out or Connection Refused
        Note over D1: Ollama busy or unreachable
        Gateway->>D1: AbortController.abort()
        Gateway->>Fallback: fallbackEvaluate(promptText)
        Note over Fallback: Deterministic Regex Rules:<br/>Raft/Consensus -> 4.8<br/>Coding/Functions -> 2.7<br/>Philosophy -> 3.8<br/>General -> 1.2
        Fallback-->>Gateway: {score: 2.7, isFallback: true, reason: "D1 Timeout"}
    end
    
    Gateway->>Policy: resolve(candidates, score: 2.7)
    Policy-->>Gateway: Selected Model
    Gateway->>Upstream: Forward payload
    Upstream-->>Gateway: Upstream Response
    Gateway-->>Client: 200 OK + [X-D1-Fallback: true, X-D1-Fallback-Reason: "..."]
```

---

## 3. Finite State Machine (Request Lifecycle)

Each request transitioning through ModelRouter adheres to the following formal State Machine:

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: HTTP Request Arrives
    RECEIVED --> NORMALIZED: Canonical Adapter Parse
    NORMALIZED --> EVALUATING: D1 System One Forward Pass
    
    EVALUATING --> RESOLVED: D1 Responded (Score 1-5)
    EVALUATING --> FALLBACK: Timeout (>10s) or Network Error
    
    FALLBACK --> RESOLVED: Heuristic Classification Applied
    
    RESOLVED --> DISPATCHING: Candidate Filtered & Upstream Selected
    DISPATCHING --> STREAMING: Upstream returned SSE (stream: true)
    DISPATCHING --> BUFFERED: Upstream returned JSON (stream: false)
    
    STREAMING --> COMPLETED: TransformStream emits [DONE]
    BUFFERED --> COMPLETED: JSON payload delivered
    
    COMPLETED --> TELEMETRY_RECORDED: Telemetry logged to Ring Buffer
    TELEMETRY_RECORDED --> [*]
```

---

## 4. UI/UX Interaction Flows

### 4.1. Interactive Workbench (Playground) Execution Flow
1. **User Types or Selects Preset Prompt:**
   - Input textarea updates state. Client-side heuristic instantly previews tentative complexity.
2. **Click "Score Prompt":**
   - Calls `POST /api/evaluate`.
   - Liquid d1 evaluates complexity and returns full `DecisionEvaluation` object.
   - UI updates the Decision Flow Pipeline Graph (5 nodes) and calibrated Complexity Spectrum.
3. **Click "Route & Execute" (Streaming Mode):**
   - Dispatches `POST /v1/chat/completions` with `stream: true`.
   - Streaming token view renders in real-time with token counter, tokens/sec, and elapsed ms.
   - Fallback simulation activates if upstream API keys are unpopulated in local test environments.

### 4.2. Model Switchboard Management Flow
1. **View Model Fleet:**
   - User navigates to `/registry`. UI fetches `/api/registry/models`.
   - Displays all registered engines with complexity spans, cost/1M, provider badges, and capability chips.
2. **Toggle Active Status:**
   - User clicks `Active` / `Disabled` toggle switch.
   - Triggers `POST /api/registry/model/:id/toggle`.
   - Backend updates model in memory; subsequent inference requests automatically exclude disabled models.
3. **Register New Upstream Model:**
   - User clicks `Add Model`, enters ID, provider, upstream model name, complexity bounds `[min, max]`, and pricing.
   - Client validates fields and submits `POST /api/registry/models`. Model is appended to active fleet.

### 4.3. Real-Time Telemetry Polling Cycle
1. **Interval Trigger (Every 4,000ms):**
   - TanStack Router dashboard executes concurrent `fetch('/api/stats')` and `fetch('/api/telemetry/recent')`.
2. **State Refresh:**
   - `totalRequests`, `avgRoutingLatencyMs`, and `totalSavedUsd` counters re-render.
   - Complexity distribution bar graph updates (Local vs Mid-Tier vs Frontier).
   - Recent requests table prepends new entries with color-coded complexity pills and savings badges.
