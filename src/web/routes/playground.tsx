import { useState, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Gauge,
  Send,
  RotateCcw,
  Copy,
  Check,
  Cpu,
  Wrench,
  Eye,
  CheckCircle2,
  Terminal,
  AlertTriangle,
  Info,
  GitBranch,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AsciiFlame } from '../components/AsciiFlame';

export const Route = createFileRoute('/playground')({
  component: PlaygroundPage,
});

interface EvaluationResult {
  complexityScore: number;
  confidence: number;
  domain: string;
  requiresTools: boolean;
  requiresVision: boolean;
  isFallback?: boolean;
  fallbackReason?: string;
  reasoning?: string;
  policy?: string;
  candidatesCount?: number;
  poolSize?: number;
  selectedModel: {
    id: string;
    display_name?: string;
    provider: string;
    upstream_model: string;
    complexity_range: [number, number];
    cost?: {
      input_per_mtoken: number;
      output_per_mtoken: number;
    };
    capabilities?: {
      tools: boolean;
      vision: boolean;
      max_context: number;
      streaming: boolean;
    };
  };
  routingLatencyMs: number;
}

const PRESET_PROMPTS = [
  {
    label: 'Simple Greeting',
    prompt: 'Hello! Can you give me a quick definition of idempotent operations?',
    expectedScore: 1.2,
    domain: 'general',
  },
  {
    label: 'Node.js Event Loop',
    prompt: 'Explain the phases of the Node.js libuv event loop and how setImmediate differs from setTimeout(fn, 0).',
    expectedScore: 2.6,
    domain: 'coding',
  },
  {
    label: 'Raft Consensus',
    prompt: 'Design a fault-tolerant Raft consensus module in TypeScript. Include election timers, AppendEntries RPC handling, term increments, and split-vote edge cases.',
    expectedScore: 4.8,
    domain: 'coding',
  },
  {
    label: 'Philosophical Synthesis',
    prompt: 'Synthesize Cartesian mind-body dualism with modern functionalist theories of consciousness. Highlight hard problems of consciousness vs physicalism.',
    expectedScore: 3.8,
    domain: 'analysis',
  },
  {
    label: 'Distributed Systems & ML',
    prompt: 'Analyze an e-commerce platform that implements real-time machine learning recommendations, distributed cache invalidation with Redis, asynchronous transactional sagas via RabbitMQ, and hybrid BM25 + dense vector semantic search.',
    expectedScore: 4.5,
    domain: 'analysis',
  },
];

export function PlaygroundPage() {
  const [prompt, setPrompt] = useState<string>(PRESET_PROMPTS[0]?.prompt || '');
  const [policy, setPolicy] = useState<string>('balanced');
  const [virtualModel, setVirtualModel] = useState<string>('d1-router-auto');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [chatResponse, setChatResponse] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [upstreamNotice, setUpstreamNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showGraph, setShowGraph] = useState<boolean>(true);
  const [streamStats, setStreamStats] = useState<{
    tokens: number;
    elapsedMs: number;
    tokensPerSec: number;
  }>({ tokens: 0, elapsedMs: 0, tokensPerSec: 0 });

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatOutputRef = useRef<HTMLDivElement | null>(null);

  const handleEvaluate = async (customPrompt?: string) => {
    const textToEvaluate = customPrompt !== undefined ? customPrompt : prompt;
    if (!textToEvaluate.trim()) return;

    setIsEvaluating(true);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToEvaluate,
          model: virtualModel,
          policy,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvaluation(data);
      } else {
        fallbackClientEvaluation(textToEvaluate);
      }
    } catch {
      fallbackClientEvaluation(textToEvaluate);
    } finally {
      setIsEvaluating(false);
    }
  };

  const fallbackClientEvaluation = (text: string) => {
    const lower = text.toLowerCase();
    let score = 1.2;
    let domain = 'general';
    let requiresTools = false;
    let requiresVision = false;

    if (
      lower.includes('raft') ||
      lower.includes('distributed') ||
      lower.includes('formal verification') ||
      lower.includes('consensus') ||
      text.length > 300
    ) {
      score = 4.8;
      domain = 'coding';
      requiresTools = true;
    } else if (
      lower.includes('function') ||
      lower.includes('code') ||
      lower.includes('node.js') ||
      lower.includes('event loop') ||
      lower.includes('typescript')
    ) {
      score = 2.7;
      domain = 'coding';
    } else if (
      lower.includes('synthesize') ||
      lower.includes('philosophy') ||
      lower.includes('consciousness') ||
      lower.includes('analyze')
    ) {
      score = 3.8;
      domain = 'analysis';
    }

    let selectedModel = {
      id: 'local-chat',
      display_name: 'Local Chat',
      provider: 'ollama',
      upstream_model: 'lfm3:latest',
      complexity_range: [0.0, 1.8] as [number, number],
      cost: { input_per_mtoken: 0, output_per_mtoken: 0 },
      capabilities: {
        tools: false,
        vision: false,
        max_context: 32768,
        streaming: true,
      },
    };

    if (score > 3.0) {
      selectedModel = {
        id: 'cloud-coder',
        display_name: 'Claude Sonnet',
        provider: 'anthropic',
        upstream_model: 'claude-3-5-sonnet-20241022',
        complexity_range: [3.0, 5.0] as [number, number],
        cost: { input_per_mtoken: 3.0, output_per_mtoken: 15.0 },
        capabilities: {
          tools: true,
          vision: true,
          max_context: 200000,
          streaming: true,
        },
      };
    } else if (score > 1.8) {
      selectedModel = {
        id: 'openai-gpt4o',
        display_name: 'OpenAI GPT-4o',
        provider: 'openai',
        upstream_model: 'gpt-4o',
        complexity_range: [2.5, 5.0] as [number, number],
        cost: { input_per_mtoken: 2.5, output_per_mtoken: 10.0 },
        capabilities: {
          tools: true,
          vision: true,
          max_context: 128000,
          streaming: true,
        },
      };
    }

    setEvaluation({
      complexityScore: score,
      confidence: 0.94,
      domain,
      requiresTools,
      requiresVision,
      isFallback: true,
      fallbackReason: 'Evaluated via client fallback guard',
      selectedModel,
      routingLatencyMs: 14.2,
      policy,
    });
  };

  useEffect(() => {
    handleEvaluate(prompt);
  }, []);

  const handleSendPrompt = async () => {
    if (!prompt.trim() || isGenerating) return;

    await handleEvaluate();

    setIsGenerating(true);
    setChatResponse('');
    setUpstreamNotice(null);
    setStreamStats({ tokens: 0, elapsedMs: 0, tokensPerSec: 0 });

    const startTime = performance.now();
    let tokenCount = 0;

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: virtualModel,
          policy: policy,
          messages: [{ role: 'user', content: prompt }],
          stream: isStreaming,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (res.ok && isStreaming && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  tokenCount++;
                  setChatResponse((prev) => prev + delta);
                  const elapsed = performance.now() - startTime;
                  setStreamStats({
                    tokens: tokenCount,
                    elapsedMs: Math.round(elapsed),
                    tokensPerSec:
                      Math.round((tokenCount / (elapsed / 1000)) * 10) / 10,
                  });
                }
              } catch {
                // Ignore partial JSON chunks
              }
            }
          }
        }
      } else if (res.ok && !isStreaming) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        setChatResponse(content);
        const elapsed = performance.now() - startTime;
        const estimatedTokens = Math.max(1, Math.round(content.length / 4));
        setStreamStats({
          tokens: estimatedTokens,
          elapsedMs: Math.round(elapsed),
          tokensPerSec:
            Math.round((estimatedTokens / (elapsed / 1000)) * 10) / 10,
        });
      } else {
        const errText = await res.text().catch(() => '');
        setUpstreamNotice(
          `Upstream endpoint returned HTTP ${res.status}. Showing policy-aligned simulated output for ${evaluation?.selectedModel?.display_name || 'selected model'}.`
        );
        await simulateStreamingResponse(
          prompt,
          evaluation?.selectedModel?.display_name || 'Selected Model',
          policy
        );
      }
    } catch {
      setUpstreamNotice(
        `Local gateway simulation active for ${evaluation?.selectedModel?.display_name || 'selected model'}.`
      );
      await simulateStreamingResponse(
        prompt,
        evaluation?.selectedModel?.display_name || 'Selected Model',
        policy
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const simulateStreamingResponse = async (
    userPrompt: string,
    modelName: string,
    activePolicy: string
  ) => {
    const startTime = performance.now();
    let text = '';

    const getPolicyRationale = (p: string) => {
      switch (p) {
        case 'quality_max':
          return 'ModelRouter selected this engine under Quality-Max policy to provide maximum reasoning depth, capability headroom, and architectural synthesis capability, prioritizing accuracy over token cost.';
        case 'cost_optimized':
          return 'ModelRouter selected this engine under Cost-Optimized policy to minimize operational cost per token while fulfilling the required task complexity.';
        case 'local_first':
          return 'ModelRouter prioritized local Ollama inference ($0.00 marginal cost) to ensure complete data privacy and zero cloud egress.';
        case 'balanced':
        default:
          return 'ModelRouter determined this model offers the optimal Pareto frontier balance between processing latency, cost per token, and reasoning quality.';
      }
    };

    const rationale = getPolicyRationale(activePolicy);

    if (userPrompt.toLowerCase().includes('idempotent')) {
      text =
        `[Routed via D1 System One -> ${modelName} | Policy: ${activePolicy}]\n\n` +
        `An **idempotent operation** is an operation that produces the exact same state outcome no matter how many times it is executed with identical parameters.\n\n` +
        `### Key Characteristics\n` +
        `1. **REST APIs**: HTTP \`GET\`, \`PUT\`, and \`DELETE\` are idempotent. Retrying \`PUT /orders/123\` with identical state does not duplicate the resource.\n` +
        `2. **Distributed Messaging**: Consumers use deduplication keys or transaction IDs to safely handle redelivered messages.\n` +
        `3. **Database Ledger**: \`SET balance = 1000\` is idempotent; \`balance = balance + 100\` is not.\n\n` +
        `### Policy Rationale\n` +
        `${rationale}`;
    } else if (userPrompt.toLowerCase().includes('raft')) {
      text =
        `[Routed via D1 System One -> ${modelName} | Policy: ${activePolicy}]\n\n` +
        `### Raft Consensus State Machine in TypeScript\n\n` +
        `Raft achieves consensus via three server states: **Leader**, **Candidate**, and **Follower**.\n\n` +
        `\`\`\`typescript\n` +
        `enum Role { Follower, Candidate, Leader }\n\n` +
        `interface LogEntry<T> {\n` +
        `  term: number;\n` +
        `  index: number;\n` +
        `  command: T;\n` +
        `}\n\n` +
        `class RaftNode<T> {\n` +
        `  private currentTerm = 0;\n` +
        `  private votedFor: string | null = null;\n` +
        `  private log: LogEntry<T>[] = [];\n` +
        `  private role = Role.Follower;\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `### Policy Execution Analysis\n` +
        `${rationale}`;
    } else {
      text =
        `[Routed via D1 System One -> ${modelName} | Policy: ${activePolicy}]\n\n` +
        `Prompt successfully processed by ModelRouter gateway.\n\n` +
        `- Evaluated Complexity: ${evaluation?.complexityScore.toFixed(2) || '2.40'} / 5.00\n` +
        `- Classified Domain: ${evaluation?.domain || 'general'}\n` +
        `- Selected Engine: ${modelName}\n` +
        `- Active Routing Policy: ${activePolicy}\n\n` +
        `### Policy Rationale\n` +
        `${rationale}`;
    }

    const words = text.split(' ');
    let currentOutput = '';
    let tokenCount = 0;

    for (const word of words) {
      currentOutput += word + ' ';
      tokenCount++;
      setChatResponse(currentOutput);
      const elapsed = performance.now() - startTime;
      setStreamStats({
        tokens: tokenCount,
        elapsedMs: Math.round(elapsed),
        tokensPerSec:
          Math.round((tokenCount / (Math.max(1, elapsed) / 1000)) * 10) / 10,
      });
      await new Promise((r) => setTimeout(r, 22));
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(chatResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const score = evaluation?.complexityScore || 1.2;
  const scorePercent = Math.min(100, Math.max(0, (score / 5) * 100));

  const getScoreColor = (val: number) => {
    if (val < 2.0)
      return {
        text: 'text-fc-forest',
        bg: 'bg-fc-forest',
        tier: 'Low Complexity (Local Free Tier)',
      };
    if (val < 3.5)
      return {
        text: 'text-fc-honey',
        bg: 'bg-fc-honey',
        tier: 'Standard Complexity (Mid-tier Engine)',
      };
    return {
      text: 'text-heat-100',
      bg: 'bg-heat-100',
      tier: 'Advanced Complexity (Frontier Engine)',
    };
  };

  const scoreStyle = getScoreColor(score);

  return (
    <div className="space-y-6 pb-12">
      {/* Workbench Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-fc-border-muted pb-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-fc-accent-black flex items-center space-x-2">
            <Gauge className="w-5 h-5 text-heat-100" />
            <span>Decision Intelligence Playground</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate prompt complexity with Liquid d1, inspect candidate filtering, and observe streaming dispatch.
          </p>
        </div>

        {/* Preset Prompt Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 font-mono mr-1">Presets:</span>
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPrompt(p.prompt);
                handleEvaluate(p.prompt);
              }}
              className="px-2.5 py-1 rounded-fc-sm text-xs font-mono bg-fc-bg-lighter hover:bg-fc-surface border border-fc-border-faint text-fc-accent-black transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Dual-Pane Grid: Left = Execution Workbench, Right = Decision Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Prompt Input & Stream Output (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Prompt Editor Card */}
          <div className="relative rounded-fc-12 bg-fc-surface border border-fc-border-muted p-5 sm:p-6 space-y-4 widget-halo">
            <span className="corner-crosshair top-2 left-2">+</span>
            <span className="corner-crosshair top-2 right-2">+</span>
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Policy Segmented Control */}
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 font-medium">Policy:</span>
                <div className="flex bg-fc-bg-lighter p-0.5 rounded-fc-sm border border-fc-border-faint font-mono text-[11px]">
                  {(['balanced', 'cost_optimized', 'quality_max', 'local_first'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPolicy(p)}
                      className={`px-2.5 py-0.5 rounded-fc-sm transition-all cursor-pointer ${
                        policy === p
                          ? 'bg-heat-100 text-white font-medium shadow-xs'
                          : 'text-slate-500 hover:text-fc-accent-black'
                      }`}
                    >
                      {p === 'balanced'
                        ? 'Balanced'
                        : p === 'cost_optimized'
                        ? 'Cost'
                        : p === 'quality_max'
                        ? 'Quality'
                        : 'Local'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Virtual Router & Stream Options */}
              <div className="flex items-center space-x-3">
                <select
                  value={virtualModel}
                  onChange={(e) => {
                    setVirtualModel(e.target.value);
                    if (e.target.value === 'd1-router-cost') setPolicy('cost_optimized');
                    else if (e.target.value === 'd1-router-quality') setPolicy('quality_max');
                    else if (e.target.value === 'd1-router-local') setPolicy('local_first');
                    else if (e.target.value === 'd1-router-auto') setPolicy('balanced');
                  }}
                  className="bg-fc-bg-lighter border border-fc-border-muted rounded-fc-sm px-2 py-1 text-fc-accent-black text-xs focus:outline-none focus:border-heat-100 font-mono"
                >
                  <option value="d1-router-auto">d1-router-auto</option>
                  <option value="d1-router-cost">d1-router-cost</option>
                  <option value="d1-router-quality">d1-router-quality</option>
                  <option value="d1-router-local">d1-router-local</option>
                </select>

                <label className="flex items-center space-x-1 cursor-pointer text-slate-600 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={isStreaming}
                    onChange={(e) => setIsStreaming(e.target.checked)}
                    className="rounded bg-fc-bg-lighter border-fc-border-muted text-heat-100 focus:ring-0 w-3 h-3"
                  />
                  <span className="font-mono text-[11px]">Stream</span>
                </label>

                <button
                  onClick={() => {
                    setPrompt('');
                    setChatResponse('');
                    setEvaluation(null);
                  }}
                  className="text-slate-400 hover:text-fc-accent-black flex items-center space-x-1 cursor-pointer"
                  title="Clear Prompt"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  fallbackClientEvaluation(e.target.value);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                rows={4}
                placeholder="Type or paste prompt to analyze (e.g. code generation, greeting, architecture)..."
                className="w-full bg-fc-bg-base border border-fc-border-muted rounded-fc-sm p-3 text-xs sm:text-sm text-fc-accent-black placeholder-slate-400 focus:outline-none focus:border-heat-100 resize-y transition-colors font-sans leading-relaxed"
              />
              <div className="absolute right-2.5 bottom-2.5 text-[10px] font-mono text-slate-400 pointer-events-none">
                {prompt.length} chars • ~{Math.round(prompt.length / 4)} tokens
              </div>
            </div>

            {/* Execute Buttons */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Press <kbd className="px-1.5 py-0.5 rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint text-slate-500">⌘+Enter</kbd> to execute
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleEvaluate()}
                  disabled={isEvaluating || !prompt.trim()}
                  className="px-3.5 py-2 rounded-fc-sm bg-fc-bg-lighter hover:bg-fc-surface disabled:opacity-50 text-fc-accent-black font-medium text-xs flex items-center space-x-1.5 border border-fc-border-muted transition-colors cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5 text-heat-100" />
                  <span>{isEvaluating ? 'Evaluating...' : 'Score Prompt'}</span>
                </button>

                <button
                  onClick={handleSendPrompt}
                  disabled={isGenerating || !prompt.trim()}
                  className="btn-heat-primary px-4 py-2 rounded-fc-sm disabled:opacity-50 font-medium text-xs flex items-center space-x-1.5 cursor-pointer shadow-heat-button"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isGenerating ? 'Streaming...' : 'Route & Execute'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Upstream Notice Banner (if any) */}
          {upstreamNotice && (
            <div className="p-3 rounded-fc-sm bg-heat-4 border border-heat-20 text-xs text-heat-100 flex items-center space-x-2 transition-all">
              <Info className="w-4 h-4 text-heat-100 shrink-0" />
              <span>{upstreamNotice}</span>
            </div>
          )}

          {/* Streaming Output Card */}
          <div className="relative rounded-fc-12 bg-fc-surface border border-fc-border-muted p-5 space-y-3.5 widget-halo">
            <span className="corner-crosshair top-2 left-2">+</span>
            <span className="corner-crosshair top-2 right-2">+</span>
            <div className="flex items-center justify-between border-b border-fc-border-faint pb-2.5">
              <div className="flex items-center space-x-2 text-xs font-mono">
                <Terminal className="w-3.5 h-3.5 text-heat-100" />
                <span className="font-semibold text-fc-accent-black">Execution Output</span>
                {isGenerating && (
                  <span className="flex items-center space-x-1 text-heat-100 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-heat-100 animate-pulse" />
                    <span>Streaming</span>
                  </span>
                )}
              </div>

              {/* Streaming Stats & Copy */}
              <div className="flex items-center space-x-2.5 text-[11px] font-mono text-slate-400">
                <span>{streamStats.tokens} tokens</span>
                <span>•</span>
                <span>{streamStats.tokensPerSec} t/s</span>
                <span>•</span>
                <span>{streamStats.elapsedMs} ms</span>
                {chatResponse && (
                  <button
                    onClick={copyToClipboard}
                    className="p-1 rounded-fc-sm hover:bg-fc-bg-lighter text-slate-400 hover:text-fc-accent-black transition-colors cursor-pointer"
                    title="Copy output"
                  >
                    {copied ? <Check className="w-3 h-3 text-fc-forest" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Output Text View */}
            <div
              ref={chatOutputRef}
              className="min-h-[200px] max-h-[380px] overflow-y-auto rounded-fc-sm bg-fc-bg-base border border-fc-border-muted p-3.5 text-xs font-mono text-fc-accent-black whitespace-pre-wrap leading-relaxed select-text transition-colors"
            >
              {chatResponse ? (
                <span>{chatResponse}</span>
              ) : isGenerating ? (
                <div className="flex flex-col items-center justify-center py-6 space-y-3">
                  <AsciiFlame opacity={0.7} />
                  <span className="text-slate-500 font-mono text-xs flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-heat-100 animate-pulse" />
                    <span>Streaming tokens via Liquid d1 & upstream model...</span>
                  </span>
                </div>
              ) : (
                <span className="text-slate-400 italic">
                  Run prompt to view token-by-token output and decision rationale...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Decision Intelligence Console (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Decision Fallback / Status Alert */}
          {Boolean(evaluation?.isFallback || evaluation?.fallbackReason) ? (
            <div className="rounded-fc-sm bg-fc-honey/10 border border-fc-honey/30 p-3.5 text-xs text-fc-honey flex items-start space-x-2.5 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-fc-honey shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-fc-honey text-xs">
                  Deterministic Fallback Active
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-snug">
                  {evaluation?.fallbackReason ||
                    'Liquid d1 unreachable or exceeded 10s timeout. Complexity and model choice calculated via heuristic rules.'}
                </p>
              </div>
            </div>
          ) : evaluation ? (
            <div className="rounded-fc-sm bg-fc-forest/10 border border-fc-forest/20 p-2.5 text-xs text-fc-forest flex items-center space-x-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-fc-forest shrink-0" />
              <span className="font-mono text-[11px]">
                Liquid d1 Neural Forward Pass: <strong>{evaluation.routingLatencyMs || 14} ms</strong>
              </span>
            </div>
          ) : null}

          {/* Interactive Decision Pipeline Node Graph */}
          <div className="rounded-fc-md bg-fc-surface border border-fc-border-muted p-5 space-y-3 shadow-xs transition-colors">
            <div className="flex items-center justify-between border-b border-fc-border-faint pb-2">
              <h2 className="font-medium text-fc-accent-black text-xs flex items-center space-x-1.5 uppercase tracking-wider font-mono">
                <GitBranch className="w-3.5 h-3.5 text-heat-100" />
                <span>Decision Flow Pipeline</span>
              </h2>
              <button
                onClick={() => setShowGraph(!showGraph)}
                className="text-[11px] font-mono text-slate-400 hover:text-fc-accent-black flex items-center space-x-1 cursor-pointer"
              >
                <span>{showGraph ? 'Collapse' : 'Expand'}</span>
                {showGraph ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {showGraph && (
              <div className="space-y-1.5 pt-0.5 font-mono text-xs">
                {/* Node 1: Ingestion */}
                <div className="p-3 rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-medium text-fc-accent-black">1. Prompt State Ingestion</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-fc-sm bg-fc-surface border border-fc-border-faint text-fc-accent-black">
                      ~{Math.round(prompt.length / 4)} tokens
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Input: {prompt.slice(0, 48) || 'Waiting for prompt...'}
                  </div>
                </div>

                <div className="flex justify-center text-slate-400">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 2: D1 System One Evaluation */}
                <div className="p-3 rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fc-forest">2. Liquid d1 Evaluation</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-fc-sm bg-fc-forest/10 text-fc-forest font-bold border border-fc-forest/20">
                      Score: {score.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                    <div>Domain: <span className="text-fc-accent-black font-bold">{evaluation?.domain || 'general'}</span></div>
                    <div>Latency: <span className="text-fc-accent-black font-bold">{evaluation?.routingLatencyMs || 14}ms</span></div>
                    <div>Tools: <span className={evaluation?.requiresTools ? 'text-fc-amethyst font-bold' : 'text-slate-400'}>{evaluation?.requiresTools ? 'Yes' : 'No'}</span></div>
                    <div>Vision: <span className={evaluation?.requiresVision ? 'text-fc-bluetron font-bold' : 'text-slate-400'}>{evaluation?.requiresVision ? 'Yes' : 'No'}</span></div>
                  </div>
                </div>

                <div className="flex justify-center text-slate-400">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 3: Policy Engine */}
                <div className="p-3 rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fc-amethyst">3. Policy Engine Resolution</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-fc-sm bg-fc-amethyst/10 text-fc-amethyst font-bold border border-fc-amethyst/20 uppercase">
                      {policy}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Evaluated against active models matching score {score.toFixed(2)} with capability requirements.
                  </div>
                </div>

                <div className="flex justify-center text-slate-400">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 4: Selected Target Model */}
                <div className="p-3 rounded-fc-sm bg-heat-4 border border-heat-40 text-fc-accent-black space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fc-accent-black flex items-center space-x-1.5">
                      <Sparkles className="w-3 h-3 text-heat-100" />
                      <span>4. Target Engine Selected</span>
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-fc-sm bg-fc-surface border border-heat-40 text-heat-100">
                      {evaluation?.selectedModel?.provider || 'ollama'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-heat-100">
                    {evaluation?.selectedModel?.display_name || 'Local Chat'} ({evaluation?.selectedModel?.upstream_model || 'lfm3:latest'})
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5">
                    <span>Range: [{evaluation?.selectedModel?.complexity_range?.[0]?.toFixed(1)}, {evaluation?.selectedModel?.complexity_range?.[1]?.toFixed(1)}]</span>
                    <span>Cost: ${evaluation?.selectedModel?.cost?.input_per_mtoken || 0}/1M</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Calibrated Complexity Spectrum Card */}
          <div className="rounded-fc-md bg-fc-surface border border-fc-border-muted p-5 space-y-3 shadow-xs transition-colors">
            <div className="flex items-center justify-between border-b border-fc-border-faint pb-2">
              <h2 className="font-medium text-fc-accent-black text-xs flex items-center space-x-1.5 uppercase tracking-wider font-mono">
                <Gauge className="w-3.5 h-3.5 text-heat-100" />
                <span>Complexity Spectrum</span>
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Score: <strong>{score.toFixed(2)}</strong> / 5.0
              </span>
            </div>

            {/* Readout & Meter */}
            <div className="rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint p-4 flex flex-col items-center justify-center space-y-2.5">
              <div className="text-center space-y-0.5">
                <div className="text-3xl font-bold font-mono tracking-tight text-fc-accent-black">
                  <span className={scoreStyle.text}>{score.toFixed(2)}</span>
                  <span className="text-sm text-slate-400 font-sans font-normal ml-1">/ 5.0</span>
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {scoreStyle.tier}
                </div>
              </div>

              {/* Calibrated Bar with Ticks */}
              <div className="w-full space-y-1 pt-1">
                <div className="w-full h-2 rounded-fc-full bg-fc-surface border border-fc-border-faint overflow-hidden">
                  <div
                    className={`h-full rounded-fc-full transition-all duration-300 ${scoreStyle.bg}`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>1.0 Local</span>
                  <span>3.0 Mid-Tier</span>
                  <span>5.0 Frontier</span>
                </div>
              </div>
            </div>

            {/* Classified Capabilities */}
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
              <div className="p-2.5 rounded-fc-sm bg-fc-bg-lighter border border-fc-border-faint text-fc-accent-black">
                <div className="text-slate-400 text-[10px]">Domain</div>
                <div className="font-bold">{evaluation?.domain || 'general'}</div>
              </div>
              <div className={`p-2.5 rounded-fc-sm border text-[11px] font-mono ${
                evaluation?.requiresTools
                  ? 'bg-fc-amethyst/10 border-fc-amethyst/30 text-fc-amethyst font-bold'
                  : 'bg-fc-bg-lighter border-fc-border-faint text-slate-500'
              }`}>
                <div className="text-slate-400 text-[10px]">Tools</div>
                <div>{evaluation?.requiresTools ? 'Required' : 'None'}</div>
              </div>
              <div className={`p-2.5 rounded-fc-sm border text-[11px] font-mono ${
                evaluation?.requiresVision
                  ? 'bg-fc-bluetron/10 border-fc-bluetron/30 text-fc-bluetron font-bold'
                  : 'bg-fc-bg-lighter border-fc-border-faint text-slate-500'
              }`}>
                <div className="text-slate-400 text-[10px]">Vision</div>
                <div>{evaluation?.requiresVision ? 'Required' : 'None'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
