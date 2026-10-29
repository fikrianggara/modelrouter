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
} from 'lucide-react';

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
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          setIsHealthOk(true);
        } else {
          setIsHealthOk(false);
        }
      } catch {
        setIsHealthOk(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-fc-paper text-fc-graphite flex flex-col font-sans transition-colors duration-150">
      {/* Firecrawl Announcement Bar */}
      <div className="bg-fc-bg-lighter border-b border-fc-border-faint py-2 px-4 text-xs font-mono text-center">
        <div className="max-w-[1112px] mx-auto flex items-center justify-center space-x-2 text-[12px]">
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
      </div>

      {/* Main Structural Frame bounded by continuous 1px side lines */}
      <div className="flex-1 max-w-[1112px] w-full mx-auto border-x border-fc-border-faint flex flex-col bg-fc-paper">
        {/* Top Navbar */}
        <header className="sticky top-0 z-50 backdrop-blur-md bg-fc-surface/90 border-b border-fc-border-muted">
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

              {/* Status Pill: Latency & State */}
              <div className="hidden sm:flex items-center space-x-2 pl-3 border-l border-fc-border-faint text-xs font-mono">
                <span className="px-2 py-0.5 rounded-fc-full text-[11px] font-mono bg-fc-forest/10 text-fc-forest border border-fc-forest/20 flex items-center space-x-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isHealthOk === true
                        ? 'bg-fc-forest'
                        : isHealthOk === false
                        ? 'bg-fc-honey'
                        : 'bg-slate-400 animate-pulse'
                    }`}
                  />
                  <span>
                    {isHealthOk === true
                      ? '49 ms · d1:online'
                      : isHealthOk === false
                      ? 'd1:offline'
                      : 'connecting'}
                  </span>
                </span>
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

            {/* Actions: Theme Toggle */}
            <div className="flex items-center space-x-2">
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
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 sm:px-6 py-8">
          <Outlet />
        </main>

        {/* Clean Blueprint Utility Footer */}
        <footer className="border-t border-fc-border-muted bg-fc-surface py-5 px-6 text-xs font-mono text-fc-muted">
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
        </footer>
      </div>
    </div>
  );
}
