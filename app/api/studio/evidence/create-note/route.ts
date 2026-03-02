import { NextResponse } from 'next/server';
import { requireOwnedBrand, requireStudioAuth, studioErrorResponse } from '@/lib/studio/server-auth';

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brandId?: string;
      title?: string;
      description?: string;
      bucket?: string;
      tags?: unknown;
      noteText?: string;
    };

    const brandId = String(body.brandId || '').trim();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const bucket = String(body.bucket || 'general').trim() || 'general';
    const tags = normalizeTags(body.tags);
    const noteText = String(body.noteText || '').trim();

    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    if (!noteText) {
      return NextResponse.json({ error: 'noteText is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);

    const { data, error } = await admin
      .from('evidence_assets')
      .insert({
        brand_id: brandId,
        owner_user_id: userId,
        type: 'note',
        title: title || 'Note',
        description: description || null,
        bucket,
        tags,
        note_text: noteText,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to create note evidence');
    }

    return NextResponse.json({ evidence: data });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
