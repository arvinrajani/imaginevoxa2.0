'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ThemeMode = 'dark' | 'light';

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('voxa-theme') as ThemeMode | null) ?? 'dark';
    setMode(stored);
    document.documentElement.setAttribute('data-theme', stored);
    document.documentElement.classList.toggle('dark', stored === 'dark');
    document.documentElement.style.colorScheme = stored;
  }, []);

  const handleToggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem('voxa-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme = next;
  };

  return (
    <div className="fixed right-4 top-1/2 z-50 -translate-y-1/2">
      <Button
        onClick={handleToggle}
        aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-voxa hover:bg-white/15"
      >
        <Lightbulb className="h-4 w-4 text-cyan-200" />
        <span className="uppercase tracking-wide">{mode === 'dark' ? 'Light' : 'Dark'} mode</span>
        <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
          {mode === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
        </span>
      </Button>
    </div>
  );
}
