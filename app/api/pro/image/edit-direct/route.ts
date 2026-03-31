import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 60;

import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const inputSchema = z.object({
  imageUrl: z.string().min(1),
  prompt: z.string().min(6),
  size: z.string().optional(),
  outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
  brandId: z.string().optional(),
});

const OPENAI_API_BASE = 'https://api.openai.com/v1';

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing OPENAI_API_KEY.');
  }
  return key;
}

async function resolveActingUserId() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devUserId = process.env.DEV_USER_ID?.trim();
  const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
  return user?.id || (allowDevFallback ? devUserId : undefined);
}

function dataUrlToBuffer(dataUrl: string) {
  const [header, data] = dataUrl.split(',');
  if (!header || !data) throw new Error('Invalid data URL.');
  return Buffer.from(data, 'base64');
}

function mimeByFormat(format: 'png' | 'jpeg' | 'webp') {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

async function fetchImageBuffer(url: string) {
  if (url.startsWith('data:image')) {
    return dataUrlToBuffer(url);
  }

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadEditedImage(options: {
  ownerUserId: string;
  brandId?: string;
  format: 'png' | 'jpeg' | 'webp';
  data: Buffer;
}) {
  const db = createAdminClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = options.format === 'jpeg' ? 'jpg' : options.format;
  const folder = options.brandId?.trim() || options.ownerUserId;
  const fileName = `${folder}/edits/edited-${stamp}.${ext}`;
  const contentType = mimeByFormat(options.format);
  const buckets = ['brand-assets', 'images'] as const;

  for (const bucket of buckets) {
    const { error } = await db.storage.from(bucket).upload(fileName, options.data, {
      contentType,
      upsert: false,
    });
    if (error) continue;

    const { data } = db.storage.from(bucket).getPublicUrl(fileName);
    return {
      url: data.publicUrl,
      storagePath: fileName,
      storageBucket: bucket,
    };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const imageBuffer = await fetchImageBuffer(input.imageUrl);
    const outputFormat = input.outputFormat || 'png';

    const form = new FormData();
    form.append('model', process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1');
    form.append('prompt', input.prompt);
    form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'image.png');
    if (input.size) form.append('size', input.size);
    form.append('response_format', 'b64_json');

    const editRes = await fetchWithTimeout(`${OPENAI_API_BASE}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: form,
    }, 55000);

    if (!editRes.ok) {
      const errorText = await editRes.text();
      return NextResponse.json(
        { error: `OpenAI edit failed: ${errorText}` },
        { status: 500 }
      );
    }

    const editJson = (await editRes.json()) as { data?: Array<{ b64_json?: string }> };
    const base64 = editJson.data?.[0]?.b64_json;
    if (!base64) {
      return NextResponse.json(
        { error: 'OpenAI edit returned no image' },
        { status: 502 }
      );
    }

    const editedBuffer = Buffer.from(base64, 'base64');
    const uploaded = await uploadEditedImage({
      ownerUserId: actingUserId,
      brandId: input.brandId,
      format: outputFormat,
      data: editedBuffer,
    });

    const fallbackDataUrl = `data:${mimeByFormat(outputFormat)};base64,${base64}`;
    return NextResponse.json({
      url: uploaded?.url || fallbackDataUrl,
      storage_path: uploaded?.storagePath || null,
      storage_bucket: uploaded?.storageBucket || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
