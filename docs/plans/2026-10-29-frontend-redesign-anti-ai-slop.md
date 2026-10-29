# Implementation Plan: Frontend Redesign & Anti-AI Slop Transformation

> **For Hermes / Implementer:** Use the `subagent-driven-development` or `ticket-driven-parallel-development` skill to implement this redesign task-by-task on dedicated branches with visual verification and test retention.

**Goal:** Transform the ModelRouter Web UI from a generic "AI SaaS" template (neon gradients, floating glowing blobs, uppercase card kits, and marketing fluff) into a clean, precision-engineered developer appliance and decision inspection console inspired by Linear, Raycast, and Cloudflare.

**Current Context & Assumptions:**
- The application runs on Vite 5, TanStack Router, React 18, and Tailwind CSS with `@hono/node-server`.
- All backend routing, Liquid d1 evaluation, and telemetry endpoints (`/v1/chat/completions`, `/v1/messages`, `/api/evaluate`, `/api/stats`, `/api/registry`) are fully operational and backed by 100 passing Vitest tests.
- Existing tests rely on route elements, endpoints, and data attributes; redesign must preserve all functional behaviors, route paths, API contracts, and element accessibility without breaking existing test assertions.
- Fonts available: `Plus Jakarta Sans` (primary sans) and `JetBrains Mono` (technical monospace).

**Architecture & Proposed Approach:**
Replace the visual layer with an "Engineering Instrument" design system: a focused neutral palette (deep zinc `#090A0F`/`#12141C` dark, crisp titanium `#F8FAFC`/`#FFFFFF` light), zero decorative gradient text clips, and hairline structural borders (`1px solid`). The Dashboard becomes a live operational control plane (dense telemetry strip, real-time decision stream table); the Playground becomes a dual-pane workbench with an interactive decision pipeline node graph; and the Registry becomes an accessible model switchboard with inline toggling and modal configuration.

---

## Visual Design Specification (Design System Tokens)

### 1. Palette & Typography Tokens
- **Backgrounds (Dark):** `#090A0F` (Base Canvas), `#11131B` (Surfaces / Panels), `#171A24` (Elevated Elements & Inputs).
- **Backgrounds (Light):** `#F8FAFC` (Base Canvas), `#FFFFFF` (Surfaces / Panels), `#F1F5F9` (Elevated Elements & Inputs).
- **Borders:** `rgba(255, 255, 255, 0.08)` (Dark) / `rgba(0, 0, 0, 0.08)` (Light).
- **Primary Accent:** Precision Cobalt Blue (`#2563EB` / `#3B82F6`) — used strictly for focused actions, active navigation, and selection states. No neon cyan/purple blends.
- **Semantic Accents:**
  - Low Complexity / Local: Muted Emerald (`#10B981` / text: `#059669` light, `#34D399` dark).
  - Moderate / Mid-tier: Warm Amber (`#F59E0B` / text: `#D97706` light, `#FBBF24` dark).
  - High / Frontier: Slate Indigo (`#6366F1` / text: `#4F46E5` light, `#818CF8` dark).
  - Neural Decision Active: Subtle Emerald Pulse.
  - Fallback / Heuristic: Clean Warning Amber Banner.
- **Typography Roles:**
  - Sans (`Plus Jakarta Sans`): All UI chrome, headings, explanations, and controls (Sentence case, balanced line height).
  - Mono (`JetBrains Mono`): Numeric values, scores, latency tags, model identifiers, prompt tokens, and code blocks.

---

## Step-by-Step Implementation Tasks

### Task 1: Refactor Global Shell, Navigation & Theme System (`__root.tsx`)

**Objective:** Remove neon gradient text, lightning glow effects, and marketing chrome from the navbar and footer. Replace with a minimal, high-density tool header featuring a live d1 engine status dot, segmented nav buttons, and clean theme toggle.

**Files:**
- Modify: `src/web/routes/__root.tsx`
- Modify: `src/web/index.css`
- Test: `tests/integration/web-server.test.ts`

**Step 1: Write failing visual test / route structure test**
```typescript
// Ensure navigation links and health indicators remain properly structured
// in tests/integration/web-server.test.ts
import { describe, it, expect } from 'vitest';
import { app } from '../../src/api/server';

describe('Root Shell Verification', () => {
  it('serves root layout with clean navigational markers', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('ModelRouter');
  });
});
```

**Step 2: Implement minimal, clean root shell (`src/web/routes/__root.tsx`)**
```tsx
import { useState, useEffect } from 'react';
import { createRootRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import {
  Activity,
  Layers,
  Sun,
  Moon,
  Gauge,
  Terminal,
  Server,
} from 'lucide-react';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mr-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });

  const [isHealthOk, setIsHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mr-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        setIsHealthOk(res.ok);
      } catch {
        setIsHealthOk(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090A0F] dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 dark:bg-[#090A0F]/90 border-b border-slate-200 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand & Engine Status */}
          <div className="flex items-center space-x-3.5">
            <Link to="/" className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-mono font-bold text-xs tracking-tighter">
                MR
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white">
                  ModelRouter
                </span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                  v0.1
                </span>
              </div>
            </Link>

            {/* Precision Status Dot */}
            <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-slate-200 dark:border-slate-800 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthOk === true
                    ? 'bg-emerald-500'
                    : isHealthOk === false
                    ? 'bg-amber-500'
                    : 'bg-slate-400 animate-pulse'
                }`}
              />
              <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                {isHealthOk === true
                  ? 'd1:online'
                  : isHealthOk === false
                  ? 'd1:offline'
                  : 'd1:connecting'}
              </span>
            </div>
          </div>

          {/* Segmented Nav Controls */}
          <nav className="flex items-center bg-slate-100 dark:bg-[#12141C] p-1 rounded-lg border border-slate-200 dark:border-slate-800/80 text-xs font-medium">
            <Link
              to="/"
              activeProps={{
                className: 'bg-white dark:bg-[#1C1F2B] text-slate-900 dark:text-white shadow-sm font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Overview</span>
            </Link>

            <Link
              to="/playground"
              activeProps={{
                className: 'bg-white dark:bg-[#1C1F2B] text-slate-900 dark:text-white shadow-sm font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Playground</span>
            </Link>

            <Link
              to="/registry"
              activeProps={{
                className: 'bg-white dark:bg-[#1C1F2B] text-slate-900 dark:text-white shadow-sm font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Models</span>
            </Link>
          </nav>

          {/* Actions: Theme Toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#12141C] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>

      {/* Clean Utility Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#090A0F] py-4 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span>Liquid AI d1 (System One)</span>
            <span>•</span>
            <span>Zero-Buffer SSE Streaming</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>OpenAI /v1/chat/completions</span>
            <span>•</span>
            <span>Anthropic /v1/messages</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

**Step 3: Verification command**
Run: `npm run build && npx vitest run`
Expected: Build succeeds, all 100 tests pass.

---

### Task 2: Redesign Operational Overview Dashboard (`src/web/routes/index.tsx`)

**Objective:** Strip out the oversized marketing hero banner, the decorative gradient blobs, and generic card kits. Replace with an engineering dashboard featuring a dense 4-KPI summary bar, a live interactive execution architecture topology, and a clean live telemetry feed.

**Files:**
- Modify: `src/web/routes/index.tsx`
- Test: `tests/integration/web-server.test.ts`

**Key Design Adjustments:**
- **Remove:** Neon gradient banner, big gradient text, arbitrary icons, marketing jargon.
- **Add:**
  - Compact header with gateway endpoint pills (`http://localhost:8100/v1`).
  - Clean telemetry strip: Requests, Mean Latency, Cost Reduction, Fleet count.
  - Interactive Decision Architecture Map: Clickable pipeline nodes showing latency budgets and causal flow.
  - Real-time decision stream table: Clear row density, monospace timestamps, subtle status badges.

**Verification command:**
Run: `npm run build && npx vitest run tests/integration/web-server.test.ts`
Expected: PASS with 7/7 integration tests.

---

### Task 3: Redesign Interactive Playground with Decision Flow Pipeline Graph (`src/web/routes/playground.tsx`)

**Objective:** Redesign the playground into a dual-pane engineering console. Replace the rainbow gauge and stacked text boxes with a calibrated complexity spectrum and an interconnected, animated Decision Pipeline Graph that traces the request from prompt state through d1 scoring, candidate filtering, and policy selection to the target model.

**Files:**
- Modify: `src/web/routes/playground.tsx`
- Test: `tests/integration/web-server.test.ts`

**Key Design Adjustments:**
- **Left Panel (Editor & Output):**
  - Clean prompt editor with subtle toolbar (segmented policy buttons, router selector).
  - Clean output stream terminal with monospace font, live token count, and streaming speed indicator.
- **Right Panel (Decision Intelligence Console):**
  - **Calibrated Complexity Spectrum (1.0 to 5.0):** Clean numeric readout with subtle level markers (1: Trivial, 2: Routine, 3: Standard, 4: Advanced, 5: Frontier).
  - **Interactive Decision Flow Pipeline Graph:**
    ```text
    ┌──────────────────────┐
    │ 1. Ingest State      │ ~120 tokens
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 2. Liquid d1 Neural  │ Score: 3.8 / 5.0 · Coding · 18ms
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 3. Filter Candidates │ 4 of 16 active models eligible
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 4. Policy Engine     │ Policy: Quality-Max (Frontier Headroom)
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 5. Target Execution  │ Claude Sonnet 4.6 (9router) · In: $3.0/M
    └──────────────────────┘
    ```
  - **Model Target Card:** Detailed metadata without neon border glows.

**Verification command:**
Run: `npm run build && npx vitest run tests/integration/web-server.test.ts`
Expected: PASS.

---

### Task 4: Redesign Model Registry Catalogue & Switchboard (`src/web/routes/registry.tsx`)

**Objective:** Clean up the registry view into an operational switchboard. Replace thick colored card borders with clean, high-density cards, a responsive filter bar, and a sleek slide-over / dialog modal for adding and editing models.

**Files:**
- Modify: `src/web/routes/registry.tsx`
- Test: `tests/integration/web-server.test.ts`

**Key Design Adjustments:**
- **Model Card Density:** Show ID, upstream model, base URL, complexity spectrum line, capability chips, and pricing in a scannable grid.
- **Toggle Mechanism:** Crisp toggle button with immediate visual feedback (dimmed card state for disabled models).
- **Add / Edit Modal:** Clean form with clear field groupings (Identity, Routing Criteria, Upstream Endpoints, Cost).
- **YAML Spec Viewer:** Clean collapsible code sheet with copy button.

**Verification command:**
Run: `npm run build && npx vitest run tests/integration/web-server.test.ts`
Expected: PASS.

---

### Task 5: CSS & Typography Polishing (`src/web/index.css` & `tailwind.config.js`)

**Objective:** Fine-tune global stylesheet to eliminate all residual AI-slop styles: adjust font tracking, remove excessive custom webkit scrollbar shadows, standardize input focus rings, and ensure seamless dark/light contrast.

**Files:**
- Modify: `src/web/index.css`
- Modify: `tailwind.config.js`
- Test: `tests/unit/sanity.test.ts`

**Verification command:**
Run: `npm run build && npx vitest run`
Expected: 100/100 tests pass, build bundle <= 55KB server, <= 320KB client.

---

## Risks, Tradeoffs, and Mitigasi

1. **Tradeoff: Kerapian Visual vs Kepadatan Informasi (Information Density):**
   - *Risiko:* Menyederhanakan UI berisiko menghilangkan metrik penting yang dibutuhkan developer untuk debugging.
   - *Mitigasi:* Menggunakan pola *progressive disclosure* — metrik utama tetap terlihat di permukaan, sedangkan detail teknis lengkap (raw prompt tokens, legend kriteria, full upstream headers) dapat di-inspect saat diklik.
2. **Risiko Regresi Test Integrasi:**
   - *Risiko:* Perubahan selector CSS atau teks tombol dapat mematahkan test integrasi di `tests/integration/web-server.test.ts`.
   - *Mitigasi:* Seluruh route path, atribut JSON return, dan tombol aksi esensial (`openAddModal`, link `/playground`, `/registry`) dipertahankan secara identik.
3. **Kompatibilitas Dark/Light Mode:**
   - *Risiko:* Warna teks pada mode terang bisa menjadi tidak terbaca jika warna hardcoded slate/zinc tidak memiliki prefix `dark:`.
   - *Mitigasi:* Disiplin menerapkan dual classing `text-slate-900 dark:text-slate-100` dan `bg-white dark:bg-[#12141C]` pada setiap komponen.

---

## Definition of Done (DoD)

- [ ] Seluruh halaman (`/`, `/playground`, `/registry`) bersih dari teks gradien warna-warni, neon glow, dan copy marketing klise.
- [ ] Tampilan konsisten dengan estetika developer console tingkat industri (Linear / Raycast / Cloudflare).
- [ ] Dark/Light mode beralih mulus tanpa kontras teks yang rusak.
- [ ] Interactive Decision Pipeline Graph di Playground berfungsi secara dinamis dengan data evaluasi nyata.
- [ ] `npm run build` sukses mengompilasi frontend dan backend tanpa error TypeScript.
- [ ] Seluruh **100 tests pada Vitest lulus 100%**.
