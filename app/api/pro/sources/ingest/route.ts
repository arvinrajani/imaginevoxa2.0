import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  url: z.string().url(),
  postId: z.string().uuid().optional().nullable(),
  sourceType: z.enum(["url", "product", "document", "manual"]).optional(),
});

const MAX_CONTENT_LENGTH = 2_000_000; // 2MB
const MAX_TEXT_LENGTH = 8000;

const blockedHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const isPrivateHost = (hostname: string) => {
  const lower = hostname.toLowerCase();
  if (blockedHosts.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.startsWith("10.") || lower.startsWith("192.168.") || lower.startsWith("169.254.")) {
    return true;
  }
  if (lower.startsWith("172.")) {
    const second = Number(lower.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
};

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);
    const sourceType = input.sourceType ?? "url";

    const targetUrl = new URL(input.url);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: "Only http/https URLs are allowed." }, { status: 400 });
    }
    if (isPrivateHost(targetUrl.hostname)) {
      return NextResponse.json({ error: "Private or local URLs are not allowed." }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "ImagineVoxaBot/1.0",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: `Fetch failed: ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "text/plain";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength && contentLength > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "Content too large." }, { status: 413 });
    }

    const rawText = await response.text();
    const titleMatch = rawText.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;

    const stripped = decodeEntities(stripHtml(rawText));
    const clipped = stripped.slice(0, MAX_TEXT_LENGTH);
    const excerpt = clipped.slice(0, 500);
    const hash = crypto.createHash("sha256").update(clipped).digest("hex");

    const { data: source, error } = await supabase
      .from("content_sources")
      .insert({
        brand_id: input.brandId,
        post_id: input.postId ?? null,
        source_type: sourceType,
        source_url: targetUrl.toString(),
        title,
        content: clipped,
        content_excerpt: excerpt,
        content_hash: hash,
        metadata: {
          content_type: contentType,
          content_length: rawText.length,
        },
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !source) {
      return NextResponse.json({ error: "Failed to save source" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "content_source_ingested",
      entity_type: "content_source",
      entity_id: source.id,
      metadata: { url: targetUrl.toString() },
    });

    return NextResponse.json({ source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
