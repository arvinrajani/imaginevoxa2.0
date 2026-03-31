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
  evidence?: Partial<EvidenceAsset> & {
    id?: string | null;
  };
  extracted_evidence?: Array<
    Partial<EvidenceAsset> & {
      id?: string | null;
    }
  >;
  knowledge_sync?: UploadKnowledgeSync;
  chatbot_sync?: {
    status?: string;
    detail?: string;
    chunks_created?: number;
  };
  storage_warning?: string | null;
};

type ReextractPdfPayload = {
  processed?: number;
  deleted_existing?: number;
  found_count?: number;
  saved_count?: number;
  detail?: string;
};

export type EvidenceUploadState = {
  active: boolean;
  totalFiles: number;
  completedFiles: number;
  successfulFiles: number;
  failedFiles: number;
  currentFileName: string | null;
  pendingFileNames: string[];
  failedFileNames: string[];
};

type UseEvidenceLockerResult = {
  evidence: EvidenceAsset[];
  selectedEvidenceIds: string[];
  selectedEvidence: EvidenceAsset[];
  loading: boolean;
  mutating: boolean;
  uploadState: EvidenceUploadState;
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
const EMPTY_UPLOAD_STATE: EvidenceUploadState = {
  active: false,
  totalFiles: 0,
  completedFiles: 0,
  successfulFiles: 0,
  failedFiles: 0,
  currentFileName: null,
  pendingFileNames: [],
  failedFileNames: [],
};

function dedupeStringList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeEvidenceAsset(
  asset: UploadEvidencePayload['evidence'],
  fallback: { brandId: string; fileName: string; options?: UploadEvidenceOptions }
): EvidenceAsset | null {
  if (!asset || typeof asset.id !== 'string' || !asset.id.trim()) {
    return null;
  }

  const type =
    asset.type === 'image' ||
    asset.type === 'url' ||
    asset.type === 'note' ||
    asset.type === 'pdf'
      ? asset.type
      : 'pdf';

  return {
    id: asset.id,
    brand_id:
      typeof asset.brand_id === 'string' && asset.brand_id.trim()
        ? asset.brand_id
        : fallback.brandId,
    owner_user_id:
      typeof asset.owner_user_id === 'string' ? asset.owner_user_id : '',
    type,
    title:
      typeof asset.title === 'string' && asset.title.trim()
        ? asset.title
        : fallback.fileName,
    description:
      typeof asset.description === 'string'
        ? asset.description
        : fallback.options?.description ?? null,
    bucket:
      typeof asset.bucket === 'string' && asset.bucket.trim()
        ? asset.bucket
        : fallback.options?.bucket || 'general',
    tags: Array.isArray(asset.tags)
      ? asset.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean)
      : fallback.options?.tags || [],
    file_path:
      typeof asset.file_path === 'string' && asset.file_path.trim()
        ? asset.file_path
        : null,
    url:
      typeof asset.url === 'string' && asset.url.trim()
        ? asset.url
        : null,
    note_text:
      typeof asset.note_text === 'string' && asset.note_text.trim()
        ? asset.note_text
        : null,
    created_at:
      typeof asset.created_at === 'string' && asset.created_at.trim()
        ? asset.created_at
        : new Date().toISOString(),
    signed_url:
      typeof asset.signed_url === 'string' && asset.signed_url.trim()
        ? asset.signed_url
        : null,
  };
}

function upsertEvidenceAsset(list: EvidenceAsset[], asset: EvidenceAsset) {
  const next = [asset, ...list.filter((item) => item.id !== asset.id)];
  next.sort((left, right) => {
    const rightTime = Date.parse(right.created_at || '') || 0;
    const leftTime = Date.parse(left.created_at || '') || 0;
    return rightTime - leftTime;
  });
  return next;
}

export function useEvidenceLocker(brandId: string | null): UseEvidenceLockerResult {
  const [evidence, setEvidence] = useState<EvidenceAsset[]>([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [uploadState, setUploadState] = useState<EvidenceUploadState>(EMPTY_UPLOAD_STATE);

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

        const extractedAssets = Array.isArray(payload.extracted_evidence)
          ? payload.extracted_evidence
              .map((asset) =>
                normalizeEvidenceAsset(asset, {
                  brandId,
                  fileName: file.name,
                  options,
                })
              )
              .filter((asset): asset is EvidenceAsset => Boolean(asset))
          : [];

        if (extractedAssets.length > 0) {
          setEvidence((prev) =>
            extractedAssets.reduce((next, asset) => upsertEvidenceAsset(next, asset), prev)
          );
        }

        if (uploadedEvidenceId) {
          setSelectedEvidenceIds((prev) =>
            dedupeStringList([...prev, uploadedEvidenceId])
          );
        }

        const chatbotIndexed = payload.chatbot_sync?.status === 'indexed';

        if (payload.knowledge_sync?.status === 'ingested') {
          const extractedCount = payload.knowledge_sync.image_extraction?.saved_count ?? 0;
          if (extractedCount > 0) {
            toast.success(
              `PDF uploaded, indexed, and ${extractedCount} image${
                extractedCount === 1 ? '' : 's'
              } extracted`,
              chatbotIndexed
                ? {
                    description:
                      'Ready for post generation, Image Creator, and chatbot answers.',
                  }
                : undefined
            );
          } else {
            toast.success(
              chatbotIndexed
                ? 'PDF uploaded and indexed for post generation + chatbot'
                : 'PDF uploaded and indexed for post generation'
            );
          }
        } else if (chatbotIndexed) {
          toast.success('PDF uploaded and indexed for chatbot answers');
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

        // Surface image extraction failures so the user knows
        const imgExtraction = payload.knowledge_sync?.image_extraction;
        if (imgExtraction) {
          const extractionStatus = imgExtraction.status || '';
          if (extractionStatus === 'extract_failed' || extractionStatus === 'none_found') {
            toast.warning('No images could be extracted from this PDF', {
              description: imgExtraction.detail || 'The PDF may not contain extractable images, or the extraction engine encountered an error.',
            });
          }
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

      const fileNames = files.map((file) => file.name);
      setMutating(true);
      setUploadState({
        active: true,
        totalFiles: files.length,
        completedFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        currentFileName: fileNames[0] || null,
        pendingFileNames: fileNames,
        failedFileNames: [],
      });

      const uploadedEvidenceIds: string[] = [];
      const failures: string[] = [];
      let indexedPdfCount = 0;
      let chatbotIndexedCount = 0;
      let extractedImageCount = 0;
      let storageWarningCount = 0;

      try {
        for (const [index, file] of files.entries()) {
          setUploadState((prev) => ({
            ...prev,
            currentFileName: file.name,
            pendingFileNames: fileNames.slice(index),
          }));

          try {
            const payload = await performFileUpload(file, options);
            const uploadedEvidenceId =
              typeof payload.evidence?.id === 'string' && payload.evidence.id
                ? payload.evidence.id
                : null;

            if (uploadedEvidenceId) {
              uploadedEvidenceIds.push(uploadedEvidenceId);
            }

            const uploadedAsset = normalizeEvidenceAsset(payload.evidence, {
              brandId,
              fileName: file.name,
              options,
            });
            if (uploadedAsset) {
              setEvidence((prev) => upsertEvidenceAsset(prev, uploadedAsset));
            }

            const extractedAssets = Array.isArray(payload.extracted_evidence)
              ? payload.extracted_evidence
                  .map((asset) =>
                    normalizeEvidenceAsset(asset, {
                      brandId,
                      fileName: file.name,
                      options,
                    })
                  )
                  .filter((asset): asset is EvidenceAsset => Boolean(asset))
              : [];
            if (extractedAssets.length > 0) {
              setEvidence((prev) =>
                extractedAssets.reduce((next, asset) => upsertEvidenceAsset(next, asset), prev)
              );
            }

            if (payload.knowledge_sync?.status === 'ingested') {
              indexedPdfCount += 1;
            }

            if (payload.chatbot_sync?.status === 'indexed') {
              chatbotIndexedCount += 1;
            }

            extractedImageCount += payload.knowledge_sync?.image_extraction?.saved_count ?? 0;

            // Track extraction failures for batch summary
            const batchImgStatus = payload.knowledge_sync?.image_extraction?.status || '';
            if (batchImgStatus === 'extract_failed' || batchImgStatus === 'none_found') {
              failures.push(`${file.name}: No images could be extracted`);
            }

            if (payload.storage_warning) {
              storageWarningCount += 1;
            }

            setUploadState((prev) => ({
              ...prev,
              completedFiles: prev.completedFiles + 1,
              successfulFiles: prev.successfulFiles + 1,
              currentFileName:
                index + 1 < fileNames.length ? fileNames[index + 1] || null : null,
              pendingFileNames: fileNames.slice(index + 1),
            }));
          } catch (error) {
            failures.push(
              error instanceof Error && error.message
                ? `${file.name}: ${error.message}`
                : `${file.name}: Upload failed`
            );

            setUploadState((prev) => ({
              ...prev,
              completedFiles: prev.completedFiles + 1,
              failedFiles: prev.failedFiles + 1,
              failedFileNames: [...prev.failedFileNames, file.name],
              currentFileName:
                index + 1 < fileNames.length ? fileNames[index + 1] || null : null,
              pendingFileNames: fileNames.slice(index + 1),
            }));
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
                      chatbotIndexedCount > 0
                        ? `, ${chatbotIndexedCount} ready for chatbot answers`
                        : ''
                    }${
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
        setUploadState(EMPTY_UPLOAD_STATE);
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
      const matchedItems = evidence.filter((item) => uniqueIds.includes(item.id));
      const allPdfs =
        matchedItems.length > 0 && matchedItems.every((item) => item.type === 'pdf');
      const allImages =
        matchedItems.length > 0 && matchedItems.every((item) => item.type === 'image');

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

        const deletedLabel = allPdfs
          ? `PDF${deletedCount === 1 ? '' : 's'}`
          : allImages
            ? `extracted image${deletedCount === 1 ? '' : 's'}`
            : `evidence item${deletedCount === 1 ? '' : 's'}`;
        const emptyLabel = allPdfs
          ? 'PDFs'
          : allImages
            ? 'extracted images'
            : 'evidence items';
        const deletedDescription = allPdfs
          ? 'Removed from Knowledge Base and post grounding.'
          : allImages
            ? 'Removed from the PDF visual library.'
            : 'Removed from Studio evidence.';

        toast.success(`${deletedCount} ${deletedLabel} deleted`, {
          description:
            deletedCount > 0
              ? deletedDescription
              : `No matching ${emptyLabel} were found to delete.`,
        });
      } catch (error) {
        toast.error('Delete failed', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutating(false);
      }
    },
    [brandId, evidence, refresh]
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
    uploadState,
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
