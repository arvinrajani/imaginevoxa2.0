import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

/**
 * Brand Voice Evolution API
 *
 * Analyzes recent posted content + engagement to:
 * 1. Update brand voice profile based on what's actually performing
 * 2. Detect voice drift (is the brand changing tone unintentionally?)
 * 3. Recommend voice adjustments based on audience response
 * 4. Generate an updated "voice DNA" snapshot
 *
 * Should be called periodically (e.g., after every 5 published posts)
 * or manually from the Strategy page.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { brandId } = body as { brandId: string };

    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    // Verify user owns this brand
    const { data: brandOwnership } = await supabase
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("owner_user_id", authData.user.id)
      .single();
    if (!brandOwnership) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // ── Fetch current brand DNA (baseline to compare against) ──
    const { data: currentDna } = await supabase
      .from("marketing_dna")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Fetch recent posted content with engagement ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentPosts, error: postsError } = await supabase
      .from("posts")
      .select(
        "id, title, post_content, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares"
      )
      .eq("user_id", authData.user.id)
      .in("status", ["posted", "published"])
      .gte("posted_at", thirtyDaysAgo.toISOString())
      .order("posted_at", { ascending: false })
      .limit(30);

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    const publishedPosts = (recentPosts || []).filter(
      (p) => typeof p.post_content === "string" && p.post_content.length > 50
    );

    if (publishedPosts.length < 3) {
      return NextResponse.json({
        insufficientData: true,
        message: "Need at least 3 published posts in the last 30 days to analyze voice evolution.",
        postsFound: publishedPosts.length,
      });
    }

    // ── Score posts for weighting ──
    const scoredPosts = publishedPosts.map((p) => {
      const score =
        Number(p.engagement_views || 0) +
        Number(p.engagement_likes || 0) * 5 +
        Number(p.engagement_comments || 0) * 10 +
        Number(p.engagement_shares || 0) * 15;
      return { ...p, score };
    });

    const avgScore = scoredPosts.reduce((a, b) => a + b.score, 0) / scoredPosts.length;
    const topPosts = scoredPosts.filter((p) => p.score > avgScore).sort((a, b) => b.score - a.score);
    const lowPosts = scoredPosts.filter((p) => p.score <= avgScore * 0.5);

    // ── Build analysis prompt ──
    const currentDnaContext = currentDna
      ? `CURRENT BRAND VOICE BASELINE:
- Tone: ${currentDna.tone || "unknown"}
- CTA style: ${currentDna.cta_style || "unknown"}
- Post types: ${JSON.stringify(currentDna.post_types || [])}
- Visual density: ${currentDna.visual_density || "unknown"}
- Consistency score: ${currentDna.consistency_score || "unknown"}
- Last analyzed: ${currentDna.analyzed_at || currentDna.created_at}`
      : "No existing brand voice baseline found. This will be the first voice analysis.";

    const topPostsContext = topPosts.slice(0, 5).map((p, i) =>
      `TOP POST ${i + 1} (score: ${p.score}):\n${(p.post_content || "").slice(0, 500)}`
    ).join("\n\n");

    const lowPostsContext = lowPosts.slice(0, 3).map((p, i) =>
      `LOW POST ${i + 1} (score: ${p.score}):\n${(p.post_content || "").slice(0, 300)}`
    ).join("\n\n");

    const allPostsSummary = scoredPosts.map((p, i) =>
      `Post ${i + 1} (${p.posted_at?.slice(0, 10)}, score: ${p.score}): ${(p.post_content || "").slice(0, 150)}`
    ).join("\n");

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";

    const result = await createStructuredChatCompletion<{
      evolved_voice: {
        tone: string;
        tone_keywords: string[];
        writing_style: string;
        hook_patterns: string[];
        cta_patterns: string[];
        vocabulary_signature: string[];
        emotional_range: string;
        sentence_rhythm: string;
      };
      drift_analysis: {
        has_drift: boolean;
        drift_direction: string;
        drift_severity: "none" | "mild" | "moderate" | "significant";
        drift_details: string;
      };
      performance_voice_link: {
        what_works: string[];
        what_doesnt: string[];
        audience_preference: string;
      };
      recommendations: string[];
      consistency_score: number;
      voice_summary: string;
    }>({
      model,
      system: `You are a brand voice analyst specializing in LinkedIn B2B content. Analyze the voice patterns across published posts, identify what resonates with the audience (based on engagement scores), and detect any voice drift from the baseline.

Voice drift means the brand's actual published tone is shifting away from their intended tone — this can be positive (audience prefers the new direction) or negative (losing brand consistency).

Return JSON only.`,
      user: `${currentDnaContext}

RECENT PUBLISHED POSTS (${publishedPosts.length} posts, last 30 days):
${allPostsSummary}

HIGH-PERFORMING POSTS (audience loved these):
${topPostsContext || "No clearly top-performing posts yet."}

LOW-PERFORMING POSTS (these didn't resonate):
${lowPostsContext || "No clearly underperforming posts."}

Analyze:
1. What voice/tone patterns appear in the TOP posts vs LOW posts?
2. Has the brand voice drifted from the baseline? In what direction?
3. What specific writing patterns (hooks, CTAs, sentence structure, vocabulary) correlate with engagement?
4. Provide 3-5 specific, actionable voice recommendations.
5. Score consistency 0-100 based on how aligned the recent posts are with each other.
6. Write a 2-3 sentence "voice summary" that captures this brand's current authentic voice.`,
      schema: {
        name: "voice_evolution",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            evolved_voice: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone: { type: "string" },
                tone_keywords: { type: "array", items: { type: "string" } },
                writing_style: { type: "string" },
                hook_patterns: { type: "array", items: { type: "string" } },
                cta_patterns: { type: "array", items: { type: "string" } },
                vocabulary_signature: { type: "array", items: { type: "string" } },
                emotional_range: { type: "string" },
                sentence_rhythm: { type: "string" },
              },
              required: ["tone", "tone_keywords", "writing_style", "hook_patterns", "cta_patterns"],
            },
            drift_analysis: {
              type: "object",
              additionalProperties: false,
              properties: {
                has_drift: { type: "boolean" },
                drift_direction: { type: "string" },
                drift_severity: { type: "string", enum: ["none", "mild", "moderate", "significant"] },
                drift_details: { type: "string" },
              },
              required: ["has_drift", "drift_direction", "drift_severity", "drift_details"],
            },
            performance_voice_link: {
              type: "object",
              additionalProperties: false,
              properties: {
                what_works: { type: "array", items: { type: "string" } },
                what_doesnt: { type: "array", items: { type: "string" } },
                audience_preference: { type: "string" },
              },
              required: ["what_works", "what_doesnt", "audience_preference"],
            },
            recommendations: { type: "array", items: { type: "string" } },
            consistency_score: { type: "number" },
            voice_summary: { type: "string" },
          },
          required: [
            "evolved_voice", "drift_analysis", "performance_voice_link",
            "recommendations", "consistency_score", "voice_summary",
          ],
        },
      },
      temperature: 0.4,
    });

    // ── Store the evolved voice as a new marketing_dna entry ──
    const { data: newDna, error: insertError } = await supabase
      .from("marketing_dna")
      .insert({
        brand_id: brandId,
        source: "voice-evolution",
        analysis_version: model,
        tone: result.evolved_voice.tone,
        consistency_score: result.consistency_score,
        evidence: {
          evolved_voice: result.evolved_voice,
          drift_analysis: result.drift_analysis,
          performance_voice_link: result.performance_voice_link,
          recommendations: result.recommendations,
          voice_summary: result.voice_summary,
          posts_analyzed: publishedPosts.length,
          top_post_count: topPosts.length,
          analyzed_window: "30d",
        },
        created_by: authData.user.id,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Failed to store evolved voice:", insertError);
    }

    return NextResponse.json({
      evolvedVoice: result.evolved_voice,
      driftAnalysis: result.drift_analysis,
      performanceLink: result.performance_voice_link,
      recommendations: result.recommendations,
      consistencyScore: result.consistency_score,
      voiceSummary: result.voice_summary,
      meta: {
        postsAnalyzed: publishedPosts.length,
        topPerformers: topPosts.length,
        lowPerformers: lowPosts.length,
        storedAs: newDna?.id || null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Brand voice evolution error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
