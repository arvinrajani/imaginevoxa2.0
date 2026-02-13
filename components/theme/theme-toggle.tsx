'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ThemeMode = 'dark' | 'light';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ThemeMode>('dark');
  const resolvedMode = mode;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('voxa-theme') as ThemeMode | null;
    if (stored && stored !== mode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(stored);
      return;
    }
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem('voxa-theme', mode);
  }, [mode]);

  const handleToggle = () => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('voxa-theme', next);
      return next;
    });
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed right-4 top-1/2 z-50 -translate-y-1/2">
      <Button
        onClick={handleToggle}
        aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-voxa hover:bg-white/15"
      >
        <Lightbulb className="h-4 w-4 text-cyan-200" />
        <span className="uppercase tracking-wide">{resolvedMode === 'dark' ? 'Light' : 'Dark'} mode</span>
        <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
          {resolvedMode === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
        </span>
      </Button>
    </div>
  );
}
