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
  TrendingDown,
  CheckCircle2,
  Terminal,
  Zap,
} from 'lucide-react';
import { AsciiFlame } from '../components/AsciiFlame';
import { PipelineFlowGraph } from '../components/PipelineFlowGraph';

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
  const [heroAsciiMode, setHeroAsciiMode] = useState<'flame' | 'matrix' | 'stream'>('flame');
  const [pipelineView, setPipelineView] = useState<'graph' | 'stages'>('graph');

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
    <div className="min-h-screen bg-fc-paper text-fc-graphite font-sans">
      {/* Architectural Bento Grid Wrapper: 3 Columns [Gutter Kiri | Konten Utama 1200px | Gutter Kanan] */}
      <div className="grid grid-cols-[1fr_minmax(0,1200px)_1fr]">

        {/* ================= BARIS 1: SPACER KOSONG TOP ================= */}
        <div className="border-b border-r border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-l border-fc-border-faint h-10 sm:h-14" />

        {/* ================= BARIS 2: SECTION HEADER [ 01 / 04 ] ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint py-5 px-6 sm:px-10 relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#FA5D19]" />
          <div className="font-mono text-xs tracking-widest uppercase text-fc-muted flex items-center gap-3">
            <span>[ <strong className="text-heat-100 font-bold">01</strong> / 04 ]</span>
            <span>·</span>
            <span className="text-fc-graphite font-semibold">CORE ARCHITECTURE</span>
            <span className="text-fc-muted-soft">//</span>
            <span>DEVELOPER FIRST</span>
          </div>
          <span className="hidden sm:inline-block font-mono text-[11px] text-fc-muted">
            LATENCY TARGET &lt;15ms
          </span>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 3: HERO BENTO (Gap 0px) ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint grid grid-cols-1 lg:grid-cols-12">
          {/* Hero Left: Headline & CTA (8 cols) */}
          <div className="lg:col-span-8 p-8 sm:p-12 border-b lg:border-b-0 lg:border-r border-fc-border-faint flex flex-col justify-between relative group overflow-hidden">
            {/* Hero ASCII Animation (Position absolute — zero layout shift) */}
            <div className="absolute right-4 top-4 sm:right-8 sm:top-6 z-10 pointer-events-auto select-none hidden md:flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-fc-4 bg-fc-paper/90 dark:bg-[#181818]/90 backdrop-blur-xs border border-fc-border-faint text-[10px] font-mono text-fc-muted shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-heat-100 animate-pulse" />
                <span className="text-fc-graphite font-semibold">ASCII</span>
                <span className="text-fc-muted-soft">//</span>
                <span className="text-heat-100 uppercase font-bold">{heroAsciiMode}</span>
                <div className="flex items-center gap-1 ml-1.5 border-l border-fc-border-faint pl-1.5">
                  <button
                    onClick={() => setHeroAsciiMode('flame')}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors ${
                      heroAsciiMode === 'flame' ? 'bg-heat-100 text-white font-bold' : 'hover:text-fc-graphite'
                    }`}
                    title="ASCII flame animation"
                  >
                    FLM
                  </button>
                  <button
                    onClick={() => setHeroAsciiMode('matrix')}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors ${
                      heroAsciiMode === 'matrix' ? 'bg-heat-100 text-white font-bold' : 'hover:text-fc-graphite'
                    }`}
                    title="ASCII matrix animation"
                  >
                    MTX
                  </button>
                  <button
                    onClick={() => setHeroAsciiMode('stream')}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors ${
                      heroAsciiMode === 'stream' ? 'bg-heat-100 text-white font-bold' : 'hover:text-fc-graphite'
                    }`}
                    title="ASCII stream ticker"
                  >
                    STR
                  </button>
                </div>
              </div>
              <div className="p-2 rounded-fc-4 bg-fc-paper/60 dark:bg-[#141414]/60 border border-fc-border-faint/60 pointer-events-none">
                <AsciiFlame variant={heroAsciiMode} opacity={0.65} className="text-heat-100" />
              </div>
            </div>

            <div className="space-y-4 max-w-2xl relative z-10">
              <h1 className="text-3xl sm:text-5xl font-medium tracking-tight text-fc-graphite leading-[1.12]">
                Fast, reliable, token-efficient <br />
                <span className="text-heat-100 font-semibold">model routing</span>.
              </h1>
              <p className="text-base sm:text-lg text-fc-body-soft font-normal leading-relaxed">
                Give your AI agents exact model capabilities. Single forward-pass evaluation by Liquid AI d1 routes prompt complexity to the optimal engine in real time.
              </p>
            </div>

            {/* Action Controls & Ingress Tag */}
            <div className="pt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/playground"
                className="btn-heat-cta px-5 py-2.5 rounded-fc-6 text-sm font-medium inline-flex items-center space-x-2 shadow-fc-heat-btn"
              >
                <Gauge className="w-4 h-4" />
                <span>Launch Playground</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>

              <Link
                to="/registry"
                className="btn-ghost-outline px-4 py-2.5 rounded-fc-6 text-sm font-medium inline-flex items-center space-x-2"
              >
                <Layers className="w-4 h-4 text-heat-100" />
                <span>Model Registry</span>
              </Link>

              <div className="px-3 py-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint text-xs font-mono text-fc-muted flex items-center space-x-2">
                <span className="text-heat-100 font-bold">[ .CLI ]</span>
                <span>npx -y modelrouter-cli@latest</span>
              </div>
            </div>
          </div>

          {/* Hero Right Bento Tile: Neural Engine Status (4 cols) */}
          <div className="lg:col-span-4 p-8 sm:p-10 flex flex-col justify-between hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-fc-muted border-b border-fc-border-faint pb-3">
                <span className="flex items-center space-x-1.5 text-heat-100 font-bold">
                  <Zap className="w-3.5 h-3.5 fill-heat-100" />
                  <span>NEURAL HEAD</span>
                </span>
                <span className="text-[11px] font-mono">[ d1:systemone ]</span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-mono text-fc-muted uppercase tracking-wider">Evaluation Latency</div>
                <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                  {stats?.avgRoutingLatencyMs ? `${stats.avgRoutingLatencyMs.toFixed(1)} ms` : '<15.0 ms'}
                </div>
                <div className="text-xs text-fc-forest font-mono flex items-center space-x-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zero Egress Token Overhead</span>
                </div>
              </div>

              <p className="text-xs text-fc-body-soft leading-relaxed pt-2">
                Continuous complexity projection (1.00 - 5.00) determining exact Pareto model execution target before request dispatch.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-mono text-fc-muted border-t border-fc-border-faint">
              <span>Active Engines:</span>
              <span className="text-fc-graphite font-bold">{stats?.activeModels ?? 0} online</span>
            </div>

            {/* Hover Bottom Orange Line */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 4: STAT METRICS BENTO (4 Cards, Gap 0px) ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Routed Requests */}
          <div className="p-6 sm:p-8 border-b sm:border-b-0 border-r border-fc-border-faint hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div className="flex items-center justify-between text-fc-muted mb-3">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Routed Requests</span>
              <Activity className="w-4 h-4 text-fc-graphite" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                {stats?.totalRequests ? stats.totalRequests.toLocaleString() : '0'}
              </div>
              <div className="text-xs font-mono text-fc-muted">
                {stats?.totalTokens ? `${stats.totalTokens.toLocaleString()} tokens handled` : 'Zero egress buffer'}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Card 2: Decision Latency */}
          <div className="p-6 sm:p-8 border-b sm:border-b-0 lg:border-r border-fc-border-faint hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div className="flex items-center justify-between text-fc-muted mb-3">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Mean Decision Latency</span>
              <Clock className="w-4 h-4 text-fc-graphite" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                {stats?.avgRoutingLatencyMs ? stats.avgRoutingLatencyMs.toFixed(1) : '<15.0'}{' '}
                <span className="text-base font-sans font-normal text-fc-muted">ms</span>
              </div>
              <div className="text-xs text-fc-forest font-mono flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>P95 &lt;30 ms SLA</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Card 3: Cost Savings */}
          <div className="p-6 sm:p-8 border-b sm:border-b-0 border-r border-fc-border-faint hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div className="flex items-center justify-between text-fc-muted mb-3">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Cost Saved vs Frontier</span>
              <Coins className="w-4 h-4 text-fc-graphite" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-fc-graphite">
                ${stats?.totalSavedUsd ? stats.totalSavedUsd.toFixed(3) : '0.000'}
              </div>
              <div className="text-xs text-heat-100 font-mono flex items-center space-x-1 font-medium">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{stats?.costReductionPercent ? `${stats.costReductionPercent}% saved` : '0% baseline'}</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Card 4: Active Fleet */}
          <div className="p-6 sm:p-8 hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div className="flex items-center justify-between text-fc-muted mb-3">
              <span className="text-xs font-mono uppercase tracking-wider font-medium">Active Fleet</span>
              <Server className="w-4 h-4 text-fc-graphite" />
            </div>
            <div className="space-y-1">
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
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 5: SPACER KOSONG ================= */}
        <div className="border-b border-r border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-l border-fc-border-faint h-10 sm:h-14" />

        {/* ================= BARIS 6: SECTION HEADER [ 02 / 04 ] ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint py-5 px-6 sm:px-10 relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#FA5D19]" />
          <div className="font-mono text-xs tracking-widest uppercase text-fc-muted flex items-center gap-3">
            <span>[ <strong className="text-heat-100 font-bold">02</strong> / 04 ]</span>
            <span>·</span>
            <span className="text-fc-graphite font-semibold">PIPELINE TOPOLOGY</span>
            <span className="text-fc-muted-soft">//</span>
            <span>GRAPH-BASED ARCHITECTURE</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-fc-4 bg-fc-bg-lighter border border-fc-border-faint p-0.5 text-[11px] font-mono">
              <button
                onClick={() => setPipelineView('graph')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  pipelineView === 'graph' ? 'bg-fc-surface text-heat-100 font-bold shadow-xs' : 'text-fc-muted hover:text-fc-graphite'
                }`}
              >
                Graph View
              </button>
              <button
                onClick={() => setPipelineView('stages')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  pipelineView === 'stages' ? 'bg-fc-surface text-heat-100 font-bold shadow-xs' : 'text-fc-muted hover:text-fc-graphite'
                }`}
              >
                Stage Grid
              </button>
            </div>
            <span className="hidden sm:inline-block font-mono text-[11px] text-fc-muted">
              5 DETERMINISTIC STAGES
            </span>
          </div>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 7: PIPELINE STAGES BENTO ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint">
          {/* Pipeline Intro Banner */}
          <div className="p-8 sm:p-10 border-b border-fc-border-faint flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-2xl font-medium tracking-tight text-fc-graphite">
                We handle the <span className="text-heat-100 font-semibold">hard stuff</span>.
              </h2>
              <p className="text-sm text-fc-body-soft">
                Zero-copy canonical parser, continuous complexity projection, deterministic model routing, and on-the-fly SSE transcoding.
              </p>
            </div>
            <div className="text-xs font-mono text-fc-muted">
              <span>Execution Ceiling: </span>
              <span className="font-bold text-fc-forest">&lt;15ms overhead</span>
            </div>
          </div>

          {/* Interactive Graph-Based Flow Visualization */}
          {pipelineView === 'graph' && (
            <div className="border-b border-fc-border-faint">
              <PipelineFlowGraph
                activeStep={activeStep}
                onSelectStep={setActiveStep}
                avgRoutingLatencyMs={stats?.avgRoutingLatencyMs}
                activeModels={stats?.activeModels}
              />
            </div>
          )}

          {/* 5-Stage Bento Selector (0px gap, 1px borders) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-fc-border-faint">
            {architectureSteps.map((s, idx) => {
              const isSelected = activeStep === s.step;
              return (
                <button
                  key={s.step}
                  onClick={() => setActiveStep(s.step)}
                  className={`text-left p-5 sm:p-6 transition-colors cursor-pointer relative ${
                    idx < 4 ? 'border-r border-fc-border-faint' : ''
                  } ${
                    isSelected
                      ? 'bg-white dark:bg-[#1C1C1C] text-fc-graphite'
                      : 'bg-fc-paper hover:bg-white dark:hover:bg-[#1A1A1A] text-fc-muted'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-heat-100" />
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`w-5 h-5 rounded-fc-4 flex items-center justify-center text-[10px] font-mono font-bold ${
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
                className="p-6 sm:p-8 bg-fc-bg-lighter flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs font-mono"
              >
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-fc-graphite">
                      Stage {s.step}: {s.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-fc-4 bg-fc-surface border border-fc-border-faint text-fc-graphite text-[10px]">
                      {s.badge}
                    </span>
                  </div>
                  <p className="text-fc-body font-sans leading-relaxed text-xs sm:text-sm">
                    {s.description}
                  </p>
                  <div className="text-fc-muted text-[11px] flex items-center space-x-1.5 pt-1">
                    <Terminal className="w-3.5 h-3.5 text-fc-muted-soft shrink-0" />
                    <span>Module: {s.component}</span>
                  </div>
                </div>
                <div className="px-3.5 py-1.5 rounded-fc-6 bg-fc-surface border border-fc-border-muted text-heat-100 whitespace-nowrap self-start md:self-auto text-center font-bold">
                  Latency Budget: {s.latency}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 8: SPACER KOSONG ================= */}
        <div className="border-b border-r border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-fc-border-faint h-10 sm:h-14" />
        <div className="border-b border-l border-fc-border-faint h-10 sm:h-14" />

        {/* ================= BARIS 9: SECTION HEADER [ 03 / 04 ] ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint py-5 px-6 sm:px-10 relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#FA5D19]" />
          <div className="font-mono text-xs tracking-widest uppercase text-fc-muted flex items-center gap-3">
            <span>[ <strong className="text-heat-100 font-bold">03</strong> / 04 ]</span>
            <span>·</span>
            <span className="text-fc-graphite font-semibold">TELEMETRY & BENCHMARKS</span>
            <span className="text-fc-muted-soft">//</span>
            <span>VERIFIED OUTPUT</span>
          </div>
          <span className="hidden sm:inline-block font-mono text-[11px] text-fc-muted">
            POLLING: 4.0s
          </span>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 10: TELEMETRY BENTO (Complexity 4 cols + Live Feed 8 cols) ================= */}
        <div className="border-b border-r border-fc-border-faint" />
        <div className="border-b border-fc-border-faint grid grid-cols-1 lg:grid-cols-12">
          {/* Complexity Spectrum Column (4 cols) */}
          <div className="lg:col-span-4 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-fc-border-faint flex flex-col justify-between hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div>
              <div className="flex items-center justify-between border-b border-fc-border-faint pb-3 mb-5">
                <h3 className="font-medium text-fc-graphite text-sm flex items-center space-x-2">
                  <Gauge className="w-4 h-4 text-heat-100" />
                  <span>Complexity Spectrum</span>
                </h3>
                <span className="text-[11px] font-mono text-fc-muted">[ 1.0 – 5.0 ]</span>
              </div>

              <div className="space-y-4">
                {/* Level 1: Low */}
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
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
            </div>

            <div className="pt-4 mt-6 border-t border-fc-border-faint flex items-center justify-between text-xs text-fc-muted font-mono">
              <span>Traffic Evaluated:</span>
              <span className="font-bold text-fc-graphite">
                {stats?.totalRequests ? `${stats.totalRequests} queries` : '0 queries'}
              </span>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Live Decision Feed Column (8 cols) */}
          <div className="lg:col-span-8 p-6 sm:p-8 flex flex-col justify-between hover:bg-white dark:hover:bg-[#1C1C1C] transition-colors relative group">
            <div>
              <div className="flex items-center justify-between border-b border-fc-border-faint pb-3 mb-4">
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

            <div className="pt-4 mt-4 border-t border-fc-border-faint flex items-center justify-between text-xs text-fc-muted font-mono">
              <span>Continuous Polling: 4.0s</span>
              <span className="text-fc-forest font-bold">● Stream Connected</span>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-heat-100 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="border-b border-l border-fc-border-faint" />

        {/* ================= BARIS 11: SPACER KOSONG BOTTOM ================= */}
        <div className="border-b border-r border-fc-border-faint h-16 sm:h-20" />
        <div className="border-b border-fc-border-faint h-16 sm:h-20" />
        <div className="border-b border-l border-fc-border-faint h-16 sm:h-20" />
      </div>
    </div>
  );
}
