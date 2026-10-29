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
  Info,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  AlertCircle,
} from 'lucide-react';

export const Route = createFileRoute('/registry')({
  component: RegistryPage,
});

export interface ModelSpec {
  id: string;
  display_name?: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'openrouter' | '9router' | 'custom';
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
  enabled?: boolean;
}

export function RegistryPage() {
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [showRawYaml, setShowRawYaml] = useState<boolean>(false);
  const [copiedYaml, setCopiedYaml] = useState<boolean>(false);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ModelSpec>({
    id: '',
    display_name: '',
    provider: 'ollama',
    upstream_model: '',
    base_url: 'http://localhost:11434/v1',
    api_key_env: '',
    complexity_range: [1.0, 3.0],
    tags: ['local', 'coding'],
    capabilities: {
      tools: true,
      vision: false,
      max_context: 32768,
      streaming: true,
    },
    cost: {
      input_per_mtoken: 0,
      output_per_mtoken: 0,
    },
    enabled: true,
  });

  const loadRegistry = async () => {
    try {
      const res = await fetch('/api/registry');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
          setModels(data.models);
        }
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    loadRegistry();
  }, []);

  // Handle Toggle Active/Disabled
  const handleToggle = async (id: string, currentEnabled: boolean = true) => {
    try {
      const res = await fetch(`/api/registry/model/${encodeURIComponent(id)}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        setModels((prev) =>
          prev.map((m) => (m.id === id ? { ...m, enabled: !currentEnabled } : m))
        );
      }
    } catch {
      // ignore
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete model "${id}" from the registry?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/registry/model/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setModels((prev) => prev.filter((m) => m.id !== id));
      }
    } catch {
      // ignore
    }
  };

  // Open Modal for Add
  const openAddModal = () => {
    setModalMode('add');
    setFormError(null);
    setFormData({
      id: '',
      display_name: '',
      provider: 'ollama',
      upstream_model: '',
      base_url: 'http://localhost:11434/v1',
      api_key_env: '',
      complexity_range: [1.0, 3.0],
      tags: ['local', 'coding'],
      capabilities: {
        tools: true,
        vision: false,
        max_context: 32768,
        streaming: true,
      },
      cost: {
        input_per_mtoken: 0,
        output_per_mtoken: 0,
      },
      enabled: true,
    });
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const openEditModal = (model: ModelSpec) => {
    setModalMode('edit');
    setFormError(null);
    setFormData({ ...model });
    setIsModalOpen(true);
  };

  // Submit Modal
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.id.trim()) {
      setFormError('Model ID is required.');
      return;
    }
    if (!formData.upstream_model.trim()) {
      setFormError('Upstream Model identifier is required.');
      return;
    }

    try {
      const url =
        modalMode === 'add'
          ? '/api/registry/model'
          : `/api/registry/model/${encodeURIComponent(formData.id)}`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save model');
      }

      setIsModalOpen(false);
      await loadRegistry();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    }
  };

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

  const rawYamlContent =
    `version: "1.0"\nmodels:\n` +
    models
      .map(
        (m) =>
          `  - id: "${m.id}"\n    display_name: "${m.display_name || ''}"\n    provider: "${m.provider}"\n    upstream_model: "${m.upstream_model}"\n    base_url: "${m.base_url}"\n    complexity_range: [${m.complexity_range[0]}, ${m.complexity_range[1]}]\n    enabled: ${m.enabled !== false}\n    tags: [${m.tags.map((t) => `"${t}"`).join(', ')}]`
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 transition-colors">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2.5">
            <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            <span>Model Registry & Dynamic Tag Explorer</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure upstream models, manage active status, complexity intervals, capability tags, and pricing parameters.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={openAddModal}
            className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Model</span>
          </button>

          <button
            onClick={() => setShowRawYaml(!showRawYaml)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
            <span>{showRawYaml ? 'Hide YAML' : 'View YAML'}</span>
          </button>
        </div>
      </div>

      {/* Decision Evaluator vs. Upstream Models Architecture Note */}
      <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-700 dark:text-cyan-300 flex items-start space-x-3 shadow-sm transition-colors">
        <Info className="w-5 h-5 text-brand-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-slate-900 dark:text-white text-sm">
            Architecture Clarification: Evaluator vs. Upstream Execution Models
          </p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs">
            <strong>Liquid AI d1</strong> is our dedicated Decision Model running via Ollama (<code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px] font-mono">/v1/systemone</code>). It evaluates task complexity (1–5) and attributes with 0 output tokens.
            The models below are <strong>Upstream Execution Models</strong> (from Ollama local, 9router, OpenAI, Anthropic). You can freely add new models, update their complexity ranges, or toggle them on/off in real-time.
          </p>
        </div>
      </div>

      {/* Raw YAML Drawer / Viewer */}
      {showRawYaml && (
        <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 space-y-3 animate-in fade-in duration-200 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
            <span>config/registry.yaml</span>
            <button
              onClick={copyYaml}
              className="flex items-center space-x-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {copiedYaml ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedYaml ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-cyan-600 dark:text-cyan-300/90 overflow-x-auto p-2 bg-slate-50 dark:bg-slate-900/60 rounded-xl leading-relaxed">
            {rawYamlContent}
          </pre>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-sm dark:shadow-xl transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by model ID, name, tag (e.g. coding, local, frontier)..."
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all font-sans"
            />
          </div>

          {/* Provider Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono self-start md:self-auto">
            {['all', 'ollama', '9router', 'anthropic', 'openai'].map((prov) => (
              <button
                key={prov}
                onClick={() => setSelectedProvider(prov)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  selectedProvider === prov
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {prov === 'ollama' ? 'Ollama' : prov}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/60">
          <span className="text-xs font-mono text-slate-400 mr-1">Tags:</span>
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
              selectedTag === 'all'
                ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
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
                  ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
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
          const isEnabled = model.enabled !== false;
          const [minComp, maxComp] = model.complexity_range;
          const leftPercent = (minComp / 5) * 100;
          const widthPercent = ((maxComp - minComp) / 5) * 100;

          const providerTheme =
            model.provider === 'ollama'
              ? { border: 'border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' }
              : model.provider === '9router'
              ? { border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' }
              : model.provider === 'anthropic'
              ? { border: 'border-indigo-500/30', badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500' }
              : { border: 'border-cyan-500/30', badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', bar: 'bg-cyan-500' };

          return (
            <div
              key={model.id}
              className={`rounded-2xl bg-white dark:bg-slate-900/70 border ${
                isEnabled ? providerTheme.border : 'border-slate-300 dark:border-slate-800 opacity-60 grayscale-[40%]'
              } p-5 space-y-4 shadow-sm dark:shadow-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 transition-all`}
            >
              {/* Card Top */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                        {model.display_name || model.id}
                      </h2>
                      {!isEnabled && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-brand-600 dark:text-cyan-400 font-medium">
                      {model.id}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-mono uppercase font-bold border border-slate-200 dark:border-slate-700/60 ${providerTheme.badge}`}
                  >
                    {model.provider}
                  </span>
                </div>

                {/* Upstream & Base URL info */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 space-y-1.5 text-xs font-mono transition-colors">
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="text-slate-400">Upstream:</span>
                    <span className="font-semibold truncate max-w-[180px]">
                      {model.upstream_model}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                    <span className="text-slate-400">Base URL:</span>
                    <span className="truncate max-w-[180px]">{model.base_url}</span>
                  </div>
                  {model.api_key_env && (
                    <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400/90 pt-0.5 border-t border-slate-200 dark:border-slate-800/60">
                      <span className="text-slate-400">Auth Env:</span>
                      <span>${model.api_key_env}</span>
                    </div>
                  )}
                </div>

                {/* Complexity Range Visual Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500 dark:text-slate-400">Complexity Range:</span>
                    <span className="text-brand-600 dark:text-cyan-300 font-bold">
                      [{minComp.toFixed(1)} – {maxComp.toFixed(1)}]
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full ${providerTheme.bar}`}
                      style={{
                        marginLeft: `${leftPercent}%`,
                        width: `${Math.max(8, widthPercent)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    <span>0.0</span>
                    <span>2.5</span>
                    <span>5.0</span>
                  </div>
                </div>

                {/* Capabilities Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60">
                    <Wrench className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">Tools:</span>
                    <span className={model.capabilities.tools ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                      {model.capabilities.tools ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">Vision:</span>
                    <span className={model.capabilities.vision ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : 'text-slate-400'}>
                      {model.capabilities.vision ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60">
                    <Zap className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">Context:</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium">
                      {Math.round(model.capabilities.max_context / 1024)}K
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">Stream:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
                  </div>
                </div>

                {/* Cost Specs */}
                <div className="flex items-center justify-between text-xs font-mono bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                  <span>Price / 1M Tokens:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 dark:text-slate-400">In: ${model.cost.input_per_mtoken}</span>
                    <span>•</span>
                    <span className="text-slate-500 dark:text-slate-400">Out: ${model.cost.output_per_mtoken}</span>
                  </div>
                </div>

                {/* Tags Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {model.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] font-mono text-slate-700 dark:text-slate-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer: Toggle, Edit, Delete Actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggle(model.id, isEnabled)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    isEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700 hover:text-slate-700'
                  }`}
                  title={isEnabled ? 'Click to disable' : 'Click to enable'}
                >
                  {isEnabled ? (
                    <ToggleRight className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                </button>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => openEditModal(model)}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title="Edit Model Configuration"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(model.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                    title="Delete Model from Registry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal Drawer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
                <span>{modalMode === 'add' ? 'Add New Execution Model' : `Edit Model: ${formData.id}`}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Model ID *</label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g. qwen-coder-local"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name || ''}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g. Qwen 2.5 Coder 7B"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Provider *</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  >
                    <option value="ollama">ollama (Local)</option>
                    <option value="9router">9router (Local Gateway)</option>
                    <option value="openai">openai</option>
                    <option value="anthropic">anthropic</option>
                    <option value="openrouter">openrouter</option>
                    <option value="custom">custom</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Upstream Model *</label>
                  <input
                    type="text"
                    required
                    value={formData.upstream_model}
                    onChange={(e) => setFormData({ ...formData, upstream_model: e.target.value })}
                    placeholder="e.g. qwen2.5-coder:7b"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Base URL *</label>
                <input
                  type="text"
                  required
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                  placeholder="e.g. http://localhost:11434/v1 or http://localhost:20128/v1"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">API Key Env Variable (Optional)</label>
                <input
                  type="text"
                  value={formData.api_key_env || ''}
                  onChange={(e) => setFormData({ ...formData, api_key_env: e.target.value || null })}
                  placeholder="e.g. OPENAI_API_KEY (leave blank for local)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Complexity Min (0.0 - 5.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={formData.complexity_range[0]}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        complexity_range: [parseFloat(e.target.value) || 0, formData.complexity_range[1]],
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Complexity Max (0.0 - 5.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={formData.complexity_range[1]}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        complexity_range: [formData.complexity_range[0], parseFloat(e.target.value) || 5],
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags.join(', ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="e.g. local, coding, fast, tools"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Input Cost ($/1M Tokens)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost.input_per_mtoken}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cost: { ...formData.cost, input_per_mtoken: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">Output Cost ($/1M Tokens)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost.output_per_mtoken}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cost: { ...formData.cost, output_per_mtoken: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-2">
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.capabilities.tools}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capabilities: { ...formData.capabilities, tools: e.target.checked },
                      })
                    }
                    className="rounded text-brand-600"
                  />
                  <span>Tools Supported</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.capabilities.vision}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capabilities: { ...formData.capabilities, vision: e.target.checked },
                      })
                    }
                    className="rounded text-brand-600"
                  />
                  <span>Vision Supported</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.enabled !== false}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded text-brand-600"
                  />
                  <span>Enabled (Active)</span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 cursor-pointer"
                >
                  {modalMode === 'add' ? 'Save Model' : 'Update Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
