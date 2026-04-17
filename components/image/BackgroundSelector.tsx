'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackgroundItem {
  id: string;
  name: string;
  industry: string;
  storage_url: string;
  preview_url: string;
}

interface BackgroundSelectorProps {
  defaultIndustry: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'construction', label: 'Construction' },
  { key: 'technology', label: 'Technology' },
  { key: 'automotive', label: 'Automotive' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'general', label: 'General' },
];

export function BackgroundSelector({
  defaultIndustry,
  selectedId,
  onSelect,
}: BackgroundSelectorProps) {
  const [backgrounds, setBackgrounds] = useState<Record<string, BackgroundItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState((defaultIndustry || 'all').toLowerCase());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/backgrounds/list');
        if (!res.ok) {
          console.error('[BackgroundSelector] API returned', res.status);
          return;
        }
        const data = (await res.json()) as Record<string, BackgroundItem[]>;
        setBackgrounds(data);

        // If the default tab has no items, fall back to 'all'
        const tab = (defaultIndustry || 'all').toLowerCase();
        if (tab !== 'all' && (!data[tab] || data[tab].length === 0)) {
          setActiveTab('all');
        }
      } catch (e) {
        console.error('[BackgroundSelector] Load failed:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [defaultIndustry]);

  const visibleItems: BackgroundItem[] =
    activeTab === 'all'
      ? Object.values(backgrounds).flat()
      : backgrounds[activeTab] || [];

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              activeTab === tab.key
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video animate-pulse rounded-lg bg-gray-200"
            />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No backgrounds yet. Ask your admin to upload or generate some.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visibleItems.map((bg) => {
            const isSelected = selectedId === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => onSelect(bg.id)}
                className={cn(
                  'group relative aspect-video overflow-hidden rounded-lg border-2 transition',
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-300'
                    : 'border-gray-200 hover:border-gray-400'
                )}
              >
                <img
                  src={bg.preview_url}
                  alt={bg.name}
                  className="h-full w-full object-cover"
                />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20">
                    <div className="rounded-full bg-blue-500 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                  <span className="text-xs font-medium text-white">{bg.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
