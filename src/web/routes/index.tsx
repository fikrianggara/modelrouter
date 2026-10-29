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
  Flame,
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
      badge: '[ .JSON / .SSE ]',
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
    <div className="space-y-12 pb-16">
      {/* Section 01: Firecrawl Blueprint Hero Header */}
      <section className="space-y-4">
        {/* Firecrawl Section Metadata */}
        <div className="flex items-center space-x-2 text-xs font-mono text-fc-muted">
          <span className="text-heat-100 font-bold">[ 01 / 04 ]</span>
          <span>·</span>
          <span>Core Architecture</span>
          <span className="text-fc-muted-soft">//</span>
          <span className="text-fc-muted-soft">Developer First</span>
          <span className="text-fc-muted-soft">//</span>
        </div>

        {/* Title H2 styled per Firecrawl */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-5xl font-medium tracking-tight text-fc-graphite leading-[1.12]">
            Fast, reliable, token-efficient <br />
            <span className="text-heat-100">model routing</span>.
          </h1>
          <p className="text-base sm:text-lg text-fc-body-soft max-w-2xl font-normal leading-relaxed">
            Give your AI agents exact model capabilities. Single forward-pass evaluation by Liquid AI d1 routes prompt complexity to the optimal engine in real time.
          </p>
        </div>

        {/* Action Controls & Ingress Tag */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Link
            to="/playground"
            className="btn-heat-cta px-5 py-2.5 rounded-fc-8 text-sm font-medium inline-flex items-center space-x-2 shadow-fc-heat-btn"
          >
            <Gauge className="w-4 h-4" />
            <span>Launch Playground</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>

          <Link
            to="/registry"
            className="btn-ghost-outline px-4 py-2.5 rounded-fc-8 text-sm font-medium inline-flex items-center space-x-2"
          >
            <Layers className="w-4 h-4 text-heat-100" />
            <span>Model Registry</span>
          </Link>

          <div className="px-3 py-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint text-xs font-mono text-fc-muted flex items-center space-x-2">
            <span className="text-heat-100 font-bold">[ .CLI ]</span>
            <span>npx -y modelrouter-cli@latest</span>
          </div>
        </div>
      </section>

      {/* Blueprint Bento Grid: 4 Metric Cards with Corner Ticks */}
      <section className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Routed Requests */}
          <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-5 space-y-2 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between text-fc-muted">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Routed Requests</span>
              <Activity className="w-4 h-4 text-heat-100" />
            </div>
            <div className="space-y-0.5 pt-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                {stats?.totalRequests ? stats.totalRequests.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-mono text-fc-muted">
                {stats?.totalTokens ? `${stats.totalTokens.toLocaleString()} tokens handled` : 'Zero egress buffer'}
              </div>
            </div>
          </div>

          {/* Card 2: Decision Latency */}
          <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-5 space-y-2 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between text-fc-muted">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Mean Decision Latency</span>
              <Clock className="w-4 h-4 text-fc-forest" />
            </div>
            <div className="space-y-0.5 pt-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                {stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '<15.0'}{' '}
                <span className="text-base font-sans font-normal text-fc-muted">ms</span>
              </div>
              <div className="text-xs text-fc-forest font-mono flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>P95 &lt;30 ms SLA</span>
              </div>
            </div>
          </div>

          {/* Card 3: Cost Savings */}
          <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-5 space-y-2 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between text-fc-muted">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Cost Saved vs Frontier</span>
              <Coins className="w-4 h-4 text-fc-honey" />
            </div>
            <div className="space-y-0.5 pt-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                ${stats?.totalSavedUsd ? stats.totalSavedUsd.toFixed(3) : '0.000'}
              </div>
              <div className="text-xs text-heat-100 font-mono flex items-center space-x-1 font-medium">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{stats?.costReductionPercent ? `${stats.costReductionPercent}% saved` : '0% baseline'}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Active Models */}
          <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-5 space-y-2 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between text-fc-muted">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Active Fleet</span>
              <Server className="w-4 h-4 text-fc-amethyst" />
            </div>
            <div className="space-y-0.5 pt-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                {stats?.activeModels ?? 0}{' '}
                <span className="text-base font-sans font-normal text-fc-muted">
                  / {stats?.registeredModels ?? 0}
                </span>
              </div>
              <div className="text-xs text-fc-muted font-mono">
                Ollama • 9router • Cloud
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 02: Execution Pipeline Topology Map */}
      <section className="space-y-4">
        {/* Section Metadata */}
        <div className="flex items-center space-x-2 text-xs font-mono text-fc-muted">
          <span className="text-heat-100 font-bold">[ 02 / 04 ]</span>
          <span>·</span>
          <span>Pipeline Stages</span>
          <span className="text-fc-muted-soft">//</span>
          <span className="text-fc-muted-soft">Zero Configuration</span>
          <span className="text-fc-muted-soft">//</span>
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-medium tracking-tight text-fc-graphite">
            We handle the <span className="text-heat-100">hard stuff</span>.
          </h2>
          <p className="text-sm text-fc-body-soft">
            Zero-copy canonical parser, continuous complexity projection, and on-the-fly SSE transcoding.
          </p>
        </div>

        {/* Blueprint Flow Box */}
        <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-12 p-6 space-y-5 widget-halo">
          <span className="corner-crosshair top-2 left-2">+</span>
          <span className="corner-crosshair top-2 right-2">+</span>
          <span className="corner-crosshair bottom-2 left-2">+</span>
          <span className="corner-crosshair bottom-2 right-2">+</span>

          {/* Stage Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {architectureSteps.map((s) => {
              const isSelected = activeStep === s.step;
              return (
                <button
                  key={s.step}
                  onClick={() => setActiveStep(s.step)}
                  className={`text-left p-3.5 rounded-fc-6 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-heat-4 border-heat-100 text-fc-graphite shadow-xs'
                      : 'bg-fc-bg-lighter border-fc-border-faint text-fc-muted hover:border-fc-border-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`w-5 h-5 rounded-fc-4 flex items-center justify-center text-[10px] font-bold font-mono ${
                        isSelected
                          ? 'bg-heat-100 text-white'
                          : 'bg-fc-surface border border-fc-border-faint text-fc-graphite'
                      }`}
                    >
                      {s.step}
                    </span>
                    <span className="text-[11px] font-mono text-heat-100 font-medium">{s.latency}</span>
                  </div>
                  <div className="font-medium text-xs text-fc-graphite truncate">{s.title}</div>
                  <div className="text-[11px] text-fc-muted truncate">{s.subtitle}</div>
                </button>
              );
            })}
          </div>

          {/* Active Stage Inspector Detail */}
          {architectureSteps.map((s) => {
            if (s.step !== activeStep) return null;
            return (
              <div
                key={s.step}
                className="p-4 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-fc-graphite">
                      Stage {s.step}: {s.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-fc-4 bg-fc-surface border border-fc-border-faint text-fc-graphite text-[10px]">
                      {s.badge}
                    </span>
                  </div>
                  <p className="text-fc-body font-sans leading-relaxed text-xs">
                    {s.description}
                  </p>
                  <div className="text-fc-muted text-[11px] flex items-center space-x-1.5 pt-0.5">
                    <Terminal className="w-3.5 h-3.5 text-fc-muted-soft" />
                    <span>Module: {s.component}</span>
                  </div>
                </div>
                <div className="px-3.5 py-1.5 rounded-fc-6 bg-fc-surface border border-fc-border-muted text-heat-100 whitespace-nowrap self-stretch md:self-auto text-center font-bold">
                  Latency Budget: {s.latency}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 03: Live Decision Stream & Complexity Benchmarks */}
      <section className="space-y-4">
        {/* Section Metadata */}
        <div className="flex items-center space-x-2 text-xs font-mono text-fc-muted">
          <span className="text-heat-100 font-bold">[ 03 / 04 ]</span>
          <span>·</span>
          <span>Telemetry & Benchmarks</span>
          <span className="text-fc-muted-soft">//</span>
          <span className="text-fc-muted-soft">Verified Output</span>
          <span className="text-fc-muted-soft">//</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Complexity Distribution Column */}
          <div className="lg:col-span-1 relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-6 space-y-4 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between border-b border-fc-border-faint pb-3">
              <h3 className="font-medium text-fc-graphite text-sm flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-heat-100" />
                <span>Complexity Spectrum</span>
              </h3>
              <span className="text-[11px] font-mono text-fc-muted">[ 1.0 – 5.0 ]</span>
            </div>

            <div className="space-y-3.5">
              {/* Level 1: Low */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-fc-body font-medium">1.0 – 1.8 (Local Ollama)</span>
                  <span className="font-mono text-fc-graphite font-bold">{p1}%</span>
                </div>
                <div className="w-full h-2 rounded-fc-full bg-fc-bg-lighter border border-fc-border-faint overflow-hidden">
                  <div className="h-full bg-fc-forest rounded-fc-full" style={{ width: `${p1}%` }} />
                </div>
                <p className="text-[10px] text-fc-muted font-mono">Zero token egress ($0.00)</p>
              </div>

              {/* Level 2: Medium */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-fc-body font-medium">1.9 – 3.5 (Mid-tier / 9router)</span>
                  <span className="font-mono text-fc-graphite font-bold">{p2}%</span>
                </div>
                <div className="w-full h-2 rounded-fc-full bg-fc-bg-lighter border border-fc-border-faint overflow-hidden">
                  <div className="h-full bg-fc-honey rounded-fc-full" style={{ width: `${p2}%` }} />
                </div>
                <p className="text-[10px] text-fc-muted font-mono">Frugal code & structured data</p>
              </div>

              {/* Level 3: Frontier */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-fc-body font-medium">3.6 – 5.0 (Frontier Cloud)</span>
                  <span className="font-mono text-fc-graphite font-bold">{p3}%</span>
                </div>
                <div className="w-full h-2 rounded-fc-full bg-fc-bg-lighter border border-fc-border-faint overflow-hidden">
                  <div className="h-full bg-heat-100 rounded-fc-full" style={{ width: `${p3}%` }} />
                </div>
                <p className="text-[10px] text-fc-muted font-mono">Formal reasoning & architecture</p>
              </div>
            </div>

            <div className="pt-2 border-t border-fc-border-faint flex items-center justify-between text-xs text-fc-muted font-mono">
              <span>Traffic Evaluated:</span>
              <span className="font-bold text-fc-graphite">
                {stats?.totalRequests ? `${stats.totalRequests} queries` : '0 queries'}
              </span>
            </div>
          </div>

          {/* Live Decision Feed */}
          <div className="lg:col-span-2 relative bg-fc-surface border border-fc-border-muted rounded-fc-8 p-6 space-y-4 shadow-xs">
            <span className="corner-crosshair top-1 left-1.5">+</span>
            <span className="corner-crosshair top-1 right-1.5">+</span>
            <div className="flex items-center justify-between border-b border-fc-border-faint pb-3">
              <div>
                <h3 className="font-medium text-fc-graphite text-sm flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-heat-100" />
                  <span>Live Decision Stream</span>
                </h3>
                <p className="text-xs text-fc-muted">
                  Real-time prompt classifications processed by Liquid AI d1
                </p>
              </div>
              <Link
                to="/playground"
                className="text-xs font-mono text-heat-100 hover:underline flex items-center space-x-1"
              >
                <span>Launch Playground</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-fc-border-muted text-fc-muted font-mono">
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Prompt Excerpt</th>
                    <th className="pb-2 font-medium">Score</th>
                    <th className="pb-2 font-medium">Domain</th>
                    <th className="pb-2 font-medium">Target Engine</th>
                    <th className="pb-2 font-medium text-right">Latency</th>
                    <th className="pb-2 font-medium text-right">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fc-border-faint font-sans">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-fc-muted italic font-mono text-xs">
                        No routed requests recorded yet. Test a prompt in the Playground.
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-fc-bg-lighter transition-colors">
                        <td className="py-2.5 text-fc-muted font-mono whitespace-nowrap text-[11px]">{r.time}</td>
                        <td className="py-2.5 text-fc-graphite max-w-xs truncate pr-3 text-xs">
                          {r.promptSnippet}
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-fc-4 text-[11px] font-mono font-bold ${
                              r.level === 'low'
                                ? 'bg-fc-forest/10 text-fc-forest border border-fc-forest/20'
                                : r.level === 'med'
                                ? 'bg-fc-honey/10 text-fc-honey border border-fc-honey/20'
                                : 'bg-heat-12 text-heat-100 border border-heat-40'
                            }`}
                          >
                            {r.score.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded-fc-4 bg-fc-bg-lighter border border-fc-border-faint text-fc-body font-mono text-[11px]">
                            {r.domain}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-fc-graphite whitespace-nowrap text-xs">
                          {r.model}
                        </td>
                        <td className="py-2.5 text-right font-mono text-fc-muted whitespace-nowrap text-[11px]">
                          {r.latency}
                        </td>
                        <td className="py-2.5 text-right font-mono text-fc-forest font-bold whitespace-nowrap text-[11px]">
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
      </section>
    </div>
  );
}
