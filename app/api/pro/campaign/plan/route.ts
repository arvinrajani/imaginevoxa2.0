import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  durationDays: z.number().int().min(7).max(60).default(30),
  postsPerWeek: z.number().int().min(1).max(10).default(3),
  createDrafts: z.boolean().optional(),
  outcomeBrief: z.object({
    goal: z.string().min(3),
    audience: z.string().min(3),
    painPoint: z.string().min(3),
    solution: z.string().min(3),
    offer: z.string().optional(),
    proof: z.string().optional(),
    kpiTarget: z.string().optional(),
  }),
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
    const createDrafts = input.createDrafts ?? true;
    const totalPosts = Math.max(2, Math.ceil((input.durationDays / 7) * input.postsPerWeek));

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, name, owner_user_id")
      .eq("id", input.brandId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (brandError) throw brandError;
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const [brandKitRes, identityRes] = await Promise.all([
      supabase
        .from("brand_kits")
        .select("*")
        .eq("brand_id", input.brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("marketing_identities")
        .select("*")
        .eq("brand_id", input.brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const system = [
      "You are a LinkedIn campaign strategist.",
      "Build a practical sequence focused on business outcomes, not vanity engagement.",
      "Each post must map to: pain -> insight -> solution -> proof -> CTA.",
      "Return JSON only.",
    ].join(" ");

    const userPrompt = [
      `Brand: ${brand.name}`,
      `Duration days: ${input.durationDays}`,
      `Posts per week: ${input.postsPerWeek}`,
      `Target post count: ${totalPosts}`,
      `Outcome brief: ${JSON.stringify(input.outcomeBrief)}`,
      `Brand kit: ${JSON.stringify({
        tone_guidelines: brandKitRes.data?.tone_guidelines || [],
        primary_colors: brandKitRes.data?.primary_colors || [],
        allowed_image_styles: brandKitRes.data?.allowed_image_styles || [],
      })}`,
      identityRes.data
        ? `Marketing identity: ${JSON.stringify({
            voice_traits: identityRes.data.voice_traits,
            positioning: identityRes.data.positioning,
            audience_personas: identityRes.data.audience_personas,
          })}`
        : null,
      "For each post output headline, hook, body, cta, hashtags, image_prompt and experiment_tag.",
    ]
      .filter(Boolean)
      .join("\n");

    const schema = {
      name: "campaign_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          campaign_name: { type: "string" },
          summary: { type: "string" },
          pillars: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string" },
          },
          posts: {
            type: "array",
            minItems: totalPosts,
            maxItems: totalPosts,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                day_offset: { type: "integer", minimum: 0, maximum: input.durationDays - 1 },
                objective: { type: "string" },
                angle: { type: "string" },
                headline: { type: "string" },
                hook: { type: "string" },
                body: { type: "string" },
                cta: { type: "string" },
                hashtags: {
                  type: "array",
                  minItems: 3,
                  maxItems: 8,
                  items: { type: "string" },
                },
                image_prompt: { type: "string" },
                experiment_tag: { type: "string" },
              },
              required: [
                "day_offset",
                "objective",
                "angle",
                "headline",
                "hook",
                "body",
                "cta",
                "hashtags",
                "image_prompt",
                "experiment_tag",
              ],
            },
          },
        },
        required: ["campaign_name", "summary", "pillars", "posts"],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const plan = await createStructuredChatCompletion<{
      campaign_name: string;
      summary: string;
      pillars: string[];
      posts: Array<{
        day_offset: number;
        objective: string;
        angle: string;
        headline: string;
        hook: string;
        body: string;
        cta: string;
        hashtags: string[];
        image_prompt: string;
        experiment_tag: string;
      }>;
    }>({
      model,
      system,
      user: userPrompt,
      schema,
    });

    if (!createDrafts) {
      return NextResponse.json({
        campaign: null,
        draftPosts: [],
        plan,
      });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + input.durationDays * 24 * 60 * 60 * 1000);

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        brand_id: input.brandId,
        name: plan.campaign_name,
        description: plan.summary,
        status: "draft",
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: user.id,
      })
      .select("*")
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }

    const postsPayload = plan.posts.map((item) => {
      const scheduled = new Date(now.getTime() + item.day_offset * 24 * 60 * 60 * 1000);
      const postContent = [item.hook, item.body, item.cta, item.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")]
        .filter(Boolean)
        .join("\n\n");
      return {
        user_id: user.id,
        brand_id: input.brandId,
        prompt: item.image_prompt,
        title: item.headline,
        post_content: postContent,
        status: "draft",
        scheduled_for: scheduled.toISOString(),
      };
    });

    const { data: insertedPosts, error: postsError } = await supabase
      .from("posts")
      .insert(postsPayload)
      .select("id, title, scheduled_for");

    if (postsError || !insertedPosts) {
      return NextResponse.json({ error: "Campaign created, but failed to create draft posts" }, { status: 500 });
    }

    const campaignPostsPayload = insertedPosts.map((post) => ({
      campaign_id: campaign.id,
      post_id: post.id,
    }));
    await supabase.from("campaign_posts").insert(campaignPostsPayload);

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "campaign_planned",
      entity_type: "campaign",
      entity_id: campaign.id,
      metadata: {
        duration_days: input.durationDays,
        posts_per_week: input.postsPerWeek,
        generated_posts: insertedPosts.length,
      },
    });

    return NextResponse.json({
      campaign,
      draftPosts: insertedPosts,
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
