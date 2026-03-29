import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import type { LoadParameters } from 'pdf-parse';

/*
 * DOM polyfills are in instrumentation.ts (runs before any route).
 * This file only handles pdf-parse worker config + parser creation.
 */

let workerConfigured = false;

function resolveWorkerPath() {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const resolvedCandidates = [
    () => require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    () => require.resolve('pdfjs-dist/build/pdf.worker.mjs'),
    () => require.resolve('pdfjs-dist/legacy/build/pdf.worker.js'),
    () => require.resolve('pdfjs-dist/build/pdf.worker.js'),
  ];

  for (const resolveCandidate of resolvedCandidates) {
    try {
      const candidate = resolveCandidate();
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // fall through to cwd-based paths
    }
  }

  const cwdCandidates = [
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs'),
  ];

  for (const candidate of cwdCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function createPdfParser(options: LoadParameters) {
  if (!workerConfigured) {
    const workerPath = resolveWorkerPath();
    if (workerPath) {
      const { PDFParse } = await import('pdf-parse');
      PDFParse.setWorker(pathToFileURL(workerPath).href);
    } else {
      console.warn('[pdf-parse-config] Could not locate pdf.worker — continuing without explicit worker');
    }
    workerConfigured = true;
  }

  const { PDFParse } = await import('pdf-parse');
  return new PDFParse(options);
}
