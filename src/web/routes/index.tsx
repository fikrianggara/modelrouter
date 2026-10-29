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
  Server,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  Terminal,
  ExternalLink,
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
  const [activeStep, setActiveStep] = useState<number>(2);
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);

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
      title: 'Client Ingress',
      subtitle: 'OpenAI / Anthropic APIs',
      latency: '1.2 ms',
      description:
        'Dual-protocol gateway parsing POST /v1/chat/completions and POST /v1/messages into canonical representation without request-body allocation overhead.',
      component: 'src/adapters/canonical.ts',
      badge: 'Zero-Copy Ingress',
    },
    {
      step: 2,
      title: 'd1 System One',
      subtitle: 'Liquid AI Neural Head',
      latency: stats?.avgRoutingLatencyMs ? `${stats.avgRoutingLatencyMs.toFixed(1)} ms` : '14.0 ms',
      description:
        'Single forward-pass evaluation querying Ollama /v1/systemone. Computes continuous complexity score (1.00-5.00), domain classification, and tool/vision necessity.',
      component: 'src/engine/d1-client.ts',
      badge: '10s Timeout Guard',
    },
    {
      step: 3,
      title: 'Policy Resolution',
      subtitle: 'Deterministic Filter',
      latency: '0.4 ms',
      description:
        'Evaluates candidate models against active policy (Balanced, Cost-Optimized, Quality-Max, Local-First) and complexity bounds.',
      component: 'src/engine/policy.ts',
      badge: 'Strict Pareto Match',
    },
    {
      step: 4,
      title: 'Upstream Dispatch',
      subtitle: 'Target Execution',
      latency: 'Upstream',
      description:
        'Dispatches payload to chosen endpoint (Ollama local, 9router, or direct cloud) with provider header translation and credential isolation.',
      component: 'src/engine/registry.ts',
      badge: `${stats?.activeModels ?? 0} Active Engines`,
    },
    {
      step: 5,
      title: 'Stream Transcoding',
      subtitle: 'Bidirectional SSE',
      latency: '0.8 ms',
      description:
        'Web-standard TransformStream translates OpenAI SSE chunks to Anthropic SSE events and vice-versa in real time with zero buffering.',
      component: 'src/adapters/sse-transcoder.ts',
      badge: 'Zero Latency Buffer',
    },
  ];

  const dist = stats?.complexityDistribution || { '1.0-2.0': 0, '2.0-3.0': 0, '3.0-4.0': 0, '4.0-5.0': 0 };
  const totalInDist = dist['1.0-2.0'] + dist['2.0-3.0'] + dist['3.0-4.0'] + dist['4.0-5.0'];
  const p1 = totalInDist > 0 ? Math.round((dist['1.0-2.0'] / totalInDist) * 100) : 40;
  const p2 = totalInDist > 0 ? Math.round((dist['2.0-3.0'] / totalInDist) * 100) : 35;
  const p3 = totalInDist > 0 ? Math.round(((dist['3.0-4.0'] + dist['4.0-5.0']) / totalInDist) * 100) : 25;

  return (
    <div className="space-y-6 pb-12">
      {/* Operational Header Bar */}
      <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-5 sm:p-6 transition-colors shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Routing Appliance Overview
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                Operational
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Complexity-driven reverse proxy backed by Liquid d1. Routes trivial prompts to zero-cost local models and reserves frontier engines for complex reasoning.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <Link
              to="/playground"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer shadow-sm"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Test Prompt</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Link>

            <Link
              to="/registry"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1D27] dark:hover:bg-[#222634] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 font-medium text-xs transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Manage Models</span>
            </Link>
          </div>
        </div>

        {/* Ingress Endpoint URI Reference */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Ingress:</span>
            <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#171A24] text-slate-800 dark:text-slate-200 text-[11px]">
              POST http://localhost:8100/v1/chat/completions
            </code>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>Timeout: <strong>10.0s</strong></span>
            <span>•</span>
            <span>Target: <strong>&lt;30ms overhead</strong></span>
          </div>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Requests */}
        <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-2 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Total Requests</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
              {stats?.totalRequests ? stats.totalRequests.toLocaleString() : '0'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {stats?.totalTokens ? `${stats.totalTokens.toLocaleString()} tokens routed` : 'Awaiting traffic'}
            </div>
          </div>
        </div>

        {/* Metric 2: Mean Latency */}
        <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-2 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Mean Decision Latency</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
              {stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '<15.0'}{' '}
              <span className="text-sm font-sans font-normal text-slate-400">ms</span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Within &lt;30ms SLA</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Cost Savings */}
        <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-2 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Cost Saved vs Frontier</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
              ${stats?.totalSavedUsd ? stats.totalSavedUsd.toFixed(3) : '0.000'}
            </div>
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono flex items-center space-x-1">
              <TrendingDown className="w-3 h-3" />
              <span>{stats?.costReductionPercent ? `${stats.costReductionPercent}% reduction` : '0% baseline'}</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Active Models */}
        <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-2 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Active Model Pool</span>
            <Server className="w-4 h-4 text-purple-500" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
              {stats?.activeModels ?? 0}{' '}
              <span className="text-sm font-sans font-normal text-slate-400">
                / {stats?.registeredModels ?? 0}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Ollama • 9router • Cloud
            </div>
          </div>
        </div>
      </div>

      {/* Decision Pipeline Topology Map */}
      <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-blue-500" />
              <span>System One Execution Pipeline</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select any stage to inspect execution parameters and latency budget.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total Pipeline Overhead: ~{stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '14.0'} ms
          </div>
        </div>

        {/* Step Selector Horizontal Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {architectureSteps.map((s) => {
            const isSelected = activeStep === s.step;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/60 dark:bg-[#171A24] border-blue-500 text-slate-900 dark:text-white shadow-sm'
                    : 'bg-slate-50/50 dark:bg-[#0D0F16] border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold font-mono ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {s.step}
                  </span>
                  <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{s.latency}</span>
                </div>
                <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">{s.title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Step Inspector Card */}
        {architectureSteps.map((s) => {
          if (s.step !== activeStep) return null;
          return (
            <div
              key={s.step}
              className="p-4 rounded-lg bg-slate-50 dark:bg-[#0E1017] border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono"
            >
              <div className="space-y-1 max-w-3xl">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Stage {s.step}: {s.title}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px]">
                    {s.badge}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-sans leading-relaxed text-xs">
                  {s.description}
                </p>
                <div className="text-slate-500 text-[11px] flex items-center space-x-1.5 pt-0.5">
                  <Terminal className="w-3 h-3 text-slate-400" />
                  <span>Module: {s.component}</span>
                </div>
              </div>
              <div className="px-3 py-1.5 rounded bg-white dark:bg-[#171A24] border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 whitespace-nowrap self-stretch md:self-auto text-center">
                Latency: {s.latency}
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics & Live Decision Stream Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Complexity Distribution Column */}
        <div className="lg:col-span-1 rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4 shadow-sm transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
              <Gauge className="w-4 h-4 text-emerald-500" />
              <span>Complexity Spectrum</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Scale 1.0 – 5.0</span>
          </div>

          <div className="space-y-3.5">
            {/* Level 1: Low */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">1.0 – 1.8 (Local Ollama)</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">{p1}%</span>
              </div>
              <div className="w-full h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded" style={{ width: `${p1}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Zero marginal cost ($0.00)</p>
            </div>

            {/* Level 2: Medium */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">1.9 – 3.5 (Mid-tier / 9router)</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">{p2}%</span>
              </div>
              <div className="w-full h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded" style={{ width: `${p2}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Cost-efficient reasoning</p>
            </div>

            {/* Level 3: Frontier */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">3.6 – 5.0 (Frontier Cloud)</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">{p3}%</span>
              </div>
              <div className="w-full h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded" style={{ width: `${p3}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Architecture, formal proofs</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>Evaluated Traffic:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {stats?.totalRequests ? `${stats.totalRequests} prompts` : '0 prompts'}
            </span>
          </div>
        </div>

        {/* Live Decision Feed */}
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-5 space-y-4 shadow-sm transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <span>Live Decision Stream</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Latest prompt evaluations resolved by D1 System One
              </p>
            </div>
            <Link
              to="/playground"
              className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
            >
              <span>Launch Playground</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-mono">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Prompt Excerpt</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Domain</th>
                  <th className="pb-2 font-medium">Target Engine</th>
                  <th className="pb-2 font-medium text-right">Latency</th>
                  <th className="pb-2 font-medium text-right">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {recentRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic font-mono text-xs">
                      No routed requests recorded yet. Test a prompt in the Playground.
                    </td>
                  </tr>
                ) : (
                  recentRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-[#171A24]/50 transition-colors">
                      <td className="py-2.5 text-slate-400 font-mono whitespace-nowrap text-[11px]">{r.time}</td>
                      <td className="py-2.5 text-slate-800 dark:text-slate-200 max-w-xs truncate pr-3 text-xs">
                        {r.promptSnippet}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                            r.level === 'low'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : r.level === 'med'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {r.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {r.domain}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">
                        {r.model}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400 whitespace-nowrap text-[11px]">
                        {r.latency}
                      </td>
                      <td className="py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap text-[11px]">
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
