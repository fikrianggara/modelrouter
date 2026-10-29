# Architecture Specification & Implementation Plan: D1-Powered Complexity Model Router (Hono + TanStack)

> **For Hermes / Implementer:** Use the `ticket-driven-parallel-development` or `subagent-driven-development` workflow to execute this plan task-by-task on dedicated feature branches with strict TDD discipline (`vitest`).

**Goal:** Membangun reverse proxy dan platform routing model AI berlatensi rendah (<30ms) yang mengevaluasi kompleksitas prompt secara dinamis menggunakan Decision Model System One (Liquid AI `d1` via `/v1/systemone`), mencocokkannya ke Model Registry berbasis kapabilitas/tag/biaya, dan menyediakan Web UI interaktif (TanStack Router + Tailwind) serta endpoint ganda berstandar OpenAI (`/v1/chat/completions`) dan Anthropic (`/v1/messages`) yang mendukung bidirectional streaming SSE untuk harness seperti Hermes Agent, Claude Code, dan OpenCode.

**Architecture:** Arsitektur monolitik modular terintegrasi dalam Pure TypeScript. Backend API dibangun menggunakan **Hono** (Web Standard `Request`/`Response`/`ReadableStream` via `@hono/node-server`) untuk zero-overhead routing dan stream transcoding; Frontend dibangun menggunakan **Vite + TanStack Router + Tailwind CSS** untuk dashboard telemetri, live complexity visualizer, dan interactive chat playground. Seluruh sistem berjalan pada satu port (default: 8100) dan satu proses Node.js.

**Tech Stack:** TypeScript 5.x, Hono v4, Vite 5.x, TanStack Router, TanStack Query, Zod v3, eventsource-parser, Tailwind CSS, Lucide Icons, Vitest.

---

## 1. Analisis Kebutuhan Sistem & Deployment

### 1.1 Model Deployment (Sangat Sederhana & Mandiri)

Pertanyaan utama: *Apakah deployment Hono + TanStack mudah?*
**Jawabannya: Sangat mudah.** Dibandingkan Next.js yang membutuhkan tracing file `.next/standalone` atau platform spesifik seperti Vercel, Hono + TanStack menghasilkan **satu file bundle server tunggal dan satu folder statis**.

Pola Deployment Produksi:
1. **Single Node Process (Bare-metal / VPS / macOS launchd):**
   ```bash
   npm run build
   # 1. Vite membangun frontend ke: dist/client
   # 2. Esbuild/Tsup membangun backend Hono ke: dist/server.js
   
   node dist/server.js
   # Mendengarkan pada port 8100.
   # Rute /v1/* dilayani oleh engine Hono API.
   # Rute /* menyajikan file statis dari dist/client (SPA TanStack Router).
   ```
2. **Docker Container Ringan (~90MB Alpine):**
   * Multi-stage build (Node Alpine builder -> minimal Node runtime).
   * Tidak ada build lock-in platform.
3. **Zero Database Heavy-Lifting:**
   * Registry model disimpan dalam YAML (`config/registry.yaml`) dan di-cache in-memory.
   * Telemetri disimpan dalam SQLite lokal (`data/metrics.db`) atau in-memory circular buffer.

---

### 1.2 Matriks Kebutuhan Fungsional (Functional Requirements)

| Kode | Kebutuhan | Deskripsi Teknis |
| :--- | :--- | :--- |
| **FR-01** | **OpenAI Ingestion API** | Endpoint `POST /v1/chat/completions` & `GET /v1/models` yang 100% kompatibel dengan spesifikasi OpenAI, validasi payload via Zod, mendukung streaming `stream: true` SSE and non-streaming. |
| **FR-02** | **Anthropic Ingestion API** | Endpoint `POST /v1/messages` kompatibel dengan protokol Anthropic Messages API v1 (`messages`, `system`, `tools`, `content_block_delta` SSE streaming). |
| **FR-03** | **Decision Engine (Liquid `d1`)** | Terkoneksi ke Ollama `/v1/systemone` lokal (atau hosted API) via native `fetch()` + `AbortSignal.timeout(150ms)` untuk evaluasi `Score` (kompleksitas 1-5), `Choice` (domain), dan `Noul` (tools/vision). |
| **FR-04** | **Model Registry & Dynamic Tagging** | Katalog model terstruktur (YAML) dengan metadata: `id`, `provider`, `upstream_model`, `base_url`, `api_key_env`, `complexity_range`, `capabilities`, `cost`, dan `tags`. |
| **FR-05** | **Policy-Driven Routing Engine** | Algoritma matematis untuk memetakan hasil evaluasi `d1` ke model terbaik berdasarkan strategi: `balanced`, `cost_optimized`, `quality_max`, atau `local_first`. |
| **FR-06** | **Bidirectional SSE Transcoder** | Mentranslasikan event chunk streaming secara real-time via `TransformStream` dan `eventsource-parser`: Client OpenAI <-> Upstream Anthropic, Client Anthropic <-> Upstream OpenAI/Ollama. |
| **FR-07** | **Zero-Buffer Streaming Proxy** | Menyalurkan token dari upstream ke client secara non-blocking dengan penambahan latensi <= 1 ms dan otomatis abort stream upstream jika client disconnect. |
| **FR-08** | **Observability Telemetry** | Injeksi response headers: `X-D1-Complexity-Score`, `X-D1-Domain`, `X-D1-Selected-Model`, `X-D1-Routing-Latency-Ms`. |
| **FR-09** | **Web UI Dashboard & Playground** | SPA TanStack Router: <br>1. *Live Complexity Meter* (visual gauge skor 1-5).<br>2. *Chat Playground* token-by-token.<br>3. *Registry Viewer & Tag Explorer*.<br>4. *Cost Savings Estimator*. |
| **FR-10** | **Resilience & Fallback Engine** | Jika `d1` lokal gagal/timeout (>150ms), fallback otomatis ke rule-based heuristic classifier (token count, deteksi blok kode, tool signatures). |

---

## 2. Arsitektur Komponen & Struktur Direktori

```text
modelrouter/
├── config/
│   └── registry.yaml              # Definisi model, tag, range kompleksitas, dan harga
├── src/
│   ├── core/
│   │   ├── config.ts              # Variabel lingkungan & app settings via Zod
│   │   ├── types.ts               # Tipe kanonikal internal (CanonicalRequest, CanonicalMessage)
│   │   └── telemetry.ts           # Logger & metrik latensi/biaya
│   ├── engine/
│   │   ├── d1-client.ts           # Client HTTP untuk Ollama /v1/systemone
│   │   ├── evaluator.ts           # Formatter state prompt & typed questions
│   │   ├── registry.ts            # Aggregate ModelRegistry & Tag Matcher
│   │   └── policy-engine.ts       # Strategi routing (balanced, cost, quality, local)
│   ├── adapters/
│   │   ├── openai-adapter.ts      # Parser & serializer format OpenAI
│   │   ├── anthropic-adapter.ts   # Parser & serializer format Anthropic
│   │   └── sse-transcoder.ts      # TransformStream SSE OpenAI <-> Anthropic
│   ├── proxy/
│   │   └── forwarder.ts           # Upstream HTTP fetcher & stream pipe
│   ├── api/
│   │   ├── routes-openai.ts       # Hono routes: /v1/chat/completions, /v1/models
│   │   ├── routes-anthropic.ts    # Hono routes: /v1/messages
│   │   └── server.ts              # Hono application root & static file server
│   └── web/                       # Frontend SPA (TanStack Router + Tailwind)
│       ├── routes/
│       │   ├── __root.tsx         # App layout (navbar, theme, status indicator)
│       │   ├── index.tsx          # Dashboard (metrik & routing analytics)
│       │   ├── playground.tsx     # Live Chat & Complexity Inspector
│       │   └── registry.tsx       # Model Registry & Tag Manager
│       ├── components/            # UI components (Gauge, ChatMessage, KebabMenu)
│       └── main.tsx               # Client entrypoint
├── tests/
│   ├── unit/
│   │   ├── canonical.test.ts
│   │   ├── d1-client.test.ts
│   │   ├── registry.test.ts
│   │   ├── policy-engine.test.ts
│   │   ├── adapters.test.ts
│   │   └── sse-transcoder.test.ts
│   └── integration/
│       ├── openai-gateway.test.ts
│       └── anthropic-gateway.test.ts
├── vite.config.ts                 # Konfigurasi Vite & TanStack Router plugin
├── vitest.config.ts               # Runner test Vitest
├── package.json
├── tsconfig.json
└── scripts/
    ├── ticket.sh
    ├── merge-tickets.sh
    └── ticket.config.sh
```

---

## 3. Rencana Kerja Implementasi Bertahap (Bite-Sized Tasks)

### Phase 1: Inisialisasi Foundation & Konfigurasi Lingkungan

#### Task 1.1: Package Manifest, TypeScript & Vitest Configuration
**Objective:** Mengonfigurasi `package.json`, `tsconfig.json`, dan `vitest.config.ts` untuk pengujian TDD berbasis Vitest.
**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `config/registry.yaml`

**Step 1: Write `package.json`**
```json
{
  "name": "modelrouter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && esbuild src/api/server.ts --bundle --platform=node --format=esm --outfile=dist/server.js",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-router": "^1.65.0",
    "clsx": "^2.1.1",
    "eventsource-parser": "^2.0.1",
    "hono": "^4.6.4",
    "lucide-react": "^0.453.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.4",
    "yaml": "^2.5.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tanstack/router-vite-plugin": "^1.65.0",
    "@types/node": "^22.7.5",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "esbuild": "^0.24.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

**Step 2: Write `vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 3: Verification command**
Run: `npm install && npx vitest run`
Expected: Vitest initializes successfully (0 tests found or all pass).

---

#### Task 1.2: Environment Settings Loader via Zod
**Objective:** Membangun `src/core/config.ts` yang memvalidasi environment variable dengan tipe ketat (*strict types*).
**Files:**
- Create: `src/core/config.ts`
- Test: `tests/unit/config.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/core/config';

describe('App Config', () => {
  it('should load default configuration values', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(8100);
    expect(config.D1_ENDPOINT).toBe('http://localhost:11434/v1/systemone');
    expect(config.D1_MODEL).toBe('d1:latest');
    expect(config.DEFAULT_POLICY).toBe('balanced');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL (`Cannot find module '../../src/core/config'`)

**Step 3: Minimal implementation**
```typescript
// src/core/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8100),
  HOST: z.string().default('0.0.0.0'),
  D1_ENDPOINT: z.string().default('http://localhost:11434/v1/systemone'),
  D1_MODEL: z.string().default('d1:latest'),
  D1_TIMEOUT_MS: z.coerce.number().default(150),
  DEFAULT_POLICY: z.enum(['balanced', 'cost_optimized', 'quality_max', 'local_first']).default('balanced'),
  FALLBACK_MODEL_ID: z.string().default('lfm3-local'),
  REGISTRY_PATH: z.string().default('config/registry.yaml'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export const config = loadConfig();
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS

---

### Phase 2: Domain Layer — Canonical Data Structures & Model Registry

#### Task 2.1: Canonical Request & Message Model
**Objective:** Mengabstraksikan request masuk dari OpenAI dan Anthropic ke dalam representasi kanonikal `CanonicalRequest` dan fungsi ekstraksi `extractState()`.
**Files:**
- Create: `src/core/types.ts`
- Test: `tests/unit/canonical.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/canonical.test.ts
import { describe, it, expect } from 'vitest';
import { CanonicalRequest } from '../../src/core/types';

describe('CanonicalRequest', () => {
  it('should extract evaluation state accurately', () => {
    const req: CanonicalRequest = {
      messages: [
        { role: 'system', content: 'You are an expert engineer.' },
        { role: 'user', content: 'Write a Raft consensus algorithm in Go.' }
      ],
      stream: true,
      tools: [{ name: 'run_tests', description: 'Run test suite' }]
    };

    const state = CanonicalRequest.extractState(req);
    expect(state).toContain('Raft consensus algorithm in Go');
    expect(state).toContain('[AVAILABLE_TOOLS]: run_tests');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/canonical.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/core/types.ts
export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface CanonicalRequest {
  messages: CanonicalMessage[];
  model_override?: string;
  policy?: 'balanced' | 'cost_optimized' | 'quality_max' | 'local_first';
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  extra_params?: Record<string, any>;
}

export const CanonicalRequest = {
  extractState(req: CanonicalRequest, maxChars: number = 4000): string {
    const lines: string[] = [];
    const recent = req.messages.slice(-4);
    for (const m of recent) {
      lines.push(`[${m.role.toUpperCase()}]: ${m.content}`);
    }
    if (req.tools && req.tools.length > 0) {
      const toolNames = req.tools.map(t => t.name || t.function?.name || '').filter(Boolean);
      lines.push(`[AVAILABLE_TOOLS]: ${toolNames.join(', ')}`);
    }
    const full = lines.join('\n');
    return full.length > maxChars ? full.slice(-maxChars) : full;
  }
};
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/canonical.test.ts`
Expected: PASS

---

#### Task 2.2: Model Registry YAML Loader & Tag Filter
**Objective:** Membaca `config/registry.yaml`, memvalidasi skema model, dan menyediakan fungsi filter berdasarkan kapabilitas, tag, dan rentang kompleksitas.
**Files:**
- Create: `src/engine/registry.ts`
- Test: `tests/unit/registry.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../../src/engine/registry';

const sampleYaml = `
version: "1.0"
models:
  - id: "local-chat"
    display_name: "Local Chat"
    provider: "ollama"
    upstream_model: "lfm3:latest"
    base_url: "http://localhost:11434/v1"
    complexity_range: [0.0, 1.8]
    tags: ["local", "chat"]
    capabilities:
      tools: false
      vision: false
      max_context: 32768
      streaming: true
    cost:
      input_per_mtoken: 0.0
      output_per_mtoken: 0.0
  - id: "cloud-coder"
    display_name: "Claude Sonnet"
    provider: "anthropic"
    upstream_model: "claude-3-5-sonnet-20241022"
    base_url: "https://api.anthropic.com/v1"
    complexity_range: [3.0, 5.0]
    tags: ["coding", "frontier", "tools"]
    capabilities:
      tools: true
      vision: true
      max_context: 200000
      streaming: true
    cost:
      input_per_mtoken: 3.0
      output_per_mtoken: 15.0
`;

describe('ModelRegistry', () => {
  it('should filter models requiring tools', () => {
    const reg = ModelRegistry.fromYaml(sampleYaml);
    const candidates = reg.findCandidates({ requiresTools: true });
    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBe('cloud-coder');
  });

  it('should filter models by complexity score', () => {
    const reg = ModelRegistry.fromYaml(sampleYaml);
    const candidates = reg.findCandidates({ complexity: 1.0 });
    expect(candidates.some(m => m.id === 'local-chat')).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/registry.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/engine/registry.ts
import YAML from 'yaml';
import { z } from 'zod';

export const ModelSpecSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  provider: z.enum(['ollama', 'openai', 'anthropic', 'openrouter', 'custom']),
  upstream_model: z.string(),
  base_url: z.string(),
  api_key_env: z.string().nullable().optional(),
  complexity_range: z.tuple([z.number(), z.number()]),
  tags: z.array(z.string()).default([]),
  capabilities: z.object({
    tools: z.boolean().default(true),
    vision: z.boolean().default(false),
    max_context: z.number().default(32768),
    streaming: z.boolean().default(true),
  }),
  cost: z.object({
    input_per_mtoken: z.number().default(0.0),
    output_per_mtoken: z.number().default(0.0),
  }),
});

export type ModelSpec = z.infer<typeof ModelSpecSchema>;

export class ModelRegistry {
  constructor(public models: ModelSpec[] = []) {}

  static fromYaml(yamlString: string): ModelRegistry {
    const parsed = YAML.parse(yamlString);
    const validated = z.object({
      version: z.string(),
      models: z.array(ModelSpecSchema)
    }).parse(parsed);
    return new ModelRegistry(validated.models);
  }

  getModel(id: string): ModelSpec | undefined {
    return this.models.find(m => m.id === id);
  }

  findCandidates(criteria: {
    complexity?: number;
    requiresTools?: boolean;
    requiresVision?: boolean;
    tag?: string;
  }): ModelSpec[] {
    return this.models.filter(m => {
      if (criteria.requiresTools && !m.capabilities.tools) return false;
      if (criteria.requiresVision && !m.capabilities.vision) return false;
      if (criteria.tag && !m.tags.includes(criteria.tag)) return false;
      if (criteria.complexity !== undefined) {
        const [min, max] = m.complexity_range;
        if (criteria.complexity < min - 0.2 || criteria.complexity > max + 0.2) return false;
      }
      return true;
    });
  }
}
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/registry.test.ts`
Expected: PASS

---

### Phase 3: Engine Layer — System One `d1` Client & Policy Engine

#### Task 3.1: D1 Decision Client (`/v1/systemone`)
**Objective:** Mengintegrasikan model Liquid `d1` melalui endpoint `/v1/systemone` dengan timeout dan fallback otomatis.
**Files:**
- Create: `src/engine/d1-client.ts`
- Test: `tests/unit/d1-client.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/d1-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { D1Client } from '../../src/engine/d1-client';

describe('D1Client', () => {
  it('should parse d1 evaluation answers properly', async () => {
    const mockResponse = {
      model: 'd1:latest',
      answers: {
        complexity: { type: 'score', score: 3.42, confidence: 0.8 },
        domain: { type: 'choice', choice: 'coding', confidence: 0.95 },
        requires_tools: { type: 'noul', probability: 0.88 },
        requires_vision: { type: 'noul', probability: 0.02 }
      },
      usage: { input_tokens: 50, output_tokens: 0 }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const client = new D1Client('http://localhost:11434/v1/systemone');
    const result = await client.evaluate('Refactor this code');
    expect(result.complexityScore).toBe(3.42);
    expect(result.domain).toBe('coding');
    expect(result.requiresTools).toBe(true);
    expect(result.requiresVision).toBe(false);
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/d1-client.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/engine/d1-client.ts
export interface D1EvaluationResult {
  complexityScore: number;
  domain: string;
  requiresTools: boolean;
  requiresVision: boolean;
  confidence: number;
}

export class D1Client {
  constructor(
    private endpoint: string = 'http://localhost:11434/v1/systemone',
    private model: string = 'd1:latest',
    private timeoutMs: number = 150
  ) {}

  async evaluate(state: string): Promise<D1EvaluationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          state,
          questions: {
            complexity: {
              type: 'score',
              instructions: 'Rate technical complexity from 1 (trivial) to 5 (expert).',
              criteria: [
                'Level 1: Trivial greetings, simple chit-chat',
                'Level 2: Basic rewrite, simple fact retrieval',
                'Level 3: Standard code function, single tool call',
                'Level 4: Complex multi-file architecture, advanced algorithms',
                'Level 5: Formal mathematical proof, deep distributed systems'
              ]
            },
            domain: {
              type: 'choice',
              instructions: 'What is the primary technical domain?',
              criteria: {
                coding: 'Writing or refactoring source code',
                reasoning: 'Mathematics or complex logic',
                tools: 'Tool calling and execution planning',
                general: 'Casual conversation or general text'
              }
            },
            requires_tools: {
              type: 'noul',
              instructions: 'Does this request require invoking external tools or APIs?'
            },
            requires_vision: {
              type: 'noul',
              instructions: 'Does this request reference or analyze images?'
            }
          }
        })
      });

      if (!res.ok) throw new Error(`D1 endpoint returned status ${res.status}`);
      const data = await res.json();
      const ans = data.answers || {};

      return {
        complexityScore: ans.complexity?.score ?? 1.5,
        domain: ans.domain?.choice ?? 'general',
        requiresTools: (ans.requires_tools?.probability ?? 0) >= 0.5,
        requiresVision: (ans.requires_vision?.probability ?? 0) >= 0.5,
        confidence: ans.complexity?.confidence ?? 0.5
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/d1-client.test.ts`
Expected: PASS

---

#### Task 3.2: Policy Routing Resolver
**Objective:** Mengimplementasikan seleksi model berdasarkan bobot kebijakan (`balanced`, `cost_optimized`, `quality_max`, `local_first`).
**Files:**
- Create: `src/engine/policy-engine.ts`
- Test: `tests/unit/policy-engine.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/policy-engine.test.ts
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/engine/policy-engine';
import { ModelSpec } from '../../src/engine/registry';

describe('PolicyEngine', () => {
  const models: ModelSpec[] = [
    {
      id: 'local-slm', display_name: 'Local LFM', provider: 'ollama', upstream_model: 'lfm3',
      base_url: 'http://localhost:11434', complexity_range: [0.0, 2.0], tags: ['local'],
      capabilities: { tools: true, vision: false, max_context: 32768, streaming: true },
      cost: { input_per_mtoken: 0, output_per_mtoken: 0 }
    },
    {
      id: 'cloud-frontier', display_name: 'Sonnet', provider: 'anthropic', upstream_model: 'claude-3-5-sonnet',
      base_url: 'https://api.anthropic.com', complexity_range: [3.0, 5.0], tags: ['cloud'],
      capabilities: { tools: true, vision: true, max_context: 200000, streaming: true },
      cost: { input_per_mtoken: 3.0, output_per_mtoken: 15.0 }
    }
  ];

  it('should select local model for cost_optimized policy when complexity is low', () => {
    const decision = PolicyEngine.resolve(models, {
      complexityScore: 1.2, domain: 'general', requiresTools: false, requiresVision: false, confidence: 0.9
    }, 'cost_optimized');
    expect(decision.selectedModel.id).toBe('local-slm');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/policy-engine.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/engine/policy-engine.ts
import { ModelSpec } from './registry';
import { D1EvaluationResult } from './d1-client';

export interface RoutingDecision {
  selectedModel: ModelSpec;
  policyUsed: string;
  reason: string;
  complexityScore: number;
}

export const PolicyEngine = {
  resolve(
    candidates: ModelSpec[],
    evalResult: D1EvaluationResult,
    policy: 'balanced' | 'cost_optimized' | 'quality_max' | 'local_first' = 'balanced'
  ): RoutingDecision {
    if (candidates.length === 0) throw new Error('No candidate models available.');

    const score = evalResult.complexityScore;

    if (policy === 'cost_optimized' || policy === 'local_first') {
      const sorted = [...candidates].sort((a, b) => {
        const costA = a.cost.input_per_mtoken + a.cost.output_per_mtoken;
        const costB = b.cost.input_per_mtoken + b.cost.output_per_mtoken;
        return costA - costB;
      });
      return {
        selectedModel: sorted[0],
        policyUsed: policy,
        reason: `Selected ${sorted[0].id} for minimum cost matching score ${score.toFixed(2)}`,
        complexityScore: score
      };
    }

    if (policy === 'quality_max') {
      const sorted = [...candidates].sort((a, b) => b.complexity_range[1] - a.complexity_range[1]);
      return {
        selectedModel: sorted[0],
        policyUsed: policy,
        reason: `Selected ${sorted[0].id} for maximum reasoning capacity`,
        complexityScore: score
      };
    }

    // Default: 'balanced' (cari model dengan jarak titik tengah terdekat ke skor)
    const sorted = [...candidates].sort((a, b) => {
      const midA = (a.complexity_range[0] + a.complexity_range[1]) / 2;
      const midB = (b.complexity_range[0] + b.complexity_range[1]) / 2;
      return Math.abs(midA - score) - Math.abs(midB - score);
    });

    return {
      selectedModel: sorted[0],
      policyUsed: policy,
      reason: `Selected ${sorted[0].id} as optimal complexity fit (${score.toFixed(2)})`,
      complexityScore: score
    };
  }
};
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/policy-engine.test.ts`
Expected: PASS

---

### Phase 4: Adapters & Bidirectional SSE Transcoder

#### Task 4.1: Bidirectional SSE Transcoder
**Objective:** Mengonversi data stream OpenAI ke format Anthropic SSE secara on-the-fly menggunakan `eventsource-parser` dan `TransformStream`.
**Files:**
- Create: `src/adapters/sse-transcoder.ts`
- Test: `tests/unit/sse-transcoder.test.ts`

**Step 1: Write failing test**
```typescript
// tests/unit/sse-transcoder.test.ts
import { describe, it, expect } from 'vitest';
import { createOpenAIToAnthropicTransform } from '../../src/adapters/sse-transcoder';

describe('SSE Transcoder', () => {
  it('should transform OpenAI delta chunks to Anthropic message events', async () => {
    const transform = createOpenAIToAnthropicTransform('test-model');
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    writer.write('data: {"id":"1","choices":[{"delta":{"content":"Hi"}}]}\n\n');
    writer.write('data: [DONE]\n\n');
    writer.close();

    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += value;
    }

    expect(output).toContain('event: message_start');
    expect(output).toContain('event: content_block_delta');
    expect(output).toContain('"text":"Hi"');
    expect(output).toContain('event: message_stop');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/unit/sse-transcoder.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/adapters/sse-transcoder.ts
import { createParser } from 'eventsource-parser';

export function createOpenAIToAnthropicTransform(modelId: string): TransformStream<string, string> {
  const msgId = `msg_${Math.random().toString(36).substring(2, 10)}`;

  let controllerRef: TransformStreamDefaultController<string>;

  const parser = createParser({
    onEvent(event) {
      if (event.data === '[DONE]') {
        controllerRef.enqueue(`event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`);
        controllerRef.enqueue(`event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\n`);
        controllerRef.enqueue(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
        return;
      }

      try {
        const payload = JSON.parse(event.data);
        const text = payload.choices?.[0]?.delta?.content;
        if (text) {
          controllerRef.enqueue(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text }
          })}\n\n`);
        }
      } catch {}
    }
  });

  return new TransformStream({
    start(controller) {
      controllerRef = controller;
      // Emit Initial Events
      controller.enqueue(`event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: { id: msgId, type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 0 } }
      })}\n\n`);
      controller.enqueue(`event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      })}\n\n`);
    },
    transform(chunk) {
      parser.feed(chunk);
    }
  });
}
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/unit/sse-transcoder.test.ts`
Expected: PASS

---

### Phase 5: Hono API Gateway & Dual Endpoint Routing

#### Task 5.1: Hono Core API Server & Endpoint Handlers
**Objective:** Mengintegrasikan seluruh router, d1 evaluator, dan upstream proxy ke dalam rute `/v1/chat/completions`, `/v1/messages`, dan `/v1/models`.
**Files:**
- Create: `src/api/server.ts`
- Test: `tests/integration/gateway.test.ts`

**Step 1: Write failing test**
```typescript
// tests/integration/gateway.test.ts
import { describe, it, expect } from 'vitest';
import { app } from '../../src/api/server';

describe('Gateway API Routes', () => {
  it('GET /v1/models returns virtual and registered models', async () => {
    const res = await app.request('/v1/models');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.object).toBe('list');
    expect(data.data.some((m: any) => m.id === 'd1-router-auto')).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**
Run: `npx vitest run tests/integration/gateway.test.ts`
Expected: FAIL

**Step 3: Minimal implementation**
```typescript
// src/api/server.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from '../core/config';
import { ModelRegistry } from '../engine/registry';
import { D1Client } from '../engine/d1-client';
import { PolicyEngine } from '../engine/policy-engine';
import { CanonicalRequest } from '../core/types';
import fs from 'fs';

export const app = new Hono();

app.use('*', cors());

let registry = new ModelRegistry([]);
if (fs.existsSync(config.REGISTRY_PATH)) {
  registry = ModelRegistry.fromYaml(fs.readFileSync(config.REGISTRY_PATH, 'utf-8'));
}

const d1Client = new D1Client(config.D1_ENDPOINT, config.D1_MODEL, config.D1_TIMEOUT_MS);

// 1. Model List
app.get('/v1/models', (c) => {
  const models = [
    { id: 'd1-router-auto', object: 'model', owned_by: 'system-one' },
    { id: 'd1-router-cost', object: 'model', owned_by: 'system-one' },
    { id: 'd1-router-quality', object: 'model', owned_by: 'system-one' },
    { id: 'd1-router-local', object: 'model', owned_by: 'system-one' },
    ...registry.models.map(m => ({ id: m.id, object: 'model', owned_by: m.provider }))
  ];
  return c.json({ object: 'list', data: models });
});

// 2. OpenAI Chat Completions
app.post('/v1/chat/completions', async (c) => {
  const t0 = performance.now();
  const body = await c.req.json();
  
  const canonical: CanonicalRequest = {
    messages: body.messages || [],
    stream: body.stream ?? false,
    tools: body.tools
  };

  const state = CanonicalRequest.extractState(canonical);
  let evalResult;
  try {
    evalResult = await d1Client.evaluate(state);
  } catch {
    evalResult = { complexityScore: 1.5, domain: 'general', requiresTools: false, requiresVision: false, confidence: 0.5 };
  }

  const candidates = registry.findCandidates({
    complexity: evalResult.complexityScore,
    requiresTools: evalResult.requiresTools,
    requiresVision: evalResult.requiresVision
  });

  const decision = PolicyEngine.resolve(
    candidates.length > 0 ? candidates : registry.models,
    evalResult,
    config.DEFAULT_POLICY
  );

  const latency = (performance.now() - t0).toFixed(2);
  c.header('X-D1-Complexity-Score', evalResult.complexityScore.toFixed(2));
  c.header('X-D1-Domain', evalResult.domain);
  c.header('X-D1-Selected-Model', decision.selectedModel.id);
  c.header('X-D1-Routing-Latency-Ms', latency);

  // Forward to upstream
  const upstreamUrl = `${decision.selectedModel.base_url.replace(/\/$/, '')}/chat/completions`;
  body.model = decision.selectedModel.upstream_model;

  const upstreamRes = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: c.req.raw.signal
  });

  if (body.stream && upstreamRes.body) {
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-D1-Complexity-Score': evalResult.complexityScore.toFixed(2),
        'X-D1-Selected-Model': decision.selectedModel.id
      }
    });
  }

  const data = await upstreamRes.json();
  return c.json(data);
});
```

**Step 4: Run test to verify pass**
Run: `npx vitest run tests/integration/gateway.test.ts`
Expected: PASS

---

### Phase 6: Web Dashboard & Live Complexity Playground

#### Task 6.1: Vite & TanStack Router Frontend Setup
**Objective:** Menyiapkan root layout TanStack Router dengan dashboard metrik dan playground.
**Files:**
- Create: `src/web/routes/__root.tsx`
- Create: `src/web/routes/index.tsx`
- Create: `src/web/routes/playground.tsx`
- Create: `vite.config.ts`

**Step 1: Write `vite.config.ts`**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';

export default defineConfig({
  plugins: [react(), TanStackRouterVite({ routesDirectory: './src/web/routes' })],
  server: {
    port: 8100,
  },
  build: {
    outDir: 'dist/client'
  }
});
```

---

## 4. Definisi Selesai (Definition of Done)

- [ ] Seluruh unit test pada `tests/unit/` (Config, Canonical, D1Client, Registry, Policy, Transcoder) lulus 100%.
- [ ] Pengujian integrasi pada `tests/integration/` lulus untuk skenario streaming dan non-streaming.
- [ ] Server Hono dapat menyajikan rute API `/v1/*` dan file statis TanStack UI pada port 8100.
- [ ] Hermes Agent dan Claude Code berhasil terhubung ke gateway router lokal tanpa kesalahan format.
