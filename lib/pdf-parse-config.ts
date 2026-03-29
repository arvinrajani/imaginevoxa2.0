import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import type { LoadParameters } from 'pdf-parse';

/* ------------------------------------------------------------------ *
 * Polyfill DOMMatrix for pdfjs-dist in Node.js serverless (Vercel).  *
 * pdfjs-dist expects DOMMatrix to exist globally; it's only used for *
 * coordinate transforms during rendering — text extraction works     *
 * fine with a minimal stub.                                          *
 * ------------------------------------------------------------------ */
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }

    static fromMatrix() { return new DOMMatrixPolyfill(); }
    static fromFloat32Array() { return new DOMMatrixPolyfill(); }
    static fromFloat64Array() { return new DOMMatrixPolyfill(); }

    multiply() { return new DOMMatrixPolyfill(); }
    translate() { return new DOMMatrixPolyfill(); }
    scale() { return new DOMMatrixPolyfill(); }
    rotate() { return new DOMMatrixPolyfill(); }
    inverse() { return new DOMMatrixPolyfill(); }
    transformPoint(point?: { x?: number; y?: number }) {
      return { x: point?.x ?? 0, y: point?.y ?? 0, z: 0, w: 1 };
    }
  }
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

/* Also polyfill Path2D if missing (pdfjs-dist may reference it) */
if (typeof globalThis.Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    /* stub — only needed for canvas rendering, not text extraction */
  };
}

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
