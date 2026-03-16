'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type WorkspaceBrand = {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  website: string | null;
  company_id?: string | null;
};

export type WorkspaceCompany = {
  id: string;
  name: string;
  logo_url: string | null;
};

type WorkspaceContextValue = {
  brands: WorkspaceBrand[];
  companies: WorkspaceCompany[];
  selectedBrand: WorkspaceBrand | null;
  selectedCompany: WorkspaceCompany | null;
  setSelectedBrand: (brand: WorkspaceBrand | null) => void;
  setSelectedCompany: (company: WorkspaceCompany | null) => void;
  loadWorkspace: () => Promise<void>;
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY_BRAND = 'voxa_active_brand_id';
const STORAGE_KEY_COMPANY = 'voxa_active_company_id';

function isAutoPlaceholderBrand(brand: WorkspaceBrand | null | undefined) {
  if (!brand) return false;

  const name = typeof brand.name === 'string' ? brand.name.trim() : '';
  const description =
    typeof brand.description === 'string' ? brand.description.trim().toLowerCase() : '';

  return (
    name === 'My Brand' &&
    (description === 'default brand for pro studio' || description === 'default brand for studio')
  );
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [brands, setBrands] = useState<WorkspaceBrand[]>([]);
  const [companies, setCompanies] = useState<WorkspaceCompany[]>([]);
  const [selectedBrand, setSelectedBrandState] = useState<WorkspaceBrand | null>(null);
  const [selectedCompany, setSelectedCompanyState] = useState<WorkspaceCompany | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setSelectedBrand = useCallback((brand: WorkspaceBrand | null) => {
    setSelectedBrandState(brand);
    if (brand) {
      localStorage.setItem(STORAGE_KEY_BRAND, brand.id);
    } else {
      localStorage.removeItem(STORAGE_KEY_BRAND);
    }
  }, []);

  const setSelectedCompany = useCallback((company: WorkspaceCompany | null) => {
    setSelectedCompanyState(company);
    if (company) {
      localStorage.setItem(STORAGE_KEY_COMPANY, company.id);
    } else {
      localStorage.removeItem(STORAGE_KEY_COMPANY);
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const [brandsResult, companiesResult] = await Promise.all([
        supabase
          .from('brands')
          .select('id, name, description, industry, website, company_id')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('companies')
          .select('id, name, logo_url')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: true }),
      ]);

      const loadedBrands = ((brandsResult.data || []) as WorkspaceBrand[]).filter(
        (brand) => !isAutoPlaceholderBrand(brand)
      );
      const loadedCompanies = (companiesResult.data || []) as WorkspaceCompany[];

      setBrands(loadedBrands);
      setCompanies(loadedCompanies);

      const savedBrandId = localStorage.getItem(STORAGE_KEY_BRAND);
      const savedCompanyId = localStorage.getItem(STORAGE_KEY_COMPANY);

      const restoredBrand = loadedBrands.find((b) => b.id === savedBrandId) ?? loadedBrands[0] ?? null;
      const restoredCompany = loadedCompanies.find((c) => c.id === savedCompanyId) ?? loadedCompanies[0] ?? null;

      setSelectedBrandState(restoredBrand);
      setSelectedCompanyState(restoredCompany);

      if (restoredBrand) localStorage.setItem(STORAGE_KEY_BRAND, restoredBrand.id);
      if (restoredCompany) localStorage.setItem(STORAGE_KEY_COMPANY, restoredCompany.id);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      brands,
      companies,
      selectedBrand,
      selectedCompany,
      setSelectedBrand,
      setSelectedCompany,
      loadWorkspace,
      isLoading,
    }),
    [brands, companies, selectedBrand, selectedCompany, setSelectedBrand, setSelectedCompany, loadWorkspace, isLoading]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return ctx;
}
