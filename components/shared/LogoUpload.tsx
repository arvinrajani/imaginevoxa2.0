'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LogoUploadProps {
  label: string;
  description: string;
  currentUrl: string | null;
  bucket: 'company-logos' | 'brand-logos';
  storagePath: string; // e.g. 'companyId/logo' or 'brandId/logo'
  onUploaded: (url: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];

function resizeOnCanvas(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 512;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/png'
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

export function LogoUpload({
  label,
  description,
  currentUrl,
  bucket,
  storagePath,
  onUploaded,
}: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Only PNG, SVG, JPEG, or WebP files are accepted.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('File exceeds 5 MB limit.');
        return;
      }

      setUploading(true);
      try {
        const blob = await resizeOnCanvas(file);
        const path = `${storagePath}-${Date.now()}.png`;

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, blob, { contentType: 'image/png', upsert: true });

        if (uploadErr) throw uploadErr;

        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(path);

        setPreviewUrl(publicUrl);
        onUploaded(publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [supabase, bucket, storagePath, onUploaded]
  );

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500">{description}</p>

      {previewUrl ? (
        <div className="flex items-center gap-4 mt-2">
          <img
            src={previewUrl}
            alt={label}
            className="h-16 w-16 rounded-xl border border-gray-200 object-contain bg-white"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              'Change'
            )}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500 transition hover:border-violet-400 hover:bg-gray-100 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span>Upload logo (PNG, SVG, JPG, WebP – max 5 MB)</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
