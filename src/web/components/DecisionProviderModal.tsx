import { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  RefreshCw,
  Server,
  Cloud,
  Sliders,
  ShieldCheck,
} from 'lucide-react';

export type DecisionProvider = 'ollama' | 'liquid' | 'custom';

export interface DecisionPreset {
  name: string;
  defaultEndpoint: string;
  defaultModel: string;
  requiresKey: boolean;
}

export interface DecisionProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderUpdated?: (newConfig: {
    provider: DecisionProvider;
    endpoint: string;
    model: string;
    latencyMs?: number;
  }) => void;
}

const DEFAULT_PRESETS: Record<DecisionProvider, DecisionPreset> = {
  ollama: {
    name: 'Ollama (Local)',
    defaultEndpoint: 'http://localhost:11434/v1/systemone',
    defaultModel: 'd1:latest',
    requiresKey: false,
  },
  liquid: {
    name: 'Liquid AI (Cloud)',
    defaultEndpoint: 'https://api.liquid.ai/v1/systemone',
    defaultModel: 'd1',
    requiresKey: true,
  },
  custom: {
    name: 'Custom Endpoint',
    defaultEndpoint: 'http://localhost:11434/v1/systemone',
    defaultModel: 'd1:latest',
    requiresKey: false,
  },
};

export function DecisionProviderModal({
  isOpen,
  onClose,
  onProviderUpdated,
}: DecisionProviderModalProps) {
  const [provider, setProvider] = useState<DecisionProvider>('ollama');
  const [endpoint, setEndpoint] = useState<string>('http://localhost:11434/v1/systemone');
  const [model, setModel] = useState<string>('d1:latest');
  const [timeoutMs, setTimeoutMs] = useState<number>(10000);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string>('');
  const [presets, setPresets] = useState<Record<DecisionProvider, DecisionPreset>>(DEFAULT_PRESETS);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Fetch current provider configuration on open
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setIsLoading(true);
    setSaveSuccess(false);
    setSaveError(null);
    setTestResult(null);

    fetch('/api/decision-provider')
      .then((res) => (res.ok ? res.json() : Promise.reject('Failed to fetch config')))
      .then((data) => {
        if (!mounted) return;
        if (data.provider) setProvider(data.provider);
        if (data.endpoint) setEndpoint(data.endpoint);
        if (data.model) setModel(data.model);
        if (data.timeoutMs) setTimeoutMs(data.timeoutMs);
        setHasApiKey(Boolean(data.hasApiKey));
        setMaskedApiKey(data.maskedApiKey || '');
        setApiKey('');
        if (data.presets) {
          setPresets((prev) => ({ ...prev, ...data.presets }));
        }
      })
      .catch((err) => {
        console.warn('[BYOK] Error loading decision provider config:', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectPreset = (p: DecisionProvider) => {
    setProvider(p);
    const targetPreset = presets[p] || DEFAULT_PRESETS[p];
    if (targetPreset) {
      setEndpoint(targetPreset.defaultEndpoint);
      setModel(targetPreset.defaultModel);
    }
    setTestResult(null);
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const res = await fetch('/api/decision-provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          endpoint,
          model,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          timeoutMs: Number(timeoutMs) || 5000,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          latencyMs: data.latencyMs,
        });
      } else {
        setTestResult({
          ok: false,
          latencyMs: data.latencyMs,
          error: data.error || 'Connection test failed',
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err?.message || 'Network error during connection test',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndApply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (provider === 'liquid' && !hasApiKey && !apiKey.trim()) {
      setSaveError('Liquid AI Cloud provider requires an API key.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const payload: Record<string, any> = {
        provider,
        endpoint,
        model,
        timeoutMs: Number(timeoutMs) || 10000,
      };

      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/decision-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveSuccess(true);
        setHasApiKey(Boolean(data.hasApiKey));
        setMaskedApiKey(data.maskedApiKey || '');
        setApiKey('');

        if (onProviderUpdated) {
          onProviderUpdated({
            provider: data.provider,
            endpoint: data.endpoint,
            model: data.model,
            latencyMs: testResult?.ok ? testResult.latencyMs : undefined,
          });
        }
      } else {
        setSaveError(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Network error while saving configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative bg-fc-surface border border-fc-border-faint dark:border-[#23252a] rounded-fc-12 max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Firecrawl Blueprint Crosshair Accents */}
        <span className="corner-crosshair top-2 left-2 text-fc-muted/60 font-mono select-none">+</span>
        <span className="corner-crosshair top-2 right-2 text-fc-muted/60 font-mono select-none">+</span>
        <span className="corner-crosshair bottom-2 left-2 text-fc-muted/60 font-mono select-none">+</span>
        <span className="corner-crosshair bottom-2 right-2 text-fc-muted/60 font-mono select-none">+</span>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-fc-border-faint dark:border-[#23252a] pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-fc-6 bg-heat-8 text-heat-100 flex items-center justify-center border border-heat-16">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-fc-graphite tracking-tight flex items-center space-x-2">
                <span>Decision Model Provider</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-fc-bg-lighter border border-fc-border-faint text-heat-100 font-semibold">
                  BYOK
                </span>
              </h2>
              <p className="text-[11px] text-fc-muted font-sans">
                Neural routing engine powered by Liquid AI d1
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-fc-4 text-fc-muted hover:text-fc-graphite hover:bg-fc-bg-lighter transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Alert */}
        {saveSuccess && (
          <div className="p-2.5 rounded-fc-6 bg-fc-forest/10 border border-fc-forest/30 text-xs text-fc-forest flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-mono">
              Provider configuration updated: <strong className="font-bold">{provider}</strong> is now active.
            </span>
          </div>
        )}

        {/* Error Alert */}
        {saveError && (
          <div className="p-2.5 rounded-fc-6 bg-fc-crimson/10 border border-fc-crimson/30 text-xs text-fc-crimson flex items-center space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <form onSubmit={handleSaveAndApply} className="space-y-4 text-xs font-sans">
          {/* Preset Selector Radio Cards */}
          <div className="space-y-1.5">
            <label className="text-fc-muted font-mono text-[11px] uppercase tracking-wider block">
              Provider Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Ollama Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('ollama')}
                className={`p-2.5 rounded-fc-8 border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                  provider === 'ollama'
                    ? 'border-heat-100 bg-heat-4 dark:bg-heat-8/30 ring-1 ring-heat-100'
                    : 'border-fc-border-faint dark:border-[#23252a] bg-fc-bg-lighter hover:border-fc-border-muted'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-1.5">
                    <Server className="w-3.5 h-3.5 text-heat-100" />
                    <span className="font-semibold text-fc-graphite text-xs">Ollama</span>
                  </div>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-fc-forest/10 text-fc-forest border border-fc-forest/20">
                    Local
                  </span>
                </div>
                <div className="text-[11px] text-fc-muted leading-tight">
                  Local System One d1 inference
                </div>
              </button>

              {/* Liquid AI Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('liquid')}
                className={`p-2.5 rounded-fc-8 border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                  provider === 'liquid'
                    ? 'border-heat-100 bg-heat-4 dark:bg-heat-8/30 ring-1 ring-heat-100'
                    : 'border-fc-border-faint dark:border-[#23252a] bg-fc-bg-lighter hover:border-fc-border-muted'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-1.5">
                    <Cloud className="w-3.5 h-3.5 text-heat-100" />
                    <span className="font-semibold text-fc-graphite text-xs">Liquid AI</span>
                  </div>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-fc-bluetron/10 text-fc-bluetron border border-fc-bluetron/20">
                    Cloud
                  </span>
                </div>
                <div className="text-[11px] text-fc-muted leading-tight">
                  Managed Cloud API with BYOK
                </div>
              </button>

              {/* Custom Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset('custom')}
                className={`p-2.5 rounded-fc-8 border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                  provider === 'custom'
                    ? 'border-heat-100 bg-heat-4 dark:bg-heat-8/30 ring-1 ring-heat-100'
                    : 'border-fc-border-faint dark:border-[#23252a] bg-fc-bg-lighter hover:border-fc-border-muted'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-heat-100" />
                    <span className="font-semibold text-fc-graphite text-xs">Custom</span>
                  </div>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-fc-amethyst/10 text-fc-amethyst border border-fc-amethyst/20">
                    Self-Host
                  </span>
                </div>
                <div className="text-[11px] text-fc-muted leading-tight">
                  Custom OpenAI-compatible URL
                </div>
              </button>
            </div>
          </div>

          {/* Endpoint & Model Form Fields */}
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-fc-muted font-mono text-[11px] uppercase tracking-wider block">
                Endpoint URL *
              </label>
              <input
                type="url"
                required
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:11434/v1/systemone"
                className="w-full bg-fc-paper border border-fc-border-faint dark:border-[#23252a] rounded-fc-6 p-2 text-fc-graphite font-mono text-xs focus:outline-none focus:border-heat-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-fc-muted font-mono text-[11px] uppercase tracking-wider block">
                  Model Identifier *
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="d1:latest"
                  className="w-full bg-fc-paper border border-fc-border-faint dark:border-[#23252a] rounded-fc-6 p-2 text-fc-graphite font-mono text-xs focus:outline-none focus:border-heat-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-fc-muted font-mono text-[11px] uppercase tracking-wider block">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  min="500"
                  max="60000"
                  step="500"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  placeholder="10000"
                  className="w-full bg-fc-paper border border-fc-border-faint dark:border-[#23252a] rounded-fc-6 p-2 text-fc-graphite font-mono text-xs focus:outline-none focus:border-heat-100"
                />
              </div>
            </div>

            {/* API Key Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-fc-muted font-mono text-[11px] uppercase tracking-wider block">
                  API Key (Bearer Token)
                  {provider === 'liquid' && <span className="text-heat-100 ml-1">*</span>}
                </label>
                {hasApiKey && maskedApiKey && (
                  <div className="flex items-center space-x-1 text-[10px] font-mono text-fc-forest bg-fc-forest/10 px-1.5 py-0.5 rounded border border-fc-forest/20">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Saved: {maskedApiKey}</span>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasApiKey
                      ? 'Key configured (leave blank to keep current key)'
                      : provider === 'liquid'
                      ? 'sk-liq-...'
                      : 'Optional API key for authenticated proxies'
                  }
                  className="w-full bg-fc-paper border border-fc-border-faint dark:border-[#23252a] rounded-fc-6 p-2 pr-9 text-fc-graphite font-mono text-xs focus:outline-none focus:border-heat-100"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fc-muted hover:text-fc-graphite cursor-pointer"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] font-mono text-fc-muted-soft">
                Keys are stored encrypted on the server in <code>config/decision-provider.json</code>.
              </p>
            </div>
          </div>

          {/* Test Feedback Area */}
          {testResult && (
            <div
              className={`p-2.5 rounded-fc-6 border text-xs flex items-center justify-between animate-in fade-in font-mono ${
                testResult.ok
                  ? 'bg-fc-forest/10 border-fc-forest/30 text-fc-forest'
                  : 'bg-fc-crimson/10 border-fc-crimson/30 text-fc-crimson'
              }`}
            >
              <div className="flex items-center space-x-2">
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {testResult.ok
                    ? `Ping test successful · latency: ${testResult.latencyMs}ms`
                    : `Connection failed (${testResult.latencyMs ?? 0}ms): ${testResult.error}`}
                </span>
              </div>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-fc-border-faint dark:border-[#23252a]">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-fc-6 border border-fc-border-muted bg-fc-bg-lighter hover:bg-fc-surface text-fc-graphite text-xs font-mono font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-heat-100' : 'text-fc-muted'}`} />
              <span>{isTesting ? 'Testing Ping...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-fc-6 border border-fc-border-faint text-fc-muted hover:text-fc-graphite text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSaving || isLoading}
                className="btn-heat-primary px-4 py-1.5 rounded-fc-6 text-white text-xs font-semibold shadow-fc-heat-btn hover:brightness-105 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ponytail: single modal component for all provider types; split if provider-specific auth flows expand.
