import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { runComplianceChecks } from "@/lib/studio/compliance";

const inputSchema = z.object({
  postId: z.string().uuid(),
});

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

    const postRes = await supabase.from("posts").select("*").eq("id", input.postId).eq("user_id", user.id).single();
    if (postRes.error || !postRes.data) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = postRes.data;
    const [brandKitRes, identityRes] = await Promise.all([
      post.brand_kit_id
        ? supabase.from("brand_kits").select("*").eq("id", post.brand_kit_id).single()
        : Promise.resolve({ data: null, error: null }),
      post.brand_id
        ? supabase
            .from("marketing_identities")
            .select("*")
            .eq("brand_id", post.brand_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const brandKit = brandKitRes.data as Record<string, unknown> | null;
    const identity = identityRes.data as Record<string, unknown> | null;
    const doNotUse = (identity?.do_not_use as string[]) || [];
    const toneGuidelines = (brandKit?.tone_guidelines as string[]) || [];

    const hashtags = post.post_content?.match(/#[A-Za-z0-9_]+/g) || [];
    const checks = runComplianceChecks({
      content: post.post_content || "",
      hashtags,
      doNotUse,
      toneGuidelines,
    });

    const insertPayload = checks.map((check) => ({
      post_id: post.id,
      check_type: check.type,
      status: check.status,
      score: check.score ?? null,
      details: check.details ?? {},
    }));

    await supabase.from("compliance_checks").insert(insertPayload);

    const overallStatus = checks.some((check) => check.status === "fail")
      ? "fail"
      : checks.some((check) => check.status === "warn")
        ? "warn"
        : "pass";

    const scores = checks.map((check) => check.score || 0);
    const avgScore =
      scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 1;

    await supabase
      .from("posts")
      .update({
        compliance_status: overallStatus,
        compliance_score: Number(avgScore.toFixed(2)),
      })
      .eq("id", post.id);

    await supabase.from("audit_logs").insert({
      brand_id: post.brand_id,
      actor_id: user.id,
      action: "compliance_checked",
      entity_type: "post",
      entity_id: post.id,
      metadata: { overall_status: overallStatus },
    });

    return NextResponse.json({ checks, overall_status: overallStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
