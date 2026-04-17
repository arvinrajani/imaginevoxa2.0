'use client';

import { CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResultDisplayProps {
  result: {
    url: string;
    headline: string;
    tagline: string;
    bullets: string[];
  };
  brandId: string;
  onRegenerate?: () => void;
  onConfirm?: () => void;
}

export function ResultDisplay({ result, onRegenerate, onConfirm }: ResultDisplayProps) {
  // Derive a stable download filename from the URL (already has a timestamp
  // from the upload step). Calling Date.now() during render is impure and
  // crashes under React 19 / Next 16's purity check.
  const downloadFilename = result.url.split('/').pop()?.split('?')[0] || 'banner.png';

  return (
    <div className="space-y-4">
      <img
        src={result.url}
        alt="Generated banner"
        className="w-full rounded-lg border border-gray-200"
      />

      <div className="space-y-2 rounded-lg bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900">
          Headline: {result.headline}
        </p>
        {result.tagline && (
          <p className="text-sm text-gray-600">Tagline: {result.tagline}</p>
        )}
        {result.bullets.length > 0 && (
          <ul className="ml-4 list-disc space-y-1">
            {result.bullets.map((b, i) => (
              <li key={i} className="text-sm text-gray-600">
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        {onConfirm && (
          <Button onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Use This Image
          </Button>
        )}
        <a
          href={result.url}
          download={downloadFilename}
          className="inline-flex"
        >
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </a>
        {onRegenerate && (
          <Button variant="outline" onClick={onRegenerate}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Tip: Right-click the image to copy or save directly
      </p>
    </div>
  );
}
