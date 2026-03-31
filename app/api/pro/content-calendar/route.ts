import { NextResponse } from "next/server";

export const maxDuration = 60;

import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

/**
 * Smart Content Calendar API
 *
 * Generates an optimized week/month of content based on:
 * - Brand DNA and voice guidelines
 * - Performance patterns (what hooks/topics/times work best)
 * - Content pillar rotation (avoid repeating the same theme)
 * - Optimal posting cadence
 * - Recent post history (avoid duplication)
 *
 * Returns a calendar of post briefs ready for the Studio pipeline.
 */

export const dynamic = "force-dynamic";

const CONTENT_PILLARS = [
  "thought-leadership",
  "product-insight",
  "social-proof",
  "personal-story",
  "how-to-guide",
  "industry-trend",
  "hiring-culture",
] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      brandId,
      durationDays = 7,
      postsPerWeek = 4,
      focusTopics = [],
      avoidTopics = [],
      includeWeekends = false,
    } = body as {
      brandId: string;
      durationDays?: number;
      postsPerWeek?: number;
      focusTopics?: string[];
      avoidTopics?: string[];
      includeWeekends?: boolean;
    };

    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    // ── Fetch brand context ──
    const [brandResult, dnaResult, recentPostsResult, performanceResult] = await Promise.all([
      supabase.from("brands").select("name, description, industry, website").eq("id", brandId).maybeSingle(),
      supabase
        .from("marketing_dna")
        .select("tone, post_types, cta_style, cadence, evidence")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("posts")
        .select("title, post_content, created_at, engagement_views, engagement_likes, engagement_comments")
        .eq("user_id", authData.user.id)
        .in("status", ["posted", "published", "draft", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(15),
      // Fetch performance patterns
      supabase
        .from("posts")
        .select("post_content, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares")
        .eq("user_id", authData.user.id)
        .in("status", ["posted", "published"])
        .order("posted_at", { ascending: false })
        .limit(50),
    ]);

    const brand = brandResult.data;
    const dna = dnaResult.data;
    const recentPosts = recentPostsResult.data || [];
    const performancePosts = performanceResult.data || [];

    // ── Analyze what's been working ──
    const scoredPosts = performancePosts
      .filter((p) => p.post_content && p.engagement_views)
      .map((p) => {
        const score =
          Number(p.engagement_views || 0) +
          Number(p.engagement_likes || 0) * 5 +
          Number(p.engagement_comments || 0) * 10 +
          Number(p.engagement_shares || 0) * 15;
        const firstLine = (p.post_content || "").split(/\r?\n/).find((l: string) => l.trim()) || "";
        return { content: p.post_content, score, firstLine };
      })
      .sort((a, b) => b.score - a.score);

    const topPerformers = scoredPosts.slice(0, 5).map((p) => p.content?.slice(0, 300));
    const topHooks = scoredPosts.slice(0, 5).map((p) => p.firstLine);

    // ── Detect recently covered topics to avoid repetition ──
    const recentTopics = recentPosts
      .map((p) => p.title || (p.post_content || "").slice(0, 100))
      .filter(Boolean)
      .slice(0, 10);

    // ── Calculate posting slots ──
    const totalPosts = Math.ceil((durationDays / 7) * postsPerWeek);
    const clampedPosts = Math.min(totalPosts, 30);

    // ── Build the prompt ──
    const brandContext = brand
      ? `Brand: ${brand.name}\nIndustry: ${brand.industry || "General"}\nDescription: ${brand.description || "N/A"}\nWebsite: ${brand.website || "N/A"}`
      : "No brand context available.";

    const dnaContext = dna
      ? `Tone: ${dna.tone || "professional"}\nPost types: ${JSON.stringify(dna.post_types || [])}\nCTA style: ${dna.cta_style || "direct"}`
      : "";

    const performanceContext = topPerformers.length
      ? `TOP PERFORMING POSTS (learn from these — replicate what works):\n${topPerformers.map((p, i) => `${i + 1}. ${p}`).join("\n\n")}`
      : "No performance data yet. Use diverse content types to discover what resonates.";

    const hooksContext = topHooks.length
      ? `PROVEN HOOK PATTERNS (these hooks drove the most engagement):\n${topHooks.map((h, i) => `${i + 1}. "${h}"`).join("\n")}`
      : "";

    const avoidContext = recentTopics.length
      ? `RECENTLY COVERED (avoid repeating these themes):\n${recentTopics.map((t) => `- ${t}`).join("\n")}`
      : "";

    const systemPrompt = `You are a senior content strategist planning a LinkedIn content calendar for a B2B brand.

Your job is to create a strategic, data-informed content plan that:
1. Rotates between content pillars so the audience never sees the same theme twice in a row
2. Uses proven hook patterns from top-performing posts
3. Avoids recently covered topics
4. Assigns optimal posting days (${includeWeekends ? "Mon-Sun" : "Mon-Fri"})
5. Each post brief should be specific enough to generate from — not vague

Content pillars to rotate: ${CONTENT_PILLARS.join(", ")}
${focusTopics.length ? `Focus more on: ${focusTopics.join(", ")}` : ""}
${avoidTopics.length ? `Avoid these topics: ${avoidTopics.join(", ")}` : ""}

Return JSON only.`;

    const userPrompt = `${brandContext}

${dnaContext}

${performanceContext}

${hooksContext}

${avoidContext}

Generate exactly ${clampedPosts} post briefs for a ${durationDays}-day content calendar starting tomorrow.

For each post, provide:
- day_offset: days from today (1 = tomorrow)
- pillar: which content pillar this belongs to
- headline: a compelling title for this post
- hook_suggestion: the exact opening 1-2 lines (use proven patterns if available)
- brief: 2-3 sentence description of what this post should cover, including specific angles, data to mention, or stories to tell
- tone: recommended tone for this specific post
- cta_type: what kind of CTA to use (question, link, dm-invite, follow, save)
- post_type: format suggestion (story, listicle, hot-take, case-study, how-to, announcement)
- suggested_time: recommended posting time in HH:MM format (24h)`;

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";

    const result = await createStructuredChatCompletion<{
      calendar: Array<{
        day_offset: number;
        pillar: string;
        headline: string;
        hook_suggestion: string;
        brief: string;
        tone: string;
        cta_type: string;
        post_type: string;
        suggested_time: string;
      }>;
      strategy_notes: string;
    }>({
      model,
      system: systemPrompt,
      user: userPrompt,
      schema: {
        name: "content_calendar",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            calendar: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  day_offset: { type: "number" },
                  pillar: { type: "string" },
                  headline: { type: "string" },
                  hook_suggestion: { type: "string" },
                  brief: { type: "string" },
                  tone: { type: "string" },
                  cta_type: { type: "string" },
                  post_type: { type: "string" },
                  suggested_time: { type: "string" },
                },
                required: [
                  "day_offset", "pillar", "headline", "hook_suggestion",
                  "brief", "tone", "cta_type", "post_type", "suggested_time",
                ],
              },
            },
            strategy_notes: { type: "string" },
          },
          required: ["calendar", "strategy_notes"],
        },
      },
      temperature: 0.8,
    });

    // ── Compute actual dates for each post ──
    const today = new Date();
    const calendarWithDates = result.calendar.map((item) => {
      const postDate = new Date(today);
      postDate.setDate(today.getDate() + item.day_offset);
      const [hours, minutes] = (item.suggested_time || "09:00").split(":").map(Number);
      postDate.setHours(hours || 9, minutes || 0, 0, 0);

      return {
        ...item,
        scheduled_date: postDate.toISOString().slice(0, 10),
        scheduled_datetime: postDate.toISOString(),
      };
    });

    return NextResponse.json({
      calendar: calendarWithDates,
      strategyNotes: result.strategy_notes,
      config: {
        durationDays,
        postsPerWeek,
        totalPosts: clampedPosts,
        brandName: brand?.name || null,
        includeWeekends,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Content calendar error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
