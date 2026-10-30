import { useState, useEffect } from 'react';
import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import {
  Activity,
  Layers,
  Sun,
  Moon,
  Gauge,
  Flame,
  ArrowRight,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { DecisionProviderModal, DecisionProvider } from '../components/DecisionProviderModal';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mr-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'light'; // Firecrawl default is signature warm paper!
  });

  const [isHealthOk, setIsHealthOk] = useState<boolean | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    model?: string;
    status: 'online' | 'offline' | 'connecting';
    latencyMs?: number;
  }>({
    provider: 'ollama',
    model: 'd1:latest',
    status: 'connecting',
    latencyMs: 49,
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mr-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const checkProviderStatus = async () => {
      try {
        const t0 = performance.now();
        const res = await fetch('/api/decision-provider');
        const latency = Math.round(performance.now() - t0);
        if (res.ok) {
          const data = await res.json();
          setProviderInfo((prev) => ({
            provider: data.provider || 'ollama',
            model: data.model || 'd1:latest',
            status: 'online',
            latencyMs: prev.latencyMs && prev.latencyMs > 0 ? prev.latencyMs : (latency || 49),
          }));
          setIsHealthOk(true);
        } else {
          setProviderInfo((prev) => ({
            ...prev,
            status: 'offline',
          }));
          setIsHealthOk(false);
        }
      } catch {
        setProviderInfo((prev) => ({
          ...prev,
          status: 'offline',
        }));
        setIsHealthOk(false);
      }
    };
    checkProviderStatus();
    const interval = setInterval(checkProviderStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleProviderUpdated = (newConfig: {
    provider: DecisionProvider;
    endpoint: string;
    model: string;
    latencyMs?: number;
  }) => {
    setProviderInfo({
      provider: newConfig.provider,
      model: newConfig.model,
      status: 'online',
      latencyMs: newConfig.latencyMs ?? 49,
    });
    setIsHealthOk(true);
  };

  return (
    <div className="min-h-screen bg-fc-paper text-fc-graphite flex flex-col font-sans transition-colors duration-150">
      {/* Architectural Announcement Bar with Full-Bleed 3-Column Grid */}
      <div className="grid grid-cols-[1fr_minmax(0,1200px)_1fr] border-b border-fc-border-faint bg-fc-bg-lighter text-xs font-mono">
        <div className="border-r border-fc-border-faint" />
        <div className="py-2.5 px-4 flex items-center justify-center space-x-2 text-[12px]">
          <span className="px-1.5 py-0.5 rounded-fc-4 bg-heat-8 text-heat-100 font-bold border border-heat-16">
            NEW
          </span>
          <span className="text-fc-body">
            Liquid AI d1 Neural Decision Model active with 10s latency headroom
          </span>
          <Link
            to="/playground"
            className="text-heat-100 font-medium hover:underline inline-flex items-center space-x-0.5"
          >
            <span>Try in Playground</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </Link>
        </div>
        <div className="border-l border-fc-border-faint" />
      </div>

      {/* Top Navbar with Full-Bleed 3-Column Grid */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-fc-surface/90 border-b border-fc-border-muted">
        <div className="grid grid-cols-[1fr_minmax(0,1200px)_1fr]">
          <div className="border-r border-fc-border-faint" />
          <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
            {/* Brand & Engine Status */}
            <div className="flex items-center space-x-3.5">
              <Link to="/" className="flex items-center space-x-2 group">
                <div className="w-7 h-7 rounded-fc-6 bg-heat-100 text-white flex items-center justify-center font-mono font-bold text-xs shadow-fc-heat-btn group-hover:brightness-105 transition-all">
                  <Flame className="w-4 h-4 fill-white" />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-medium text-sm tracking-tight text-fc-graphite">
                    Model<span className="text-heat-100 font-semibold">Router</span>
                  </span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-fc-bg-lighter border border-fc-border-faint text-fc-muted">
                    v0.1
                  </span>
                </div>
              </Link>

              {/* Status Pill: Latency & State (Clickable to open Decision Provider Settings) */}
              <div className="hidden sm:flex items-center space-x-2 pl-3 border-l border-fc-border-faint text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  title="Configure BYOK Decision Provider"
                  className="px-2.5 py-1 rounded-fc-full text-[11px] font-mono border border-fc-border-faint bg-fc-bg-lighter text-fc-graphite hover:border-fc-border-muted flex items-center space-x-1.5 transition-all cursor-pointer group"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      providerInfo.status === 'online'
                        ? 'bg-fc-forest'
                        : providerInfo.status === 'offline'
                        ? 'bg-fc-crimson'
                        : 'bg-slate-400 animate-pulse'
                    }`}
                  />
                  <span>
                    {providerInfo.provider} · {providerInfo.model || 'd1:latest'}
                  </span>
                  <Settings className="w-3 h-3 text-fc-muted opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
                </button>
              </div>
            </div>

            {/* Segmented Nav Controls */}
            <nav className="flex items-center bg-fc-bg-lighter p-0.5 rounded-fc-6 border border-fc-border-faint text-xs font-medium">
              <Link
                to="/"
                activeProps={{
                  className: 'bg-fc-surface text-fc-graphite shadow-xs font-semibold',
                }}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-6 text-fc-muted hover:text-fc-graphite transition-all"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Overview</span>
              </Link>

              <Link
                to="/playground"
                activeProps={{
                  className: 'bg-fc-surface text-fc-graphite shadow-xs font-semibold',
                }}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-6 text-fc-muted hover:text-fc-graphite transition-all"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Playground</span>
              </Link>

              <Link
                to="/registry"
                activeProps={{
                  className: 'bg-fc-surface text-fc-graphite shadow-xs font-semibold',
                }}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-6 text-fc-muted hover:text-fc-graphite transition-all"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Models</span>
              </Link>
            </nav>

            {/* Actions: Settings Modal & Theme Toggle */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                aria-label="Decision Provider Settings"
                className="p-1.5 rounded-fc-6 bg-fc-surface hover:bg-fc-bg-lighter border border-fc-border-muted text-fc-muted hover:text-fc-graphite transition-colors cursor-pointer"
                title="Decision Provider Settings (BYOK)"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleTheme}
                aria-label="Toggle color theme"
                className="p-1.5 rounded-fc-6 bg-fc-surface hover:bg-fc-bg-lighter border border-fc-border-muted text-fc-muted hover:text-fc-graphite transition-colors cursor-pointer"
                title={`Switch to ${theme === 'dark' ? 'Paper (Light)' : 'Graphite (Dark)'}`}
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-fc-honey" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-fc-graphite" />
                )}
              </button>
            </div>
          </div>
          <div className="border-l border-fc-border-faint" />
        </div>
      </header>

      {/* Main Architectural Content Surface */}
      <main className="flex-1 w-full bg-fc-paper">
        <Outlet />
      </main>

      {/* Clean Blueprint Utility Footer with Full-Bleed 3-Column Grid */}
      <footer className="border-t border-fc-border-muted bg-fc-surface">
        <div className="grid grid-cols-[1fr_minmax(0,1200px)_1fr]">
          <div className="border-r border-fc-border-faint" />
          <div className="py-5 px-6 text-xs font-mono text-fc-muted">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-heat-100 font-bold">[ 04 / 04 ]</span>
                <span>·</span>
                <span className="text-fc-graphite font-medium">ModelRouter Blueprint</span>
                <span>//</span>
                <span>Liquid AI d1 (System One)</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] text-fc-muted-soft">
                <span>POST /v1/chat/completions</span>
                <span>•</span>
                <span>POST /v1/messages</span>
              </div>
            </div>
          </div>
          <div className="border-l border-fc-border-faint" />
        </div>
      </footer>

      {/* BYOK Decision Provider Settings Modal */}
      <DecisionProviderModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onProviderUpdated={handleProviderUpdated}
      />
    </div>
  );
}
