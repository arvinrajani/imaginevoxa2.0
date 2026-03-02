'use client';

import { useState } from 'react';
import { ChevronDown, Building2, Sparkles, Check, Plus } from 'lucide-react';
import { useWorkspace } from '@/lib/context/workspace-context';
import { useRouter } from 'next/navigation';

export function GlobalBrandSelector() {
  const { brands, selectedBrand, setSelectedBrand, isLoading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="mx-4 mb-3 h-12 rounded-xl bg-gray-50 animate-pulse border border-gray-200/60" />
    );
  }

  if (brands.length === 0) {
    return (
      <button
        onClick={() => router.push('/app/brands')}
        className="mx-4 mb-3 flex items-center gap-2 px-3 py-2.5 w-[calc(100%-2rem)] rounded-xl border border-dashed border-gray-200 text-gray-500 hover:text-gray-900 hover:border-white/40 transition-all text-sm"
      >
        <Plus className="h-4 w-4 shrink-0" />
        <span>Add your first brand</span>
      </button>
    );
  }

  return (
    <div className="mx-4 mb-3 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-xl bg-gray-50 border border-gray-200/60 hover:bg-gray-100 hover:border-gray-200 transition-all group"
      >
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">Active Brand</p>
          <p className="text-sm font-medium text-gray-900 truncate leading-tight">
            {selectedBrand?.name ?? 'Select brand'}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl bg-white border border-gray-200/60 shadow-lg overflow-hidden">
            <div className="p-1.5 max-h-56 overflow-y-auto">
              {brands.map((brand) => {
                const isSelected = selectedBrand?.id === brand.id;
                return (
                  <button
                    key={brand.id}
                    onClick={() => {
                      setSelectedBrand(brand);
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-cyan-50 text-cyan-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-50/40 to-blue-600/40 flex items-center justify-center shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                    </div>
                    <span className="flex-1 text-left truncate">{brand.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-cyan-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-gray-200/60 p-1.5">
              <button
                onClick={() => {
                  router.push('/app/brands');
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Manage brands
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
