'use client';

/**
 * Client-side PDF page renderer using pdfjs-dist + browser Canvas.
 * Used as a fallback when server-side extraction fails (e.g. @napi-rs/canvas unavailable on Vercel).
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

const MAX_RENDER_WIDTH = 1400;
const MAX_PAGES = 50;

export type RenderedPdfPage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

/**
 * Renders each page of a PDF file to a PNG blob using the browser's Canvas.
 * Returns an array of rendered page blobs ready for upload.
 */
export async function renderPdfPagesToImages(
  file: File,
  options?: { maxPages?: number; maxWidth?: number }
): Promise<RenderedPdfPage[]> {
  const maxPages = options?.maxPages ?? MAX_PAGES;
  const maxWidth = options?.maxWidth ?? MAX_RENDER_WIDTH;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, maxPages);
  const results: RenderedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1 });

      // Scale to fit maxWidth
      const scale = Math.min(maxWidth / unscaledViewport.width, 3);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (blob && blob.size > 0) {
        results.push({
          pageNumber: pageNum,
          blob,
          width: canvas.width,
          height: canvas.height,
        });
      }
    } catch (pageError) {
      console.warn(`[client-pdf-renderer] Failed to render page ${pageNum}:`, pageError);
    }
  }

  return results;
}
