import crypto from 'crypto';
import sharp from 'sharp';
import {
  isMissingColumnError,
  isMissingTableOrRelationError,
  requireStudioAuth,
} from '@/lib/studio/server-auth';
import { createPdfParser } from '@/lib/pdf-parse-config';

export const EVIDENCE_STORAGE_BUCKET =
  process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';

export const MAX_PDF_IMAGE_EXTRACTION_BYTES = 1024 * 1024 * 1024;
export const MAX_EXTRACTED_IMAGES_PER_PDF = 1200;
const MIN_EXTRACTED_IMAGE_SIZE_PX = 0;
const MAX_EXTRACTED_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_RENDERED_PAGE_WIDTH_PX = 1400;

export type ParsedPdfImage = {
  pageNumber: number;
  imageIndex: number;
  width: number;
  height: number;
  data: Buffer;
  hash: string;
  source: 'embedded' | 'page-screenshot';
};

export async function normalizePdfVisualBuffer(
  input: Buffer,
  options?: { maxWidth?: number; maxHeight?: number }
) {
  if (!input.byteLength) return null;

  try {
    const maxWidth = options?.maxWidth ?? MAX_RENDERED_PAGE_WIDTH_PX;
    const maxHeight = options?.maxHeight ?? 2200;
    const normalized = await sharp(input)
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    if (normalized.byteLength === 0 || normalized.byteLength > MAX_EXTRACTED_IMAGE_BYTES) {
      return null;
    }

    const metadata = await sharp(normalized).metadata();
    return {
      data: normalized,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      hash: crypto.createHash('sha256').update(normalized).digest('hex'),
    };
  } catch {
    return null;
  }
}

export function dedupeTags(tags: string[]) {
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

export async function insertEvidenceRow(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    isPdf: boolean;
    title: string;
    description: string;
    bucket: string;
    tags: string[];
    storagePath: string | null;
  }
) {
  const fullPayload = {
    brand_id: params.brandId,
    owner_user_id: params.userId,
    type: params.isPdf ? 'pdf' : 'image',
    title: params.title,
    description: params.description || null,
    bucket: params.bucket,
    tags: params.tags,
    file_path: params.storagePath,
  };

  let attempt = await admin
    .from('evidence_assets')
    .insert(fullPayload)
    .select('*')
    .single();

  if (attempt.error && isMissingTableOrRelationError(attempt.error, 'evidence_assets')) {
    return { inserted: null, usedFallback: true };
  }

  if (attempt.error && isMissingColumnError(attempt.error, ['bucket', 'tags', 'description'])) {
    const withoutOptionalColumns = {
      brand_id: params.brandId,
      owner_user_id: params.userId,
      type: params.isPdf ? 'pdf' : 'image',
      title: params.title,
      file_path: params.storagePath,
    };

    attempt = await admin
      .from('evidence_assets')
      .insert(withoutOptionalColumns)
      .select('*')
      .single();
  }

  if (attempt.error && isMissingColumnError(attempt.error, ['owner_user_id'])) {
    const legacyPayload = {
      brand_id: params.brandId,
      type: params.isPdf ? 'pdf' : 'image',
      title: params.title,
      file_path: params.storagePath,
    };

    attempt = await admin
      .from('evidence_assets')
      .insert(legacyPayload)
      .select('*')
      .single();
  }

  if (attempt.error) {
    throw new Error(attempt.error.message || 'Failed to create evidence row');
  }

  return { inserted: attempt.data, usedFallback: false };
}

export async function parsePdfEmbeddedImages(fileBuffer: Buffer) {
  if (fileBuffer.byteLength > MAX_PDF_IMAGE_EXTRACTION_BYTES) {
    return {
      status: 'skipped' as const,
      detail: `PDF is larger than ${Math.round(
        MAX_PDF_IMAGE_EXTRACTION_BYTES / (1024 * 1024)
      )}MB, so image extraction was skipped for performance.`,
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  }

  const parser = await createPdfParser({ data: fileBuffer });
  try {
    const parsed = await parser.getImage({
      imageThreshold: MIN_EXTRACTED_IMAGE_SIZE_PX,
      imageDataUrl: false,
      imageBuffer: true,
    });

    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const hashes = new Set<string>();
    const images: ParsedPdfImage[] = [];
    let foundCount = 0;

    for (const page of pages) {
      const pageNumber = typeof page.pageNumber === 'number' ? page.pageNumber : 0;
      const pageImages = Array.isArray(page.images) ? page.images : [];

      for (let i = 0; i < pageImages.length; i += 1) {
        const image = pageImages[i];
        const imageData = image?.data;
        if (!(imageData instanceof Uint8Array) || imageData.byteLength === 0) {
          continue;
        }

        foundCount += 1;
        const rawBuffer = Buffer.from(imageData);
        if (rawBuffer.byteLength > MAX_EXTRACTED_IMAGE_BYTES * 2) {
          continue;
        }

        const normalized = await normalizePdfVisualBuffer(rawBuffer, {
          maxWidth: MAX_RENDERED_PAGE_WIDTH_PX,
          maxHeight: 2200,
        });
        if (!normalized) {
          continue;
        }

        const hash = normalized.hash;
        if (hashes.has(hash)) {
          continue;
        }
        hashes.add(hash);

        const width =
          normalized.width || (typeof image.width === 'number' ? image.width : 0);
        const height =
          normalized.height || (typeof image.height === 'number' ? image.height : 0);

        images.push({
          pageNumber,
          imageIndex: i + 1,
          width,
          height,
          data: normalized.data,
          hash,
          source: 'embedded',
        });

        if (images.length >= MAX_EXTRACTED_IMAGES_PER_PDF) {
          break;
        }
      }

      if (images.length >= MAX_EXTRACTED_IMAGES_PER_PDF) {
        break;
      }
    }

    return {
      status: 'ok' as const,
      detail: null,
      images,
      foundCount,
    };
  } catch (error) {
    return {
      status: 'extract_failed' as const,
      detail: error instanceof Error ? error.message : 'Could not extract images from PDF.',
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function parsePdfPageScreenshots(
  fileBuffer: Buffer,
  options?: { skipPageNumbers?: Set<number>; maxImages?: number }
) {
  if (fileBuffer.byteLength > MAX_PDF_IMAGE_EXTRACTION_BYTES) {
    return {
      status: 'skipped' as const,
      detail: `PDF is larger than ${Math.round(
        MAX_PDF_IMAGE_EXTRACTION_BYTES / (1024 * 1024)
      )}MB, so rendered page extraction was skipped for performance.`,
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  }

  const parser = await createPdfParser({ data: fileBuffer });
  try {
    const parsed = await parser.getScreenshot({
      desiredWidth: MAX_RENDERED_PAGE_WIDTH_PX,
      imageDataUrl: false,
      imageBuffer: true,
    });

    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const hashes = new Set<string>();
    const images: ParsedPdfImage[] = [];
    let foundCount = 0;

    for (const page of pages) {
      if (images.length >= (options?.maxImages ?? MAX_EXTRACTED_IMAGES_PER_PDF)) {
        break;
      }

      const pageNumber = typeof page.pageNumber === 'number' ? page.pageNumber : 0;
      if (options?.skipPageNumbers?.has(pageNumber)) {
        continue;
      }

      const pageData = page?.data;
      if (!(pageData instanceof Uint8Array) || pageData.byteLength === 0) {
        continue;
      }

      foundCount += 1;
      const normalized = await normalizePdfVisualBuffer(Buffer.from(pageData), {
        maxWidth: MAX_RENDERED_PAGE_WIDTH_PX,
        maxHeight: 2200,
      });
      if (!normalized) {
        continue;
      }

      if (hashes.has(normalized.hash)) {
        continue;
      }
      hashes.add(normalized.hash);

      images.push({
        pageNumber,
        imageIndex: 1,
        width: normalized.width || (typeof page.width === 'number' ? page.width : 0),
        height: normalized.height || (typeof page.height === 'number' ? page.height : 0),
        data: normalized.data,
        hash: normalized.hash,
        source: 'page-screenshot',
      });
    }

    return {
      status: 'ok' as const,
      detail: null,
      images,
      foundCount,
    };
  } catch (error) {
    return {
      status: 'extract_failed' as const,
      detail: error instanceof Error ? error.message : 'Could not render PDF pages as images.',
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractPdfImagesIntoEvidence(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    parentEvidenceId: string;
    parentTitle: string;
    fileBuffer: Buffer;
    bucket: string;
    tags: string[];
  }
) {
  const logPrefix = `[pdf-extraction] "${params.parentTitle}"`;
  console.log(`${logPrefix} Starting extraction (buffer: ${params.fileBuffer.byteLength} bytes)`);

  let embeddedParsed: Awaited<ReturnType<typeof parsePdfEmbeddedImages>>;
  try {
    embeddedParsed = await parsePdfEmbeddedImages(params.fileBuffer);
  } catch (embeddedError) {
    console.error(`${logPrefix} Embedded image extraction crashed:`, embeddedError instanceof Error ? embeddedError.message : embeddedError);
    embeddedParsed = {
      status: 'extract_failed' as const,
      detail: embeddedError instanceof Error ? embeddedError.message : 'Embedded image extraction crashed.',
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  }
  const embeddedImages =
    embeddedParsed.status === 'ok' ? embeddedParsed.images : ([] as ParsedPdfImage[]);
  console.log(`${logPrefix} Embedded images: status=${embeddedParsed.status}, found=${embeddedParsed.foundCount}, extracted=${embeddedImages.length}${embeddedParsed.detail ? `, detail=${embeddedParsed.detail}` : ''}`);

  let screenshotParsed: Awaited<ReturnType<typeof parsePdfPageScreenshots>>;
  try {
    screenshotParsed = await parsePdfPageScreenshots(params.fileBuffer, {
      maxImages: Math.max(0, MAX_EXTRACTED_IMAGES_PER_PDF - embeddedImages.length),
    });
  } catch (screenshotError) {
    console.error(`${logPrefix} Page screenshot extraction crashed:`, screenshotError instanceof Error ? screenshotError.message : screenshotError);
    screenshotParsed = {
      status: 'extract_failed' as const,
      detail: screenshotError instanceof Error ? screenshotError.message : 'Page screenshot extraction crashed.',
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  }
  console.log(`${logPrefix} Page screenshots: status=${screenshotParsed.status}, found=${screenshotParsed.foundCount}, extracted=${screenshotParsed.status === 'ok' ? screenshotParsed.images.length : 0}${screenshotParsed.detail ? `, detail=${screenshotParsed.detail}` : ''}`);

  const parsedImages: ParsedPdfImage[] = [];
  const seenHashes = new Set<string>();

  for (const image of [
    ...embeddedImages,
    ...(screenshotParsed.status === 'ok' ? screenshotParsed.images : []),
  ]) {
    if (parsedImages.length >= MAX_EXTRACTED_IMAGES_PER_PDF) {
      break;
    }
    if (seenHashes.has(image.hash)) {
      continue;
    }
    seenHashes.add(image.hash);
    parsedImages.push(image);
  }

  const foundCount = embeddedParsed.foundCount + screenshotParsed.foundCount;
  const extractionNotes = [embeddedParsed.detail, screenshotParsed.detail]
    .filter((detail): detail is string => Boolean(detail && detail.trim()))
    .join(' ');

  if (parsedImages.length === 0) {
    const status =
      embeddedParsed.status === 'skipped' && screenshotParsed.status === 'skipped'
        ? ('skipped' as const)
        : embeddedParsed.status === 'extract_failed' &&
            screenshotParsed.status === 'extract_failed'
          ? ('extract_failed' as const)
          : ('none_found' as const);

    return {
      status,
      found_count: foundCount,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 0,
      detail: extractionNotes || undefined,
    };
  }

  let savedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let savedEmbeddedCount = 0;
  let savedRenderedPageCount = 0;
  const batchId = Date.now();

  for (let i = 0; i < parsedImages.length; i += 1) {
    const image = parsedImages[i];
    const imageName = `pdf-${batchId}-${i + 1}-p${image.pageNumber || 0}-${image.imageIndex}.png`;
    const storagePath = `${params.userId}/${params.brandId}/pdf-extract/${imageName}`;

    const upload = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .upload(storagePath, image.data, {
        contentType: 'image/png',
        upsert: false,
      });

    if (upload.error) {
      console.warn(`${logPrefix} Storage upload failed for ${storagePath}: ${upload.error.message}`);
      failedCount += 1;
      continue;
    }

    const imageTags = dedupeTags([
      ...params.tags,
      'pdf-extracted',
      image.source === 'embedded' ? 'pdf-embedded-image' : 'pdf-rendered-page',
      `pdf-source-${params.parentEvidenceId}`,
      image.pageNumber > 0 ? `pdf-page-${image.pageNumber}` : 'pdf-page-unknown',
    ]).slice(0, 20);

    const imageTitle =
      image.source === 'embedded'
        ? `${params.parentTitle} - Extracted image ${savedCount + 1}`
        : `${params.parentTitle} - Page ${image.pageNumber || '?'} visual`;
    const sizeHint =
      image.width > 0 && image.height > 0
        ? `${image.width}x${image.height}px`
        : 'size unavailable';
    const imageDescription =
      image.source === 'embedded'
        ? `Extracted embedded image from PDF "${params.parentTitle}" (page ${
            image.pageNumber || '?'
          }, ${sizeHint}). Source evidence: ${params.parentEvidenceId}.`
        : `Rendered page ${image.pageNumber || '?'} from PDF "${params.parentTitle}" as a visual reference (${sizeHint}). Source evidence: ${params.parentEvidenceId}.`;

    const insert = await insertEvidenceRow(admin, {
      brandId: params.brandId,
      userId: params.userId,
      isPdf: false,
      title: imageTitle,
      description: imageDescription,
      bucket: params.bucket,
      tags: imageTags,
      storagePath,
    });

    if (insert.usedFallback || !insert.inserted) {
      console.warn(`${logPrefix} DB insert skipped for ${imageName}: usedFallback=${insert.usedFallback}, inserted=${!!insert.inserted}`);
      skippedCount += 1;
      continue;
    }

    savedCount += 1;
    if (image.source === 'embedded') {
      savedEmbeddedCount += 1;
    } else {
      savedRenderedPageCount += 1;
    }
  }

  const status =
    savedCount > 0
      ? ('saved' as const)
      : failedCount > 0 || skippedCount > 0
        ? ('extract_failed' as const)
        : ('none_found' as const);

  return {
    status,
    found_count: foundCount,
    saved_count: savedCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    detail: [
      parsedImages.length >= MAX_EXTRACTED_IMAGES_PER_PDF
        ? `Saved the first ${MAX_EXTRACTED_IMAGES_PER_PDF} PDF visuals for this file.`
        : null,
      savedEmbeddedCount > 0
        ? `${savedEmbeddedCount} embedded image${savedEmbeddedCount === 1 ? '' : 's'} saved.`
        : null,
      savedRenderedPageCount > 0
        ? `${savedRenderedPageCount} rendered page visual${savedRenderedPageCount === 1 ? '' : 's'} saved.`
        : null,
      status === 'extract_failed'
        ? 'PDF visuals were found, but some could not be saved as evidence.'
        : null,
      extractionNotes || null,
    ]
      .filter(Boolean)
      .join(' ') || undefined,
  };
}
