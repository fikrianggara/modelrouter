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
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500',
        tier: 'Low Complexity (Local Free Tier)',
      };
    if (val < 3.5)
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500',
        tier: 'Standard Complexity (Mid-tier Engine)',
      };
    return {
      text: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-500',
      tier: 'Advanced Complexity (Frontier Engine)',
    };
  };

  const scoreStyle = getScoreColor(score);

  return (
    <div className="space-y-6 pb-12">
      {/* Workbench Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center space-x-2">
            <Gauge className="w-5 h-5 text-blue-500" />
            <span>Decision Intelligence Playground</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              className="px-2.5 py-1 rounded text-xs font-mono bg-white dark:bg-[#11131B] hover:bg-slate-50 dark:hover:bg-[#1A1D27] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
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
          <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-3 shadow-sm transition-colors">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Policy Segmented Control */}
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Policy:</span>
                <div className="flex bg-slate-100 dark:bg-[#171A24] p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                  {(['balanced', 'cost_optimized', 'quality_max', 'local_first'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPolicy(p)}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                        policy === p
                          ? 'bg-white dark:bg-[#252938] text-slate-900 dark:text-white font-bold shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
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
                  className="bg-slate-100 dark:bg-[#171A24] border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-blue-500 font-mono"
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
                    className="rounded bg-slate-100 dark:bg-[#171A24] border-slate-300 dark:border-slate-800 text-blue-600 focus:ring-0 w-3 h-3"
                  />
                  <span className="font-mono text-[11px]">Stream</span>
                </label>

                <button
                  onClick={() => {
                    setPrompt('');
                    setChatResponse('');
                    setEvaluation(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
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
                className="w-full bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800/80 rounded-lg p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500/80 resize-y transition-colors font-sans leading-relaxed"
              />
              <div className="absolute right-2.5 bottom-2.5 text-[10px] font-mono text-slate-400 pointer-events-none">
                {prompt.length} chars • ~{Math.round(prompt.length / 4)} tokens
              </div>
            </div>

            {/* Execute Buttons */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">⌘+Enter</kbd> to execute
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleEvaluate()}
                  disabled={isEvaluating || !prompt.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1A1D27] dark:hover:bg-[#222634] disabled:opacity-50 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center space-x-1.5 border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5 text-blue-500" />
                  <span>{isEvaluating ? 'Evaluating...' : 'Score Prompt'}</span>
                </button>

                <button
                  onClick={handleSendPrompt}
                  disabled={isGenerating || !prompt.trim()}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isGenerating ? 'Streaming...' : 'Route & Execute'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Upstream Notice Banner (if any) */}
          {upstreamNotice && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-center space-x-2 transition-all">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <span>{upstreamNotice}</span>
            </div>
          )}

          {/* Streaming Output Card */}
          <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-3 shadow-sm transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2.5">
              <div className="flex items-center space-x-2 text-xs font-mono">
                <Terminal className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Execution Output</span>
                {isGenerating && (
                  <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Copy output"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Output Text View */}
            <div
              ref={chatOutputRef}
              className="min-h-[200px] max-h-[380px] overflow-y-auto rounded-lg bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800/80 p-3.5 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-text transition-colors"
            >
              {chatResponse ? (
                <span>{chatResponse}</span>
              ) : isGenerating ? (
                <span className="text-slate-400 italic flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5" />
                  Connecting to upstream model stream...
                </span>
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
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-700 dark:text-amber-300 flex items-start space-x-2.5 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-800 dark:text-amber-200 text-xs">
                  Deterministic Fallback Active
                </div>
                <p className="text-amber-700/90 dark:text-amber-300/90 text-[11px] leading-snug">
                  {evaluation?.fallbackReason ||
                    'Liquid d1 unreachable or exceeded 10s timeout. Complexity and model choice calculated via heuristic rules.'}
                </p>
              </div>
            </div>
          ) : evaluation ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-mono text-[11px]">
                Liquid d1 Neural Forward Pass: <strong>{evaluation.routingLatencyMs || 14} ms</strong>
              </span>
            </div>
          ) : null}

          {/* Interactive Decision Pipeline Node Graph */}
          <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-3 shadow-sm transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h2 className="font-bold text-slate-900 dark:text-white text-xs flex items-center space-x-1.5 uppercase tracking-wider font-mono">
                <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                <span>Decision Flow Pipeline</span>
              </h2>
              <button
                onClick={() => setShowGraph(!showGraph)}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
              >
                <span>{showGraph ? 'Collapse' : 'Expand'}</span>
                {showGraph ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {showGraph && (
              <div className="space-y-1.5 pt-0.5 font-mono text-xs">
                {/* Node 1: Ingestion */}
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">1. Prompt State Ingestion</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      ~{Math.round(prompt.length / 4)} tokens
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Input: {prompt.slice(0, 48) || 'Waiting for prompt...'}
                  </div>
                </div>

                <div className="flex justify-center text-slate-300 dark:text-slate-700">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 2: D1 System One Evaluation */}
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">2. Liquid d1 Evaluation</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                      Score: {score.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                    <div>Domain: <span className="text-slate-900 dark:text-slate-200 font-bold">{evaluation?.domain || 'general'}</span></div>
                    <div>Latency: <span className="text-slate-900 dark:text-slate-200 font-bold">{evaluation?.routingLatencyMs || 14}ms</span></div>
                    <div>Tools: <span className={evaluation?.requiresTools ? 'text-purple-500 font-bold' : 'text-slate-400'}>{evaluation?.requiresTools ? 'Yes' : 'No'}</span></div>
                    <div>Vision: <span className={evaluation?.requiresVision ? 'text-blue-500 font-bold' : 'text-slate-400'}>{evaluation?.requiresVision ? 'Yes' : 'No'}</span></div>
                  </div>
                </div>

                <div className="flex justify-center text-slate-300 dark:text-slate-700">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 3: Policy Engine */}
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-600 dark:text-purple-400">3. Policy Engine Resolution</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 uppercase">
                      {policy}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Evaluated against active models matching score {score.toFixed(2)} with capability requirements.
                  </div>
                </div>

                <div className="flex justify-center text-slate-300 dark:text-slate-700">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </div>

                {/* Node 4: Selected Target Model */}
                <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-[#171A24] border border-blue-500/30 text-blue-700 dark:text-blue-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                      <Sparkles className="w-3 h-3 text-blue-500" />
                      <span>4. Target Engine Selected</span>
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white dark:bg-[#11131B] border border-blue-500/30">
                      {evaluation?.selectedModel?.provider || 'ollama'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
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
          <div className="rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-slate-800/80 p-4 space-y-3 shadow-sm transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h2 className="font-bold text-slate-900 dark:text-white text-xs flex items-center space-x-1.5 uppercase tracking-wider font-mono">
                <Gauge className="w-3.5 h-3.5 text-blue-500" />
                <span>Complexity Spectrum</span>
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Score: <strong>{score.toFixed(2)}</strong> / 5.0
              </span>
            </div>

            {/* Readout & Meter */}
            <div className="rounded-lg bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800 p-3 flex flex-col items-center justify-center space-y-2.5">
              <div className="text-center space-y-0.5">
                <div className="text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                  <span className={scoreStyle.text}>{score.toFixed(2)}</span>
                  <span className="text-sm text-slate-400 font-sans font-normal ml-1">/ 5.0</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {scoreStyle.tier}
                </div>
              </div>

              {/* Calibrated Bar with Ticks */}
              <div className="w-full space-y-1 pt-1">
                <div className="w-full h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded transition-all duration-300 ${scoreStyle.bg}`}
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
              <div className="p-2 rounded bg-slate-50 dark:bg-[#0D0F16] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <div className="text-slate-400 text-[10px]">Domain</div>
                <div className="font-bold">{evaluation?.domain || 'general'}</div>
              </div>
              <div className={`p-2 rounded border text-[11px] font-mono ${
                evaluation?.requiresTools
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 font-bold'
                  : 'bg-slate-50 dark:bg-[#0D0F16] border-slate-200 dark:border-slate-800 text-slate-500'
              }`}>
                <div className="text-slate-400 text-[10px]">Tools</div>
                <div>{evaluation?.requiresTools ? 'Required' : 'None'}</div>
              </div>
              <div className={`p-2 rounded border text-[11px] font-mono ${
                evaluation?.requiresVision
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-slate-50 dark:bg-[#0D0F16] border-slate-200 dark:border-slate-800 text-slate-500'
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
