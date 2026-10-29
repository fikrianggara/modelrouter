import { useState, useEffect } from 'react';
import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import {
  Activity,
  Layers,
  Sun,
  Moon,
  Gauge,
  Flame,
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
    return 'dark';
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
    <div className="min-h-screen bg-fc-bg-base text-fc-accent-black flex flex-col font-sans transition-colors duration-150">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-fc-surface/90 border-b border-fc-border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand & Engine Status */}
          <div className="flex items-center space-x-3.5">
            <Link to="/" className="flex items-center space-x-2.5 group">
              <div className="w-7 h-7 rounded-fc-sm bg-heat-100 text-white flex items-center justify-center font-mono font-bold text-xs shadow-heat-button group-hover:brightness-105 transition-all">
                <Flame className="w-4 h-4 fill-white" />
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm tracking-tight text-fc-accent-black">
                  Model<span className="text-heat-100 font-semibold">Router</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  v0.1
                </span>
              </div>
            </Link>

            {/* Precision Status Dot */}
            <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-fc-border-faint text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthOk === true
                    ? 'bg-fc-forest'
                    : isHealthOk === false
                    ? 'bg-fc-honey'
                    : 'bg-slate-400 animate-pulse'
                }`}
              />
              <span className="text-slate-500 text-[11px]">
                {isHealthOk === true
                  ? 'd1:online'
                  : isHealthOk === false
                  ? 'd1:offline'
                  : 'd1:connecting'}
              </span>
            </div>
          </div>

          {/* Segmented Nav Controls */}
          <nav className="flex items-center bg-fc-bg-lighter p-1 rounded-fc-sm border border-fc-border-faint text-xs font-medium">
            <Link
              to="/"
              activeProps={{
                className: 'bg-fc-surface text-fc-accent-black shadow-xs font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-sm text-slate-500 hover:text-fc-accent-black transition-all"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Overview</span>
            </Link>

            <Link
              to="/playground"
              activeProps={{
                className: 'bg-fc-surface text-fc-accent-black shadow-xs font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-sm text-slate-500 hover:text-fc-accent-black transition-all"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Playground</span>
            </Link>

            <Link
              to="/registry"
              activeProps={{
                className: 'bg-fc-surface text-fc-accent-black shadow-xs font-semibold',
              }}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-fc-sm text-slate-500 hover:text-fc-accent-black transition-all"
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
              className="p-1.5 rounded-fc-sm bg-fc-surface hover:bg-fc-bg-lighter border border-fc-border-muted text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-fc-honey" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>

      {/* Clean Utility Footer */}
      <footer className="border-t border-fc-border-muted bg-fc-surface/60 py-4 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-heat-100 font-bold">Firecrawl-Aligned</span>
            <span>•</span>
            <span>Liquid AI d1 (System One)</span>
            <span>•</span>
            <span>Zero-Buffer SSE Streaming</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>OpenAI /v1/chat/completions</span>
            <span>•</span>
            <span>Anthropic /v1/messages</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
