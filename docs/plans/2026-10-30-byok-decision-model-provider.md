# Spesifikasi Teknis & Rencana Implementasi: BYOK Decision Model Provider (ModelRouter)

> **Untuk Agent Coder / Hermes:** Kerjakan rencana ini secara bertahap menggunakan workflow `ticket-driven-parallel-development` pada branch tiket terisolasi dengan disiplin ketat TDD (`vitest`).

---

## 1. Executive Summary & Problem Statement

### 1.1 Latar Belakang
ModelRouter saat ini secara *hardcoded* mengasumsikan model keputusan System One (Liquid AI `d1`) berjalan pada runtime lokal Ollama di `http://localhost:11434/v1/systemone` dengan model `d1:latest` tanpa autentikasi.

### 1.2 Masalah (Problem Statement)
1. **Tidak Ada Dukungan Cloud Hosted Provider:** Pengguna yang tidak memiliki GPU lokal dengan VRAM cukup untuk menjalankan `d1:latest` secara lokal tidak dapat menggunakan hosted Liquid AI Cloud API (`https://api.liquid.ai/v1/systemone`) atau provider System One pihak ketiga lainnya (misal TypeSafe Jev, endpoint cloud privat).
2. **Ketiadaan Mekanisme BYOK (Bring Your Own Key):** ModelRouter tidak mendukung penyertaan API key (Bearer token / header khusus) untuk endpoint decision model, baik pada level konfigurasi server maupun per-request.
3. **Konfigurasi Statis:** Tidak ada endpoint API atau antarmuka Web UI untuk menguji koneksi (test ping), mengganti provider secara runtime, atau memantau status latensi decision model cloud vs lokal tanpa restart server.

### 1.3 Solusi (Proposed Solution)
Membangun fitur **BYOK Decision Model Provider** end-to-end:
1. **Multi-Provider Client Abstraction:** Mendukung preset `ollama` (lokal), `liquid` (Liquid AI Cloud), dan `custom` (endpoint generik `/v1/systemone`) dengan injeksi header `Authorization: Bearer <key>`.
2. **Dual-Layer BYOK Configuration:**
   - *Layer 1 (Server/Runtime Config):* Disimpan di environment variables dan persisted di `config/decision-provider.json` via endpoint management `GET/PUT /api/decision-provider`.
   - *Layer 2 (Per-Request Header Overrides):* Mendukung header `X-Decision-Provider`, `X-Decision-Api-Key`, `X-Decision-Endpoint`, dan `X-Decision-Model` pada API gateway (`/v1/chat/completions`, `/v1/messages`, `/api/evaluate`) untuk penggunaan multi-tenant / client harness (Hermes, Claude Code, OpenCode).
3. **Health Check & Latency Ping Console:** Endpoint `POST /api/decision-provider/test` untuk verifikasi instan kredensial dan latensi roundtrip sebelum disimpan.
4. **Web UI Settings Drawer/Modal:** Antarmuka sesuai *Firecrawl Blueprint Design System* (monochrome, hairline border, segmented preset switcher, secure masked key input, live connection test feedback).

---

## 2. Analisis Kebutuhan Sistem & Trade-Offs

### 2.1 Kebutuhan Fungsional (Functional Requirements)

| ID | Fitur | Deskripsi |
|:---|:---|:---|
| **FR-BYOK-01** | Multi-Provider Presets | Preset bawaan untuk `ollama` (`http://localhost:11434/v1/systemone`, `d1:latest`), `liquid` (`https://api.liquid.ai/v1/systemone`, `d1`), dan `custom`. |
| **FR-BYOK-02** | Bearer Token Auth | Injeksi header `Authorization: Bearer <apiKey>` otomatis jika provider membutuhkan autentikasi atau API key tersedia. |
| **FR-BYOK-03** | Server Runtime Settings API | Endpoint `GET /api/decision-provider` (membaca konfigurasi aktif dengan key tersensor) dan `PUT /api/decision-provider` (memperbarui provider & key). |
| **FR-BYOK-04** | Live Connection Test API | Endpoint `POST /api/decision-provider/test` untuk menguji konektivitas endpoint & validitas API key dengan mengembalikan latensi aktual dan status. |
| **FR-BYOK-05** | Per-Request BYOK Header Overrides | Gateway membaca header `X-Decision-*` per request untuk override dinamis tanpa mengubah state global server. |
| **FR-BYOK-06** | Graceful Degradation & Fallback | Jika provider cloud mengembalikan HTTP 401/403/timeout, fallback otomatis ke *heuristic evaluator* tanpa menggagalkan request proxy gateway (`X-D1-Fallback: true`). |
| **FR-BYOK-07** | Blueprint Web UI Console | Modal/Drawer Settings di Web Dashboard untuk konfigurasi provider, test connection visual, dan status pill di navbar. |

### 2.2 Kebutuhan Non-Fungsional (Non-Functional Requirements)

1. **Security & Zero Key Leakage:**
   - API key tidak boleh dicatat dalam log/telemetri atau dikembalikan mentah (*plaintext*) melalui response API publik.
   - Endpoint `GET /api/decision-provider` wajib mengembalikan masked key (misal: `sk-liq-****abcd`) dan boolean `hasApiKey: true`.
2. **Latency Budget:**
   - Pengecekan provider dan routing decision lokal tetap berkecepatan <30ms; provider cloud memiliki timeout adaptif (default 10.000ms untuk mencegah false-positive dropouts saat cold start).
3. **Backward Compatibility:**
   - Jika variabel `DECISION_PROVIDER` atau file konfigurasi tidak ada, sistem default 100% identik dengan perilaku lama (Local Ollama di `http://localhost:11434/v1/systemone`).

### 2.3 Analisis Trade-Offs

| Opsi Desain | Pendekatan Terpilih | Alternatif yang Ditolak | Alasan Pemilihan |
|:---|:---|:---|:---|
| **Penyimpanan Runtime BYOK** | File JSON lokal (`config/decision-provider.json`) + In-Memory Singleton | Database SQLite / Redis | Ringan, zero-dependency tambahan, cocok untuk deployment single-binary Hono tanpa setup database eksternal. |
| **Per-Request vs Global BYOK** | Hybrid (Global default + Per-Request Headers) | Hanya Global Config atau Hanya Per-Request | Global memudahkan pengguna perorangan di Web UI, sedangkan per-request penting untuk integrasi multi-agent dan CI/CD. |
| **Masking API Key** | Partial masking di server (`sk-liq-...3a8f`) | Enkripsi reversibel di browser | Menjaga keamanan standar industri; browser tidak pernah menerima raw key kembali setelah disimpan. |

---

## 3. Arsitektur Komponen & Data Flow

### 3.1 Diagram Alur Evaluasi Request dengan BYOK

```
Incoming Request (/v1/chat/completions, /v1/messages, /api/evaluate)
   │
   ├── Memeriksa Header `X-Decision-Provider` / `X-Decision-Api-Key`?
   │     ├─ [YA] -> Buat Ephemeral D1Client dengan parameter request
   │     └─ [TIDAK] -> Gunakan Global D1Client dari App State
   │
   ├── Eksekusi POST /v1/systemone (Endpoint: Ollama / Liquid Cloud / Custom)
   │     ├─ Header: Content-Type: application/json
   │     └─ Header: Authorization: Bearer <API_KEY> (jika ada)
   │
   ├── Evaluasi Berhasil?
   │     ├─ [YA] -> Kembalikan D1EvaluationResult (Score, Domain, Tools, Vision)
   │     └─ [TIMEOUT / ERROR / 401] -> Fallback ke D1Client.fallbackEvaluate()
   │                                   (Inject header X-D1-Fallback & Reason)
   │
   └── Lanjutkan ke Policy Routing Engine & Model Forwarding
```

### 3.2 Diagram Alur Settings & Test Connection di UI

```
User di Web Dashboard -> Klik Status Pill di Navbar -> Buka Settings Modal
   │
   ├── GET /api/decision-provider (Tampilkan provider aktif, masked key, presets)
   │
   ├── User memilih Preset: [Ollama (Local)] | [Liquid AI (Cloud)] | [Custom]
   │     └─ Auto-fill default endpoint & model jika memilih preset
   │     └─ Input API Key (jika Cloud / Custom)
   │
   ├── User klik [Test Connection]
   │     └─ POST /api/decision-provider/test
   │     └─ Tampilkan badge: "Connected · 142ms" atau "Error: 401 Unauthorized"
   │
   └── User klik [Save & Apply]
         └─ PUT /api/decision-provider
         └─ Simpan ke config/decision-provider.json & perbarui singleton client
         └─ Update status pill di navbar: "liquid · 142ms · d1:online"
```

---

## 4. Rincian Teknis & Kontrak API

### 4.1 Skema Konfigurasi & Tipe Data (`src/core/config.ts` & `src/core/types.ts`)

```typescript
export type DecisionProviderType = 'ollama' | 'liquid' | 'custom';

export interface DecisionProviderConfig {
  provider: DecisionProviderType;
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export const DECISION_PRESETS: Record<DecisionProviderType, {
  name: string;
  defaultEndpoint: string;
  defaultModel: string;
  requiresKey: boolean;
}> = {
  ollama: {
    name: 'Ollama (Local)',
    defaultEndpoint: 'http://localhost:11434/v1/systemone',
    defaultModel: 'd1:latest',
    requiresKey: false,
  },
  liquid: {
    name: 'Liquid AI (Cloud)',
    defaultEndpoint: 'https://api.liquid.ai/v1/systemone',
    defaultModel: 'd1',
    requiresKey: true,
  },
  custom: {
    name: 'Custom System One Endpoint',
    defaultEndpoint: 'http://localhost:11434/v1/systemone',
    defaultModel: 'd1:latest',
    requiresKey: false,
  },
};
```

### 4.2 Pembaruan `D1Client` (`src/engine/d1-client.ts`)

```typescript
export interface D1ClientOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  provider?: DecisionProviderType;
}

export class D1Client {
  public endpoint: string;
  public model: string;
  public timeoutMs: number;
  public apiKey?: string;
  public provider: DecisionProviderType;

  constructor(options?: D1ClientOptions) {
    this.provider = options?.provider || 'ollama';
    this.endpoint = options?.endpoint || DECISION_PRESETS[this.provider].defaultEndpoint;
    this.model = options?.model || DECISION_PRESETS[this.provider].defaultModel;
    this.timeoutMs = options?.timeoutMs || 10000;
    this.apiKey = options?.apiKey;
  }

  // Pada pemanggilan fetch(this.endpoint):
  // Tambahkan Authorization: Bearer <apiKey> jika this.apiKey terdefinisi
}
```

### 4.3 Spesifikasi Endpoint REST API

#### 1. `GET /api/decision-provider`
Mengembalikan status konfigurasi saat ini (dengan masked key).
- **Response `200 OK`:**
```json
{
  "provider": "liquid",
  "endpoint": "https://api.liquid.ai/v1/systemone",
  "model": "d1",
  "timeoutMs": 10000,
  "hasApiKey": true,
  "maskedApiKey": "sk-liq-...8a4f",
  "presets": {
    "ollama": { "name": "Ollama (Local)", "defaultEndpoint": "http://localhost:11434/v1/systemone", "defaultModel": "d1:latest", "requiresKey": false },
    "liquid": { "name": "Liquid AI (Cloud)", "defaultEndpoint": "https://api.liquid.ai/v1/systemone", "defaultModel": "d1", "requiresKey": true },
    "custom": { "name": "Custom System One Endpoint", "defaultEndpoint": "http://localhost:11434/v1/systemone", "defaultModel": "d1:latest", "requiresKey": false }
  }
}
```

#### 2. `PUT /api/decision-provider`
Memperbarui konfigurasi decision provider dan menyimpannya ke `config/decision-provider.json`.
- **Request Body:**
```json
{
  "provider": "liquid",
  "endpoint": "https://api.liquid.ai/v1/systemone",
  "model": "d1",
  "apiKey": "sk-liq-secret12345",
  "timeoutMs": 10000
}
```
- **Response `200 OK`:**
```json
{
  "ok": true,
  "provider": "liquid",
  "endpoint": "https://api.liquid.ai/v1/systemone",
  "model": "d1",
  "timeoutMs": 10000,
  "hasApiKey": true,
  "maskedApiKey": "sk-liq-...2345"
}
```

#### 3. `POST /api/decision-provider/test`
Menguji konektivitas kandidat konfigurasi tanpa langsung menyimpannya.
- **Request Body (Opsional: jika kosong, menguji provider aktif saat ini):**
```json
{
  "provider": "liquid",
  "endpoint": "https://api.liquid.ai/v1/systemone",
  "model": "d1",
  "apiKey": "sk-liq-secret12345",
  "timeoutMs": 5000
}
```
- **Response `200 OK`:**
```json
{
  "ok": true,
  "latencyMs": 138.4,
  "provider": "liquid",
  "endpoint": "https://api.liquid.ai/v1/systemone",
  "model": "d1",
  "sampleEvaluation": {
    "complexityScore": 1.0,
    "domain": "general",
    "isFallback": false
  }
}
```
- **Response `400 / 502 Bad Gateway` (Jika gagal/offline/key invalid):**
```json
{
  "ok": false,
  "error": "Liquid endpoint returned HTTP 401: Unauthorized",
  "latencyMs": 85.2
}
```

#### 4. Per-Request Gateway Headers
Request ke `/v1/chat/completions`, `/v1/messages`, dan `/api/evaluate` menerima header:
- `X-Decision-Provider`: `ollama` | `liquid` | `custom`
- `X-Decision-Api-Key`: String API key
- `X-Decision-Endpoint`: Custom endpoint URL
- `X-Decision-Model`: Custom model name

Response selalu menyertakan header audit:
- `X-D1-Provider`: `liquid` | `ollama` | `custom`
- `X-D1-Complexity-Score`: `2.80`
- `X-D1-Domain`: `coding`
- `X-D1-Fallback`: `true` (hanya jika terjadi fallback)
- `X-D1-Fallback-Reason`: Alasan kegagalan/timeout

---

## 5. Rencana Pembagian Tiket Kerja (Ticket Breakdown)

Pengerjaan dibagi ke dalam 3 tiket berurutan dalam group `byok`:

### TKT-021: BYOK Decision Provider Core Config, D1Client Multi-Provider & Auth Headers
- **Group:** `byok`
- **Tipe:** `feature`
- **Ukuran:** `medium`
- **Prioritas:** `P1`
- **Ruang Lingkup:**
  1. Tambahkan `DECISION_PROVIDER`, `DECISION_API_KEY`, `DECISION_ENDPOINT`, `DECISION_MODEL`, `DECISION_TIMEOUT_MS` ke `ConfigSchema` di `src/core/config.ts`.
  2. Definisikan preset `DECISION_PRESETS` dan tipe data pendukung di `src/core/types.ts`.
  3. Perbarui `D1Client` di `src/engine/d1-client.ts`:
     - Terima parameter `provider`, `apiKey`, `endpoint`, `model`, `timeoutMs`.
     - Injeksi header `Authorization: Bearer <apiKey>` pada fetch jika `apiKey` disediakan.
     - Tambahkan properti `provider` pada `D1EvaluationResult`.
  4. Tulis unit test komprehensif di `tests/unit/d1-client.test.ts` dan `tests/unit/config.test.ts` untuk memverifikasi autentikasi Bearer, parsing preset, dan fallback saat auth error.

### TKT-022: Decision Provider API Endpoints, Runtime Switching, and Per-Request Header Overrides
- **Group:** `byok`
- **Tipe:** `feature`
- **Ukuran:** `medium`
- **Prioritas:** `P1`
- **Ruang Lingkup:**
  1. Implementasikan persistence layer di `src/core/decision-config.ts` untuk memuat dan menyimpan konfigurasi ke `config/decision-provider.json`.
  2. Implementasikan rute REST API di `src/api/server.ts`:
     - `GET /api/decision-provider`
     - `PUT /api/decision-provider`
     - `POST /api/decision-provider/test`
  3. Implementasikan per-request header overrides (`X-Decision-Provider`, `X-Decision-Api-Key`, `X-Decision-Endpoint`, `X-Decision-Model`) pada gateway `/v1/chat/completions`, `/v1/messages`, dan `/api/evaluate`.
  4. Injeksi header audit `X-D1-Provider` pada setiap response gateway dan rekam provider ke dalam telemetry.
  5. Tulis integration test di `tests/integration/gateway.test.ts` dan `tests/integration/web-server.test.ts`.

### TKT-023: Decision Provider Settings Modal, BYOK Key Management, and Navbar Status in Web UI
- **Group:** `byok`
- **Tipe:** `feature`
- **Ukuran:** `medium`
- **Prioritas:** `P1`
- **Ruang Lingkup:**
  1. Buat komponen `DecisionProviderModal.tsx` dengan Firecrawl Blueprint styling (border 1px `#EDEDED`, dark `#23252A`, radio preset cards, secure masked key input dengan toggle show/hide).
  2. Implementasikan tombol "Test Connection" dengan visual status ping latency real-time.
  3. Implementasikan tombol "Save & Apply" yang mengupdate config via `PUT /api/decision-provider`.
  4. Perbarui status pill di `src/web/routes/__root.tsx` untuk menampilkan provider aktif (misal: `liquid · 142ms · d1:online`) dan membuka modal settings saat diklik.
  5. Pastikan build web (`npm run build`) berjalan bersih tanpa error TypeScript.

---

## 6. Verification & Test Strategy

1. **Unit Testing (`vitest`):**
   - Validasi skema konfigurasi Zod dengan env vars default dan kustom.
   - Verifikasi `D1Client` mengirimkan header `Authorization: Bearer` jika key disuplai.
   - Verifikasi `D1Client` otomatis fallback ke heuristic jika cloud provider mengembalikan status HTTP 401/500/timeout.
2. **Integration Testing (`supertest` / native fetch):**
   - Uji endpoint `GET /api/decision-provider` tidak pernah membocorkan key asli.
   - Uji endpoint `PUT /api/decision-provider` berhasil memperbarui state client dan menyimpan ke file konfigurasi.
   - Uji endpoint `POST /api/decision-provider/test` mengembalikan latensi dan status koneksi yang valid.
   - Uji pemanggilan `/v1/chat/completions` dengan header `X-Decision-Api-Key` berhasil mengarahkan evaluasi dengan kredensial tersebut.
3. **End-to-End Build Verification:**
   - Jalankan `npm run build` (memastikan Vite frontend dan esbuild backend sukses tanpa circular dependency).
   - Jalankan seluruh rangkaian test suite (`npx vitest run`) dan pastikan 100% tes lulus.
