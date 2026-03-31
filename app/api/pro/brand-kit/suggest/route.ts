import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  brandName: z.string().optional(),
  industry: z.string().optional(),
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

    const dnaRes = await supabase
      .from("marketing_dna")
      .select("*")
      .eq("brand_id", input.brandId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const systemPrompt = [
      "You are ImagineVoxa Pro.",
      "Propose a brand kit suggestion based on Marketing DNA.",
      "Return JSON only, matching the schema.",
      "Do not claim it is final or locked.",
    ].join(" ");

    const userPrompt = [
      `Brand name: ${input.brandName || ""}`,
      `Industry: ${input.industry || ""}`,
      `Marketing DNA: ${JSON.stringify(dnaRes.data || {})}`,
    ].join("\n");

    const schema = {
      name: "brand_kit_suggestion",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          brand_name: { type: "string" },
          primary_colors: { type: "array", items: { type: "string" } },
          secondary_colors: { type: "array", items: { type: "string" } },
          accent_colors: { type: "array", items: { type: "string" } },
          font_personality: { type: "string" },
          tone_guidelines: { type: "array", items: { type: "string" } },
          allowed_image_styles: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: [
          "name",
          "brand_name",
          "primary_colors",
          "secondary_colors",
          "accent_colors",
          "font_personality",
          "tone_guidelines",
          "allowed_image_styles",
          "rationale",
        ],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const suggestion = await createStructuredChatCompletion<{
      name: string;
      brand_name: string;
      primary_colors: string[];
      secondary_colors: string[];
      accent_colors: string[];
      font_personality: string;
      tone_guidelines: string[];
      allowed_image_styles: string[];
      rationale: string;
    }>({
      model,
      system: systemPrompt,
      user: userPrompt,
      schema,
    });

    const { data: kit, error } = await supabase
      .from("brand_kits")
      .insert({
        brand_id: input.brandId,
        name: suggestion.name,
        brand_name: suggestion.brand_name,
        primary_colors: suggestion.primary_colors,
        secondary_colors: suggestion.secondary_colors,
        accent_colors: suggestion.accent_colors,
        font_personality: suggestion.font_personality,
        tone_guidelines: suggestion.tone_guidelines,
        allowed_image_styles: suggestion.allowed_image_styles,
        is_locked: false,
      })
      .select("*")
      .single();

    if (error || !kit) {
      return NextResponse.json({ error: "Failed to save brand kit" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "brand_kit_suggested",
      entity_type: "brand_kit",
      entity_id: kit.id,
      metadata: { model, rationale: suggestion.rationale },
    });

    return NextResponse.json({ brand_kit: kit, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
