import { NextResponse } from 'next/server';

export const maxDuration = 30;

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_PAGES_RENDER = 3;
const MAX_PAGES_EXTRACT = 5;
const MIN_IMAGE_DIM = 200;
const MAX_RESULTS = 12;

interface ExtractedImage {
  dataUri: string;
  width: number;
  height: number;
  pageNumber: number;
  source: 'page' | 'embedded';
}

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
  }

  if (!file.type && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json({ error: 'PDF exceeds 20MB limit' }, { status: 413 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Dynamic import to avoid bundling issues
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({
        data: uint8,
        useSystemFonts: true,
        isEvalSupported: false,
      }).promise;
    } catch (pdfErr: unknown) {
      const msg = pdfErr instanceof Error ? pdfErr.message : '';
      if (msg.includes('password') || msg.includes('encrypted')) {
        return NextResponse.json(
          { error: 'PDF is password protected — please remove the password first' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: 'Could not read PDF file' },
        { status: 400 },
      );
    }

    const images: ExtractedImage[] = [];

    // Strategy A: render pages as images using sharp
    // pdfjs-dist in Node can render to a custom canvas — but it's complex.
    // Instead we use a simpler approach: extract embedded images only.
    // If we find no embedded images, render pages with pdfjs + @napi-rs/canvas.

    // Strategy B: extract embedded images
    const pageCount = Math.min(pdf.numPages, MAX_PAGES_EXTRACT);

    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p);
      const ops = await page.getOperatorList();

      for (let i = 0; i < ops.fnArray.length; i++) {
        // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82
        if (ops.fnArray[i] !== 85 && ops.fnArray[i] !== 82) continue;

        const imgName = ops.argsArray[i]?.[0];
        if (!imgName || typeof imgName !== 'string') continue;

        try {
          const imgData = await new Promise<{
            width: number;
            height: number;
            data: Uint8ClampedArray;
            kind?: number;
          }>((resolve, reject) => {
            page.objs.get(imgName, (obj: unknown) => {
              if (obj && typeof obj === 'object' && 'width' in obj) {
                resolve(obj as { width: number; height: number; data: Uint8ClampedArray; kind?: number });
              } else {
                reject(new Error('Not found'));
              }
            });
            // Timeout
            setTimeout(() => reject(new Error('Timeout')), 3000);
          });

          if (imgData.width < MIN_IMAGE_DIM || imgData.height < MIN_IMAGE_DIM) continue;

          // Convert raw RGBA to PNG via sharp
          const sharp = (await import('sharp')).default;
          const channels = imgData.data.length / (imgData.width * imgData.height);
          let pngBuf: Buffer;

          if (channels === 4) {
            pngBuf = await sharp(Buffer.from(imgData.data.buffer), {
              raw: { width: imgData.width, height: imgData.height, channels: 4 },
            })
              .png()
              .toBuffer();
          } else if (channels === 3) {
            pngBuf = await sharp(Buffer.from(imgData.data.buffer), {
              raw: { width: imgData.width, height: imgData.height, channels: 3 },
            })
              .png()
              .toBuffer();
          } else if (channels === 1) {
            // Grayscale
            pngBuf = await sharp(Buffer.from(imgData.data.buffer), {
              raw: { width: imgData.width, height: imgData.height, channels: 1 },
            })
              .png()
              .toBuffer();
          } else {
            continue;
          }

          const dataUri = `data:image/png;base64,${pngBuf.toString('base64')}`;
          images.push({
            dataUri,
            width: imgData.width,
            height: imgData.height,
            pageNumber: p,
            source: 'embedded',
          });

          if (images.length >= MAX_RESULTS) break;
        } catch {
          // Skip images that fail to extract
          continue;
        }
      }
      page.cleanup();
      if (images.length >= MAX_RESULTS) break;
    }

    // Strategy A fallback: if no embedded images found, render pages
    if (images.length === 0) {
      try {
        const sharp = (await import('sharp')).default;
        const renderPages = Math.min(pdf.numPages, MAX_PAGES_RENDER);

        for (let p = 1; p <= renderPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1.5 });
          const width = Math.floor(viewport.width);
          const height = Math.floor(viewport.height);

          // Create an RGBA buffer and render into it
          const { createCanvas } = await import('@napi-rs/canvas');
          const canvas = createCanvas(width, height);
          const ctx = canvas.getContext('2d');

          // pdfjs-dist render
          await page.render({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            canvasContext: ctx as any,
            canvas: null,
            viewport,
          }).promise;

          const pngBuf = await sharp(canvas.toBuffer('image/png')).png().toBuffer();
          const dataUri = `data:image/png;base64,${pngBuf.toString('base64')}`;

          images.push({
            dataUri,
            width,
            height,
            pageNumber: p,
            source: 'page',
          });

          page.cleanup();
        }
      } catch {
        // Canvas rendering not available — return what we have
      }
    }

    pdf.destroy();

    if (images.length === 0) {
      return NextResponse.json({
        images: [],
        message: 'No images found in this PDF',
      });
    }

    // Sort: embedded first, then page renders
    images.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'embedded' ? -1 : 1;
      return a.pageNumber - b.pageNumber;
    });

    return NextResponse.json({ images: images.slice(0, MAX_RESULTS) });
  } catch (err) {
    console.error('[extract-from-pdf] Error:', err);
    return NextResponse.json(
      { error: 'Failed to extract images from PDF' },
      { status: 500 },
    );
  }
}
