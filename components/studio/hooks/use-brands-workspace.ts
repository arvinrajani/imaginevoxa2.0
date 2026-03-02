'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export type WorkspaceBrand = {
  id: string;
  name: string;
  owner_user_id: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
};

export type NewBrandForm = {
  name: string;
  description: string;
  industry: string;
  website: string;
};

export function useBrandsWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<WorkspaceBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<WorkspaceBrand | null>(null);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [newBrandForm, setNewBrandForm] = useState<NewBrandForm>({
    name: '',
    description: '',
    industry: '',
    website: '',
  });

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = '/login';
        return;
      }

      const { data, error } = await supabase
        .from('brands')
        .select('id, name, owner_user_id, description, industry, website')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const resolved = (data || []) as WorkspaceBrand[];
      setBrands(resolved);
      setSelectedBrand((prev) => prev || resolved[0] || null);
    } catch (error) {
      toast.error('Could not load brands', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const createBrand = useCallback(async () => {
    const trimmedName = newBrandForm.name.trim();
    if (!trimmedName) {
      toast.error('Brand name is required');
      return null;
    }

    setCreatingBrand(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please sign in again to create a brand');
        return null;
      }

      const payload = {
        owner_user_id: user.id,
        name: trimmedName,
        description: newBrandForm.description.trim() || null,
        industry: newBrandForm.industry.trim() || null,
        website: newBrandForm.website.trim() || null,
      };

      const { data: createdBrand, error } = await supabase
        .from('brands')
        .insert(payload)
        .select('id, name, owner_user_id, description, industry, website')
        .single();

      if (error || !createdBrand) {
        throw error || new Error('Could not create brand');
      }

      const normalized = createdBrand as WorkspaceBrand;
      setBrands((prev) => [...prev, normalized]);
      setSelectedBrand(normalized);
      setNewBrandForm({ name: '', description: '', industry: '', website: '' });
      toast.success('Brand created');
      return normalized;
    } catch (error) {
      toast.error('Failed to create brand', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      return null;
    } finally {
      setCreatingBrand(false);
    }
  }, [newBrandForm, supabase]);

  return {
    loading,
    brands,
    selectedBrand,
    setSelectedBrand,
    creatingBrand,
    newBrandForm,
    setNewBrandForm,
    loadBrands,
    createBrand,
  };
}
