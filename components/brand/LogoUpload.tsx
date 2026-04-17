'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Upload, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LogoUploadProps {
  label: string;
  description: string;
  brandId: string;
  field: 'logo_url' | 'partner_logo_url';
  currentUrl: string | null;
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
  brandId,
  field,
  currentUrl,
  onUploaded,
}: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFile(file: File) {
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
      const path = `${brandId}/${field}-${Date.now()}.png`;

      const { error: uploadErr } = await supabase.storage
        .from('brand-logos')
        .upload(path, blob, { contentType: 'image/png', upsert: true });

      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('brand-logos').getPublicUrl(path);

      await supabase
        .from('brands')
        .update({ [field]: publicUrl })
        .eq('id', brandId);

      onUploaded(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500">{description}</p>

      {currentUrl ? (
        <div className="flex items-center gap-3">
          <img
            src={currentUrl}
            alt={label}
            className="max-h-16 object-contain rounded border border-gray-200 bg-white p-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-100"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          <span>{uploading ? 'Uploading…' : `Upload ${label}`}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
