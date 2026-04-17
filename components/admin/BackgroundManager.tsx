'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Upload, Sparkles, Trash2, X, FolderUp } from 'lucide-react';
import { LocalBackgroundUploader } from './LocalBackgroundUploader';

interface BackgroundItem {
  id: string;
  name: string;
  industry: string;
  storage_url: string;
  preview_url: string;
}

const INDUSTRIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'construction', label: 'Construction' },
  { value: 'technology', label: 'Technology' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'general', label: 'General' },
];

const INDUSTRY_COLORS: Record<string, string> = {
  electrical: 'bg-amber-100 text-amber-800',
  manufacturing: 'bg-gray-100 text-gray-800',
  construction: 'bg-orange-100 text-orange-800',
  technology: 'bg-blue-100 text-blue-800',
  automotive: 'bg-purple-100 text-purple-800',
  healthcare: 'bg-green-100 text-green-800',
  general: 'bg-slate-100 text-slate-800',
};

export function BackgroundManager() {
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BackgroundItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'ai' | 'batch'>('upload');

  // Upload form
  const [uploadName, setUploadName] = useState('');
  const [uploadIndustry, setUploadIndustry] = useState('electrical');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generate form
  const [genIndustry, setGenIndustry] = useState('electrical');
  const [generating, setGenerating] = useState(false);

  const loadBackgrounds = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/backgrounds/list');
      if (res.ok) {
        const data = (await res.json()) as Record<string, BackgroundItem[]>;
        setBackgrounds(Object.values(data).flat());
      }
    } catch (e) {
      console.error('[BackgroundManager] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackgrounds();
  }, [loadBackgrounds]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadName.trim() || !uploadFile) {
      toast.error('Name and file are required');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName.trim());
      formData.append('industry', uploadIndustry);

      const res = await fetch('/api/admin/backgrounds/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      toast.success('Background uploaded');
      setUploadName('');
      setUploadFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadBackgrounds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/backgrounds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: genIndustry }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      toast.success('2 backgrounds added');
      loadBackgrounds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/backgrounds/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      toast.success('Background removed');
      setDeleteTarget(null);
      loadBackgrounds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">
        Background Manager
      </h2>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="mr-1 inline h-3.5 w-3.5" />
          Upload Existing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'ai'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          AI Generate
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('batch')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === 'batch'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderUp className="mr-1 inline h-3.5 w-3.5" />
          Upload Local Images
        </button>
      </div>

      {/* Upload Section */}
      {activeTab === 'upload' && (
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Upload Existing Image
        </h3>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Background name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
            <Select value={uploadIndustry} onValueChange={setUploadIndustry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.value} value={ind.value}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                {uploadFile ? uploadFile.name.slice(0, 20) : 'Choose file'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <Button type="submit" disabled={uploading} size="sm">
            {uploading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3 w-3" />
            )}
            Upload Background
          </Button>
        </form>
      </div>
      )}

      {/* AI Generate Section */}
      {activeTab === 'ai' && (
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          AI Generate Background
        </h3>
        <form onSubmit={handleGenerate} className="space-y-3">
          <Select value={genIndustry} onValueChange={setGenIndustry}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind.value} value={ind.value}>
                  {ind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={generating} size="sm">
            {generating ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            {generating ? 'Generating 2 backgrounds… ~15 seconds' : 'Generate 2 Backgrounds'}
          </Button>
        </form>
      </div>
      )}

      {/* Batch Upload Local Images */}
      {activeTab === 'batch' && (
      <div className="rounded-lg border border-gray-200 p-4">
        <LocalBackgroundUploader />
      </div>
      )}

      {/* Existing Backgrounds Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Existing Backgrounds ({backgrounds.length})
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : backgrounds.length === 0 ? (
          <p className="text-sm text-gray-500">No backgrounds yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {backgrounds.map((bg) => (
              <div
                key={bg.id}
                className="group relative overflow-hidden rounded-lg border border-gray-200"
              >
                <div className="aspect-video">
                  <img
                    src={bg.preview_url}
                    alt={bg.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-gray-800">
                    {bg.name}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      INDUSTRY_COLORS[bg.industry] || INDUSTRY_COLORS.general
                    }`}
                  >
                    {bg.industry}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(bg)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Background</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{deleteTarget?.name}&rdquo;? It will be hidden but
              not deleted from storage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
