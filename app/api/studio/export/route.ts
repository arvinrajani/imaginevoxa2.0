import { NextResponse } from 'next/server';

export const maxDuration = 60;

import { requireOwnedRun, requireStudioAuth, studioErrorResponse } from '@/lib/studio/server-auth';
import { StudioChannel } from '@/lib/studio/types';

export const runtime = 'nodejs';

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBuffer(data: string) {
  return Buffer.from(data, 'utf8');
}

function getExtensionFromUrl(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'jpg';
  if (normalized.includes('.webp')) return 'webp';
  if (normalized.includes('.svg')) return 'svg';
  return 'png';
}

async function fetchBuffer(url: string) {
  if (url.startsWith('data:')) {
    const idx = url.indexOf(',');
    if (idx < 0) throw new Error('Malformed data URL');
    return Buffer.from(url.slice(idx + 1), 'base64');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildZip(files: Array<{ name: string; data: Buffer }>) {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = toBuffer(file.name);
    const crc = crc32(file.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localHeaders.push(localHeader, nameBuf, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralHeaders.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + file.data.length;
  }

  const centralSize = centralHeaders.reduce((sum, buf) => sum + buf.length, 0);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, end]);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function buildChannelCaption(post: Record<string, unknown>): string {
  const headline = asString(post.headline).trim();
  const body = asString(post.body).trim();
  const cta = asString(post.cta).trim();
  const hashtags = asStringArray(post.hashtags)
    .map((tag) => `#${String(tag).replace(/^#/, '').trim()}`)
    .join(' ')
    .trim();

  return [headline, body, cta, hashtags].filter(Boolean).join('\n\n').trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId?: string;
    };

    const runId = String(body.runId || '').trim();
    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    const run = await requireOwnedRun(admin, runId, userId);

    const confirmedPost = asObject(run.confirmed_post);
    const channelVariants = asObject(run.channel_variants);
    const confirmedImages = asObject(run.confirmed_images);

    const selectedChannels = asStringArray(run.selected_channels) as StudioChannel[];
    const channels: StudioChannel[] =
      selectedChannels.length > 0 ? selectedChannels : ['linkedin', 'facebook', 'instagram'];

    const files: Array<{ name: string; data: Buffer }> = [];

    for (const channel of channels) {
      const variant = {
        ...confirmedPost,
        ...asObject(channelVariants[channel]),
      };

      const caption = buildChannelCaption(variant);
      if (caption) {
        files.push({
          name: `captions/${channel}.txt`,
          data: toBuffer(caption),
        });
      }

      const imageEntry = asObject(confirmedImages[channel]);
      const imageUrl = asString(imageEntry.url).trim();
      if (imageUrl) {
        try {
          const extension = getExtensionFromUrl(imageUrl);
          files.push({
            name: `assets/${channel}.${extension}`,
            data: await fetchBuffer(imageUrl),
          });
        } catch {
          // Skip broken images and continue with remaining files.
        }
      }
    }

    const fallbackImage = asString(confirmedPost.imageUrl).trim();
    if (fallbackImage && !files.some((file) => file.name.startsWith('assets/'))) {
      try {
        const extension = getExtensionFromUrl(fallbackImage);
        files.push({
          name: `assets/master.${extension}`,
          data: await fetchBuffer(fallbackImage),
        });
      } catch {
        // Ignore fallback image fetch failures.
      }
    }

    const manifest = {
      run_id: run.id,
      brand_id: run.brand_id,
      status: run.status,
      selected_channels: channels,
      exported_at: new Date().toISOString(),
      includes_images: files.some((file) => file.name.startsWith('assets/')),
      includes_captions: files.some((file) => file.name.startsWith('captions/')),
    };

    files.push({
      name: 'manifest.json',
      data: toBuffer(JSON.stringify(manifest, null, 2)),
    });

    if (files.length === 1) {
      return NextResponse.json(
        {
          manifest,
          warning: 'No images or captions were found for this run yet.',
        },
        { status: 200 }
      );
    }

    const zip = buildZip(files);

    return new NextResponse(zip, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="studio-export-${run.id}.zip"`,
      },
    });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
