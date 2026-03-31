import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  baseUrl: z.string().url(),
  campaign: z.string().min(2),
  source: z.string().min(2).optional(),
  medium: z.string().min(2).optional(),
  content: z.string().optional(),
  term: z.string().optional(),
});

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = inputSchema.parse(await request.json());
    const url = new URL(input.baseUrl);

    url.searchParams.set("utm_source", slugify(input.source || "linkedin"));
    url.searchParams.set("utm_medium", slugify(input.medium || "social"));
    url.searchParams.set("utm_campaign", slugify(input.campaign));
    if (input.content) url.searchParams.set("utm_content", slugify(input.content));
    if (input.term) url.searchParams.set("utm_term", slugify(input.term));

    return NextResponse.json({
      trackedUrl: url.toString(),
      params: {
        utm_source: url.searchParams.get("utm_source"),
        utm_medium: url.searchParams.get("utm_medium"),
        utm_campaign: url.searchParams.get("utm_campaign"),
        utm_content: url.searchParams.get("utm_content"),
        utm_term: url.searchParams.get("utm_term"),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}