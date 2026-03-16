import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

/**
 * Brand Voice Score API
 *
 * Scores a draft/generated post against the brand's evolved voice profile.
 * Returns a voice alignment score + specific feedback on what to adjust.
 *
 * Use this before publishing to catch off-brand content.
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
    const { brandId, postContent } = body as { brandId: string; postContent: string };

    if (!brandId || !postContent) {
      return NextResponse.json({ error: "brandId and postContent are required" }, { status: 400 });
    }

    // ── Fetch latest brand voice (prefer voice-evolution, fallback to linkedin) ──
    const { data: dnaRows } = await supabase
      .from("marketing_dna")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(2);

    const dna = dnaRows?.find((d) => d.source === "voice-evolution") || dnaRows?.[0] || null;

    // ── Fetch brand identity ──
    const { data: identity } = await supabase
      .from("marketing_identities")
      .select("voice_traits, positioning, do_not_use, preferred_phrases")
      .eq("brand_id", brandId)
      .maybeSingle();

    // ── Fetch top-performing posts as reference ──
    const { data: topPosts } = await supabase
      .from("posts")
      .select("post_content, engagement_views, engagement_likes, engagement_comments, engagement_shares")
      .eq("user_id", authData.user.id)
      .in("status", ["posted", "published"])
      .order("engagement_likes", { ascending: false })
      .limit(5);

    const topPostExamples = (topPosts || [])
      .filter((p) => p.post_content && Number(p.engagement_likes || 0) > 0)
      .slice(0, 3)
      .map((p, i) => `Example ${i + 1}: ${(p.post_content || "").slice(0, 400)}`)
      .join("\n\n");

    // ── Build voice profile context ──
    const voiceContext: string[] = [];
    if (dna) {
      voiceContext.push(`Brand tone: ${dna.tone || "professional"}`);
      if (dna.evidence?.evolved_voice) {
        const ev = dna.evidence.evolved_voice;
        if (ev.tone_keywords) voiceContext.push(`Tone keywords: ${ev.tone_keywords.join(", ")}`);
        if (ev.writing_style) voiceContext.push(`Writing style: ${ev.writing_style}`);
        if (ev.hook_patterns) voiceContext.push(`Preferred hook patterns: ${ev.hook_patterns.join("; ")}`);
        if (ev.cta_patterns) voiceContext.push(`CTA patterns: ${ev.cta_patterns.join("; ")}`);
        if (ev.sentence_rhythm) voiceContext.push(`Sentence rhythm: ${ev.sentence_rhythm}`);
        if (ev.vocabulary_signature) voiceContext.push(`Vocabulary signature: ${ev.vocabulary_signature.join(", ")}`);
      }
      if (dna.evidence?.voice_summary) {
        voiceContext.push(`Voice summary: ${dna.evidence.voice_summary}`);
      }
    }
    if (identity) {
      if (identity.voice_traits?.length) voiceContext.push(`Voice traits: ${identity.voice_traits.join(", ")}`);
      if (identity.positioning) voiceContext.push(`Positioning: ${identity.positioning}`);
      if (identity.do_not_use?.length) voiceContext.push(`Do NOT use: ${identity.do_not_use.join(", ")}`);
      if (identity.preferred_phrases?.length) voiceContext.push(`Preferred phrases: ${identity.preferred_phrases.join(", ")}`);
    }

    if (voiceContext.length === 0) {
      return NextResponse.json({
        score: null,
        message: "No brand voice profile found. Run Brand Voice Evolution first to establish a baseline.",
      });
    }

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";

    const result = await createStructuredChatCompletion<{
      overall_score: number;
      dimensions: {
        tone_alignment: number;
        hook_quality: number;
        cta_effectiveness: number;
        vocabulary_match: number;
        structure_quality: number;
        audience_relevance: number;
      };
      strengths: string[];
      improvements: string[];
      off_brand_flags: string[];
      rewrite_suggestions: string[];
    }>({
      model,
      system: `You are a brand voice quality analyst. Score a draft LinkedIn post against the brand's established voice profile.

Be specific and actionable in feedback. Don't just say "improve the hook" — say exactly what's wrong and how to fix it.

Scores are 0-100 where:
- 90-100: Publication-ready, perfectly on-brand
- 75-89: Good, minor adjustments needed
- 60-74: Decent but noticeably off-brand in places
- Below 60: Needs significant rework

Return JSON only.`,
      user: `BRAND VOICE PROFILE:
${voiceContext.join("\n")}

${topPostExamples ? `TOP-PERFORMING POSTS FROM THIS BRAND (for reference):\n${topPostExamples}` : ""}

DRAFT POST TO SCORE:
${postContent}

Score this post across 6 dimensions. Provide specific strengths, improvements, any off-brand flags (words/phrases that violate the brand voice), and concrete rewrite suggestions for weak sections.`,
      schema: {
        name: "voice_score",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            overall_score: { type: "number" },
            dimensions: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone_alignment: { type: "number" },
                hook_quality: { type: "number" },
                cta_effectiveness: { type: "number" },
                vocabulary_match: { type: "number" },
                structure_quality: { type: "number" },
                audience_relevance: { type: "number" },
              },
              required: [
                "tone_alignment", "hook_quality", "cta_effectiveness",
                "vocabulary_match", "structure_quality", "audience_relevance",
              ],
            },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            off_brand_flags: { type: "array", items: { type: "string" } },
            rewrite_suggestions: { type: "array", items: { type: "string" } },
          },
          required: ["overall_score", "dimensions", "strengths", "improvements", "off_brand_flags", "rewrite_suggestions"],
        },
      },
      temperature: 0.3,
    });

    return NextResponse.json({
      score: result.overall_score,
      dimensions: result.dimensions,
      strengths: result.strengths,
      improvements: result.improvements,
      offBrandFlags: result.off_brand_flags,
      rewriteSuggestions: result.rewrite_suggestions,
      verdict:
        result.overall_score >= 90
          ? "on-brand"
          : result.overall_score >= 75
          ? "mostly-on-brand"
          : result.overall_score >= 60
          ? "needs-adjustment"
          : "off-brand",
    });
  } catch (error) {
    console.error("Voice score error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
