'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  Globe,
  FileText,
  Loader2,
  X,
  ImageIcon,
  Search,
  Download,
} from 'lucide-react';

interface ProductImagePickerProps {
  onImageSelected: (dataUri: string) => void;
  onImageCleared: () => void;
  selectedImageUrl: string | null;
}

interface FoundImage {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
}

interface PdfImage {
  dataUri: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page' | 'embedded';
}

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|webp|bmp|tiff?)$/i;

export function ProductImagePicker({
  onImageSelected,
  onImageCleared,
  selectedImageUrl,
}: ProductImagePickerProps) {
  // --- Upload tab ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // --- URL tab ---
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [foundImages, setFoundImages] = useState<FoundImage[]>([]);
  const [fetchingImageUrl, setFetchingImageUrl] = useState<string | null>(null);

  // --- PDF tab ---
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfImages, setPdfImages] = useState<PdfImage[]>([]);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);

  // ─── Upload handlers ───────────────────────────────

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are accepted');
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE) {
        toast.error('Image exceeds 8 MB limit');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        onImageSelected(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [onImageSelected],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // ─── URL handlers ──────────────────────────────────

  async function handleFetchUrl() {
    const url = urlInput.trim();
    if (!url) return;

    if (!url.startsWith('https://')) {
      toast.error('Only HTTPS URLs are supported');
      return;
    }

    setUrlLoading(true);
    setFoundImages([]);

    try {
      // Direct image URL?
      const isDirectImage = IMAGE_EXTENSIONS.test(url);

      if (isDirectImage) {
        const res = await fetch('/api/image/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch image');
        onImageSelected(data.dataUri);
      } else {
        // Webpage — extract images
        const res = await fetch('/api/image/extract-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to extract images');

        if (data.images?.length > 0) {
          setFoundImages(data.images);
        } else {
          toast.info('No images found on that page');
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setUrlLoading(false);
    }
  }

  async function selectFoundImage(img: FoundImage) {
    setFetchingImageUrl(img.url);
    try {
      const res = await fetch('/api/image/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: img.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch image');
      onImageSelected(data.dataUri);
      setFoundImages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch image');
    } finally {
      setFetchingImageUrl(null);
    }
  }

  // ─── PDF handlers ──────────────────────────────────

  async function handlePdfUpload(file: File) {
    if (file.size > MAX_PDF_SIZE) {
      toast.error('PDF exceeds 20 MB limit');
      return;
    }

    setPdfLoading(true);
    setPdfImages([]);
    setPdfMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/image/extract-from-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract from PDF');

      if (data.images?.length > 0) {
        setPdfImages(data.images);
        setPdfMessage(`Found ${data.images.length} image${data.images.length > 1 ? 's' : ''} — click one to use it`);
      } else {
        setPdfMessage(data.message || 'No images found in this PDF');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────

  return (
    <div className="space-y-3">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-1.5 text-xs">
            <Globe className="h-3.5 w-3.5" />
            From URL
          </TabsTrigger>
          <TabsTrigger value="pdf" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />
            From PDF
          </TabsTrigger>
        </TabsList>

        {/* ───── Upload Tab ───── */}
        <TabsContent value="upload" className="mt-3">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition ${
              isDragging
                ? 'border-blue-400 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400 hover:bg-gray-100'
            }`}
          >
            <Upload className="h-6 w-6" />
            <span className="font-medium">
              {isDragging ? 'Drop image here' : 'Click or drag & drop'}
            </span>
            <span className="text-xs text-gray-400">
              PNG, JPEG, WebP, SVG — max 8 MB
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </TabsContent>

        {/* ───── URL Tab ───── */}
        <TabsContent value="url" className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
              placeholder="https://example.com/product.jpg"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={handleFetchUrl}
              disabled={urlLoading || !urlInput.trim()}
              size="sm"
            >
              {urlLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            Paste a direct image URL or a product page URL to find images
          </p>

          {/* Found images grid */}
          {foundImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">
                Found {foundImages.length} image{foundImages.length > 1 ? 's' : ''} — click to select
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {foundImages.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectFoundImage(img)}
                    disabled={fetchingImageUrl === img.url}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-blue-400 hover:ring-2 hover:ring-blue-200"
                  >
                    <img
                      src={img.url}
                      alt={img.alt || `Image ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {fetchingImageUrl === img.url && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-1 pt-4 opacity-0 transition group-hover:opacity-100">
                      <span className="text-[10px] text-white">
                        {img.alt?.slice(0, 40) || `Image ${i + 1}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ───── PDF Tab ───── */}
        <TabsContent value="pdf" className="mt-3 space-y-3">
          <div
            onClick={() => pdfRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-100"
          >
            {pdfLoading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="font-medium text-blue-600">Extracting images from PDF…</span>
              </>
            ) : (
              <>
                <Download className="h-6 w-6" />
                <span className="font-medium">Upload PDF brochure or datasheet</span>
                <span className="text-xs text-gray-400">Max 20 MB</span>
              </>
            )}
          </div>
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePdfUpload(file);
              e.target.value = '';
            }}
          />

          {pdfMessage && (
            <p className="text-xs font-medium text-gray-600">{pdfMessage}</p>
          )}

          {/* PDF extracted images grid */}
          {pdfImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pdfImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onImageSelected(img.dataUri);
                    setPdfImages([]);
                    setPdfMessage(null);
                  }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:border-blue-400 hover:ring-2 hover:ring-blue-200"
                >
                  <img
                    src={img.dataUri}
                    alt={`PDF p.${img.pageNumber}`}
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                    <span className="text-[10px] text-white/90">
                      {img.source === 'embedded' ? 'Image' : 'Page'} · p.{img.pageNumber}
                      {' · '}
                      {img.width}×{img.height}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ───── Selected Image Preview ───── */}
      {selectedImageUrl && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <img
            src={selectedImageUrl}
            alt="Selected product"
            className="h-auto w-[200px] rounded-md border border-gray-200 object-contain"
          />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Product image selected
              </span>
            </div>
            <p className="text-xs text-green-600">
              This will appear as the hero visual on the left side of your banner
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onImageCleared}
              className="w-fit"
            >
              <X className="mr-1.5 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
