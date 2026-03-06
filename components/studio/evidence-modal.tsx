'use client';

import { useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Link2, NotebookPen, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EvidenceAsset } from '@/lib/studio/types';

type EvidenceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string | null;
  evidence: EvidenceAsset[];
  selectedEvidenceIds: string[];
  loading: boolean;
  mutating: boolean;
  onToggleEvidence: (evidenceId: string) => void;
  onClearSelection: () => void;
  onUploadFile: (file: File, options?: { title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
  onCreateUrl: (options: { url: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
  onCreateNote: (options: { noteText: string; title?: string; description?: string; bucket?: string; tags?: string[] }) => Promise<void>;
};

function iconForEvidence(type: EvidenceAsset['type']) {
  if (type === 'pdf') return FileText;
  if (type === 'image') return ImageIcon;
  if (type === 'url') return Link2;
  return NotebookPen;
}

function normalizeTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function EvidenceModal({
  open,
  onOpenChange,
  brandId,
  evidence,
  selectedEvidenceIds,
  loading,
  mutating,
  onToggleEvidence,
  onClearSelection,
  onUploadFile,
  onCreateUrl,
  onCreateNote,
}: EvidenceModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'url' | 'note'>('list');
  const [search, setSearch] = useState('');

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadBucket, setUploadBucket] = useState('general');
  const [uploadTags, setUploadTags] = useState('');
  const [isUploadActive, setIsUploadActive] = useState(false);

  const [urlTitle, setUrlTitle] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [urlDescription, setUrlDescription] = useState('');
  const [urlBucket, setUrlBucket] = useState('general');
  const [urlTags, setUrlTags] = useState('');

  const [noteTitle, setNoteTitle] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [noteDescription, setNoteDescription] = useState('');
  const [noteBucket, setNoteBucket] = useState('general');
  const [noteTags, setNoteTags] = useState('');

  const selectedSet = useMemo(() => new Set(selectedEvidenceIds), [selectedEvidenceIds]);

  const filteredEvidence = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return evidence;
    return evidence.filter((item) => {
      const haystack = [item.title, item.description, item.bucket, ...(item.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [evidence, search]);

  const submitUploadFile = async (file: File | null) => {
    if (!file || !brandId) return;

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      return;
    }

    await onUploadFile(file, {
      title: uploadTitle,
      description: uploadDescription,
      bucket: uploadBucket,
      tags: normalizeTags(uploadTags),
    });

    setUploadTitle('');
    setUploadDescription('');
    setUploadTags('');
  };

  const pickSupportedFile = (files: ArrayLike<File>) =>
    Array.from(files).find((file) => {
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      return isPdf || file.type.startsWith('image/');
    }) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-200/60 bg-white text-gray-900 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Evidence Locker</DialogTitle>
          <DialogDescription className="text-gray-600">
            Upload facts and references, then select the evidence to ground this run.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {[
              { id: 'list', label: 'Evidence List' },
              { id: 'upload', label: 'Upload File' },
              { id: 'url', label: 'Add URL' },
              { id: 'note', label: 'Add Note' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as 'list' | 'upload' | 'url' | 'note')}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                    : 'border-gray-200/60 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="rounded-lg border border-gray-200/60 bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-900">Selected evidence</p>
              <p className="mt-1">{selectedEvidenceIds.length} item{selectedEvidenceIds.length === 1 ? '' : 's'} selected</p>
              {selectedEvidenceIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onClearSelection}
                  className="mt-2 h-7 border-gray-200 bg-transparent text-gray-700"
                >
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {activeTab === 'list' && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, tags, or bucket"
                    className="border-gray-200/60 bg-gray-100 pl-9 text-gray-900"
                  />
                </div>
                <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                  {loading ? (
                    <p className="text-sm text-gray-600">Loading evidence...</p>
                  ) : filteredEvidence.length === 0 ? (
                    <p className="text-sm text-gray-600">No evidence found for this brand yet.</p>
                  ) : (
                    filteredEvidence.map((item) => {
                      const Icon = iconForEvidence(item.type);
                      const checked = selectedSet.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onToggleEvidence(item.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            checked
                              ? 'border-cyan-400 bg-cyan-50'
                              : 'border-gray-200/60 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <Icon className="h-4 w-4 text-cyan-600" />
                                <span className="truncate">{item.title}</span>
                              </p>
                              {item.description ? (
                                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{item.description}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Badge className="bg-gray-100 text-gray-700">{item.type.toUpperCase()}</Badge>
                                <Badge className="bg-gray-100 text-gray-600">{item.bucket}</Badge>
                                {(item.tags || []).slice(0, 4).map((tag) => (
                                  <Badge key={`${item.id}-${tag}`} className="bg-cyan-50 text-cyan-700">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {checked ? (
                              <span className="rounded-full bg-cyan-50/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                                Selected
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {activeTab === 'upload' && (
              <div className="space-y-3">
                <Input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <Textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="min-h-[96px] border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={uploadBucket}
                    onChange={(e) => setUploadBucket(e.target.value)}
                    placeholder="Bucket (ads/chat/misc/general)"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                  <Input
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="Tags comma-separated"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                </div>
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm transition-colors ${
                    isUploadActive
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                  tabIndex={0}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsUploadActive(true);
                  }}
                  onDragLeave={() => setIsUploadActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsUploadActive(false);
                    const file = pickSupportedFile(e.dataTransfer.files);
                    void submitUploadFile(file);
                  }}
                  onPaste={(e) => {
                    const pastedFiles = Array.from(e.clipboardData.items)
                      .map((item) => item.getAsFile())
                      .filter((file): file is File => Boolean(file));
                    const file = pickSupportedFile(pastedFiles);
                    if (!file) return;
                    e.preventDefault();
                    void submitUploadFile(file);
                  }}
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose, drop, or paste a PDF or image file (max 300MB).</span>
                  <span className="text-center text-xs text-gray-500">
                    PDFs are saved in Studio only, auto-indexed for post generation, and any embedded images become available in Image Creator.
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void submitUploadFile(file || null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            )}

            {activeTab === 'url' && (
              <div className="space-y-3">
                <Input
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <Input
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://example.com/source"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <Textarea
                  value={urlDescription}
                  onChange={(e) => setUrlDescription(e.target.value)}
                  placeholder="Why this source matters"
                  className="min-h-[96px] border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={urlBucket}
                    onChange={(e) => setUrlBucket(e.target.value)}
                    placeholder="Bucket"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                  <Input
                    value={urlTags}
                    onChange={(e) => setUrlTags(e.target.value)}
                    placeholder="Tags comma-separated"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                </div>
                <Button
                  onClick={() =>
                    void onCreateUrl({
                      url: urlValue,
                      title: urlTitle,
                      description: urlDescription,
                      bucket: urlBucket,
                      tags: normalizeTags(urlTags),
                    })
                  }
                  disabled={!urlValue.trim() || mutating}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
                >
                  Save URL evidence
                </Button>
              </div>
            )}

            {activeTab === 'note' && (
              <div className="space-y-3">
                <Input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Title"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <Textarea
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Paste facts, quotes, or instructions"
                  className="min-h-[140px] border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <Textarea
                  value={noteDescription}
                  onChange={(e) => setNoteDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="min-h-[96px] border-gray-200/60 bg-gray-100 text-gray-900"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={noteBucket}
                    onChange={(e) => setNoteBucket(e.target.value)}
                    placeholder="Bucket"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                  <Input
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                    placeholder="Tags comma-separated"
                    className="border-gray-200/60 bg-gray-100 text-gray-900"
                  />
                </div>
                <Button
                  onClick={() =>
                    void onCreateNote({
                      noteText: noteValue,
                      title: noteTitle,
                      description: noteDescription,
                      bucket: noteBucket,
                      tags: normalizeTags(noteTags),
                    })
                  }
                  disabled={!noteValue.trim() || mutating}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
                >
                  Save note evidence
                </Button>
              </div>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="ml-auto border-gray-200 bg-transparent text-gray-700"
        >
          <X className="mr-1.5 h-4 w-4" />
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
