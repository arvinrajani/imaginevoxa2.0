'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, CheckCircle2, XCircle, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const INDUSTRIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'construction', label: 'Construction' },
  { value: 'technology', label: 'Technology' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'general', label: 'General' },
];

interface UploadResult {
  name: string;
  url: string;
}

export function LocalBackgroundUploader() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState('electrical');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<UploadResult[]>([]);
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files).slice(0, 20);
    setSelectedFiles(fileArray);
    setResults([]);
    setErrors([]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, 20);
    setSelectedFiles(files);
    setResults([]);
    setErrors([]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      toast.error('No files selected');
      return;
    }

    setIsUploading(true);
    setProgress({ current: 0, total: selectedFiles.length });
    setResults([]);
    setErrors([]);

    try {
      const formData = new FormData();
      formData.append('industry', selectedIndustry);
      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      setProgress({ current: 1, total: selectedFiles.length });

      const res = await fetch('/api/admin/backgrounds/upload-batch', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setProgress({ current: selectedFiles.length, total: selectedFiles.length });

      if (data.files && data.files.length > 0) {
        setResults(data.files);
        toast.success(`${data.uploaded} background${data.uploaded !== 1 ? 's' : ''} uploaded`);
      }

      if (data.errors && data.errors.length > 0) {
        setErrors(data.errors);
        toast.error(`${data.failed} file${data.failed !== 1 ? 's' : ''} failed`);
      }

      if (data.uploaded > 0) {
        setSelectedFiles([]);
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">
        Upload Local Background Images
      </h3>

      {/* Industry select */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Industry</label>
        <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
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
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50"
      >
        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-gray-400" />
        <p className="text-sm font-medium text-gray-600">
          Drop images here or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-400">
          PNG, JPG, WebP • Max 20 files • Max 20MB each
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {selectedFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="truncate text-gray-700">{file.name}</span>
                <span className="ml-2 shrink-0 text-gray-400">
                  {formatSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload button */}
      {selectedFiles.length > 0 && (
        <Button
          onClick={handleUpload}
          disabled={isUploading}
          size="sm"
          className="w-full sm:w-auto"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Uploading {progress.current}/{progress.total}…
            </>
          ) : (
            <>
              <Upload className="mr-1 h-3 w-3" />
              Upload {selectedFiles.length} Image{selectedFiles.length !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      )}

      {/* Upload results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-green-700">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            {results.length} uploaded successfully
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {results.map((r, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-lg border border-green-200"
              >
                <div className="aspect-video">
                  <img
                    src={r.url}
                    alt={r.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                  <span className="truncate text-[10px] font-medium text-gray-700">
                    {r.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-700">
            <XCircle className="mr-1 inline h-4 w-4" />
            {errors.length} failed
          </p>
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-red-600">
              <span className="font-medium">{e.name}:</span> {e.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
