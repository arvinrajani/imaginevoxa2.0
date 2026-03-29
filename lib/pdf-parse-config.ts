import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { PDFParse, type LoadParameters } from 'pdf-parse';

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

export function configurePdfParseWorker() {
  if (workerConfigured) {
    return;
  }

  const workerPath = resolveWorkerPath();
  if (!workerPath) {
    console.warn('[pdf-parse-config] Could not locate pdf.worker.mjs — continuing without explicit worker');
    workerConfigured = true;
    return;
  }

  PDFParse.setWorker(pathToFileURL(workerPath).href);
  workerConfigured = true;
}

export function createPdfParser(options: LoadParameters) {
  configurePdfParseWorker();
  return new PDFParse(options);
}
