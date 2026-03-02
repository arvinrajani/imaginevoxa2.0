'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type SetupStep = 'welcome' | 'analyze' | 'style' | 'assets' | 'complete';

export type BrandIntelligence = {
  products: string[];
  offerings: string[];
  targetAudience: string | null;
  businessFocus: string | null;
  tagline: string | null;
  brandDescription: string | null;
  website: string | null;
  analyzedAt: string | null;
};

export type BrandSetupState = {
  setupStep: SetupStep;
  brandSetupComplete: boolean;
  brandIntelligence: BrandIntelligence | null;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function useBrandSetup() {
  const supabase = useMemo(() => createClient(), []);
  const selectedBrandIdRef = useRef<string | null>(null);

  const [setupStep, setSetupStep] = useState<SetupStep>('welcome');
  const [brandSetupComplete, setBrandSetupComplete] = useState(false);
  const [brandIntelligence, setBrandIntelligence] = useState<BrandIntelligence | null>(null);

  const checkBrandSetup = useCallback(async (brandId: string, signal?: AbortSignal) => {
    selectedBrandIdRef.current = brandId;
    const response = await fetch(`/api/pro/brand-kit/status?brandId=${brandId}`, {
      method: 'GET',
      signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      if (selectedBrandIdRef.current === brandId) {
        setBrandSetupComplete(false);
      }
      return null;
    }

    const payload = (await response.json()) as {
      setupComplete?: boolean;
    };

    if (selectedBrandIdRef.current === brandId) {
      setBrandSetupComplete(Boolean(payload.setupComplete));
    }

    return payload;
  }, []);

  const loadBrandIntelligence = useCallback(
    async (brandId: string, signal?: AbortSignal) => {
      selectedBrandIdRef.current = brandId;
      const { data, error } = await supabase
        .from('marketing_dna')
        .select('analyzed_at, evidence, created_at')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .abortSignal(signal || new AbortController().signal)
        .maybeSingle();

      if (error || !data) {
        if (selectedBrandIdRef.current === brandId) {
          setBrandIntelligence(null);
        }
        return null;
      }

      const evidence = (data.evidence || {}) as Record<string, unknown>;
      const nextIntelligence: BrandIntelligence = {
        products: asStringList(evidence.products),
        offerings: asStringList(evidence.key_offerings),
        targetAudience: asTrimmedString(evidence.target_audience),
        businessFocus: asTrimmedString(evidence.business_focus),
        tagline: asTrimmedString(evidence.tagline),
        brandDescription: asTrimmedString(evidence.brand_description),
        website: asTrimmedString(evidence.website),
        analyzedAt: typeof data.analyzed_at === 'string' ? data.analyzed_at : null,
      };

      if (selectedBrandIdRef.current === brandId) {
        setBrandIntelligence(nextIntelligence);
      }

      return nextIntelligence;
    },
    [supabase]
  );

  return {
    setupStep,
    setSetupStep,
    brandSetupComplete,
    setBrandSetupComplete,
    brandIntelligence,
    setBrandIntelligence,
    checkBrandSetup,
    loadBrandIntelligence,
  };
}
