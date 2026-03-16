import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

/**
 * A/B Hook Variant Testing API
 *
 * Two modes:
 *   POST /api/pro/ab-test?action=generate  — Generate hook variants for a post
 *   POST /api/pro/ab-test?action=analyze   — Analyze results of a completed test
 *   GET  /api/pro/ab-test?brandId=xxx      — List active/past tests with results
 *
 * Workflow:
 * 1. User writes/generates a post
 * 2. This API generates 2-3 hook variants (same body, different openings)
 * 3. User publishes variant A, schedules variant B for next week
 * 4. After both are posted + engagement synced, analyze which won and why
 * 5. Winning patterns feed back into the content recommendation engine
 */

export const dynamic = "force-dynamic";

// ── GENERATE hook variants ──
async function generateVariants(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { brandId, postContent, variantCount = 3 } = body as {
    brandId: string;
    postContent: string;
    variantCount?: number;
  };

  if (!postContent || postContent.trim().length < 50) {
    return NextResponse.json({ error: "postContent must be at least 50 characters" }, { status: 400 });
  }

  const count = Math.min(Math.max(variantCount, 2), 5);

  // ── Fetch performance patterns for this brand ──
  let topHooksContext = "";
  if (brandId) {
    const { data: topPosts } = await supabase
      .from("posts")
      .select("post_content, engagement_likes, engagement_comments, engagement_shares")
      .eq("user_id", authData.user.id)
      .in("status", ["posted", "published"])
      .order("engagement_likes", { ascending: false })
      .limit(10);

    const hooks = (topPosts || [])
      .filter((p) => p.post_content && Number(p.engagement_likes || 0) > 0)
      .map((p) => {
        const firstLine = (p.post_content || "").split(/\r?\n/).find((l: string) => l.trim()) || "";
        const score = Number(p.engagement_likes || 0) * 5 + Number(p.engagement_comments || 0) * 10 + Number(p.engagement_shares || 0) * 15;
        return { hook: firstLine.slice(0, 150), score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (hooks.length > 0) {
      topHooksContext = `\nTOP-PERFORMING HOOKS FROM THIS BRAND (learn from these patterns):\n${hooks.map((h, i) => `${i + 1}. (score: ${h.score}) "${h.hook}"`).join("\n")}`;
    }
  }

  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";

  const result = await createStructuredChatCompletion<{
    variants: Array<{
      variant_id: string;
      hook: string;
      hook_type: string;
      hypothesis: string;
      full_post: string;
      confidence: number;
    }>;
    test_rationale: string;
  }>({
    model,
    system: `You are a LinkedIn content optimization specialist running A/B tests on hook variants.

Your job: take an existing post and create ${count} hook variants. Each variant keeps the SAME core body/message but opens with a completely different hook strategy.

Hook strategies to test:
- Question hook: Opens with a provocative question
- Data hook: Leads with a specific number/statistic
- Contrarian hook: Challenges conventional wisdom
- Story hook: Starts with "I" or a personal anecdote
- Bold statement: Makes a declarative, attention-grabbing claim
- How-to hook: Promises specific actionable value

Each variant should test a DIFFERENT engagement hypothesis. The body should remain largely the same (minor adjustments for flow) but the opening 1-3 lines should be completely different.

Return JSON only.`,
    user: `ORIGINAL POST:
${postContent}
${topHooksContext}

Generate exactly ${count} hook variants. For each:
- variant_id: A/B/C/D/E label
- hook: The new opening 1-3 lines
- hook_type: Which hook strategy this uses
- hypothesis: What you're testing (e.g., "Questions drive 2x comments vs statements")
- full_post: The complete post with new hook + adjusted body
- confidence: 0-100 how likely this variant will outperform the original`,
    schema: {
      name: "ab_variants",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          variants: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                variant_id: { type: "string" },
                hook: { type: "string" },
                hook_type: { type: "string" },
                hypothesis: { type: "string" },
                full_post: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["variant_id", "hook", "hook_type", "hypothesis", "full_post", "confidence"],
            },
          },
          test_rationale: { type: "string" },
        },
        required: ["variants", "test_rationale"],
      },
    },
    temperature: 0.9,
  });

  return NextResponse.json({
    originalPost: postContent,
    variants: result.variants,
    testRationale: result.test_rationale,
    generatedAt: new Date().toISOString(),
  });
}

// ── ANALYZE test results ──
async function analyzeResults(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { postIds } = body as { postIds: string[] };

  if (!postIds || postIds.length < 2) {
    return NextResponse.json({ error: "Provide at least 2 postIds to compare" }, { status: 400 });
  }

  // ── Fetch posts with engagement ──
  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id, title, post_content, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares"
    )
    .eq("user_id", authData.user.id)
    .in("id", postIds);

  if (error || !posts || posts.length < 2) {
    return NextResponse.json({ error: "Could not find posts or insufficient data" }, { status: 400 });
  }

  const scored = posts.map((p) => {
    const views = Number(p.engagement_views || 0);
    const likes = Number(p.engagement_likes || 0);
    const comments = Number(p.engagement_comments || 0);
    const shares = Number(p.engagement_shares || 0);
    const score = views + likes * 5 + comments * 10 + shares * 15;
    const rate = views > 0 ? ((likes + comments + shares) / views) * 100 : 0;
    const firstLine = (p.post_content || "").split(/\r?\n/).find((l: string) => l.trim()) || "";

    return {
      id: p.id,
      hook: firstLine.slice(0, 200),
      score,
      engagementRate: Number(rate.toFixed(2)),
      views,
      likes,
      comments,
      shares,
      postedAt: p.posted_at,
      content: (p.post_content || "").slice(0, 500),
    };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const loser = scored[scored.length - 1];

  const liftPercent = loser.score > 0
    ? Math.round(((winner.score - loser.score) / loser.score) * 100)
    : winner.score > 0 ? 100 : 0;

  // ── AI analysis of why the winner won ──
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";

  const analysis = await createStructuredChatCompletion<{
    winner_analysis: string;
    key_differences: string[];
    learnings: string[];
    recommendation: string;
  }>({
    model,
    system: "You are a LinkedIn content analyst reviewing A/B test results. Explain WHY one variant outperformed the other based on the hook, structure, and engagement patterns. Be specific and actionable. Return JSON only.",
    user: `WINNER (score: ${winner.score}, engagement rate: ${winner.engagementRate}%):
${winner.content}

LOSER (score: ${loser.score}, engagement rate: ${loser.engagementRate}%):
${loser.content}

Lift: ${liftPercent}%

Why did the winner outperform? What specific elements drove the difference? What should the brand do more/less of based on this test?`,
    schema: {
      name: "ab_analysis",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          winner_analysis: { type: "string" },
          key_differences: { type: "array", items: { type: "string" } },
          learnings: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
        },
        required: ["winner_analysis", "key_differences", "learnings", "recommendation"],
      },
    },
    temperature: 0.3,
  });

  return NextResponse.json({
    results: scored,
    winner: {
      id: winner.id,
      hook: winner.hook,
      score: winner.score,
      liftPercent,
    },
    analysis: analysis,
    analyzedAt: new Date().toISOString(),
  });
}

// ── LIST past tests ──
async function listTests(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");

  // Fetch all posted content with engagement, grouped by similarity for A/B detection
  let query = supabase
    .from("posts")
    .select("id, title, post_content, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares")
    .eq("user_id", authData.user.id)
    .in("status", ["posted", "published"])
    .order("posted_at", { ascending: false })
    .limit(50);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Simple view: return posts with engagement so the UI can select pairs for comparison
  const postsWithScores = (posts || []).map((p) => {
    const score =
      Number(p.engagement_views || 0) +
      Number(p.engagement_likes || 0) * 5 +
      Number(p.engagement_comments || 0) * 10 +
      Number(p.engagement_shares || 0) * 15;
    const firstLine = (p.post_content || "").split(/\r?\n/).find((l: string) => l.trim()) || "";
    return {
      id: p.id,
      title: p.title,
      hook: firstLine.slice(0, 150),
      score,
      views: Number(p.engagement_views || 0),
      likes: Number(p.engagement_likes || 0),
      comments: Number(p.engagement_comments || 0),
      shares: Number(p.engagement_shares || 0),
      postedAt: p.posted_at,
    };
  });

  return NextResponse.json({ posts: postsWithScores });
}

// ── Router ──
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "generate";

    switch (action) {
      case "generate":
        return generateVariants(request);
      case "analyze":
        return analyzeResults(request);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("A/B test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    return listTests(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
