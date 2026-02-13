import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).optional(),
});

type LinkedInUgcResponse = {
  elements?: Array<{
    id?: string;
    created?: { time?: number };
    specificContent?: {
      "com.linkedin.ugc.ShareContent"?: {
        shareCommentary?: { text?: string };
        shareMediaCategory?: string;
        media?: Array<{
          status?: string;
          description?: { text?: string };
          originalUrl?: string;
          media?: string;
        }>;
      };
    };
  }>;
};

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

    const { data: connection, error: connectionError } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connectionError || !connection) {
      return NextResponse.json({ error: "LinkedIn not connected" }, { status: 404 });
    }

    const memberUrn = connection.member_urn || connection.linkedin_member_urn;
    if (!memberUrn) {
      return NextResponse.json({ error: "Missing LinkedIn member URN" }, { status: 400 });
    }

    if (connection.expires_at && new Date(connection.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "LinkedIn token expired. Reconnect." }, { status: 401 });
    }

    const count = input.limit ?? 20;
    const url = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(
      memberUrn
    )})&count=${count}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText || "LinkedIn fetch failed." }, { status: 502 });
    }

    const payload = (await response.json()) as LinkedInUgcResponse;
    const posts = (payload.elements || [])
      .map((item) => {
        const shareContent = item.specificContent?.["com.linkedin.ugc.ShareContent"];
        const text = shareContent?.shareCommentary?.text || "";
        const hashtags = text.match(/#[A-Za-z0-9_]+/g) || [];
        const media = shareContent?.media || [];
        return {
          text,
          created_at: item.created?.time ? new Date(item.created.time).toISOString() : undefined,
          hashtags,
          type: shareContent?.shareMediaCategory || "text",
          media: media.map((entry) => ({
            url: entry.originalUrl || null,
            description: entry.description?.text || null,
          })),
        };
      })
      .filter((post) => post.text.length > 0);

    await supabase
      .from("linkedin_connections")
      .update({ last_analyzed_at: new Date().toISOString() })
      .eq("id", connection.id);

    return NextResponse.json({ posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
