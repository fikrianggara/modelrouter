import { useState, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Layers,
  Search,
  Zap,
  Gauge,
  CheckCircle2,
  Wrench,
  Eye,
  FileText,
  Copy,
  Check,
} from 'lucide-react';

export const Route = createFileRoute('/registry')({
  component: RegistryPage,
});

interface ModelSpec {
  id: string;
  display_name?: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
  upstream_model: string;
  base_url: string;
  api_key_env?: string | null;
  complexity_range: [number, number];
  tags: string[];
  capabilities: {
    tools: boolean;
    vision: boolean;
    max_context: number;
    streaming: boolean;
  };
  cost: {
    input_per_mtoken: number;
    output_per_mtoken: number;
  };
}

const DEFAULT_MODELS: ModelSpec[] = [
  {
    id: 'local-chat',
    display_name: 'Local Chat',
    provider: 'ollama',
    upstream_model: 'lfm3:latest',
    base_url: 'http://localhost:11434/v1',
    complexity_range: [0.0, 1.8],
    tags: ['local', 'chat'],
    capabilities: {
      tools: false,
      vision: false,
      max_context: 32768,
      streaming: true,
    },
    cost: {
      input_per_mtoken: 0.0,
      output_per_mtoken: 0.0,
    },
  },
  {
    id: 'cloud-coder',
    display_name: 'Claude Sonnet',
    provider: 'anthropic',
    upstream_model: 'claude-3-5-sonnet-20241022',
    base_url: 'https://api.anthropic.com/v1',
    api_key_env: 'ANTHROPIC_API_KEY',
    complexity_range: [3.0, 5.0],
    tags: ['coding', 'frontier', 'tools'],
    capabilities: {
      tools: true,
      vision: true,
      max_context: 200000,
      streaming: true,
    },
    cost: {
      input_per_mtoken: 3.0,
      output_per_mtoken: 15.0,
    },
  },
  {
    id: 'openai-gpt4o',
    display_name: 'OpenAI GPT-4o',
    provider: 'openai',
    upstream_model: 'gpt-4o',
    base_url: 'https://api.openai.com/v1',
    api_key_env: 'OPENAI_API_KEY',
    complexity_range: [2.5, 5.0],
    tags: ['cloud', 'frontier', 'tools', 'vision'],
    capabilities: {
      tools: true,
      vision: true,
      max_context: 128000,
      streaming: true,
    },
    cost: {
      input_per_mtoken: 2.5,
      output_per_mtoken: 10.0,
    },
  },
];

export function RegistryPage() {
  const [models, setModels] = useState<ModelSpec[]>(DEFAULT_MODELS);
  const [search, setSearch] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [showRawYaml, setShowRawYaml] = useState<boolean>(false);
  const [copiedYaml, setCopiedYaml] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/registry')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  // Collect unique tags
  const allTags = Array.from(new Set(models.flatMap((m) => m.tags)));

  // Filter models
  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      (m.display_name && m.display_name.toLowerCase().includes(search.toLowerCase())) ||
      m.upstream_model.toLowerCase().includes(search.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));

    const matchesProvider =
      selectedProvider === 'all' || m.provider === selectedProvider;

    const matchesTag =
      selectedTag === 'all' || m.tags.includes(selectedTag);

    return matchesSearch && matchesProvider && matchesTag;
  });

  const rawYamlContent = `version: "1.0"\nmodels:\n` +
    models
      .map(
        (m) =>
          `  - id: "${m.id}"\n    display_name: "${m.display_name}"\n    provider: "${m.provider}"\n    upstream_model: "${m.upstream_model}"\n    base_url: "${m.base_url}"\n    complexity_range: [${m.complexity_range[0]}, ${m.complexity_range[1]}]\n    tags: [${m.tags.map((t) => `"${t}"`).join(', ')}]`
      )
      .join('\n\n');

  const copyYaml = () => {
    navigator.clipboard.writeText(rawYamlContent);
    setCopiedYaml(true);
    setTimeout(() => setCopiedYaml(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Registry Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center space-x-2.5">
            <Layers className="w-7 h-7 text-purple-400" />
            <span>Model Registry & Dynamic Tag Explorer</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configured execution models mapped against complexity intervals, capability tags, and cost parameters.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowRawYaml(!showRawYaml)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showRawYaml ? 'Hide YAML' : 'View YAML Spec'}</span>
          </button>
        </div>
      </div>

      {/* Raw YAML Drawer / Viewer */}
      {showRawYaml && (
        <div className="rounded-2xl bg-slate-950 border border-slate-800 p-5 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
            <span>config/registry.yaml</span>
            <button
              onClick={copyYaml}
              className="flex items-center space-x-1 hover:text-white cursor-pointer"
            >
              {copiedYaml ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedYaml ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-cyan-300/90 overflow-x-auto p-2 bg-slate-900/60 rounded-xl leading-relaxed">
            {rawYamlContent}
          </pre>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by model ID, name, tag (e.g. coding, local, frontier)..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all font-sans"
            />
          </div>

          {/* Provider Tabs */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono self-start md:self-auto">
            {['all', 'ollama', 'anthropic', 'openai'].map((prov) => (
              <button
                key={prov}
                onClick={() => setSelectedProvider(prov)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  selectedProvider === prov
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {prov === 'ollama' ? 'Ollama (Local)' : prov}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60">
          <span className="text-xs font-mono text-slate-500 mr-1">Tags:</span>
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
              selectedTag === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            all ({models.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
                selectedTag === tag
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {filteredModels.map((model) => {
          const [minComp, maxComp] = model.complexity_range;
          const leftPercent = (minComp / 5) * 100;
          const widthPercent = ((maxComp - minComp) / 5) * 100;

          const providerTheme =
            model.provider === 'ollama'
              ? { border: 'border-emerald-500/30', badge: 'bg-emerald-950/60 text-emerald-400', bar: 'bg-emerald-500' }
              : model.provider === 'anthropic'
              ? { border: 'border-indigo-500/30', badge: 'bg-indigo-950/60 text-indigo-400', bar: 'bg-indigo-500' }
              : { border: 'border-cyan-500/30', badge: 'bg-cyan-950/60 text-cyan-400', bar: 'bg-cyan-500' };

          return (
            <div
              key={model.id}
              className={`rounded-2xl bg-slate-900/70 border ${providerTheme.border} p-5 space-y-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all`}
            >
              {/* Card Top */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {model.display_name || model.id}
                    </h2>
                    <span className="text-xs font-mono text-cyan-400 font-medium">
                      {model.id}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono uppercase font-bold border border-slate-700/60 ${providerTheme.badge}`}
                  >
                    {model.provider}
                  </span>
                </div>

                {/* Upstream & Base URL info */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Upstream:</span>
                    <span className="text-white font-semibold truncate max-w-[180px]">
                      {model.upstream_model}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="text-slate-500">Base URL:</span>
                    <span className="truncate max-w-[180px]">{model.base_url}</span>
                  </div>
                  {model.api_key_env && (
                    <div className="flex items-center justify-between text-[11px] text-amber-400/90 pt-0.5 border-t border-slate-800/60">
                      <span className="text-slate-500">Auth Env:</span>
                      <span>${model.api_key_env}</span>
                    </div>
                  )}
                </div>

                {/* Complexity Range Visual Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Complexity Range:</span>
                    <span className="text-cyan-300 font-bold">
                      [{minComp.toFixed(1)} – {maxComp.toFixed(1)}]
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full ${providerTheme.bar}`}
                      style={{
                        marginLeft: `${leftPercent}%`,
                        width: `${Math.max(8, widthPercent)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>0.0</span>
                    <span>2.5</span>
                    <span>5.0</span>
                  </div>
                </div>

                {/* Capabilities Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <Wrench className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Tools:</span>
                    <span className={model.capabilities.tools ? 'text-emerald-400' : 'text-slate-500'}>
                      {model.capabilities.tools ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Vision:</span>
                    <span className={model.capabilities.vision ? 'text-cyan-400' : 'text-slate-500'}>
                      {model.capabilities.vision ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <Zap className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Context:</span>
                    <span className="text-slate-200">
                      {Math.round(model.capabilities.max_context / 1024)}K
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Stream:</span>
                    <span className="text-emerald-400">Active</span>
                  </div>
                </div>

                {/* Cost Specs */}
                <div className="flex items-center justify-between text-xs font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60 text-slate-300">
                  <span>Price / 1M Tokens:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">In: ${model.cost.input_per_mtoken}</span>
                    <span>•</span>
                    <span className="text-slate-400">Out: ${model.cost.output_per_mtoken}</span>
                  </div>
                </div>

                {/* Tags Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {model.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[11px] font-mono text-slate-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer: Action */}
              <div className="pt-4 border-t border-slate-800/60">
                <Link
                  to="/playground"
                  className="w-full inline-flex items-center justify-center space-x-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Launch in Playground</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
