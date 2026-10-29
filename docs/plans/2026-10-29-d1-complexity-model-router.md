# Architecture Specification & Implementation Plan: D1-Powered Complexity Model Router

> **For Hermes / Implementer:** Use the `subagent-driven-development` skill to execute this plan task-by-task with strict TDD discipline.

**Goal:** Membangun reverse proxy dan platform routing model AI berlatensi rendah yang mengevaluasi kompleksitas prompt secara dinamis menggunakan Decision Model System One (Liquid AI `d1` via `/v1/systemone`), mencocokkannya ke Model Registry berbasis kapabilitas/tag/biaya, dan mengekspos endpoint ganda berstandar OpenAI (`/v1/chat/completions`) dan Anthropic (`/v1/messages`) yang mendukung bidirectional streaming SSE untuk harness seperti Hermes Agent, Claude Code, dan OpenCode.

**Architecture:** Arsitektur modular berbasis Event/Stream Gateway (FastAPI + Pydantic v2 + HTTPX) yang menormalisasi request masuk ke format kanonikal internal (`CanonicalRequest`), mengevaluasi kompleksitas dan domain tugas secara instan (<30ms) melalui *single forward pass* model `d1` (Ollama/Liquid), memilih model optimal dari Model Registry terindeks tag melalui *Policy Engine*, dan meneruskan request ke upstream LLM (lokal/cloud) dengan *Universal Protocol Transcoder* untuk *zero-buffering* SSE streaming pass-through.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, HTTPX (Async Client with Connection Pooling), PyYAML, SQLite / In-Memory Indexed Registry, Pytest + Pytest-Asyncio.

---

## 1. Analisis Kebutuhan Sistem Mendalam (System Requirements Analysis)

### 1.1 Masalah Utama Arsitektur Eksisting (The Problem Statement)
1. **Inefisiensi Biaya Frontier LLM:** Penggunaan model penalaran kelas atas (Claude 3.5 Sonnet, GPT-4o, O1) untuk tugas sepele (greeting, ekstraksi teks sederhana, formatting JSON, chit-chat) menghabiskan kuota dan anggaran API hingga 70-80% lebih boros dari yang seharusnya.
2. **Keterbatasan Router Konvensional:**
   - *Regex / Keyword Router:* Terlalu rapuh dan buta konteks semantik.
   - *Embedding / Vector Distance Router:* Lambat (overhead 80-150ms), tidak memahami instruksi bertingkat, dan tidak memiliki kalibrasi kepastian.
   - *Generative LLM Router (Classifier via SLM):* Memerlukan *token generation* (50-200 token), menambah latensi 300-800ms sebelum model utama mulai berpikir, serta rawan kegagalan parsing format JSON.
3. **Fragmentasi Protokol Harness AI:**
   - Alat seperti **Claude Code** secara native mengharuskan format Anthropic (`/v1/messages` dengan `content_block_delta` SSE streaming).
   - Alat seperti **Hermes Agent**, **OpenCode**, **Cursor**, dan **Aider** dominan menggunakan protokol OpenAI (`/v1/chat/completions` dengan format delta choices).
   - Sistem membutuhkan gateway yang mampu menerima kedua standar dan meneruskannya ke model apapun tanpa memaksa harness mengubah implementasi internalnya.

---

### 1.2 Kebutuhan Fungsional (Functional Requirements)

| Kode | Kebutuhan | Deskripsi Teknis |
| :--- | :--- | :--- |
| **FR-01** | **OpenAI Ingestion API** | Menyediakan `POST /v1/chat/completions` dan `GET /v1/models` yang 100% kompatibel dengan spesifikasi OpenAI, mendukung `stream: true/false`, function/tool calling, serta image input. |
| **FR-02** | **Anthropic Ingestion API** | Menyediakan `POST /v1/messages` yang kompatibel dengan protokol Anthropic Messages API v1, mendukung streaming SSE event-based (`message_start`, `content_block_delta`, `message_delta`, `message_stop`). |
| **FR-03** | **Decision Engine (Liquid `d1`)** | Terkoneksi ke Ollama `/v1/systemone` (atau remote Liquid API) untuk menjalankan evaluasi terstruktur dalam satu forward pass (Score untuk kompleksitas, Choice untuk domain, Noul untuk kebutuhan tools/vision). |
| **FR-04** | **Model Registry & Dynamic Tagging** | Menyimpan katalog model lengkap dengan metadata: `id`, `provider`, `upstream_model`, `base_url`, `api_key_env`, `complexity_range`, `capabilities` (`tools`, `vision`, `streaming`), `cost`, dan `tags`. |
| **FR-05** | **Policy-Driven Routing Engine** | Algoritma pencocokan yang memetakan skor `d1` dan tag request ke model terbaik berdasarkan strategi: `BALANCED`, `COST_OPTIMIZED`, `PERFORMANCE`, atau `LOCAL_FIRST`. |
| **FR-06** | **Universal Protocol Transcoder** | Menerjemahkan request & streaming response secara dinamis: Client OpenAI $\leftrightarrow$ Upstream Anthropic, atau Client Anthropic $\leftrightarrow$ Upstream OpenAI/Ollama secara real-time. |
| **FR-07** | **Zero-Buffer SSE Streaming** | Menyalurkan chunk token langsung dari upstream ke client secara non-blocking (*async generator*) dengan latensi penambahan < 5ms. |
| **FR-08** | **Observability & Telemetry Headers** | Menyuntikkan custom headers pada response: `X-D1-Complexity-Score`, `X-D1-Domain`, `X-D1-Selected-Model`, `X-D1-Routing-Latency-Ms`, serta mencatat metrik penghematan biaya. |
| **FR-09** | **Resilience & Fallback Engine** | Jika model `d1` lokal gagal/timeout (>150ms), fallback otomatis ke rule-based heuristic classifier (token count + regex heuristic) tanpa menggagalkan request pengguna. |

---

### 1.3 Kebutuhan Non-Fungsional (Non-Functional Requirements)

1. **Routing Overhead Latency:** Maksimal $\le 50\text{ ms}$ untuk evaluasi `d1` lokal di atas Metal/GPU Apple Silicon.
2. **High Concurrency & Low Memory Footprint:** Arsitektur full asynchronous non-blocking I/O (`asyncio` + `httpx.AsyncClient` dengan connection pool reuse).
3. **Zero External DB Dependency for Core Routing:** Model registry disimpan dalam YAML/JSON yang dimuat ke in-memory index (*thread-safe read-heavy data structure*), opsional persistensi SQLite untuk log audit.
4. **Reliability & Idempotency:** Graceful handling untuk upstream disconnection, timeout, rate limit (HTTP 429), dan token context overflow.

---

## 2. Arsitektur Sistem & Spesifikasi Komponen

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AI CLIENT HARNESSES                                │
│   [Hermes Agent]          [Claude Code]           [OpenCode / Cursor]       │
│  (OpenAI Protocol)     (Anthropic Protocol)      (OpenAI / Custom API)      │
└──────────────┬───────────────────┬───────────────────────────┬──────────────┘
               │                   │                           │
               ▼                   ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    D1 COMPLEXITY ROUTER GATEWAY                             │
│                                                                             │
│  ┌─────────────────────────┐             ┌─────────────────────────┐        │
│  │ OpenAI Ingestion Route  │             │ Anthropic Ingest Route  │        │
│  │ POST /v1/chat/complet's │             │ POST /v1/messages       │        │
│  └───────────┬─────────────┘             └───────────┬─────────────┘        │
│              │                                       │                      │
│              └───────────────────┬───────────────────┘                      │
│                                  ▼                                          │
│                   ┌─────────────────────────────┐                           │
│                   │ Protocol Normalizer Adapter │                           │
│                   │  -> CanonicalRequest        │                           │
│                   └──────────────┬──────────────┘                           │
│                                  │                                          │
│                 ┌────────────────┴────────────────┐                         │
│                 ▼                                 ▼                         │
│  ┌───────────────────────────────┐  ┌───────────────────────────────────┐   │
│  │   D1 DECISION EVALUATOR       │  │       MODEL REGISTRY & TAGS       │   │
│  │   (Liquid AI / System One)    │  │   - Capability & Tag Index        │   │
│  │ - State Formatter             │  │   - Complexity Range Mapping      │   │
│  │ - Score: Complexity (1 - 5)   │  │   - Cost & Provider Configs       │   │
│  │ - Choice: Domain classification│ └─────────────────┬─────────────────┘   │
│  │ - Noul: Needs Tools / Vision  │                   │                     │
│  └──────────────┬────────────────┘                   │                     │
│                 │ (Evaluation Result)                │                     │
│                 └────────────────►┌──────────────────▼┐                     │
│                                   │   POLICY ROUTER   │                     │
│                                   │ - Matcher Engine  │                     │
│                                   │ - Selects Target  │                     │
│                                   └─────────┬─────────┘                     │
│                                             │ (Selected Target Model)       │
│                                             ▼                               │
│                         ┌──────────────────────────────────────┐            │
│                         │   UPSTREAM DISPATCHER & PROXY        │            │
│                         │   - Target Protocol Translation      │            │
│                         │   - HTTPX Streaming Connection Pool  │            │
│                         └───────────────────┬──────────────────┘            │
│                                             │                               │
│                                             ▼                               │
│                         ┌──────────────────────────────────────┐            │
│                         │     STREAM TRANSCODER (SSE)          │            │
│                         │ Transcodes Upstream SSE Chunk ->     │            │
│                         │ Native Client SSE Format Real-time   │            │
│                         └───────────────────┬──────────────────┘            │
└─────────────────────────────────────────────┼───────────────────────────────┘
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    ▼                                                  ▼
      ┌───────────────────────────┐                      ┌───────────────────────────┐
      │  LOCAL UPSTREAM PROVIDER  │                      │  CLOUD UPSTREAM PROVIDER  │
      │  - Ollama (lfm3, qwen)    │                      │  - Anthropic API          │
      │  - Local vLLM Engine      │                      │  - OpenAI / OpenRouter    │
      └───────────────────────────┘                      └───────────────────────────┘
```

---

## 3. Spesifikasi Protokol & Kontrak Data

### 3.1 Kontrak Evaluasi System One `d1` (Ollama `/v1/systemone`)

* **Endpoint:** `POST http://localhost:11434/v1/systemone`
* **Request Payload:**
```json
{
  "model": "d1:latest",
  "state": "User message + system instructions + tool signatures",
  "questions": {
    "complexity": {
      "type": "score",
      "instructions": "Rate the intellectual and technical complexity of this task on a scale from 1 (trivial/greetings) to 5 (deep reasoning/complex architecture).",
      "criteria": [
        "Level 1: Trivial greetings, chit-chat, simple formatting",
        "Level 2: Basic rewrite, single-fact lookup, translation",
        "Level 3: Standard code function, single tool call, structured data parsing",
        "Level 4: Complex multi-file algorithm, deep debugging, architectural design",
        "Level 5: Formal mathematical proof, intricate concurrency, distributed systems"
      ]
    },
    "domain": {
      "type": "choice",
      "instructions": "What is the primary technical domain of this prompt?",
      "criteria": {
        "coding": "Writing, refactoring, or analyzing software code and scripts",
        "reasoning": "Mathematical logic, formal verification, or complex deduction",
        "tools": "Agentic execution, tool chaining, file system operations",
        "general": "Casual conversation, translation, creative writing, or general knowledge"
      }
    },
    "requires_tools": {
      "type": "noul",
      "instructions": "Does this request explicitly require executing external tools or calling APIs?"
    },
    "requires_vision": {
      "type": "noul",
      "instructions": "Does this request contain or reference images or visual artifacts?"
    }
  }
}
```

* **Response Output:**
```json
{
  "model": "d1:latest",
  "answers": {
    "complexity": {
      "type": "score",
      "score": 3.42,
      "probabilities": { "0": 0.01, "1": 0.04, "2": 0.15, "3": 0.48, "4": 0.32 },
      "confidence": 0.52
    },
    "domain": {
      "type": "choice",
      "choice": "coding",
      "probabilities": { "coding": 0.98, "reasoning": 0.01, "tools": 0.005, "general": 0.005 },
      "confidence": 0.97
    },
    "requires_tools": {
      "type": "noul",
      "probability": 0.88
    },
    "requires_vision": {
      "type": "noul",
      "probability": 0.02
    }
  },
  "usage": { "input_tokens": 184, "output_tokens": 0 }
}
```

---

### 3.2 Struktur Model Registry (`config/registry.yaml`)

```yaml
version: "1.0"
default_policy: "balanced" # balanced | cost_optimized | quality_max | local_first

models:
  # --- Tier 1: Local / Fast SLM (Complexity 0.0 - 1.8) ---
  - id: "lfm3-local"
    display_name: "Liquid LFM3 2.6B (Local)"
    provider: "ollama"
    upstream_model: "lfm3:latest"
    base_url: "http://localhost:11434/v1"
    api_key_env: null
    complexity_range: [0.0, 1.8]
    tags: ["local", "fast", "low_cost", "chat"]
    capabilities:
      tools: true
      vision: false
      max_context: 65536
      streaming: true
    cost:
      input_per_mtoken: 0.0
      output_per_mtoken: 0.0

  # --- Tier 2: Mid-tier Coding & Reasoning (Complexity 1.5 - 3.2) ---
  - id: "qwen-coder-local"
    display_name: "Qwen 2.5 Coder 7B (Local)"
    provider: "ollama"
    upstream_model: "qwen2.5-coder:7b"
    base_url: "http://localhost:11434/v1"
    api_key_env: null
    complexity_range: [1.5, 3.2]
    tags: ["local", "coding", "tools"]
    capabilities:
      tools: true
      vision: false
      max_context: 32768
      streaming: true
    cost:
      input_per_mtoken: 0.0
      output_per_mtoken: 0.0

  # --- Tier 3: High-efficiency Cloud (Complexity 2.0 - 3.8) ---
  - id: "gpt-4o-mini"
    display_name: "OpenAI GPT-4o Mini"
    provider: "openai"
    upstream_model: "gpt-4o-mini"
    base_url: "https://api.openai.com/v1"
    api_key_env: "OPENAI_API_KEY"
    complexity_range: [2.0, 3.8]
    tags: ["cloud", "balanced", "tools", "vision"]
    capabilities:
      tools: true
      vision: true
      max_context: 128000
      streaming: true
    cost:
      input_per_mtoken: 0.15
      output_per_mtoken: 0.60

  # --- Tier 4: Frontier Coding & Complex Architecture (Complexity 3.5 - 5.0) ---
  - id: "claude-3-5-sonnet"
    display_name: "Anthropic Claude 3.5 Sonnet"
    provider: "anthropic"
    upstream_model: "claude-3-5-sonnet-20241022"
    base_url: "https://api.anthropic.com/v1"
    api_key_env: "ANTHROPIC_API_KEY"
    complexity_range: [3.5, 5.0]
    tags: ["cloud", "frontier", "coding", "reasoning", "vision", "tools"]
    capabilities:
      tools: true
      vision: true
      max_context: 200000
      streaming: true
    cost:
      input_per_mtoken: 3.00
      output_per_mtoken: 15.00
```

---

## 4. Modul Dependencies & Ekosistem

File: `pyproject.toml`
```toml
[project]
name = "d1-model-router"
version = "0.1.0"
description = "System One (Liquid d1) Dynamic Complexity Model Router"
authors = [{ name = "Fikri Anggara" }]
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "pydantic>=2.8.0",
    "pydantic-settings>=2.4.0",
    "httpx[http2]>=0.27.0",
    "pyyaml>=6.0.2",
    "python-dotenv>=1.0.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-mock>=3.14.0",
    "respx>=0.21.1", # Mocking HTTPX async requests
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## 5. Rencana Kerja Implementasi Bertahap (Bite-Sized Tasks)

### Phase 1: Foundation & Core Configuration

#### Task 1.1: Project Directory Structure & Dependencies
**Objective:** Menginisialisasi direktori project, konfigurasi environment, dan dependency lock.
**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `config/registry.yaml`
- Create: `src/__init__.py`

**Step 1: Write pyproject.toml**
```toml
[project]
name = "d1-model-router"
version = "0.1.0"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "pydantic>=2.8.0",
    "pydantic-settings>=2.4.0",
    "httpx[http2]>=0.27.0",
    "pyyaml>=6.0.2",
    "python-dotenv>=1.0.1",
]
[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "respx>=0.21.1",
]
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

**Step 2: Write .env.example**
```bash
ROUTER_HOST=0.0.0.0
ROUTER_PORT=8000
D1_ENDPOINT=http://localhost:11434/v1/systemone
D1_MODEL=d1:latest
D1_TIMEOUT_SECONDS=0.15
DEFAULT_POLICY=balanced
FALLBACK_MODEL_ID=lfm3-local
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
```

**Step 3: Verification command**
Run: `python3 -m pip install -e ".[dev]" --dry-run`
Expected: Valid pyproject dependencies resolved.

---

#### Task 1.2: App Settings & Configuration Loader
**Objective:** Membangun `src/core/config.py` menggunakan Pydantic Settings untuk validasi variabel lingkungan.
**Files:**
- Create: `src/core/config.py`
- Test: `tests/unit/test_config.py`

**Step 1: Write failing test**
```python
# tests/unit/test_config.py
from src.core.config import Settings

def test_settings_default_values():
    settings = Settings(D1_ENDPOINT="http://localhost:11434/v1/systemone")
    assert settings.ROUTER_PORT == 8000
    assert settings.D1_MODEL == "d1:latest"
    assert settings.DEFAULT_POLICY == "balanced"
    assert settings.D1_TIMEOUT_SECONDS == 0.15
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_config.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'src.core'`)

**Step 3: Write minimal implementation**
```python
# src/core/config.py
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    ROUTER_HOST: str = "0.0.0.0"
    ROUTER_PORT: int = 8000
    D1_ENDPOINT: str = "http://localhost:11434/v1/systemone"
    D1_MODEL: str = "d1:latest"
    D1_TIMEOUT_SECONDS: float = 0.15
    DEFAULT_POLICY: str = "balanced"
    FALLBACK_MODEL_ID: str = "lfm3-local"
    REGISTRY_CONFIG_PATH: str = "config/registry.yaml"
    
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_config.py -v`
Expected: PASS (1 passed)

---

### Phase 2: Domain Layer — Canonical Schema & Model Registry

#### Task 2.1: Canonical Request & Message Representation
**Objective:** Membuat model kanonikal internal `CanonicalRequest` yang mengabstraksi perbedaan OpenAI dan Anthropic.
**Files:**
- Create: `src/domain/canonical.py`
- Test: `tests/unit/test_canonical.py`

**Step 1: Write failing test**
```python
# tests/unit/test_canonical.py
from src.domain.canonical import CanonicalRequest, CanonicalMessage

def test_canonical_request_state_extraction():
    req = CanonicalRequest(
        messages=[
            CanonicalMessage(role="system", content="You are a helpful coding assistant."),
            CanonicalMessage(role="user", content="Write a quicksort in Python.")
        ],
        stream=True,
        tools=[{"name": "execute_code", "description": "Runs code"}]
    )
    assert req.stream is True
    assert len(req.messages) == 2
    state_str = req.extract_eval_state()
    assert "quicksort in Python" in state_str
    assert "execute_code" in state_str
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_canonical.py -v`
Expected: FAIL (`ModuleNotFoundError`)

**Step 3: Write minimal implementation**
```python
# src/domain/canonical.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union

class CanonicalToolCall(BaseModel):
    id: str
    name: str
    arguments: str

class CanonicalMessage(BaseModel):
    role: str # "system", "user", "assistant", "tool"
    content: Union[str, List[Dict[str, Any]]]
    name: Optional[str] = None
    tool_calls: Optional[List[CanonicalToolCall]] = None
    tool_call_id: Optional[str] = None

class CanonicalRequest(BaseModel):
    messages: List[CanonicalMessage]
    model_override: Optional[str] = None
    policy: Optional[str] = None
    stream: bool = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    tools: Optional[List[Dict[str, Any]]] = None
    extra_params: Dict[str, Any] = Field(default_factory=dict)

    def extract_eval_state(self, max_chars: int = 4000) -> str:
        """Ekstraksi state ringkas untuk input System One d1."""
        lines = []
        for m in self.messages[-4:]: # Ambil 4 message terakhir
            content_text = m.content if isinstance(m.content, str) else str(m.content)
            lines.append(f"[{m.role.upper()}]: {content_text}")
        if self.tools:
            tool_names = [t.get("name") or t.get("function", {}).get("name", "") for t in self.tools]
            lines.append(f"[AVAILABLE_TOOLS]: {', '.join(tool_names)}")
        full_text = "\n".join(lines)
        return full_text[-max_chars:] if len(full_text) > max_chars else full_text
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_canonical.py -v`
Expected: PASS

---

#### Task 2.2: Model Registry & Capability Matching
**Objective:** Membangun `ModelRegistry` yang memuat konfigurasi model, mengindeks tag, dan memfilter kandidat model berdasarkan kapabilitas.
**Files:**
- Create: `src/domain/registry.py`
- Test: `tests/unit/test_registry.py`

**Step 1: Write failing test**
```python
# tests/unit/test_registry.py
from src.domain.registry import ModelRegistry, ModelSpec

SAMPLE_YAML = """
version: "1.0"
models:
  - id: "local-chat"
    display_name: "Local Chat"
    provider: "ollama"
    upstream_model: "lfm3:latest"
    base_url: "http://localhost:11434/v1"
    complexity_range: [0.0, 2.0]
    tags: ["chat", "local"]
    capabilities:
      tools: false
      vision: false
      max_context: 32768
      streaming: true
    cost:
      input_per_mtoken: 0.0
      output_per_mtoken: 0.0
  - id: "cloud-frontier"
    display_name: "Frontier Sonnet"
    provider: "anthropic"
    upstream_model: "claude-3-5-sonnet"
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
"""

def test_registry_filtering():
    reg = ModelRegistry.from_yaml_string(SAMPLE_YAML)
    assert len(reg.models) == 2
    
    # Filter requiring tools
    candidates = reg.find_candidates(requires_tools=True, requires_vision=False)
    assert len(candidates) == 1
    assert candidates[0].id == "cloud-frontier"
    
    # Filter by complexity score 1.0 (no tools required)
    simple_candidates = reg.find_candidates(complexity=1.0, requires_tools=False)
    assert any(m.id == "local-chat" for m in simple_candidates)
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_registry.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'src.domain.registry'`)

**Step 3: Write minimal implementation**
```python
# src/domain/registry.py
import yaml
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

class ModelCapabilities(BaseModel):
    tools: bool = True
    vision: bool = False
    max_context: int = 32768
    streaming: bool = True

class ModelCost(BaseModel):
    input_per_mtoken: float = 0.0
    output_per_mtoken: float = 0.0

class ModelSpec(BaseModel):
    id: str
    display_name: str
    provider: str # ollama, openai, anthropic, openrouter
    upstream_model: str
    base_url: str
    api_key_env: Optional[str] = None
    complexity_range: Tuple[float, float] = (0.0, 5.0)
    tags: List[str] = Field(default_factory=list)
    capabilities: ModelCapabilities = Field(default_factory=ModelCapabilities)
    cost: ModelCost = Field(default_factory=ModelCost)

class ModelRegistry(BaseModel):
    version: str = "1.0"
    models: List[ModelSpec] = Field(default_factory=list)

    @classmethod
    def from_yaml_file(cls, path: str) -> "ModelRegistry":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls(**data)

    @classmethod
    def from_yaml_string(cls, content: str) -> "ModelRegistry":
        data = yaml.safe_load(content)
        return cls(**data)

    def get_model(self, model_id: str) -> Optional[ModelSpec]:
        for m in self.models:
            if m.id == model_id:
                return m
        return None

    def find_candidates(
        self,
        complexity: Optional[float] = None,
        requires_tools: bool = False,
        requires_vision: bool = False,
        tag: Optional[str] = None
    ) -> List[ModelSpec]:
        results = []
        for m in self.models:
            if requires_tools and not m.capabilities.tools:
                continue
            if requires_vision and not m.capabilities.vision:
                continue
            if tag and tag not in m.tags:
                continue
            if complexity is not None:
                min_c, max_c = m.complexity_range
                # Berikan toleransi margin 0.2
                if not (min_c - 0.2 <= complexity <= max_c + 0.2):
                    continue
            results.append(m)
        return results
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_registry.py -v`
Expected: PASS

---

### Phase 3: Engine Layer — System One `d1` Client & Decision Evaluator

#### Task 3.1: D1 Decision Client
**Objective:** Mengimplementasikan HTTP client asynchronous untuk memanggil endpoint `/v1/systemone` pada Ollama/Liquid.
**Files:**
- Create: `src/engine/d1_client.py`
- Test: `tests/unit/test_d1_client.py`

**Step 1: Write failing test**
```python
# tests/unit/test_d1_client.py
import pytest
import respx
import httpx
from src.engine.d1_client import D1Client, D1EvaluationResult

@pytest.mark.asyncio
async def test_d1_evaluate_success():
    client = D1Client(endpoint="http://localhost:11434/v1/systemone", model="d1:latest")
    
    mock_response = {
        "model": "d1:latest",
        "answers": {
            "complexity": {"type": "score", "score": 3.8, "confidence": 0.8},
            "domain": {"type": "choice", "choice": "coding", "confidence": 0.95},
            "requires_tools": {"type": "noul", "probability": 0.85},
            "requires_vision": {"type": "noul", "probability": 0.05}
        },
        "usage": {"input_tokens": 50, "output_tokens": 0}
    }
    
    with respx.mock(base_url="http://localhost:11434") as respx_mock:
        respx_mock.post("/v1/systemone").respond(200, json=mock_response)
        result = await client.evaluate("Implement B-Tree in C")
        
        assert result.complexity_score == 3.8
        assert result.domain == "coding"
        assert result.requires_tools is True
        assert result.requires_vision is False
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_d1_client.py -v`
Expected: FAIL (`ModuleNotFoundError`)

**Step 3: Write minimal implementation**
```python
# src/engine/d1_client.py
import httpx
from typing import Dict, Any, Optional
from pydantic import BaseModel

class D1EvaluationResult(BaseModel):
    complexity_score: float
    domain: str
    requires_tools: bool
    requires_vision: bool
    confidence: float
    raw_response: Dict[str, Any]

class D1Client:
    def __init__(self, endpoint: str, model: str = "d1:latest", timeout_s: float = 0.15):
        self.endpoint = endpoint
        self.model = model
        self.timeout_s = timeout_s

    def _build_payload(self, state: str) -> Dict[str, Any]:
        return {
            "model": self.model,
            "state": state,
            "questions": {
                "complexity": {
                    "type": "score",
                    "instructions": "Rate the intellectual and technical complexity on a scale from 1 (trivial) to 5 (expert).",
                    "criteria": [
                        "Level 1: Trivial greetings, simple chit-chat",
                        "Level 2: Basic rewrite, simple fact retrieval",
                        "Level 3: Standard code function, simple script, data parsing",
                        "Level 4: Complex multi-file architecture, advanced algorithms",
                        "Level 5: Deep distributed systems, kernel logic, formal proofs"
                    ]
                },
                "domain": {
                    "type": "choice",
                    "instructions": "What is the primary technical domain?",
                    "criteria": {
                        "coding": "Writing or refactoring source code",
                        "reasoning": "Mathematics or complex logic",
                        "tools": "Tool calling and execution planning",
                        "general": "Casual conversation or general text"
                    }
                },
                "requires_tools": {
                    "type": "noul",
                    "instructions": "Does this request require invoking external tools or APIs?"
                },
                "requires_vision": {
                    "type": "noul",
                    "instructions": "Does this request reference or analyze images?"
                }
            }
        }

    async def evaluate(self, state: str) -> D1EvaluationResult:
        payload = self._build_payload(state)
        async with httpx.AsyncClient(timeout=self.timeout_s) as client:
            resp = await client.post(self.endpoint, json=payload)
            resp.raise_for_status()
            data = resp.json()
            
        answers = data.get("answers", {})
        comp = answers.get("complexity", {})
        dom = answers.get("domain", {})
        tools = answers.get("requires_tools", {})
        vision = answers.get("requires_vision", {})

        return D1EvaluationResult(
            complexity_score=float(comp.get("score", 1.0)),
            domain=str(dom.get("choice", "general")),
            requires_tools=bool(tools.get("probability", 0.0) >= 0.5),
            requires_vision=bool(vision.get("probability", 0.0) >= 0.5),
            confidence=float(comp.get("confidence", 0.5)),
            raw_response=data
        )
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_d1_client.py -v`
Expected: PASS

---

### Phase 4: Policy Engine & Model Routing Resolver

#### Task 4.1: Routing Policy Strategy Pattern
**Objective:** Mengimplementasikan strategi routing (`Balanced`, `CostOptimized`, `QualityMax`, `LocalFirst`).
**Files:**
- Create: `src/domain/router_policy.py`
- Test: `tests/unit/test_policy.py`

**Step 1: Write failing test**
```python
# tests/unit/test_policy.py
from src.domain.registry import ModelSpec, ModelCost, ModelCapabilities
from src.domain.router_policy import PolicyEngine, RoutingDecision
from src.engine.d1_client import D1EvaluationResult

def test_cost_optimized_policy_selects_cheapest():
    local_model = ModelSpec(
        id="local-1", display_name="LFM Local", provider="ollama",
        upstream_model="lfm3", base_url="http://localhost:11434",
        complexity_range=(0.0, 2.5), cost=ModelCost(input_per_mtoken=0.0, output_per_mtoken=0.0)
    )
    cloud_model = ModelSpec(
        id="cloud-1", display_name="GPT-4o Mini", provider="openai",
        upstream_model="gpt-4o-mini", base_url="https://api.openai.com",
        complexity_range=(1.0, 3.5), cost=ModelCost(input_per_mtoken=0.15, output_per_mtoken=0.6)
    )
    
    eval_result = D1EvaluationResult(
        complexity_score=1.5, domain="general", requires_tools=False,
        requires_vision=False, confidence=0.9, raw_response={}
    )
    
    engine = PolicyEngine()
    decision = engine.resolve(candidates=[local_model, cloud_model], eval_result=eval_result, policy="cost_optimized")
    assert decision.selected_model.id == "local-1"
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_policy.py -v`
Expected: FAIL (`ModuleNotFoundError`)

**Step 3: Write minimal implementation**
```python
# src/domain/router_policy.py
from typing import List
from pydantic import BaseModel
from src.domain.registry import ModelSpec
from src.engine.d1_client import D1EvaluationResult

class RoutingDecision(BaseModel):
    selected_model: ModelSpec
    policy_used: str
    reason: str
    complexity_score: float

class PolicyEngine:
    def resolve(
        self,
        candidates: List[ModelSpec],
        eval_result: D1EvaluationResult,
        policy: str = "balanced"
    ) -> RoutingDecision:
        if not candidates:
            raise ValueError("No eligible models found for routing criteria.")

        score = eval_result.complexity_score

        if policy == "cost_optimized" or policy == "local_first":
            # Urutkan berdasarkan total cost (input + output), prioritaskan local (cost 0)
            sorted_candidates = sorted(
                candidates,
                key=lambda m: (m.cost.input_per_mtoken + m.cost.output_per_mtoken, -m.complexity_range[1])
            )
            chosen = sorted_candidates[0]
            reason = f"Selected {chosen.id} as lowest-cost candidate matching score {score:.2f}."
            return RoutingDecision(selected_model=chosen, policy_used=policy, reason=reason, complexity_score=score)

        elif policy == "quality_max":
            # Pilih model dengan upper bound kompleksitas tertinggi
            sorted_candidates = sorted(candidates, key=lambda m: m.complexity_range[1], reverse=True)
            chosen = sorted_candidates[0]
            reason = f"Selected {chosen.id} for maximum headroom above score {score:.2f}."
            return RoutingDecision(selected_model=chosen, policy_used=policy, reason=reason, complexity_score=score)

        else: # "balanced" default
            # Cari model yang jarak tengah range-nya paling dekat dengan score
            def distance(m: ModelSpec):
                mid = (m.complexity_range[0] + m.complexity_range[1]) / 2.0
                return abs(mid - score)

            sorted_candidates = sorted(candidates, key=distance)
            chosen = sorted_candidates[0]
            reason = f"Selected {chosen.id} as best capability-cost fit for complexity {score:.2f}."
            return RoutingDecision(selected_model=chosen, policy_used=policy, reason=reason, complexity_score=score)
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_policy.py -v`
Expected: PASS

---

### Phase 5: Adapters Layer — OpenAI & Anthropic Protocol Converters

#### Task 5.1: OpenAI Ingestion Normalizer
**Objective:** Mengonversi request OpenAI `POST /v1/chat/completions` menjadi `CanonicalRequest`.
**Files:**
- Create: `src/adapters/openai_adapter.py`
- Test: `tests/unit/test_openai_adapter.py`

**Step 1: Write failing test**
```python
# tests/unit/test_openai_adapter.py
from src.adapters.openai_adapter import OpenAIAdapter

def test_parse_openai_payload():
    payload = {
        "model": "d1-router-auto",
        "messages": [
            {"role": "user", "content": "Explain raft algorithm"}
        ],
        "stream": True,
        "temperature": 0.5
    }
    canonical = OpenAIAdapter.to_canonical(payload)
    assert canonical.messages[0].content == "Explain raft algorithm"
    assert canonical.stream is True
    assert canonical.policy == "balanced"
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_openai_adapter.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**
```python
# src/adapters/openai_adapter.py
from typing import Dict, Any
from src.domain.canonical import CanonicalRequest, CanonicalMessage

class OpenAIAdapter:
    @staticmethod
    def to_canonical(payload: Dict[str, Any]) -> CanonicalRequest:
        raw_model = payload.get("model", "auto")
        policy = "balanced"
        model_override = None

        if "cost" in raw_model:
            policy = "cost_optimized"
        elif "quality" in raw_model or "max" in raw_model:
            policy = "quality_max"
        elif "local" in raw_model:
            policy = "local_first"
        elif not raw_model.startswith("d1-router") and raw_model != "auto":
            model_override = raw_model

        messages = [
            CanonicalMessage(
                role=m.get("role", "user"),
                content=m.get("content", ""),
                name=m.get("name"),
                tool_calls=m.get("tool_calls"),
                tool_call_id=m.get("tool_call_id")
            )
            for m in payload.get("messages", [])
        ]

        return CanonicalRequest(
            messages=messages,
            model_override=model_override,
            policy=policy,
            stream=payload.get("stream", False),
            temperature=payload.get("temperature", 0.7),
            max_tokens=payload.get("max_tokens") or payload.get("max_completion_tokens"),
            tools=payload.get("tools"),
            extra_params={k: v for k, v in payload.items() if k not in ["messages", "model", "stream", "tools"]}
        )
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_openai_adapter.py -v`
Expected: PASS

---

#### Task 5.2: Anthropic Ingestion Normalizer
**Objective:** Mengonversi request Anthropic `POST /v1/messages` (dengan system prompt & tools) menjadi `CanonicalRequest`.
**Files:**
- Create: `src/adapters/anthropic_adapter.py`
- Test: `tests/unit/test_anthropic_adapter.py`

**Step 1: Write failing test**
```python
# tests/unit/test_anthropic_adapter.py
from src.adapters.anthropic_adapter import AnthropicAdapter

def test_parse_anthropic_payload():
    payload = {
        "model": "claude-d1-router",
        "system": "You are a code assistant",
        "messages": [
            {"role": "user", "content": "Write unit tests"}
        ],
        "max_tokens": 1024,
        "stream": True
    }
    canonical = AnthropicAdapter.to_canonical(payload)
    assert len(canonical.messages) == 2
    assert canonical.messages[0].role == "system"
    assert canonical.messages[0].content == "You are a code assistant"
    assert canonical.stream is True
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_anthropic_adapter.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**
```python
# src/adapters/anthropic_adapter.py
from typing import Dict, Any, List
from src.domain.canonical import CanonicalRequest, CanonicalMessage

class AnthropicAdapter:
    @staticmethod
    def to_canonical(payload: Dict[str, Any]) -> CanonicalRequest:
        raw_model = payload.get("model", "auto")
        policy = "balanced"
        if "cost" in raw_model:
            policy = "cost_optimized"
        elif "max" in raw_model:
            policy = "quality_max"

        messages: List[CanonicalMessage] = []
        
        # Anthropic memisahkan system prompt di root
        system_content = payload.get("system")
        if system_content:
            if isinstance(system_content, list):
                sys_text = "".join([b.get("text", "") for b in system_content if b.get("type") == "text"])
            else:
                sys_text = str(system_content)
            messages.append(CanonicalMessage(role="system", content=sys_text))

        for m in payload.get("messages", []):
            messages.append(CanonicalMessage(
                role=m.get("role", "user"),
                content=m.get("content", "")
            ))

        return CanonicalRequest(
            messages=messages,
            policy=policy,
            stream=payload.get("stream", False),
            temperature=payload.get("temperature", 0.7),
            max_tokens=payload.get("max_tokens", 4096),
            tools=payload.get("tools"),
            extra_params={k: v for k, v in payload.items() if k not in ["messages", "system", "model", "stream", "tools"]}
        )
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_anthropic_adapter.py -v`
Expected: PASS

---

### Phase 6: Universal Streaming Transcoder (SSE Bridge)

#### Task 6.1: Bidirectional SSE Transcoder
**Objective:** Mengonversi streaming SSE dari provider upstream (OpenAI $\leftrightarrow$ Anthropic) secara real-time tanpa penundaan buffer.
**Files:**
- Create: `src/adapters/stream_transcoder.py`
- Test: `tests/unit/test_stream_transcoder.py`

**Step 1: Write failing test**
```python
# tests/unit/test_stream_transcoder.py
import pytest
from src.adapters.stream_transcoder import StreamTranscoder

@pytest.mark.asyncio
async def test_transcode_openai_to_anthropic_sse():
    async def mock_openai_stream():
        yield 'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n'
        yield 'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
        yield 'data: [DONE]\n\n'

    chunks = []
    async for event in StreamTranscoder.openai_to_anthropic(mock_openai_stream(), model="target-model"):
        chunks.append(event)

    full_output = "".join(chunks)
    assert "event: message_start" in full_output
    assert "content_block_delta" in full_output
    assert "message_stop" in full_output
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_stream_transcoder.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**
```python
# src/adapters/stream_transcoder.py
import json
import uuid
import time
from typing import AsyncGenerator

class StreamTranscoder:
    @staticmethod
    async def openai_to_anthropic(
        stream: AsyncGenerator[str, None],
        model: str
    ) -> AsyncGenerator[str, None]:
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        
        # 1. Message Start
        yield f"event: message_start\ndata: {json.dumps({'type':'message_start','message':{'id':msg_id,'type':'message','role':'assistant','model':model,'content':[],'stop_reason':None,'usage':{'input_tokens':0}}})}\n\n"
        
        # 2. Block Start
        yield f"event: content_block_start\ndata: {json.dumps({'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}})}\n\n"

        async for chunk in stream:
            lines = chunk.strip().split("\n")
            for line in lines:
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                raw_json = line[6:].strip()
                try:
                    payload = json.loads(raw_json)
                    delta = payload.get("choices", [{}])[0].get("delta", {})
                    text_piece = delta.get("content")
                    if text_piece:
                        yield f"event: content_block_delta\ndata: {json.dumps({'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':text_piece}})}\n\n"
                except Exception:
                    continue

        # 3. Block Stop & Message Stop
        yield f"event: content_block_stop\ndata: {json.dumps({'type':'content_block_stop','index':0})}\n\n"
        yield f"event: message_delta\ndata: {json.dumps({'type':'message_delta','delta':{'stop_reason':'end_turn'},'usage':{'output_tokens':0}})}\n\n"
        yield f"event: message_stop\ndata: {json.dumps({'type':'message_stop'})}\n\n"
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_stream_transcoder.py -v`
Expected: PASS

---

### Phase 7: Proxy Dispatcher & Upstream Forwarder

#### Task 7.1: Upstream Async Forwarder with Connection Pooling
**Objective:** Mengirimkan payload ke upstream LLM (Ollama, OpenAI, Anthropic) dengan connection reuse dan timeout handling.
**Files:**
- Create: `src/proxy/upstream_client.py`
- Test: `tests/unit/test_upstream_client.py`

**Step 1: Write failing test**
```python
# tests/unit/test_upstream_client.py
import pytest
import respx
import httpx
from src.proxy.upstream_client import UpstreamClient
from src.domain.registry import ModelSpec

@pytest.mark.asyncio
async def test_forward_openai_compatible_upstream():
    model = ModelSpec(
        id="ollama-qwen", display_name="Qwen", provider="ollama",
        upstream_model="qwen3.5:4b", base_url="http://localhost:11434/v1"
    )
    client = UpstreamClient()
    
    with respx.mock(base_url="http://localhost:11434") as respx_mock:
        respx_mock.post("/v1/chat/completions").respond(200, json={"choices": [{"message": {"content": "OK"}}]})
        resp = await client.send_json(model=model, path="/chat/completions", payload={"messages": []})
        assert resp["choices"][0]["message"]["content"] == "OK"
```

**Step 2: Run test to verify failure**
Run: `pytest tests/unit/test_upstream_client.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**
```python
# src/proxy/upstream_client.py
import os
import httpx
from typing import Dict, Any, AsyncGenerator
from src.domain.registry import ModelSpec

class UpstreamClient:
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=120.0, limits=httpx.Limits(max_keepalive_connections=50, max_connections=200))

    def _get_headers(self, model: ModelSpec) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if model.api_key_env:
            token = os.getenv(model.api_key_env, "")
            if model.provider == "anthropic":
                headers["x-api-key"] = token
                headers["anthropic-version"] = "2023-06-01"
            else:
                headers["Authorization"] = f"Bearer {token}"
        return headers

    async def send_json(self, model: ModelSpec, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{model.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = self._get_headers(model)
        payload["model"] = model.upstream_model
        
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def stream_sse(self, model: ModelSpec, path: str, payload: Dict[str, Any]) -> AsyncGenerator[str, None]:
        url = f"{model.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = self._get_headers(model)
        payload["model"] = model.upstream_model
        payload["stream"] = True

        async with self._client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_lines():
                if chunk:
                    yield f"{chunk}\n\n"
```

**Step 4: Run test to verify pass**
Run: `pytest tests/unit/test_upstream_client.py -v`
Expected: PASS

---

### Phase 8: FastAPI Gateway & Dual-Protocol Endpoints

#### Task 8.1: FastAPI Main App & Model List Endpoint
**Objective:** Menginisialisasi aplikasi FastAPI dan endpoint `GET /v1/models` yang mengembalikan virtual router models dan model terdaftar.
**Files:**
- Create: `src/api/main.py`
- Test: `tests/integration/test_models_endpoint.py`

**Step 1: Write failing test**
```python
# tests/integration/test_models_endpoint.py
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app

@pytest.mark.asyncio
async def test_get_models_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/v1/models")
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "list"
        model_ids = [m["id"] for m in data["data"]]
        assert "d1-router-auto" in model_ids
        assert "d1-router-cost" in model_ids
```

**Step 2: Run test to verify failure**
Run: `pytest tests/integration/test_models_endpoint.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**
```python
# src/api/main.py
import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from src.core.config import settings
from src.domain.registry import ModelRegistry
from src.engine.d1_client import D1Client
from src.domain.router_policy import PolicyEngine
from src.adapters.openai_adapter import OpenAIAdapter
from src.adapters.anthropic_adapter import AnthropicAdapter
from src.adapters.stream_transcoder import StreamTranscoder
from src.proxy.upstream_client import UpstreamClient

app = FastAPI(title="D1 Complexity Model Router", version="0.1.0")

# Singletons
registry = ModelRegistry.from_yaml_file(settings.REGISTRY_CONFIG_PATH) if settings.REGISTRY_CONFIG_PATH else ModelRegistry()
d1_client = D1Client(endpoint=settings.D1_ENDPOINT, model=settings.D1_MODEL, timeout_s=settings.D1_TIMEOUT_SECONDS)
policy_engine = PolicyEngine()
upstream = UpstreamClient()

@app.get("/v1/models")
async def list_models():
    virtual_models = [
        {"id": "d1-router-auto", "object": "model", "owned_by": "system-one-router"},
        {"id": "d1-router-cost", "object": "model", "owned_by": "system-one-router"},
        {"id": "d1-router-quality", "object": "model", "owned_by": "system-one-router"},
        {"id": "d1-router-local", "object": "model", "owned_by": "system-one-router"},
    ]
    for m in registry.models:
        virtual_models.append({"id": m.id, "object": "model", "owned_by": m.provider})
    return {"object": "list", "data": virtual_models}
```

**Step 4: Run test to verify pass**
Run: `pytest tests/integration/test_models_endpoint.py -v`
Expected: PASS

---

#### Task 8.2: OpenAI Chat Completions Endpoint with d1 Routing
**Objective:** Mengimplementasikan `POST /v1/chat/completions` dengan evaluasi System One d1, header telemetry, dan streaming pass-through.
**Files:**
- Modify: `src/api/main.py`
- Test: `tests/integration/test_chat_completions.py`

**Step 1: Write failing test**
```python
# tests/integration/test_chat_completions.py
import pytest
import respx
from httpx import AsyncClient, ASGITransport
from src.api.main import app

@pytest.mark.asyncio
async def test_openai_chat_completions_routing(respx_mock):
    # Mock D1 evaluation
    respx_mock.post("http://localhost:11434/v1/systemone").respond(200, json={
        "answers": {
            "complexity": {"type": "score", "score": 1.2, "confidence": 0.9},
            "domain": {"type": "choice", "choice": "general"},
            "requires_tools": {"type": "noul", "probability": 0.05},
            "requires_vision": {"type": "noul", "probability": 0.01}
        }
    })
    # Mock Upstream model chat
    respx_mock.post("http://localhost:11434/v1/chat/completions").respond(200, json={
        "id": "chatcmpl-test",
        "choices": [{"message": {"role": "assistant", "content": "Hello!"}}]
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/v1/chat/completions", json={
            "model": "d1-router-auto",
            "messages": [{"role": "user", "content": "Hi"}],
            "stream": False
        })
        assert resp.status_code == 200
        assert "X-D1-Complexity-Score" in resp.headers
        assert resp.json()["choices"][0]["message"]["content"] == "Hello!"
```

**Step 2: Run test to verify failure**
Run: `pytest tests/integration/test_chat_completions.py -v`
Expected: FAIL (`404 Not Found` for `/v1/chat/completions`)

**Step 3: Write minimal implementation**
```python
# Tambahkan ke src/api/main.py
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    t0 = time.perf_counter()
    body = await request.json()
    canonical = OpenAIAdapter.to_canonical(body)

    # 1. Routing & d1 evaluation
    state = canonical.extract_eval_state()
    try:
        eval_res = await d1_client.evaluate(state)
    except Exception:
        # Fallback to local heuristic
        from src.engine.d1_client import D1EvaluationResult
        eval_res = D1EvaluationResult(complexity_score=1.5, domain="general", requires_tools=False, requires_vision=False, confidence=0.5, raw_response={})

    candidates = registry.find_candidates(
        complexity=eval_res.complexity_score,
        requires_tools=eval_res.requires_tools,
        requires_vision=eval_res.requires_vision
    ) or registry.models

    decision = policy_engine.resolve(candidates, eval_res, policy=canonical.policy or "balanced")
    selected = decision.selected_model
    routing_latency_ms = (time.perf_counter() - t0) * 1000

    headers = {
        "X-D1-Complexity-Score": f"{eval_res.complexity_score:.2f}",
        "X-D1-Domain": eval_res.domain,
        "X-D1-Selected-Model": selected.id,
        "X-D1-Routing-Latency-Ms": f"{routing_latency_ms:.2f}"
    }

    # 2. Dispatch
    if canonical.stream:
        stream_gen = upstream.stream_sse(model=selected, path="/chat/completions", payload=body)
        return StreamingResponse(stream_gen, media_type="text/event-stream", headers=headers)
    else:
        resp_json = await upstream.send_json(model=selected, path="/chat/completions", payload=body)
        return JSONResponse(content=resp_json, headers=headers)
```

**Step 4: Run test to verify pass**
Run: `pytest tests/integration/test_chat_completions.py -v`
Expected: PASS

---

#### Task 8.3: Anthropic Messages Endpoint (`POST /v1/messages`)
**Objective:** Mengimplementasikan endpoint berstandar Anthropic Messages untuk Claude Code.
**Files:**
- Modify: `src/api/main.py`
- Test: `tests/integration/test_anthropic_messages.py`

**Step 1: Write failing test**
```python
# tests/integration/test_anthropic_messages.py
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app

@pytest.mark.asyncio
async def test_anthropic_messages_endpoint(respx_mock):
    respx_mock.post("http://localhost:11434/v1/systemone").respond(200, json={
        "answers": {
            "complexity": {"type": "score", "score": 3.2, "confidence": 0.8},
            "domain": {"type": "choice", "choice": "coding"},
            "requires_tools": {"type": "noul", "probability": 0.1},
            "requires_vision": {"type": "noul", "probability": 0.0}
        }
    })
    respx_mock.post("http://localhost:11434/v1/chat/completions").respond(200, json={
        "choices": [{"message": {"role": "assistant", "content": "Refactored code"}}]
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/v1/messages", json={
            "model": "d1-router-auto",
            "messages": [{"role": "user", "content": "Refactor this"}],
            "max_tokens": 1024,
            "stream": False
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "message"
        assert data["content"][0]["text"] == "Refactored code"
```

**Step 2: Run test to verify failure**
Run: `pytest tests/integration/test_anthropic_messages.py -v`
Expected: FAIL (`404 Not Found`)

**Step 3: Write minimal implementation**
```python
# Tambahkan ke src/api/main.py
@app.post("/v1/messages")
async def anthropic_messages(request: Request):
    t0 = time.perf_counter()
    body = await request.json()
    canonical = AnthropicAdapter.to_canonical(body)

    state = canonical.extract_eval_state()
    try:
        eval_res = await d1_client.evaluate(state)
    except Exception:
        from src.engine.d1_client import D1EvaluationResult
        eval_res = D1EvaluationResult(complexity_score=2.0, domain="coding", requires_tools=False, requires_vision=False, confidence=0.5, raw_response={})

    candidates = registry.find_candidates(
        complexity=eval_res.complexity_score,
        requires_tools=eval_res.requires_tools,
        requires_vision=eval_res.requires_vision
    ) or registry.models

    decision = policy_engine.resolve(candidates, eval_res, policy=canonical.policy or "balanced")
    selected = decision.selected_model
    routing_latency_ms = (time.perf_counter() - t0) * 1000

    headers = {
        "X-D1-Complexity-Score": f"{eval_res.complexity_score:.2f}",
        "X-D1-Domain": eval_res.domain,
        "X-D1-Selected-Model": selected.id,
        "X-D1-Routing-Latency-Ms": f"{routing_latency_ms:.2f}"
    }

    # Jika upstream adalah Anthropic native:
    if selected.provider == "anthropic":
        if canonical.stream:
            stream_gen = upstream.stream_sse(model=selected, path="/messages", payload=body)
            return StreamingResponse(stream_gen, media_type="text/event-stream", headers=headers)
        else:
            resp_json = await upstream.send_json(model=selected, path="/messages", payload=body)
            return JSONResponse(content=resp_json, headers=headers)

    # Jika upstream adalah OpenAI/Ollama compatible, transcode ke format Anthropic:
    openai_payload = {
        "messages": [{"role": m.role, "content": m.content} for m in canonical.messages],
        "temperature": canonical.temperature,
        "max_tokens": canonical.max_tokens,
        "stream": canonical.stream
    }
    
    if canonical.stream:
        raw_stream = upstream.stream_sse(model=selected, path="/chat/completions", payload=openai_payload)
        transcoded_stream = StreamTranscoder.openai_to_anthropic(raw_stream, model=selected.id)
        return StreamingResponse(transcoded_stream, media_type="text/event-stream", headers=headers)
    else:
        openai_resp = await upstream.send_json(model=selected, path="/chat/completions", payload=openai_payload)
        content_text = openai_resp["choices"][0]["message"]["content"]
        anthropic_resp = {
            "id": f"msg_{int(time.time())}",
            "type": "message",
            "role": "assistant",
            "model": selected.id,
            "content": [{"type": "text", "text": content_text}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 0, "output_tokens": 0}
        }
        return JSONResponse(content=anthropic_resp, headers=headers)
```

**Step 4: Run test to verify pass**
Run: `pytest tests/integration/test_anthropic_messages.py -v`
Expected: PASS

---

## 6. Integrasi dengan AI Harness (Hermes, Claude Code, OpenCode)

### 6.1 Hermes Agent
Tambahkan router sebagai provider kustom di config profile:
```yaml
# config.yaml (Hermes)
model: d1-router-auto
provider: custom
endpoints:
  custom:
    base_url: http://localhost:8000/v1
    api_key: dummy
```

### 6.2 Claude Code CLI
Arahkan Claude Code ke endpoint `/v1` router:
```bash
export ANTHROPIC_BASE_URL="http://localhost:8000"
export ANTHROPIC_API_KEY="dummy"
claude
```

### 6.3 OpenCode
Konfigurasikan model provider di settings:
```json
{
  "provider": "openai-compatible",
  "apiBase": "http://localhost:8000/v1",
  "model": "d1-router-auto"
}
```

---

## 7. Risiko, Trade-off, & Mitigasi (Systems Analyst Perspective)

1. **Trade-off Latensi Evaluasi d1 vs Penghematan Biaya:**
   - *Risiko:* Memanggil `d1` menambah ~25-35ms latensi round-trip.
   - *Mitigasi:* Model `d1:latest` berjalan lokal di Apple Silicon GPU/Metal dengan 0 output token. Untuk request berskala kecil, overhead 30ms tidak terasa oleh pengguna dibandingkan penghematan ribuan dollar dari pemanggilan frontier model.
2. **Risiko Ketidaktersediaan Local Ollama / d1 Crash:**
   - *Risiko:* Jika daemon Ollama mati atau overload, gateway bisa gagal memproses request.
   - *Mitigasi:* Implementasi circuit breaker dengan fallback deterministik otomatis ke rule-based heuristic (menghitung jumlah token prompt, deteksi blok kode ```` ``` ````, dan keberadaan tools) serta perutean ke default fallback model (`FALLBACK_MODEL_ID`).
3. **Konversi Stateful Tool Calling Antara OpenAI dan Anthropic:**
   - *Risiko:* Skema tool calling Anthropic (`input_schema`) berbeda dengan OpenAI (`parameters`).
   - *Mitigasi:* Normalizer memetakan parameter JSON schema secara rekursif saat mentranskode request ke upstream yang berbeda format.

---

## 8. Verifikasi & Definisi Selesai (Definition of Done)

- [ ] Seluruh unit test pada `tests/unit/` (Canonical, Registry, D1Client, Policy, Adapters, Transcoder) lulus 100%.
- [ ] Test integrasi end-to-end `tests/integration/` lulus untuk skenario streaming dan non-streaming.
- [ ] Latensi evaluasi `d1` lokal terbukti $\le 40\text{ ms}$ saat diuji dengan probe benchmark `curl`.
- [ ] Hermes Agent dan Claude Code berhasil melakukan multi-turn chat dan tool execution melalui gateway tanpa format error.
