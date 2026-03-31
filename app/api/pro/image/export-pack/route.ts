import { NextResponse } from "next/server";
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
});

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
  return Buffer.from(data, "utf8");
}

async function fetchBuffer(url: string) {
  if (url.startsWith("data:")) {
    const data = url.split(",")[1];
    return Buffer.from(data, "base64");
  }
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function buildZip(files: Array<{ name: string; data: Buffer }>) {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBuf = toBuffer(file.name);
    const crc = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (store)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14); // crc
    localHeader.writeUInt32LE(file.data.length, 18); // compressed size
    localHeader.writeUInt32LE(file.data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra length

    localHeaders.push(localHeader, nameBuf, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central dir signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // compression
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16); // crc
    centralHeader.writeUInt32LE(file.data.length, 20); // compressed size
    centralHeader.writeUInt32LE(file.data.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // name length
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralHeaders.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + file.data.length;
  });

  const centralSize = centralHeaders.reduce((sum, buf) => sum + buf.length, 0);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end signature
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // start disk
  end.writeUInt16LE(files.length, 8); // entries on disk
  end.writeUInt16LE(files.length, 10); // total entries
  end.writeUInt32LE(centralSize, 12); // central size
  end.writeUInt32LE(centralOffset, 16); // central offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, end]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const postRes = await supabase
      .from("posts")
      .select("id, image_url, base_image_asset_id, composed_image_asset_id, prompt, title")
      .eq("id", input.postId)
      .single();

    if (postRes.error || !postRes.data) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const assetIds = [postRes.data.base_image_asset_id, postRes.data.composed_image_asset_id].filter(Boolean);
    const { data: assets } = await supabase
      .from("image_assets")
      .select("id, file_url")
      .in("id", assetIds as string[]);

    const baseAsset = assets?.find((asset) => asset.id === postRes.data.base_image_asset_id);
    const composedAsset = assets?.find((asset) => asset.id === postRes.data.composed_image_asset_id);

    const files: Array<{ name: string; data: Buffer }> = [];
    if (baseAsset?.file_url) {
      files.push({ name: "base-image.png", data: await fetchBuffer(baseAsset.file_url) });
    }
    if (composedAsset?.file_url) {
      files.push({ name: "composed-image.svg", data: await fetchBuffer(composedAsset.file_url) });
    }
    if (postRes.data.image_url && !composedAsset?.file_url) {
      files.push({ name: "image.png", data: await fetchBuffer(postRes.data.image_url) });
    }

    const metadata = {
      post_id: postRes.data.id,
      prompt: postRes.data.prompt,
      title: postRes.data.title,
      base_image_asset_id: postRes.data.base_image_asset_id,
      composed_image_asset_id: postRes.data.composed_image_asset_id,
    };
    files.push({ name: "metadata.json", data: toBuffer(JSON.stringify(metadata, null, 2)) });

    const zip = buildZip(files);

    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="image-pack-${input.postId}.zip"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
