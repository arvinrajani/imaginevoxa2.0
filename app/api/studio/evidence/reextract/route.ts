import { NextResponse } from 'next/server';
import {
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';
import {
  EVIDENCE_STORAGE_BUCKET,
  extractPdfImagesIntoEvidence,
} from '@/lib/studio/pdf-extraction';

export const runtime = 'nodejs';
export const maxDuration = 60;

type EvidenceRow = {
  id: string;
  type?: string | null;
  title?: string | null;
  file_path?: string | null;
  bucket?: string | null;
  tags?: string[] | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      brandId?: string;
      evidenceIds?: string[];
    };

    const brandId = String(body.brandId || '').trim();
    const evidenceIds = Array.isArray(body.evidenceIds)
      ? Array.from(
          new Set(body.evidenceIds.map((id) => String(id || '').trim()).filter(Boolean))
        )
      : [];

    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    if (evidenceIds.length === 0) {
      return NextResponse.json({ error: 'At least one PDF must be selected.' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);

    const { data, error } = await admin
      .from('evidence_assets')
      .select('id, type, title, file_path, bucket, tags')
      .eq('brand_id', brandId)
      .eq('owner_user_id', userId);

    if (error) {
      throw new Error(error.message || 'Failed to load PDFs for re-extraction');
    }

    const rows = (Array.isArray(data) ? data : []) as EvidenceRow[];
    const selectedPdfs = rows.filter(
      (item) =>
        evidenceIds.includes(item.id) &&
        item.type === 'pdf' &&
        typeof item.file_path === 'string' &&
        item.file_path.trim().length > 0
    );

    if (selectedPdfs.length === 0) {
      return NextResponse.json(
        { error: 'No stored PDFs were found for the selected items.' },
        { status: 404 }
      );
    }

    let processed = 0;
    let deletedExisting = 0;
    let totalFound = 0;
    let totalSaved = 0;
    const details: string[] = [];

    for (const pdf of selectedPdfs) {
      const sourceTag = `pdf-source-${pdf.id}`;
      const existingExtracted = rows.filter(
        (item) =>
          item.type === 'image' &&
          Array.isArray(item.tags) &&
          item.tags.includes(sourceTag)
      );

      const existingPaths = existingExtracted
        .map((item) => (typeof item.file_path === 'string' ? item.file_path.trim() : ''))
        .filter(Boolean);
      if (existingPaths.length > 0) {
        await admin.storage.from(EVIDENCE_STORAGE_BUCKET).remove(existingPaths).catch(() => undefined);
      }

      const existingIds = existingExtracted
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (existingIds.length > 0) {
        const deleteRes = await admin
          .from('evidence_assets')
          .delete()
          .in('id', existingIds)
          .eq('brand_id', brandId);
        if (!deleteRes.error) {
          deletedExisting += existingIds.length;
        }
      }

      const download = await admin.storage
        .from(EVIDENCE_STORAGE_BUCKET)
        .download(pdf.file_path as string);

      if (download.error || !download.data) {
        details.push(`${pdf.title || pdf.id}: could not download the stored PDF.`);
        continue;
      }

      const fileBuffer = Buffer.from(await download.data.arrayBuffer());
      const extraction = await extractPdfImagesIntoEvidence(admin, {
        brandId,
        userId,
        parentEvidenceId: pdf.id,
        parentTitle: pdf.title?.trim() || 'PDF',
        fileBuffer,
        bucket: typeof pdf.bucket === 'string' && pdf.bucket.trim() ? pdf.bucket.trim() : 'general',
        tags: Array.isArray(pdf.tags)
          ? pdf.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          : [],
      });

      processed += 1;
      totalFound += extraction.found_count;
      totalSaved += extraction.saved_count;
      details.push(
        `${pdf.title || pdf.id}: ${extraction.detail || `${extraction.saved_count} visual${extraction.saved_count === 1 ? '' : 's'} saved.`}`
      );
    }

    return NextResponse.json({
      processed,
      deleted_existing: deletedExisting,
      found_count: totalFound,
      saved_count: totalSaved,
      detail: details.join(' | '),
    });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
