import { NextResponse } from 'next/server';
import {
  extractPdfTextFromBuffer,
  isIndexedOnlyStoragePath,
  syncContentSourceToChatbotKnowledge,
  syncPdfTextToChatbotKnowledge,
} from '@/lib/chatbot/pdf-knowledge';
import { EVIDENCE_STORAGE_BUCKET } from '@/lib/studio/evidence-helpers';
import {
  isMissingTableOrRelationError,
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

export const runtime = 'nodejs';

type EvidenceAsset = {
  id: string;
  brand_id: string;
  owner_user_id: string;
  type: string;
  title: string;
  file_path: string | null;
};

function syncResultResponse(
  result: Awaited<ReturnType<typeof syncPdfTextToChatbotKnowledge>>
) {
  if (result.status === 'indexed') {
    return NextResponse.json({
      success: true,
      chunks_created: result.chunks_created,
      chunk_limit_applied: result.chunk_limit_applied,
      source_file: result.source_file,
      source_mode: result.source_mode,
      detail: result.detail,
    });
  }

  if (result.status === 'unsupported_schema') {
    return NextResponse.json(
      { error: result.detail || 'brand_knowledge_chunks table is missing.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: result.detail || 'PDF text could not be converted into chatbot knowledge.' },
    { status: 400 }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brand_id, evidence_asset_id, file_path, source_file } = body as {
      brand_id?: string;
      evidence_asset_id?: string;
      file_path?: string;
      source_file?: string;
    };

    const normalizedFilePath = typeof file_path === 'string' ? file_path.trim() : '';
    const normalizedSourceFile = typeof source_file === 'string' ? source_file.trim() : '';

    if (!brand_id || (!evidence_asset_id && !normalizedFilePath)) {
      return NextResponse.json(
        { error: 'brand_id and either evidence_asset_id or file_path are required' },
        { status: 400 }
      );
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brand_id, userId);

    let resolvedFilePath = normalizedFilePath;
    let resolvedSourceTitle = normalizedSourceFile;

    if (evidence_asset_id) {
      const { data: evidenceAsset, error: assetError } = await admin
        .from('evidence_assets')
        .select('id, brand_id, owner_user_id, type, title, file_path')
        .eq('id', evidence_asset_id)
        .eq('brand_id', brand_id)
        .maybeSingle<EvidenceAsset>();

      if (assetError) {
        if (!isMissingTableOrRelationError(assetError, 'evidence_assets')) {
          return NextResponse.json(
            { error: `Failed to load evidence asset: ${assetError.message}` },
            { status: 500 }
          );
        }
        if (!resolvedFilePath) {
          return NextResponse.json(
            {
              error:
                'Evidence table is not available in this database. Upload the PDF again and retry.',
            },
            { status: 500 }
          );
        }
      } else if (evidenceAsset) {
        resolvedFilePath = evidenceAsset.file_path || resolvedFilePath;
        resolvedSourceTitle = evidenceAsset.title || resolvedSourceTitle;
      } else if (!resolvedFilePath) {
        return NextResponse.json({ error: 'Evidence asset not found' }, { status: 404 });
      }
    }

    if (evidence_asset_id && (!resolvedFilePath || isIndexedOnlyStoragePath(resolvedFilePath))) {
      const contentSourceSync = await syncContentSourceToChatbotKnowledge(admin, {
        brandId: brand_id,
        evidenceAssetId: evidence_asset_id,
        sourceFile: resolvedSourceTitle || undefined,
        storagePath: resolvedFilePath || null,
        logPrefix: '[process-pdf]',
      });

      if (contentSourceSync.status === 'indexed') {
        return syncResultResponse(contentSourceSync);
      }

      return NextResponse.json(
        {
          error:
            contentSourceSync.detail ||
            'This PDF was uploaded without a stored file copy, and no reusable Studio text was found for chatbot indexing. Re-upload the PDF to continue.',
        },
        { status: contentSourceSync.status === 'unsupported_schema' ? 500 : 400 }
      );
    }

    if (!resolvedFilePath) {
      return NextResponse.json({ error: 'No file path available for PDF processing' }, { status: 400 });
    }

    const { data: fileData, error: downloadError } = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .download(resolvedFilePath);

    if (downloadError || !fileData) {
      const downloadMessage = String(downloadError?.message || 'Unknown error');
      const lower = downloadMessage.toLowerCase();
      if (lower.includes('bucket') && (lower.includes('not found') || lower.includes('does not exist'))) {
        return NextResponse.json(
          {
            error: `Storage bucket "${EVIDENCE_STORAGE_BUCKET}" is missing. Upload a PDF again to auto-create it or create the bucket in Supabase Storage.`,
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: `Failed to download PDF: ${downloadMessage}` },
        { status: 500 }
      );
    }

    let extractedText = '';

    try {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      console.log('[process-pdf] PDF buffer size:', buffer.length, 'bytes');
      const parsed = await extractPdfTextFromBuffer(buffer);
      extractedText = parsed.text;
      console.log('[process-pdf] Extracted text length:', extractedText.length);
    } catch (parseError) {
      console.error('[process-pdf] PDF parse error:', parseError);
      return NextResponse.json(
        {
          error: `PDF parsing failed: ${
            parseError instanceof Error ? parseError.message : 'Unknown parse error'
          }`,
        },
        { status: 500 }
      );
    }

    const syncResult = await syncPdfTextToChatbotKnowledge(admin, {
      brandId: brand_id,
      evidenceAssetId: evidence_asset_id,
      sourceFile: resolvedSourceTitle || undefined,
      storagePath: resolvedFilePath,
      text: extractedText,
      sourceMode: 'stored_pdf',
      logPrefix: '[process-pdf]',
    });

    return syncResultResponse(syncResult);
  } catch (error) {
    console.error('[api/chatbot/process-pdf] failed:', error);
    return studioErrorResponse(error);
  }
}
