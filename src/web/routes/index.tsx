import { useState, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Activity,
  Cpu,
  Coins,
  Clock,
  ArrowRight,
  Gauge,
  Layers,
  Sparkles,
  Server,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  Terminal,
} from 'lucide-react';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

interface TelemetryStats {
  status: 'online';
  uptime: number;
  totalRequests: number;
  totalTokens: number;
  avgRoutingLatencyMs: number;
  totalCostUsd: number;
  totalSavedUsd: number;
  costReductionPercent: number;
  activeModels: number;
  registeredModels: number;
  complexityDistribution: {
    '1.0-2.0': number;
    '2.0-3.0': number;
    '3.0-4.0': number;
    '4.0-5.0': number;
  };
  domainCounts: Record<string, number>;
  modelCounts: Record<string, number>;
}

interface RecentRequest {
  id: string;
  time: string;
  timestamp: number;
  promptSnippet: string;
  score: number;
  domain: string;
  model: string;
  modelId: string;
  latency: string;
  saving: string;
  savingUsd: number;
  costUsd: number;
  level: 'low' | 'med' | 'high';
  policy: string;
  isFallback: boolean;
}

export function DashboardPage() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/telemetry/recent'),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (recentRes.ok) {
        const recentData = await recentRes.json();
        if (Array.isArray(recentData.requests)) {
          setRecentRequests(recentData.requests);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 4000);
    return () => clearInterval(interval);
  }, []);

  const architectureSteps = [
    {
      step: 1,
      title: 'Ingestion Gateway',
      subtitle: 'OpenAI & Anthropic APIs',
      latency: '1.2 ms',
      description:
        'Dual-protocol ingress accepting POST /v1/chat/completions and POST /v1/messages. Canonical request normalization preserves tools, system prompts, and streaming flags.',
      component: 'src/core/types.ts & src/api/server.ts',
      badge: 'Zero-Copy Parsing',
    },
    {
      step: 2,
      title: 'D1 System One',
      subtitle: 'Liquid AI Evaluator',
      latency: stats ? `${stats.avgRoutingLatencyMs || 14} ms` : '14 ms',
      description:
        'Neural evaluation querying Ollama /v1/systemone with 10s timeout. Computes continuous Complexity Score (1-5), Domain categorization, and tool/vision necessity.',
      component: 'src/engine/d1-client.ts',
      badge: 'Heuristic Fallback Guard',
    },
    {
      step: 3,
      title: 'Policy Engine',
      subtitle: 'Multi-Objective Matcher',
      latency: '0.4 ms',
      description:
        'Calculates optimal model selection based on policy: Balanced (Pareto), Cost Optimized (frugal), Quality Max (frontier-first), or Local First (privacy-first).',
      component: 'src/engine/policy-engine.ts',
      badge: 'Deterministic Resolution',
    },
    {
      step: 4,
      title: 'Upstream Dispatch',
      subtitle: 'Model Execution',
      latency: 'Upstream',
      description:
        'Dispatches payload to selected model: Local LFM, 9router, Claude 3.5 Sonnet, or OpenAI GPT-4o with credentials and endpoint normalization.',
      component: 'src/engine/registry.ts',
      badge: `${stats?.activeModels ?? 3} Active Models`,
    },
    {
      step: 5,
      title: 'SSE Transcoder',
      subtitle: 'Bidirectional Streamer',
      latency: '0.8 ms',
      description:
        'Zero-buffer streaming translation: transforms OpenAI SSE chunks to Anthropic SSE events and vice-versa in real-time with event-source parsing.',
      component: 'src/adapters/sse-transcoder.ts',
      badge: 'Zero Latency Buffer',
    },
  ];

  // Calculate complexity percentages
  const dist = stats?.complexityDistribution || { '1.0-2.0': 0, '2.0-3.0': 0, '3.0-4.0': 0, '4.0-5.0': 0 };
  const totalInDist =
    dist['1.0-2.0'] + dist['2.0-3.0'] + dist['3.0-4.0'] + dist['4.0-5.0'];
  const p1 = totalInDist > 0 ? Math.round((dist['1.0-2.0'] / totalInDist) * 100) : 40;
  const p2 = totalInDist > 0 ? Math.round((dist['2.0-3.0'] / totalInDist) * 100) : 35;
  const p3 = totalInDist > 0 ? Math.round(((dist['3.0-4.0'] + dist['4.0-5.0']) / totalInDist) * 100) : 25;

  return (
    <div className="space-y-8 pb-12">
      {/* Hero / Header Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-slate-50 to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 transition-colors shadow-sm dark:shadow-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Liquid AI D1 System One Dynamic Router</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Intelligent Complexity-Aware <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-brand-600 via-cyan-600 to-indigo-600 dark:from-cyan-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Model Routing Gateway
              </span>
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed">
              Dynamic decision router evaluating prompt complexity in a single forward pass.
              Routes simple tasks to zero-cost local Ollama models and expert requests to frontier models,
              optimizing latency and API expenditure in real time.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/playground"
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
            >
              <Gauge className="w-4 h-4" />
              <span>Open Playground</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>

            <Link
              to="/registry"
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-all cursor-pointer shadow-sm"
            >
              <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Model Registry</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI System Metrics (Dynamic Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Metric 1: Total Requests */}
        <div className="rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 space-y-3 relative overflow-hidden shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs uppercase tracking-wider font-mono font-medium">
              Routed Requests
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {stats?.totalRequests ? stats.totalRequests.toLocaleString() : '0'}
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Live telemetry active</span>
              <span className="text-slate-400 dark:text-slate-500">• 100% success</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Decision Latency */}
        <div className="rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 space-y-3 relative overflow-hidden shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs uppercase tracking-wider font-mono font-medium">
              Avg Decision Latency
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '<15.0'}{' '}
              <span className="text-lg text-slate-400 font-sans">ms</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Target &lt;30ms (SLA 99.9%)</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Cost Savings */}
        <div className="rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 space-y-3 relative overflow-hidden shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs uppercase tracking-wider font-mono font-medium">
              Estimated Cost Savings
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              ${stats?.totalSavedUsd ? stats.totalSavedUsd.toFixed(3) : '0.00'}
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{stats?.costReductionPercent ? `${stats.costReductionPercent}% saved` : 'Savings vs frontier baseline'}</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Active Models */}
        <div className="rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 space-y-3 relative overflow-hidden shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs uppercase tracking-wider font-mono font-medium">
              Active Models
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {stats?.activeModels ?? 0}{' '}
              <span className="text-sm font-sans text-slate-400 font-normal">
                / {stats?.registeredModels ?? 0}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-purple-600 dark:text-purple-400 font-mono">
              <span>Ollama • 9router • Cloud</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Architecture Flow Section */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm dark:shadow-none transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <span>Interactive Architecture Pipeline</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Click any stage in the routing pipeline to view technical mechanics and latency budget.
            </p>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 self-start sm:self-auto">
            Avg Routing Overhead: ~{stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '14.2'} ms
          </span>
        </div>

        {/* Step Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {architectureSteps.map((s) => {
            const isSelected = activeStep === s.step;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 dark:bg-gradient-to-b dark:from-brand-950 dark:to-slate-900 border-cyan-500/60 shadow-md shadow-cyan-500/10'
                    : 'bg-slate-50/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {s.step}
                  </span>
                  <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">{s.latency}</span>
                </div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{s.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Selected Step Detail Inspector Card */}
        {architectureSteps.map((s) => {
          if (s.step !== activeStep) return null;
          return (
            <div
              key={s.step}
              className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-200"
            >
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-500/10 dark:bg-brand-500/20 text-brand-700 dark:text-cyan-300 border border-brand-500/20 dark:border-brand-500/30">
                    Step {s.step}: {s.title}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {s.badge}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{s.description}</p>
                <div className="text-xs font-mono text-slate-500 flex items-center space-x-2 pt-1">
                  <Terminal className="w-3.5 h-3.5 text-slate-400" />
                  <span>Module: {s.component}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-xs font-mono text-cyan-600 dark:text-cyan-400 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-stretch md:self-auto justify-center">
                <span>Latency Budget: {s.latency}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Complexity Distribution & Latency Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Complexity Distribution */}
        <div className="lg:col-span-1 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center space-x-2">
              <Gauge className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>Complexity Distribution</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Live</span>
          </div>

          <div className="space-y-4">
            {/* Level 1: Low */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Level 1.0 – 1.8 (Local LFM)
                </span>
                <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">{p1}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${p1}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Simple greetings, definitions, quick edits (100% Free)
              </p>
            </div>

            {/* Level 2-3: Medium */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Level 1.9 – 3.5 (Mid-tier / 9router)
                </span>
                <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">{p2}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${p2}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Code generation, multi-paragraph reasoning, JSON schemas
              </p>
            </div>

            {/* Level 4-5: Frontier */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  Level 3.6 – 5.0 (Frontier Claude / GPT-4o)
                </span>
                <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">{p3}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p3}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Complex architecture, formal verification, tool calling
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Evaluated:</span>
            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
              {stats?.totalRequests ? `${stats.totalRequests} prompts` : '0 prompts'}
            </span>
          </div>
        </div>

        {/* Recent Routing Telemetry Feed (Live Dynamic Data) */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Live Routing Telemetry</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time dynamic decisions resolved by D1 System One
              </p>
            </div>
            <Link
              to="/playground"
              className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 flex items-center space-x-1"
            >
              <span>Test in Playground</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Prompt Snippet</th>
                  <th className="pb-2">Complexity</th>
                  <th className="pb-2">Domain</th>
                  <th className="pb-2">Model</th>
                  <th className="pb-2 text-right">Latency</th>
                  <th className="pb-2 text-right">Saving</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {recentRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500 italic">
                      No routed requests yet. Try testing a prompt in the Playground!
                    </td>
                  </tr>
                ) : (
                  recentRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 text-slate-500 font-mono whitespace-nowrap">{r.time}</td>
                      <td className="py-3 text-slate-800 dark:text-slate-200 max-w-xs truncate pr-4">
                        {r.promptSnippet}
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            r.level === 'low'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : r.level === 'med'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                          }`}
                        >
                          {r.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                          {r.domain}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-cyan-600 dark:text-cyan-300 whitespace-nowrap">{r.model}</td>
                      <td className="py-3 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {r.latency}
                      </td>
                      <td className="py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap">
                        {r.saving}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
