import { useState, useEffect } from 'react';
import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import {
  Activity,
  Layers,
  Sun,
  Moon,
  Zap,
  Gauge,
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
    <div className="min-h-screen bg-slate-950 text-slate-100 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 via-blue-500 to-cyan-400 p-0.5 shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Zap className="w-5 h-5 text-cyan-400 fill-cyan-400/20" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Model<span className="text-cyan-400">Router</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 -mt-1">
                  D1 System One
                </span>
              </div>
            </Link>

            {/* Health / Engine Badge */}
            <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-800 text-xs">
              <div
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
                  isHealthOk === true
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                    : isHealthOk === false
                    ? 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isHealthOk === true
                      ? 'bg-emerald-400 animate-pulse'
                      : isHealthOk === false
                      ? 'bg-amber-400'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="font-mono font-medium">
                  {isHealthOk === true
                    ? 'Router Online'
                    : isHealthOk === false
                    ? 'Local Engine Offline'
                    : 'Checking...'}
                </span>
              </div>
              <div className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[11px]">
                &lt;30ms Target
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <Link
              to="/"
              activeProps={{
                className:
                  'bg-brand-600/20 text-cyan-300 border-brand-500/40 font-semibold',
              }}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-850 border border-transparent transition-all"
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Dashboard</span>
            </Link>

            <Link
              to="/playground"
              activeProps={{
                className:
                  'bg-brand-600/20 text-cyan-300 border-brand-500/40 font-semibold',
              }}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-850 border border-transparent transition-all"
            >
              <Gauge className="w-4 h-4 text-emerald-400" />
              <span>Playground</span>
            </Link>

            <Link
              to="/registry"
              activeProps={{
                className:
                  'bg-brand-600/20 text-cyan-300 border-brand-500/40 font-semibold',
              }}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-850 border border-transparent transition-all"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Registry</span>
            </Link>
          </nav>

          {/* Actions: Theme Toggle & Docs link */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-slate-400">ModelRouter Core v0.1.0</span>
            <span>•</span>
            <span>Liquid AI D1 System One</span>
            <span>•</span>
            <span className="font-mono text-emerald-400/80">SSE Stream Transcoder Active</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hover:text-slate-300 cursor-pointer">
              OpenAI /v1/chat/completions
            </span>
            <span>•</span>
            <span className="hover:text-slate-300 cursor-pointer">
              Anthropic /v1/messages
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
