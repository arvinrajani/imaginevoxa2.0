import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  brandKitId: z.string().uuid(),
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

    const [brandKitRes, dnaRes] = await Promise.all([
      supabase.from("brand_kits").select("*").eq("id", input.brandKitId).single(),
      supabase
        .from("marketing_dna")
        .select("*")
        .eq("brand_id", input.brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (brandKitRes.error || !brandKitRes.data) {
      return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
    }

    const systemPrompt = [
      "You are ImagineVoxa Pro.",
      "Propose mood boards from Brand Kit + Marketing DNA.",
      "Return JSON only, matching the schema.",
    ].join(" ");

    const userPrompt = [
      `Brand kit: ${JSON.stringify(brandKitRes.data)}`,
      `Marketing DNA: ${JSON.stringify(dnaRes.data || {})}`,
    ].join("\n");

    const schema = {
      name: "mood_board_suggestion",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          palette_colors: { type: "array", items: { type: "string" } },
          typography_mood: { type: "string" },
          image_density: { type: "string" },
          composition_style: { type: "string" },
          emotional_tone: { type: "string" },
          rationale: { type: "string" },
        },
        required: [
          "name",
          "palette_colors",
          "typography_mood",
          "image_density",
          "composition_style",
          "emotional_tone",
          "rationale",
        ],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const suggestion = await createStructuredChatCompletion<{
      name: string;
      description: string;
      palette_colors: string[];
      typography_mood: string;
      image_density: string;
      composition_style: string;
      emotional_tone: string;
      rationale: string;
    }>({
      model,
      system: systemPrompt,
      user: userPrompt,
      schema,
    });

    const { data: mood, error } = await supabase
      .from("mood_boards")
      .insert({
        brand_id: input.brandId,
        name: suggestion.name,
        description: suggestion.description,
        palette_colors: suggestion.palette_colors,
        typography_mood: suggestion.typography_mood,
        image_density: suggestion.image_density,
        composition_style: suggestion.composition_style,
        emotional_tone: suggestion.emotional_tone,
        is_locked: false,
      })
      .select("*")
      .single();

    if (error || !mood) {
      return NextResponse.json({ error: "Failed to save mood board" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "mood_board_suggested",
      entity_type: "mood_board",
      entity_id: mood.id,
      metadata: { model, rationale: suggestion.rationale },
    });

    return NextResponse.json({ mood_board: mood, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
