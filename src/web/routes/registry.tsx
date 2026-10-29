import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Layers,
  Search,
  Zap,
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

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete model "${id}" from the active registry?`)) {
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

  const openEditModal = (model: ModelSpec) => {
    setModalMode('edit');
    setFormError(null);
    setFormData({ ...model });
    setIsModalOpen(true);
  };

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

  const allTags = Array.from(new Set(models.flatMap((m) => m.tags)));

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
    <div className="space-y-8 pb-16">
      {/* Section Metadata & Header */}
      <section className="space-y-3">
        <div className="flex items-center space-x-2 text-xs font-mono text-fc-muted">
          <span className="text-heat-100 font-bold">[ 01 / 01 ]</span>
          <span>·</span>
          <span>Model Registry</span>
          <span className="text-fc-muted-soft">//</span>
          <span className="text-fc-muted-soft">Execution Fleet Matrix</span>
          <span className="text-fc-muted-soft">//</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-medium tracking-tight text-fc-graphite">
              Registered <span className="text-heat-100">execution engines</span>.
            </h1>
            <p className="text-xs sm:text-sm text-fc-body-soft mt-1">
              Configure upstream models, active status, complexity intervals, and pricing metrics.
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={openAddModal}
              className="btn-heat-cta px-4 py-2 rounded-fc-8 text-xs font-medium flex items-center space-x-1.5 cursor-pointer shadow-fc-heat-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Model</span>
            </button>

            <button
              onClick={() => setShowRawYaml(!showRawYaml)}
              className="btn-ghost-outline px-3.5 py-2 rounded-fc-8 text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-heat-100" />
              <span>{showRawYaml ? 'Hide YAML' : 'View [ .YAML ]'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Architecture Clarification Note with Halo */}
      <div className="relative rounded-fc-12 bg-fc-surface border border-fc-border-muted p-5 text-xs text-fc-muted flex items-start space-x-3.5 widget-halo">
        <span className="corner-crosshair top-2 left-2">+</span>
        <span className="corner-crosshair top-2 right-2">+</span>
        <Info className="w-4 h-4 text-heat-100 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-fc-graphite text-xs">
            Architecture Blueprint: Evaluator Head vs. Upstream Execution Engines
          </div>
          <p className="leading-relaxed text-[11px] text-fc-body">
            <strong>Liquid AI d1</strong> is our dedicated System One Decision Model running locally in Ollama (<code className="px-1.5 py-0.5 rounded-fc-4 bg-fc-bg-lighter border border-fc-border-faint font-mono font-bold text-heat-100">/v1/systemone</code>). It consumes zero output tokens to classify task complexity (1–5). The entries below represent the <strong>Upstream Execution Engines</strong> that receive the request payload once routing is resolved.
          </p>
        </div>
      </div>

      {/* Raw YAML Drawer */}
      {showRawYaml && (
        <div className="relative rounded-fc-12 bg-fc-surface border border-fc-border-muted p-6 space-y-3 animate-in fade-in duration-150 widget-halo">
          <span className="corner-crosshair top-2 left-2">+</span>
          <span className="corner-crosshair top-2 right-2">+</span>
          <div className="flex items-center justify-between text-xs font-mono text-fc-muted border-b border-fc-border-faint pb-2.5">
            <span className="text-heat-100 font-bold">[ config/registry.yaml ]</span>
            <button
              onClick={copyYaml}
              className="flex items-center space-x-1 text-fc-muted hover:text-fc-graphite cursor-pointer"
            >
              {copiedYaml ? <Check className="w-3.5 h-3.5 text-fc-forest" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedYaml ? 'Copied' : 'Copy YAML'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-fc-graphite overflow-x-auto p-4 bg-fc-paper border border-fc-border-faint rounded-fc-8 leading-relaxed">
            {rawYamlContent}
          </pre>
        </div>
      )}

      {/* Search & Provider Filter Toolbar with Corner Markers */}
      <div className="relative rounded-fc-12 bg-fc-surface border border-fc-border-muted p-4 sm:p-5 space-y-3.5 shadow-xs">
        <span className="corner-crosshair top-2 left-2">+</span>
        <span className="corner-crosshair top-2 right-2">+</span>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fc-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, name, or tag (e.g. coding, local, frontier)..."
              className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-8 pl-9 pr-3.5 py-2 text-xs text-fc-graphite placeholder-fc-muted-soft focus:outline-none focus:border-heat-100 transition-colors font-sans"
            />
          </div>

          {/* Provider Filter Segment */}
          <div className="flex items-center bg-fc-bg-lighter p-0.5 rounded-fc-6 border border-fc-border-faint text-xs font-mono self-start md:self-auto">
            {['all', 'ollama', '9router', 'anthropic', 'openai'].map((prov) => (
              <button
                key={prov}
                onClick={() => setSelectedProvider(prov)}
                className={`px-3 py-1 rounded-fc-4 capitalize transition-all cursor-pointer ${
                  selectedProvider === prov
                    ? 'bg-heat-100 text-white font-medium shadow-fc-heat-btn'
                    : 'text-fc-muted hover:text-fc-graphite'
                }`}
              >
                {prov === 'ollama' ? 'Ollama' : prov}
              </button>
            ))}
          </div>
        </div>

        {/* Tags Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-fc-border-faint">
          <span className="text-[11px] font-mono text-fc-muted mr-1">Tags:</span>
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-2.5 py-0.5 rounded-fc-4 text-[11px] font-mono transition-colors cursor-pointer ${
              selectedTag === 'all'
                ? 'bg-heat-8 text-heat-100 border border-heat-20 font-bold'
                : 'bg-fc-bg-lighter text-fc-muted hover:text-fc-graphite border border-fc-border-faint'
            }`}
          >
            all ({models.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-0.5 rounded-fc-4 text-[11px] font-mono transition-colors cursor-pointer ${
                selectedTag === tag
                  ? 'bg-heat-8 text-heat-100 border border-heat-20 font-bold'
                  : 'bg-fc-bg-lighter text-fc-muted hover:text-fc-graphite border border-fc-border-faint'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Model Cards Grid with Corner Markers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredModels.map((model) => {
          const isEnabled = model.enabled !== false;
          const [minComp, maxComp] = model.complexity_range;
          const leftPercent = (minComp / 5) * 100;
          const widthPercent = ((maxComp - minComp) / 5) * 100;

          return (
            <div
              key={model.id}
              className={`relative rounded-fc-12 bg-fc-surface border transition-all p-5 space-y-3.5 flex flex-col justify-between shadow-xs ${
                isEnabled
                  ? 'border-fc-border-muted hover:border-fc-border-loud'
                  : 'border-fc-border-faint opacity-55'
              }`}
            >
              <span className="corner-crosshair top-2 left-2">+</span>
              <span className="corner-crosshair top-2 right-2">+</span>

              <div className="space-y-3">
                {/* Header: Name, Provider, Enabled Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium text-fc-graphite tracking-tight truncate max-w-[210px]">
                      {model.display_name || model.id}
                    </h2>
                    <span className="text-[11px] font-mono text-fc-muted">
                      {model.id}
                    </span>
                  </div>

                  <span className="px-2 py-0.5 rounded-fc-4 text-[10px] font-mono uppercase font-bold bg-fc-bg-lighter text-fc-graphite border border-fc-border-faint">
                    {model.provider}
                  </span>
                </div>

                {/* Upstream & URL specs */}
                <div className="p-3 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between text-fc-graphite">
                    <span className="text-fc-muted text-[11px]">Upstream:</span>
                    <span className="font-semibold truncate max-w-[170px] text-[11px]">
                      {model.upstream_model}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-fc-muted text-[10px]">
                    <span className="text-fc-muted">Endpoint:</span>
                    <span className="truncate max-w-[170px]">{model.base_url}</span>
                  </div>
                </div>

                {/* Complexity Spectrum Bar */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-fc-muted text-[11px]">Complexity Span:</span>
                    <span className="text-fc-graphite font-bold text-[11px]">
                      [{minComp.toFixed(1)} – {maxComp.toFixed(1)}]
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-fc-full bg-fc-bg-lighter border border-fc-border-faint overflow-hidden relative">
                    <div
                      className="h-full rounded-fc-full bg-heat-100"
                      style={{
                        marginLeft: `${leftPercent}%`,
                        width: `${Math.max(6, widthPercent)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Capabilities & Pricing Matrix */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                  <div className="p-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint flex items-center justify-between">
                    <span className="text-fc-muted">Tools:</span>
                    <span className={model.capabilities.tools ? 'text-fc-forest font-bold' : 'text-fc-muted'}>
                      {model.capabilities.tools ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="p-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint flex items-center justify-between">
                    <span className="text-fc-muted">Vision:</span>
                    <span className={model.capabilities.vision ? 'text-fc-bluetron font-bold' : 'text-fc-muted'}>
                      {model.capabilities.vision ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="p-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint flex items-center justify-between">
                    <span className="text-fc-muted">Context:</span>
                    <span className="text-fc-graphite font-medium">
                      {Math.round(model.capabilities.max_context / 1024)}K
                    </span>
                  </div>

                  <div className="p-2 rounded-fc-6 bg-fc-bg-lighter border border-fc-border-faint flex items-center justify-between">
                    <span className="text-fc-muted">Cost/1M:</span>
                    <span className="text-fc-graphite">
                      ${model.cost.input_per_mtoken}
                    </span>
                  </div>
                </div>

                {/* Tags Badges */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {model.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded-fc-4 bg-fc-bg-lighter border border-fc-border-faint text-[10px] font-mono text-fc-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-fc-border-faint flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggle(model.id, isEnabled)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-fc-6 text-[11px] font-medium border transition-colors cursor-pointer ${
                    isEnabled
                      ? 'bg-fc-forest/10 text-fc-forest border-fc-forest/20 hover:bg-fc-forest/20'
                      : 'bg-fc-bg-lighter text-fc-muted border-fc-border-faint'
                  }`}
                  title={isEnabled ? 'Click to disable' : 'Click to enable'}
                >
                  {isEnabled ? (
                    <ToggleRight className="w-4 h-4 text-fc-forest" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-fc-muted" />
                  )}
                  <span>{isEnabled ? 'Active' : 'Disabled'}</span>
                </button>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => openEditModal(model)}
                    className="p-1.5 rounded-fc-6 bg-fc-bg-lighter hover:bg-fc-surface border border-fc-border-faint text-fc-muted hover:text-fc-graphite transition-colors cursor-pointer"
                    title="Edit Model"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(model.id)}
                    className="p-1.5 rounded-fc-6 bg-fc-crimson/10 hover:bg-fc-crimson/20 text-fc-crimson transition-colors cursor-pointer"
                    title="Delete Model"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative bg-fc-surface border border-fc-border-muted rounded-fc-12 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <span className="corner-crosshair top-2 left-2">+</span>
            <span className="corner-crosshair top-2 right-2">+</span>

            <div className="flex items-center justify-between border-b border-fc-border-faint pb-3">
              <h2 className="text-sm font-bold text-fc-graphite flex items-center space-x-2">
                <Layers className="w-4 h-4 text-heat-100" />
                <span>{modalMode === 'add' ? 'Register Upstream Model' : `Edit: ${formData.id}`}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-fc-muted hover:text-fc-graphite cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-fc-6 bg-fc-crimson/10 border border-fc-crimson/30 text-xs text-fc-crimson flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3.5 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Model ID *</label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g. qwen-coder-local"
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name || ''}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g. Qwen 2.5 Coder 7B"
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Provider *</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
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
                  <label className="text-fc-muted font-medium">Upstream Model *</label>
                  <input
                    type="text"
                    required
                    value={formData.upstream_model}
                    onChange={(e) => setFormData({ ...formData, upstream_model: e.target.value })}
                    placeholder="e.g. qwen2.5-coder:7b"
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-fc-muted font-medium">Base URL *</label>
                <input
                  type="text"
                  required
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                  placeholder="e.g. http://localhost:11434/v1"
                  className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-fc-muted font-medium">API Key Env Variable</label>
                <input
                  type="text"
                  value={formData.api_key_env || ''}
                  onChange={(e) => setFormData({ ...formData, api_key_env: e.target.value || null })}
                  placeholder="e.g. OPENAI_API_KEY (leave blank for local)"
                  className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Complexity Min (0.0 - 5.0)</label>
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
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Complexity Max (0.0 - 5.0)</label>
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
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-fc-muted font-medium">Tags (comma-separated)</label>
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
                  className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Input Cost ($/1M Tokens)</label>
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
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-fc-muted font-medium">Output Cost ($/1M Tokens)</label>
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
                    className="w-full bg-fc-paper border border-fc-border-muted rounded-fc-6 p-2 text-fc-graphite font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-2">
                <label className="flex items-center space-x-1.5 cursor-pointer text-fc-graphite">
                  <input
                    type="checkbox"
                    checked={formData.capabilities.tools}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capabilities: { ...formData.capabilities, tools: e.target.checked },
                      })
                    }
                    className="rounded text-heat-100"
                  />
                  <span>Tools Supported</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-fc-graphite">
                  <input
                    type="checkbox"
                    checked={formData.capabilities.vision}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        capabilities: { ...formData.capabilities, vision: e.target.checked },
                      })
                    }
                    className="rounded text-heat-100"
                  />
                  <span>Vision Supported</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-fc-graphite">
                  <input
                    type="checkbox"
                    checked={formData.enabled !== false}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded text-heat-100"
                  />
                  <span>Enabled (Active)</span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-fc-border-faint">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-ghost-outline px-4 py-2 rounded-fc-8 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-heat-cta px-5 py-2 rounded-fc-8 text-xs font-medium cursor-pointer shadow-fc-heat-btn"
                >
                  {modalMode === 'add' ? 'Save Model' : 'Update Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
