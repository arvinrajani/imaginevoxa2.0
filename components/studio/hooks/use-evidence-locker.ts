'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EvidenceAsset } from '@/lib/studio/types';

type UseEvidenceLockerResult = {
  evidence: EvidenceAsset[];
  selectedEvidenceIds: string[];
  selectedEvidence: EvidenceAsset[];
  loading: boolean;
  mutating: boolean;
  refresh: () => Promise<void>;
  toggleEvidence: (evidenceId: string) => void;
  clearSelection: () => void;
  setSelectedEvidenceIds: (ids: string[]) => void;
  uploadFileEvidence: (file: File, options?: { title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
  createUrlEvidence: (options: { url: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
  createNoteEvidence: (options: { noteText: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
};

function dedupeStringList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function useEvidenceLocker(brandId: string | null): UseEvidenceLockerResult {
  const [evidence, setEvidence] = useState<EvidenceAsset[]>([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  const refresh = useCallback(async () => {
    if (!brandId) {
      setEvidence([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/studio/evidence/list?brandId=${encodeURIComponent(brandId)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorPayload.error || 'Failed to load evidence');
      }

      const payload = (await response.json()) as { evidence?: EvidenceAsset[] };
      setEvidence(Array.isArray(payload.evidence) ? payload.evidence : []);
    } catch (error) {
      toast.error('Could not load evidence', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setEvidence([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    setSelectedEvidenceIds([]);
    void refresh();
  }, [refresh]);

  const toggleEvidence = useCallback((evidenceId: string) => {
    setSelectedEvidenceIds((prev) =>
      prev.includes(evidenceId) ? prev.filter((id) => id !== evidenceId) : dedupeStringList([...prev, evidenceId])
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEvidenceIds([]);
  }, []);

  const uploadFileEvidence = useCallback(
    async (
      file: File,
      options?: { title?: string; description?: string; bucket?: string; tags?: string[] }
    ) => {
      if (!brandId) return;
      setMutating(true);
      try {
        const form = new FormData();
        form.set('brandId', brandId);
        form.set('file', file);
        if (options?.title) form.set('title', options.title);
        if (options?.description) form.set('description', options.description);
        if (options?.bucket) form.set('bucket', options.bucket);
        if (options?.tags?.length) form.set('tags', JSON.stringify(options.tags));

        const response = await fetch('/api/studio/evidence/upload', {
          method: 'POST',
          body: form,
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to upload evidence');
        }

        await refresh();
        toast.success('Evidence uploaded');
      } catch (error) {
        toast.error('Upload failed', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, refresh]
  );

  const createUrlEvidence = useCallback(
    async (options: { url: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => {
      if (!brandId) return;
      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/create-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, ...options }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to create URL evidence');
        }

        await refresh();
        toast.success('URL evidence saved');
      } catch (error) {
        toast.error('Could not save URL evidence', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, refresh]
  );

  const createNoteEvidence = useCallback(
    async (options: { noteText: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => {
      if (!brandId) return;
      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/create-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, ...options }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to create note evidence');
        }

        await refresh();
        toast.success('Note evidence saved');
      } catch (error) {
        toast.error('Could not save note evidence', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, refresh]
  );

  const selectedEvidence = useMemo(() => {
    const ids = new Set(selectedEvidenceIds);
    return evidence.filter((item) => ids.has(item.id));
  }, [evidence, selectedEvidenceIds]);

  return {
    evidence,
    selectedEvidenceIds,
    selectedEvidence,
    loading,
    mutating,
    refresh,
    toggleEvidence,
    clearSelection,
    setSelectedEvidenceIds,
    uploadFileEvidence,
    createUrlEvidence,
    createNoteEvidence,
  };
}
