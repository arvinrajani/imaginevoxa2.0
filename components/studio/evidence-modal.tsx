'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EvidenceAsset } from '@/lib/studio/types';
import { EvidenceUploadState } from '@/components/studio/hooks/use-evidence-locker';

type EvidenceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string | null;
  evidence: EvidenceAsset[];
  selectedEvidenceIds: string[];
  loading: boolean;
  mutating: boolean;
  uploadState: EvidenceUploadState;
  onToggleEvidence: (evidenceId: string) => void;
  onClearSelection: () => void;
  onDeleteEvidenceIds: (ids: string[]) => Promise<void>;
  onReextractPdfEvidence: (ids: string[]) => Promise<void>;
  onUploadFiles: (
    files: File[],
    options?: { title?: string; description?: string; bucket?: string; tags?: string[] }
  ) => Promise<void>;
  onCreateUrl: (options: {
    url: string;
    title?: string;
    description?: string;
    bucket?: string;
    tags?: string[];
  }) => Promise<void>;
  onCreateNote: (options: {
    noteText: string;
    title?: string;
    description?: string;
    bucket?: string;
    tags?: string[];
  }) => Promise<void>;
};

export function EvidenceModal({
  open,
  onOpenChange,
  brandId,
  evidence,
  selectedEvidenceIds,
  loading,
  mutating,
  uploadState,
  onToggleEvidence,
  onClearSelection,
  onDeleteEvidenceIds,
  onReextractPdfEvidence,
  onUploadFiles,
}: EvidenceModalProps) {
  const [search, setSearch] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [isUploadActive, setIsUploadActive] = useState(false);

  const pdfEvidence = useMemo(
    () => evidence.filter((item) => item.type === 'pdf'),
    [evidence]
  );

  const selectedSet = useMemo(() => new Set(selectedEvidenceIds), [selectedEvidenceIds]);
  const uploadPercent =
    uploadState.totalFiles > 0
      ? Math.round((uploadState.completedFiles / uploadState.totalFiles) * 100)
      : 0;

  const filteredEvidence = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pdfEvidence;
    return pdfEvidence.filter((item) => item.title.toLowerCase().includes(query));
  }, [pdfEvidence, search]);

  const submitUploadFiles = async (files: ArrayLike<File> | null | undefined) => {
    if (!files || !brandId) return;

    const pdfFiles = Array.from(files).filter(
      (file) =>
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) return;

    await onUploadFiles(pdfFiles, {
      title: pdfFiles.length === 1 && uploadTitle.trim() ? uploadTitle.trim() : undefined,
      bucket: 'general',
      tags: ['pdf-knowledge'],
    });

    setUploadTitle('');
  };

  const handleDeleteSelected = async () => {
    if (selectedEvidenceIds.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedEvidenceIds.length} selected PDF${selectedEvidenceIds.length === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!confirmed) return;

    await onDeleteEvidenceIds(selectedEvidenceIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-200/60 bg-white text-gray-900 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Knowledge Base</DialogTitle>
          <DialogDescription className="text-gray-600">
            Upload PDFs, then select the files that should ground this post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Upload PDF</p>
                <p className="mt-1 text-xs text-slate-600">
                  Multiple PDFs are supported. Each uploaded PDF is indexed for post generation and now extracts embedded visuals plus page renders for Image Creator.
                </p>
              </div>
              <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-700">
                Limit: up to 1GB per PDF
              </div>
            </div>

            <div className="mt-4">
              <Input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Title (optional for a single PDF)"
                className="border-gray-200/60 bg-white text-gray-900"
                disabled={uploadState.active}
              />
            </div>

            {uploadState.active ? (
              <div className="mt-4 rounded-xl border border-cyan-200 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                      Uploading PDFs
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {uploadState.completedFiles} of {uploadState.totalFiles} finished
                      {uploadState.currentFileName ? `, working on ${uploadState.currentFileName}` : ''}.
                    </p>
                  </div>
                  <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {uploadPercent}%
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyan-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {uploadState.successfulFiles} uploaded
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {Math.max(uploadState.totalFiles - uploadState.completedFiles, 0)} remaining
                  </span>
                  {uploadState.failedFiles > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {uploadState.failedFiles} failed
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <label
              className={`mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm transition-colors ${
                isUploadActive
                  ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                  : uploadState.active
                    ? 'border-cyan-200 bg-cyan-50/60 text-cyan-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              tabIndex={uploadState.active ? -1 : 0}
              onDragOver={(event) => {
                if (uploadState.active) return;
                event.preventDefault();
                setIsUploadActive(true);
              }}
              onDragLeave={() => setIsUploadActive(false)}
              onDrop={(event) => {
                if (uploadState.active) return;
                event.preventDefault();
                setIsUploadActive(false);
                void submitUploadFiles(event.dataTransfer.files);
              }}
            >
              {uploadState.active ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <span className="font-medium">
                {uploadState.active
                  ? 'Uploading PDFs...'
                  : 'Choose or drop one or more PDF files'}
              </span>
              <span className="text-center text-xs text-gray-500">
                {uploadState.active
                  ? 'Keep this window open. Uploaded PDFs will appear below as each file completes.'
                  : 'PDF text is extracted and used as knowledge for post generation.'}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                disabled={uploadState.active}
                onChange={(event) => {
                  void submitUploadFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <div className="rounded-2xl border border-gray-200/70 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">All PDFs</p>
                <p className="mt-1 text-xs text-slate-600">
                  {uploadState.active
                    ? `${pdfEvidence.length} visible so far. New PDFs appear here as each upload finishes.`
                    : `${pdfEvidence.length} PDF${pdfEvidence.length === 1 ? '' : 's'} in this knowledge base`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {selectedEvidenceIds.length} selected
                </div>
                {selectedEvidenceIds.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onClearSelection}
                    className="border-gray-200 bg-white text-gray-700"
                    disabled={mutating}
                  >
                    Clear
                  </Button>
                ) : null}
                {selectedEvidenceIds.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onReextractPdfEvidence(selectedEvidenceIds)}
                    className="border-cyan-200 bg-white text-cyan-700"
                    disabled={mutating}
                  >
                    Re-extract visuals
                  </Button>
                ) : null}
                {selectedEvidenceIds.length > 0 ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDeleteSelected()}
                    disabled={mutating}
                  >
                    Delete selected
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PDF title"
                className="border-gray-200/60 bg-gray-50 pl-9 text-gray-900"
              />
            </div>

            <div className="mt-4 max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-gray-600">Loading PDFs...</p>
              ) : filteredEvidence.length === 0 ? (
                <p className="text-sm text-gray-600">No PDFs uploaded for this brand yet.</p>
              ) : (
                filteredEvidence.map((item) => {
                  const selected = selectedSet.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onToggleEvidence(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-cyan-400 bg-cyan-50'
                          : 'border-gray-200/60 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 flex-shrink-0 text-cyan-600" />
                        <span className="truncate text-sm font-medium text-gray-900">
                          {item.title}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          selected
                            ? 'bg-cyan-600 text-white'
                            : 'bg-white text-gray-500'
                        }`}
                      >
                        {selected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutating}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
