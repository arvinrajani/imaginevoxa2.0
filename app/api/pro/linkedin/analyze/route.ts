import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const postSchema = z.object({
  text: z.string().min(1),
  created_at: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  type: z.string().optional(),
  media: z
    .object({
      dominant_colors: z.array(z.string()).optional(),
      has_text_overlay: z.boolean().optional(),
      theme: z.string().optional(),
    })
    .optional(),
});

const inputSchema = z.object({
  brandId: z.string().uuid(),
  connectionId: z.string().uuid().optional().nullable(),
  posts: z.array(postSchema).min(3),
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

    const systemPrompt = [
      "You are ImagineVoxa Pro.",
      "Analyze LinkedIn content and return structured Marketing DNA.",
      "Return JSON only with the given schema.",
      "Use evidence from provided posts only.",
    ].join(" ");

    const userPrompt = [
      `Posts: ${JSON.stringify(input.posts).slice(0, 6000)}`,
      "Return tone, colors, image_style, post_types, product_mentions, content_pillars, cta_style, visual_density, cadence, consistency_score, evidence.",
    ].join("\n");

    const schema = {
      name: "marketing_dna",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          tone: { type: "string" },
          primary_colors: { type: "array", items: { type: "string" } },
          accent_colors: { type: "array", items: { type: "string" } },
          image_style: { type: "string" },
          post_types: { type: "array", items: { type: "string" } },
          product_mentions: { type: "array", items: { type: "string" } },
          content_pillars: { type: "array", items: { type: "string" } },
          cta_style: { type: "string" },
          visual_density: { type: "string" },
          cadence: {
            type: "object",
            additionalProperties: true,
          },
          consistency_score: { type: "number" },
          evidence: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: [
          "tone",
          "primary_colors",
          "accent_colors",
          "image_style",
          "post_types",
          "product_mentions",
          "content_pillars",
          "cta_style",
          "visual_density",
          "cadence",
          "consistency_score",
          "evidence",
        ],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const result = await createStructuredChatCompletion<{
      tone: string;
      primary_colors: string[];
      accent_colors: string[];
      image_style: string;
      post_types: string[];
      product_mentions: string[];
      content_pillars: string[];
      cta_style: string;
      visual_density: string;
      cadence: Record<string, unknown>;
      consistency_score: number;
      evidence: Record<string, unknown>;
    }>({
      model,
      system: systemPrompt,
      user: userPrompt,
      schema,
    });

    const { data: dna, error: dnaError } = await supabase
      .from("marketing_dna")
      .insert({
        brand_id: input.brandId,
        source: "linkedin",
        analysis_version: model,
        tone: result.tone,
        primary_colors: result.primary_colors,
        accent_colors: result.accent_colors,
        image_style: result.image_style,
        post_types: result.post_types,
        cta_style: result.cta_style,
        visual_density: result.visual_density,
        cadence: result.cadence,
        consistency_score: result.consistency_score,
        evidence: {
          ...result.evidence,
          product_mentions: result.product_mentions,
          content_pillars: result.content_pillars,
        },
        created_by: user.id,
      })
      .select("*")
      .single();

    if (dnaError || !dna) {
      return NextResponse.json({ error: "Failed to save marketing DNA" }, { status: 500 });
    }

    await supabase.from("linkedin_mood_profiles").insert({
      brand_id: input.brandId,
      marketing_dna_id: dna.id,
      profile: result,
      is_active: true,
      created_by: user.id,
    });

    await supabase.from("linkedin_analysis_runs").insert({
      brand_id: input.brandId,
      connection_id: input.connectionId ?? null,
      status: "completed",
      input_summary: { posts_count: input.posts.length },
      output: result,
      created_by: user.id,
    });

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "linkedin_analysis",
      entity_type: "marketing_dna",
      entity_id: dna.id,
    });

    return NextResponse.json({ marketing_dna: dna, profile: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
