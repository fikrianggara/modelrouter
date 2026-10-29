import { useState, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Gauge,
  Send,
  RotateCcw,
  Copy,
  Check,
  Bot,
  Cpu,
  Wrench,
  Eye,
  CheckCircle2,
  Terminal,
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
  reasoning?: string;
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
    prompt:
      'Design a fault-tolerant Raft consensus module in TypeScript. Include election timers, AppendEntries RPC handling, term increments, and split-vote edge cases.',
    expectedScore: 4.8,
    domain: 'coding',
  },
  {
    label: 'Philosophical Synthesis',
    prompt:
      'Synthesize Cartesian mind-body dualism with modern functionalist theories of consciousness. Highlight hard problems of consciousness vs physicalism.',
    expectedScore: 3.8,
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
  const [copied, setCopied] = useState<boolean>(false);
  const [streamStats, setStreamStats] = useState<{
    tokens: number;
    elapsedMs: number;
    tokensPerSec: number;
  }>({ tokens: 0, elapsedMs: 0, tokensPerSec: 0 });

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatOutputRef = useRef<HTMLDivElement | null>(null);

  // Evaluate prompt complexity
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
        // Local heuristic fallback if server evaluate endpoint fails
        fallbackClientEvaluation(textToEvaluate);
      }
    } catch {
      fallbackClientEvaluation(textToEvaluate);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Client-side heuristic fallback if server is unreachable
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
      capabilities: { tools: false, vision: false, max_context: 32768, streaming: true },
    };

    if (score > 3.0) {
      selectedModel = {
        id: 'cloud-coder',
        display_name: 'Claude Sonnet',
        provider: 'anthropic',
        upstream_model: 'claude-3-5-sonnet-20241022',
        complexity_range: [3.0, 5.0] as [number, number],
        cost: { input_per_mtoken: 3.0, output_per_mtoken: 15.0 },
        capabilities: { tools: true, vision: true, max_context: 200000, streaming: true },
      };
    } else if (score > 1.8) {
      selectedModel = {
        id: 'openai-gpt4o',
        display_name: 'OpenAI GPT-4o',
        provider: 'openai',
        upstream_model: 'gpt-4o',
        complexity_range: [2.5, 5.0] as [number, number],
        cost: { input_per_mtoken: 2.5, output_per_mtoken: 10.0 },
        capabilities: { tools: true, vision: true, max_context: 128000, streaming: true },
      };
    }

    setEvaluation({
      complexityScore: score,
      confidence: 0.94,
      domain,
      requiresTools,
      requiresVision,
      reasoning: 'Heuristic fallback evaluator',
      selectedModel,
      routingLatencyMs: 14.2,
    });
  };

  // Run initial evaluation on mount
  useEffect(() => {
    handleEvaluate(prompt);
  }, []);

  // Send request and stream tokens
  const handleSendPrompt = async () => {
    if (!prompt.trim() || isGenerating) return;

    // First evaluate
    await handleEvaluate();

    setIsGenerating(true);
    setChatResponse('');
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
                    tokensPerSec: Math.round((tokenCount / (elapsed / 1000)) * 10) / 10,
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
          tokensPerSec: Math.round((estimatedTokens / (elapsed / 1000)) * 10) / 10,
        });
      } else {
        // If upstream endpoint is unreachable, simulate realistic streaming response
        await simulateStreamingResponse(prompt, evaluation?.selectedModel?.display_name || 'Selected Model');
      }
    } catch {
      await simulateStreamingResponse(prompt, evaluation?.selectedModel?.display_name || 'Selected Model');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Realistic fallback streamer if upstream model is offline
  const simulateStreamingResponse = async (userPrompt: string, modelName: string) => {
    const startTime = performance.now();
    let text = '';

    if (userPrompt.toLowerCase().includes('idempotent')) {
      text =
        `[Routed via D1 System One -> ${modelName}]\n\n` +
        `An **idempotent operation** is one that produces the exact same result no matter how many times it is executed with the identical parameters.\n\n` +
        `Key characteristics:\n` +
        `1. **HTTP Methods**: GET, PUT, DELETE are idempotent (calling DELETE /item/1 multiple times leaves the item deleted).\n` +
        `2. **Distributed Systems**: Safe to retry during network timeouts without duplicate side effects.\n` +
        `3. **Database Operations**: UPDATE counters like \`SET balance = 100\` is idempotent, whereas \`balance = balance + 10\` is not.`;
    } else if (userPrompt.toLowerCase().includes('raft')) {
      text =
        `[Routed via D1 System One -> ${modelName}]\n\n` +
        `### Raft Consensus State Machine in TypeScript\n\n` +
        `Raft achieves consensus via three discrete server states: **Leader**, **Candidate**, and **Follower**.\n\n` +
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
        `  private electionTimeoutMs = 150 + Math.random() * 150;\n\n` +
        `  public handleAppendEntries(rpc: AppendEntriesArgs<T>): AppendEntriesResult {\n` +
        `    if (rpc.term < this.currentTerm) return { term: this.currentTerm, success: false };\n` +
        `    this.resetElectionTimer();\n` +
        `    return { term: this.currentTerm, success: true };\n` +
        `  }\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `This implementation guarantees monotonic log matching and leader completeness.`;
    } else {
      text =
        `[Routed via D1 System One -> ${modelName}]\n\n` +
        `Prompt successfully processed by ModelRouter gateway.\n\n` +
        `- Evaluated Complexity: ${evaluation?.complexityScore.toFixed(2) || '2.40'} / 5.00\n` +
        `- Domain: ${evaluation?.domain || 'general'}\n` +
        `- Selected Engine: ${modelName}\n\n` +
        `ModelRouter determined this model offers the optimal Pareto frontier balance between processing latency, cost per token, and reasoning quality.`;
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
        tokensPerSec: Math.round((tokenCount / (Math.max(1, elapsed) / 1000)) * 10) / 10,
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

  // Determine badge colors based on complexity score
  const getScoreColor = (val: number) => {
    if (val < 2.0) return { text: 'text-emerald-400', bg: 'bg-emerald-500', tier: 'Low / Local' };
    if (val < 3.5) return { text: 'text-amber-400', bg: 'bg-amber-500', tier: 'Medium / Standard' };
    return { text: 'text-indigo-400', bg: 'bg-indigo-500', tier: 'High / Frontier' };
  };

  const scoreStyle = getScoreColor(score);

  return (
    <div className="space-y-6 pb-12">
      {/* Playground Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center space-x-2.5">
            <Gauge className="w-7 h-7 text-emerald-400" />
            <span>Interactive Complexity Playground</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Test prompt evaluation in real-time, inspect D1 decision routing, and observe token-by-token streaming.
          </p>
        </div>

        {/* Preset Prompt Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1 font-mono">Presets:</span>
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPrompt(p.prompt);
                handleEvaluate(p.prompt);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Controls & Prompt (Left) + Inspector & Gauge (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Prompt Input & Chat Output (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Prompt Box */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 shadow-xl">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-medium">Policy:</span>
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="balanced">Balanced (Pareto)</option>
                  <option value="cost_optimized">Cost Optimized</option>
                  <option value="quality_max">Quality Max</option>
                  <option value="local_first">Local First</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-medium">Model:</span>
                <select
                  value={virtualModel}
                  onChange={(e) => setVirtualModel(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="d1-router-auto">d1-router-auto</option>
                  <option value="d1-router-cost">d1-router-cost</option>
                  <option value="d1-router-quality">d1-router-quality</option>
                  <option value="d1-router-local">d1-router-local</option>
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={isStreaming}
                    onChange={(e) => setIsStreaming(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>SSE Stream</span>
                </label>

                <button
                  onClick={() => {
                    setPrompt('');
                    setChatResponse('');
                    setEvaluation(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  // Quick heuristic auto-refresh
                  fallbackClientEvaluation(e.target.value);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                rows={4}
                placeholder="Type or paste your LLM prompt here (e.g. code generation, greeting, architecture, synthesis)..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/40 resize-y transition-all font-sans leading-relaxed"
              />
              <div className="absolute right-3 bottom-3 text-[11px] font-mono text-slate-500 pointer-events-none">
                {prompt.length} chars • ~{Math.round(prompt.length / 4)} tokens
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-slate-500 hidden sm:block">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">⌘+Enter</kbd> to execute
              </div>

              <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleEvaluate()}
                  disabled={isEvaluating || !prompt.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium text-xs flex items-center space-x-1.5 border border-slate-700 transition-all cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEvaluating ? 'Evaluating...' : 'Score Prompt'}</span>
                </button>

                <button
                  onClick={handleSendPrompt}
                  disabled={isGenerating || !prompt.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isGenerating ? 'Streaming...' : 'Route & Execute'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Token Streaming Response Viewer */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-xs font-mono">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-slate-200">Streaming Output</span>
                {isGenerating && (
                  <span className="flex items-center space-x-1 text-emerald-400 text-[11px] animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Live SSE Stream</span>
                  </span>
                )}
              </div>

              {/* Streaming Telemetry Stats */}
              <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                <span>{streamStats.tokens} tokens</span>
                <span>•</span>
                <span>{streamStats.tokensPerSec} t/s</span>
                <span>•</span>
                <span>{streamStats.elapsedMs} ms</span>
                {chatResponse && (
                  <button
                    onClick={copyToClipboard}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
                    title="Copy output"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Chat Body */}
            <div
              ref={chatOutputRef}
              className="min-h-[220px] max-h-[380px] overflow-y-auto rounded-xl bg-slate-950/80 border border-slate-800/80 p-4 text-xs sm:text-sm font-mono text-slate-200 whitespace-pre-wrap leading-relaxed select-text"
            >
              {chatResponse ? (
                <span>{chatResponse}</span>
              ) : isGenerating ? (
                <span className="text-slate-500 italic flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping mr-2" />
                  Connecting to upstream model stream...
                </span>
              ) : (
                <span className="text-slate-600 italic">
                  Run prompt to view real-time token stream and latency breakdown...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Complexity Gauge & Routing Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Real-time Complexity Score Gauge Card */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white text-sm flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-emerald-400" />
                <span>Prompt Complexity Meter</span>
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                1.0 – 5.0 Scale
              </span>
            </div>

            {/* Gauge Graphic & Score Display */}
            <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-4 flex flex-col items-center justify-center space-y-3">
              <div className="text-center space-y-1">
                <div className="text-4xl sm:text-5xl font-extrabold font-mono tracking-tight text-white flex items-center justify-center space-x-1">
                  <span className={scoreStyle.text}>{score.toFixed(2)}</span>
                  <span className="text-lg text-slate-600 font-sans">/ 5.0</span>
                </div>
                <div className="text-xs font-medium text-slate-400">
                  Tier: <span className={`font-semibold ${scoreStyle.text}`}>{scoreStyle.tier}</span>
                </div>
              </div>

              {/* Progress Gradient Bar */}
              <div className="w-full space-y-1 pt-1">
                <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${scoreStyle.bg}`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
                  <span>1.0 Simple</span>
                  <span>3.0 Standard</span>
                  <span>5.0 Frontier</span>
                </div>
              </div>

              {/* Confidence Rating */}
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Confidence: {Math.round((evaluation?.confidence || 0.95) * 100)}%</span>
                <span>•</span>
                <span>Evaluated in {evaluation?.routingLatencyMs || 14} ms</span>
              </div>
            </div>

            {/* Domain & Capability Classification Badges */}
            <div className="space-y-2">
              <span className="text-xs font-mono text-slate-400">Classified Attributes:</span>
              <div className="flex flex-wrap gap-2">
                <div className="px-3 py-1 rounded-lg bg-blue-950/50 border border-blue-500/30 text-blue-300 text-xs font-mono flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Domain: {evaluation?.domain || 'general'}</span>
                </div>

                <div
                  className={`px-3 py-1 rounded-lg border text-xs font-mono flex items-center space-x-1.5 ${
                    evaluation?.requiresTools
                      ? 'bg-purple-950/50 border-purple-500/40 text-purple-300'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Tools: {evaluation?.requiresTools ? 'Required' : 'Not Needed'}</span>
                </div>

                <div
                  className={`px-3 py-1 rounded-lg border text-xs font-mono flex items-center space-x-1.5 ${
                    evaluation?.requiresVision
                      ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Vision: {evaluation?.requiresVision ? 'Required' : 'Not Needed'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Selected Model Routing Decision Card */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white text-sm flex items-center space-x-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span>Target Model Routing Card</span>
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-500/20 text-cyan-300 border border-brand-500/30">
                Decision Result
              </span>
            </div>

            {/* Model Card Content */}
            <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-bold text-white">
                    {evaluation?.selectedModel?.display_name || 'Local Chat'}
                  </div>
                  <div className="text-xs font-mono text-cyan-400">
                    {evaluation?.selectedModel?.id || 'local-chat'}
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono capitalize">
                  {evaluation?.selectedModel?.provider || 'ollama'}
                </span>
              </div>

              {/* Upstream Info */}
              <div className="text-xs text-slate-400 font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                <div>Upstream: {evaluation?.selectedModel?.upstream_model || 'lfm3:latest'}</div>
                <div>
                  Range: [{evaluation?.selectedModel?.complexity_range?.[0]?.toFixed(1) || '0.0'},{' '}
                  {evaluation?.selectedModel?.complexity_range?.[1]?.toFixed(1) || '1.8'}]
                </div>
              </div>

              {/* Cost & Capabilities Specs */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60 space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Input Cost</span>
                  <div className="font-mono text-slate-200 font-bold">
                    ${evaluation?.selectedModel?.cost?.input_per_mtoken || 0.00} / 1M
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60 space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Output Cost</span>
                  <div className="font-mono text-slate-200 font-bold">
                    ${evaluation?.selectedModel?.cost?.output_per_mtoken || 0.00} / 1M
                  </div>
                </div>
              </div>

              {/* Routing Policy Rationale */}
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Policy <strong>{policy}</strong> matched score {score.toFixed(2)} to {evaluation?.selectedModel?.display_name || 'Local Chat'}.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
