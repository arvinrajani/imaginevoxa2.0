import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  days: z.number().int().min(7).max(365).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = inputSchema.parse(await request.json());
    const days = input.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id")
      .eq("id", input.brandId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (brandError) throw brandError;
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, status, created_at, approved_at, posted_at")
      .eq("brand_id", input.brandId)
      .gte("created_at", since);
    if (postsError) throw postsError;

    const rows = posts || [];
    const drafted = rows.filter((p) => p.status === "draft").length;
    const approved = rows.filter((p) => p.status === "approved").length;
    const posted = rows.filter((p) => p.status === "posted").length;
    const pending = rows.filter((p) => p.status === "pending_approval").length;

    const publishRate = rows.length ? Number(((posted / rows.length) * 100).toFixed(1)) : 0;
    const approvalRate = rows.length ? Number(((approved / rows.length) * 100).toFixed(1)) : 0;
    const estimatedMqls = Math.round(posted * 1.8);
    const estimatedSqls = Math.round(estimatedMqls * 0.35);
    const estimatedMeetings = Math.round(estimatedSqls * 0.4);

    return NextResponse.json({
      window_days: days,
      totals: {
        generated: rows.length,
        draft: drafted,
        pending,
        approved,
        posted,
      },
      funnel: {
        approval_rate_pct: approvalRate,
        publish_rate_pct: publishRate,
        estimated_mqls: estimatedMqls,
        estimated_sqls: estimatedSqls,
        estimated_meetings: estimatedMeetings,
      },
      notes: [
        "Estimated funnel uses conservative placeholder multipliers.",
        "Replace with CRM-attributed conversions when available.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
