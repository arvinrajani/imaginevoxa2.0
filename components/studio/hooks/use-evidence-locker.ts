'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EvidenceAsset } from '@/lib/studio/types';

type UploadEvidenceOptions = {
  title?: string;
  description?: string;
  bucket?: string;
  tags?: string[];
};

type UploadKnowledgeSync = {
  status?: string;
  detail?: string;
  text_chars?: number;
  image_extraction?: {
    status?: string;
    saved_count?: number;
    found_count?: number;
    detail?: string;
  };
};

type UploadEvidencePayload = {
  evidence?: {
    id?: string | null;
  };
  knowledge_sync?: UploadKnowledgeSync;
  storage_warning?: string | null;
};

type ReextractPdfPayload = {
  processed?: number;
  deleted_existing?: number;
  found_count?: number;
  saved_count?: number;
  detail?: string;
};

type UseEvidenceLockerResult = {
  evidence: EvidenceAsset[];
  selectedEvidenceIds: string[];
  selectedEvidence: EvidenceAsset[];
  loading: boolean;
  mutating: boolean;
  refresh: () => Promise<void>;
  toggleEvidence: (evidenceId: string) => void;
  clearSelection: () => void;
  deleteEvidenceByIds: (ids: string[]) => Promise<void>;
  reextractPdfEvidence: (ids: string[]) => Promise<void>;
  setSelectedEvidenceIds: (ids: string[]) => void;
  uploadFileEvidence: (
    file: File,
    options?: UploadEvidenceOptions
  ) => Promise<void>;
  uploadFilesEvidence: (
    files: File[],
    options?: UploadEvidenceOptions
  ) => Promise<void>;
  createUrlEvidence: (options: {
    url: string;
    title?: string;
    description?: string;
    bucket?: string;
    tags?: string[];
  }) => Promise<void>;
  createNoteEvidence: (options: {
    noteText: string;
    title?: string;
    description?: string;
    bucket?: string;
    tags?: string[];
  }) => Promise<void>;
};

const MAX_EVIDENCE_FILE_BYTES = 1024 * 1024 * 1024;

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
      const response = await fetch(
        `/api/studio/evidence/list?brandId=${encodeURIComponent(brandId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
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
      prev.includes(evidenceId)
        ? prev.filter((id) => id !== evidenceId)
        : dedupeStringList([...prev, evidenceId])
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEvidenceIds([]);
  }, []);

  const performFileUpload = useCallback(
    async (file: File, options?: UploadEvidenceOptions): Promise<UploadEvidencePayload> => {
      if (!brandId) {
        throw new Error('Select a brand before uploading evidence.');
      }

      if (file.size > MAX_EVIDENCE_FILE_BYTES) {
        throw new Error('Each file must be 1GB or less.');
      }

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
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorPayload.error || 'Failed to upload evidence');
      }

      return (await response.json().catch(() => ({}))) as UploadEvidencePayload;
    },
    [brandId]
  );

  const uploadFileEvidence = useCallback(
    async (file: File, options?: UploadEvidenceOptions) => {
      if (!brandId) return;

      setMutating(true);
      try {
        const payload = await performFileUpload(file, options);
        await refresh();

        const uploadedEvidenceId =
          typeof payload.evidence?.id === 'string' && payload.evidence.id
            ? payload.evidence.id
            : null;

        if (uploadedEvidenceId) {
          setSelectedEvidenceIds((prev) =>
            dedupeStringList([...prev, uploadedEvidenceId])
          );
        }

        if (payload.knowledge_sync?.status === 'ingested') {
          const extractedCount = payload.knowledge_sync.image_extraction?.saved_count ?? 0;
          if (extractedCount > 0) {
            toast.success(
              `PDF uploaded, indexed, and ${extractedCount} image${
                extractedCount === 1 ? '' : 's'
              } extracted`
            );
          } else {
            toast.success('PDF uploaded and indexed for post generation');
          }
        } else if (payload.knowledge_sync?.status) {
          const extractedCount = payload.knowledge_sync.image_extraction?.saved_count ?? 0;
          if (extractedCount > 0) {
            toast.success(
              `PDF uploaded - ${extractedCount} image${
                extractedCount === 1 ? '' : 's'
              } extracted`,
              {
                description:
                  payload.knowledge_sync.detail ||
                  'Text could not be indexed, but extracted images were still saved for Image Creator.',
              }
            );
          } else {
            toast.success('PDF uploaded', {
              description:
                payload.knowledge_sync.detail ||
                'The PDF was added, but knowledge indexing is incomplete.',
            });
          }
        } else {
          toast.success('PDF uploaded');
        }

        if (payload.storage_warning) {
          toast.message('PDF indexed with storage warning', {
            description: payload.storage_warning,
          });
        }
      } catch (error) {
        toast.error('Upload failed', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, performFileUpload, refresh]
  );

  const uploadFilesEvidence = useCallback(
    async (files: File[], options?: UploadEvidenceOptions) => {
      if (!brandId || files.length === 0) return;

      setMutating(true);
      const uploadedEvidenceIds: string[] = [];
      const failures: string[] = [];
      let indexedPdfCount = 0;
      let extractedImageCount = 0;
      let storageWarningCount = 0;

      try {
        for (const file of files) {
          try {
            const payload = await performFileUpload(file, options);
            const uploadedEvidenceId =
              typeof payload.evidence?.id === 'string' && payload.evidence.id
                ? payload.evidence.id
                : null;

            if (uploadedEvidenceId) {
              uploadedEvidenceIds.push(uploadedEvidenceId);
            }
            if (payload.knowledge_sync?.status === 'ingested') {
              indexedPdfCount += 1;
            }

            extractedImageCount += payload.knowledge_sync?.image_extraction?.saved_count ?? 0;

            if (payload.storage_warning) {
              storageWarningCount += 1;
            }
          } catch (error) {
            failures.push(
              error instanceof Error && error.message
                ? `${file.name}: ${error.message}`
                : `${file.name}: Upload failed`
            );
          }
        }

        await refresh();

        if (uploadedEvidenceIds.length > 0) {
          setSelectedEvidenceIds((prev) =>
            dedupeStringList([...prev, ...uploadedEvidenceIds])
          );

          toast.success(
            `${uploadedEvidenceIds.length} file${
              uploadedEvidenceIds.length === 1 ? '' : 's'
            } uploaded and selected`,
            {
              description:
                indexedPdfCount > 0
                  ? `${indexedPdfCount} PDF${indexedPdfCount === 1 ? '' : 's'} indexed for post generation${
                      extractedImageCount > 0
                        ? ` and ${extractedImageCount} extracted image${
                            extractedImageCount === 1 ? '' : 's'
                          } saved for Image Creator`
                        : ''
                    }${
                      storageWarningCount > 0
                        ? ` ${storageWarningCount} PDF${
                            storageWarningCount === 1 ? '' : 's'
                          } were indexed without storing the original file because of the current Supabase size limit.`
                        : ''
                    }`
                  : 'The uploaded files are now attached to this Studio run.',
            }
          );
        }

        if (failures.length > 0) {
          toast.error(
            `${failures.length} file${failures.length === 1 ? '' : 's'} failed to upload`,
            {
              description: failures.slice(0, 2).join(' | '),
            }
          );
        }
      } finally {
        setMutating(false);
      }
    },
    [brandId, performFileUpload, refresh]
  );

  const createUrlEvidence = useCallback(
    async (options: {
      url: string;
      title?: string;
      description?: string;
      bucket?: string;
      tags?: string[];
    }) => {
      if (!brandId) return;
      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/create-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, ...options }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
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
    async (options: {
      noteText: string;
      title?: string;
      description?: string;
      bucket?: string;
      tags?: string[];
    }) => {
      if (!brandId) return;
      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/create-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, ...options }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
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

  const deleteEvidenceByIds = useCallback(
    async (ids: string[]) => {
      if (!brandId) return;

      const uniqueIds = Array.from(
        new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
      );
      if (uniqueIds.length === 0) return;

      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, evidenceIds: uniqueIds }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorPayload.error || 'Failed to delete evidence');
        }

        const payload = (await response.json().catch(() => ({}))) as {
          deletedCount?: number;
        };
        const deletedCount =
          typeof payload.deletedCount === 'number' ? payload.deletedCount : 0;

        await refresh();
        setSelectedEvidenceIds((prev) => prev.filter((id) => !uniqueIds.includes(id)));

        toast.success(`${deletedCount} PDF${deletedCount === 1 ? '' : 's'} deleted`, {
          description:
            deletedCount > 0
              ? 'Removed from Knowledge Base and post grounding.'
              : 'No matching PDFs were found to delete.',
        });
      } catch (error) {
        toast.error('Delete failed', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, refresh]
  );

  const reextractPdfEvidence = useCallback(
    async (ids: string[]) => {
      if (!brandId) return;

      const uniqueIds = Array.from(
        new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
      );
      if (uniqueIds.length === 0) return;

      setMutating(true);
      try {
        const response = await fetch('/api/studio/evidence/reextract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, evidenceIds: uniqueIds }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorPayload.error || 'Failed to re-extract PDF visuals');
        }

        const payload = (await response.json().catch(() => ({}))) as ReextractPdfPayload;
        await refresh();

        const savedCount =
          typeof payload.saved_count === 'number' ? payload.saved_count : 0;
        const processed =
          typeof payload.processed === 'number' ? payload.processed : uniqueIds.length;

        toast.success(
          `Re-extracted visuals from ${processed} PDF${processed === 1 ? '' : 's'}`,
          {
            description:
              payload.detail ||
              `${savedCount} visual${savedCount === 1 ? '' : 's'} saved for Image Creator.`,
          }
        );
      } catch (error) {
        toast.error('Could not re-extract PDF visuals', {
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
    deleteEvidenceByIds,
    reextractPdfEvidence,
    setSelectedEvidenceIds,
    uploadFileEvidence,
    uploadFilesEvidence,
    createUrlEvidence,
    createNoteEvidence,
  };
}
