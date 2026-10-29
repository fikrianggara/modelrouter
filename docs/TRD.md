# Technical Requirements Document (TRD)
## ModelRouter — Architectural & Technical Specifications

---

### Document Control
- **Document ID:** DOC-TRD-001
- **Product Name:** ModelRouter
- **Version:** 1.0.0
- **Status:** Approved / Production-Ready
- **Tech Stack:** Node.js 20+, TypeScript 5+, Hono v4, TanStack Router, Vite, Vitest, Zod, Tailwind CSS, esbuild

---

## 1. System Architecture & Component Topology

ModelRouter is engineered as a lean, single-process, zero-copy reverse proxy and application server.

```
                          ┌───────────────────────────┐
                          │   Downstream AI Clients   │
                          │ (OpenAI SDK / Anthropic)  │
                          └─────────────┬─────────────┘
                                        │ HTTP POST /v1/...
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   ModelRouter Core Gateway (Port 8100)                   │
│                                                                          │
│  ┌───────────────────────┐          ┌─────────────────────────────────┐  │
│  │   Canonical Ingress   │          │    In-Memory Telemetry Store    │  │
│  │   (OpenAI/Anthropic)  │          │   (Ring Buffer: 50 records)     │  │
│  └───────────┬───────────┘          └────────────────┬────────────────┘  │
│              │ CanonicalRequest                      │ Metrics           │
│              ▼                                       ▼                   │
│  ┌───────────────────────┐          ┌─────────────────────────────────┐  │
│  │   d1 Decision Client  │          │      TanStack Router SPA        │  │
│  │  (Ollama /v1/systemone│          │   (Architectural Bento Grid)    │  │
│  └───────────┬───────────┘          └─────────────────────────────────┘  │
│              │ Complexity (1-5), Domain, Capabilities                    │
│              ▼                                                           │
│  ┌───────────────────────┐          ┌─────────────────────────────────┐  │
│  │ Policy Resolver Engine│◄─────────┤     Model Registry (YAML)       │  │
│  │ (Pareto / Cost/ Quality)         │    (config/registry.yaml)       │  │
│  └───────────┬───────────┘          └─────────────────────────────────┘  │
│              │ Target Engine ID & Upstream Endpoint                      │
│              ▼                                                           │
│  ┌───────────────────────┐          ┌─────────────────────────────────┐  │
│  │   Upstream Dispatch   │─────────►│  Bi-directional SSE Transcoder  │  │
│  │ (Header Translation)  │          │       (TransformStream)         │  │
│  └───────────┬───────────┘          └────────────────┬────────────────┘  │
└──────────────┼───────────────────────────────────────┼───────────────────┘
               │                                       │ Transcoded SSE
               ▼                                       ▼
 ┌──────────────────────────┐             ┌──────────────────────────┐
 │  Local Ollama (Port 11434│             │  Remote 9router / Cloud  │
 │  (lfm3, qwen3.5, etc.)   │             │  (Sonnet, DeepSeek, etc.)│
 └──────────────────────────┘             └──────────────────────────┘
```

---

## 2. Technology Stack & Runtime Dependencies

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime Environment** | Node.js | $\ge 20.0.0$ | Core server execution, Web-standard Streams, `fetch` |
| **Language** | TypeScript | $\ge 5.5.0$ | Strict type safety, explicit interfaces |
| **HTTP Gateway Framework**| Hono | `^4.6.0` | Ultra-fast HTTP routing, middleware, SSE helper |
| **Schema Validation** | Zod | `^3.23.0` | Runtime config validation, YAML schema enforcement |
| **Configuration Parser** | YAML | `^2.6.0` | Declarative model fleet configuration parsing |
| **Testing Suite** | Vitest | `^2.1.0` | Unit & integration test execution, mocking |
| **Frontend Framework** | React + TanStack Router | `^18.3` / `^1.80` | High-density developer dashboard SPA |
| **Styling & Design System**| Tailwind CSS | `^3.4.0` | Firecrawl Architectural Blueprint design system |
| **Production Bundler** | esbuild + Vite | `^0.24` / `^5.4` | Node ESM server bundle (`--packages=external`) |

---

## 3. Data Structures & Interface Contracts

### 3.1. Canonical Request Model (`src/adapters/canonical.ts`)
To decouple downstream clients from upstream APIs, all requests normalize into the following canonical schema:

```typescript
export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface CanonicalRequest {
  model: string;                      // Virtual router ID or target model
  messages: CanonicalMessage[];       // Normalized conversation array
  stream: boolean;                    // Stream flag (SSE)
  temperature?: number;               // 0.0 - 2.0
  max_tokens?: number;                // Context ceiling
  policy?: 'balanced' | 'cost_optimized' | 'quality_max' | 'local_first';
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  requires_vision?: boolean;          // Auto-inferred from image blocks
}
```

### 3.2. Model Registry Specification (`src/engine/registry.ts`)
Configured in `config/registry.yaml` and validated by Zod:

```typescript
export interface ModelSpec {
  id: string;                         // Unique routing key (e.g., "cloud-coder")
  display_name?: string;              // Human readable name
  provider: 'ollama' | 'openai' | 'anthropic' | 'openrouter' | '9router' | 'custom';
  base_url: string;                   // Upstream API base endpoint
  api_key_env?: string;               // Name of ENV variable holding the API key
  upstream_model: string;             // Real model name (e.g., "claude-3-5-sonnet")
  complexity_range: [number, number]; // [min, max] matching interval (e.g. [3.0, 5.0])
  cost: {
    input_per_mtoken: number;         // USD per 1M input tokens
    output_per_mtoken: number;        // USD per 1M output tokens
  };
  capabilities: {
    tools: boolean;
    vision: boolean;
    max_context: number;
    streaming: boolean;
  };
  tags: string[];                     // Semantic tags (e.g., ["coding", "frontier"])
  enabled?: boolean;                  // Runtime active toggle (default: true)
}
```

### 3.3. D1 System One Evaluation Interface (`src/engine/d1-client.ts`)
Protocol contract with Ollama `/v1/systemone`:

```typescript
export interface D1SystemOneResponse {
  score: number;                      // Float 1.00 to 5.00
  domain?: 'coding' | 'reasoning' | 'tools' | 'general' | 'analysis';
  requires_tools?: boolean;
  requires_vision?: boolean;
  confidence?: number;                // 0.0 to 1.0
}

export interface DecisionEvaluation {
  complexityScore: number;
  domain: string;
  requiresTools: boolean;
  requiresVision: boolean;
  routingLatencyMs: number;
  isFallback: boolean;
  fallbackReason?: string;
  selectedModel: ModelSpec;
  policy: string;
}
```

---

## 4. Subsystem Detailed Design

### 4.1. Ingress & Normalization Pipeline
1. **OpenAI Ingress Handler (`POST /v1/chat/completions`):**
   - Ingests raw JSON body.
   - Extracts messages, tool definitions, and stream flag directly.
   - Extracts instruction state: Isolates the last user message, system instruction, and user code blocks. Trims conversational history beyond 1,000 characters to prevent D1 evaluation token bloat.
2. **Anthropic Ingress Handler (`POST /v1/messages`):**
   - Transposes `system` parameter into a `{ role: 'system', content }` canonical message.
   - Converts content blocks (text, tool_use, image) into canonical message structure.

### 4.2. Neural Evaluator Client (`D1Client`)
- **HTTP Client:** Native `fetch` with `AbortController` timeout guard (default: 10,000ms).
- **Target Endpoint:** `http://localhost:11434/v1/systemone` (configurable via `D1_ENDPOINT`).
- **Resilience Engine (Heuristic Fallback):**
  If Ollama returns 4xx/5xx, connection refused, or aborts upon timeout, `fallbackEvaluate(text)` executes:
  - Regex detects Raft, consensus, formal verification, or text length > 300 $\rightarrow$ `score = 4.8`, `domain = 'coding'`, `tools = true`.
  - Regex detects function, code, TypeScript, event loop $\rightarrow$ `score = 2.7`, `domain = 'coding'`.
  - Regex detects philosophy, synthesis, analysis $\rightarrow$ `score = 3.8`, `domain = 'analysis'`.
  - Default simple query $\rightarrow$ `score = 1.2`, `domain = 'general'`.
  - Sets `isFallback: true` and logs the reason.

### 4.3. Policy Engine Resolution
```typescript
class PolicyEngine {
  resolve(candidates: ModelSpec[], score: number, policy: RoutingPolicy): ModelSpec {
    // 1. Filter models matching complexity interval [min, max]
    // 2. Apply Policy Strategy:
    //    - balanced: Pareto score = (1 / cost) * 0.4 + (capability / score_diff) * 0.6
    //    - cost_optimized: sort ascending by cost.input_per_mtoken
    //    - quality_max: sort descending by complexity_range[1]
    //    - local_first: if score <= 2.5 and Ollama available, pick Ollama; else fallback to balanced
  }
}
```

### 4.4. Bi-directional SSE Stream Transcoder (`SSETranscoder`)
When an OpenAI client connects, but an Anthropic model is chosen (or vice versa), the transcoder stream wraps upstream output:

- **OpenAI $\rightarrow$ Anthropic:** Translates `data: {"choices":[{"delta":{"content":"..."}}]}` chunks into `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`.
- **Anthropic $\rightarrow$ OpenAI:** Translates `event: content_block_delta` into `data: {"choices":[{"index":0,"delta":{"content":"..."}}]}`.
- Zero buffering: Emits chunks immediately upon parser emission using `TransformStream`.

---

## 5. API Interface Specifications

### 5.1. Core Inference Endpoints

#### `POST /v1/chat/completions`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>` (optional).
- **Request Body:** Standard OpenAI chat completion schema.
- **Response Headers Added:**
  - `X-D1-Complexity-Score`: e.g. `2.40`
  - `X-D1-Selected-Model`: e.g. `local-chat`
  - `X-D1-Routing-Latency`: e.g. `14.2ms`
  - `X-D1-Fallback`: `true` | `false`
- **Response Body:** OpenAI chat completion JSON or SSE stream.

#### `POST /v1/messages`
- **Headers:** `Content-Type: application/json`, `x-api-key: <key>`, `anthropic-version: 2023-06-01`.
- **Request Body:** Standard Anthropic messages schema.
- **Response Body:** Anthropic messages JSON or SSE stream.

### 5.2. Observability & Management Endpoints

#### `GET /health`
- **Response:** `200 OK`
```json
{
  "status": "online",
  "d1": "connected",
  "registered_models": 9,
  "active_models": 8
}
```

#### `POST /api/evaluate`
- **Request:** `{"prompt": "string", "model": "string", "policy": "string"}`
- **Response:** Returns complete `DecisionEvaluation` object without invoking upstream LLMs.

#### `GET /api/stats`
- **Response:** Global runtime telemetry aggregated across the instance lifetime:
```json
{
  "status": "online",
  "uptime": 1420.5,
  "totalRequests": 184,
  "totalTokens": 142050,
  "avgRoutingLatencyMs": 14.8,
  "totalCostUsd": 0.012,
  "totalSavedUsd": 0.384,
  "costReductionPercent": 68.4,
  "activeModels": 8,
  "registeredModels": 9,
  "complexityDistribution": { "1.0-2.0": 80, "2.0-3.0": 54, "3.0-4.0": 32, "4.0-5.0": 18 }
}
```

#### `GET /api/telemetry/recent`
- **Response:** `{"requests": RecentRequest[]}` containing the latest 50 queries in the ring buffer.

#### `POST /api/registry/model/:id/toggle`
- **Response:** `{"success": true, "modelId": "...", "enabled": true/false}` toggling model execution at runtime without restart.

---

## 6. Build, Deployment & Operational Constraints

1. **Production Bundling:**
   `package.json` executes:
   ```bash
   vite build && esbuild src/api/server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server.js
   ```
   *Note:* The `--packages=external` flag is mandatory to prevent dynamic `require('process')` bundle corruption in external ESM modules (such as `yaml`).
2. **Process Lifecycle:**
   Run via `node dist/server.js`. The server serves both static client assets (`dist/client`) and API endpoints on port `8100`.
3. **Vitest Verification:**
   All pull requests must pass 100/100 tests with 0 test exclusions:
   ```bash
   npx vitest run
   ```
