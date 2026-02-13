import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const inputSchema = z.object({
  brief: z.string().min(10).max(1200),
});

const outputSchema = z.object({
  brand_kit: z.object({
    name: z.string(),
    primary_colors: z.array(z.string()).min(1),
    secondary_colors: z.array(z.string()).min(1),
    accent_colors: z.array(z.string()).min(1),
    font_personality: z.string(),
    tone_guidelines: z.array(z.string()).min(2),
    allowed_image_styles: z.array(z.string()).min(2),
  }),
  identity: z.object({
    positioning: z.string(),
    voice_traits: z.array(z.string()).min(2),
    audience_personas: z.array(z.string()).min(2),
    do_not_use: z.array(z.string()).min(2),
    preferred_phrases: z.array(z.string()).min(2),
  }),
  mood_board: z.object({
    name: z.string(),
    palette_colors: z.array(z.string()).min(2),
    typography_mood: z.string(),
    image_density: z.string(),
    composition_style: z.string(),
    emotional_tone: z.string(),
  }),
  post_strategy: z.object({
    post_type: z.string(),
    length: z.enum(["short", "standard", "long"]),
    audience_level: z.enum(["executive", "practitioner", "general"]),
  }),
});

const isHexColor = (value: string) => /^#?[0-9A-Fa-f]{6}$/.test(value.trim());
const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  if (!isHexColor(trimmed)) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

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
      "You are an expert brand strategist for a LinkedIn marketing studio.",
      "Convert the brand brief into a structured setup.",
      "Use short, concrete labels and avoid claims like 'best' or 'guaranteed'.",
      "Return only JSON that matches the schema.",
    ].join(" ");

    const userPrompt = [
      "Brand brief:",
      input.brief,
      "Guidelines:",
      "- Use 3 hex colors in palette fields.",
      "- Pick 2-4 items per list.",
      "- Tone and mood should match the brief.",
      "- Keep output concise.",
    ].join("\n");

    const schema = {
      name: "brand_intake",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          brand_kit: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              primary_colors: { type: "array", items: { type: "string" }, minItems: 1 },
              secondary_colors: { type: "array", items: { type: "string" }, minItems: 1 },
              accent_colors: { type: "array", items: { type: "string" }, minItems: 1 },
              font_personality: { type: "string" },
              tone_guidelines: { type: "array", items: { type: "string" }, minItems: 2 },
              allowed_image_styles: { type: "array", items: { type: "string" }, minItems: 2 },
            },
            required: [
              "name",
              "primary_colors",
              "secondary_colors",
              "accent_colors",
              "font_personality",
              "tone_guidelines",
              "allowed_image_styles",
            ],
          },
          identity: {
            type: "object",
            additionalProperties: false,
            properties: {
              positioning: { type: "string" },
              voice_traits: { type: "array", items: { type: "string" }, minItems: 2 },
              audience_personas: { type: "array", items: { type: "string" }, minItems: 2 },
              do_not_use: { type: "array", items: { type: "string" }, minItems: 2 },
              preferred_phrases: { type: "array", items: { type: "string" }, minItems: 2 },
            },
            required: ["positioning", "voice_traits", "audience_personas", "do_not_use", "preferred_phrases"],
          },
          mood_board: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              palette_colors: { type: "array", items: { type: "string" }, minItems: 2 },
              typography_mood: { type: "string" },
              image_density: { type: "string" },
              composition_style: { type: "string" },
              emotional_tone: { type: "string" },
            },
            required: [
              "name",
              "palette_colors",
              "typography_mood",
              "image_density",
              "composition_style",
              "emotional_tone",
            ],
          },
          post_strategy: {
            type: "object",
            additionalProperties: false,
            properties: {
              post_type: { type: "string" },
              length: { type: "string", enum: ["short", "standard", "long"] },
              audience_level: { type: "string", enum: ["executive", "practitioner", "general"] },
            },
            required: ["post_type", "length", "audience_level"],
          },
        },
        required: ["brand_kit", "identity", "mood_board", "post_strategy"],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const result = await createStructuredChatCompletion<z.infer<typeof outputSchema>>({
      model,
      system: systemPrompt,
      user: userPrompt,
      schema,
    });

    const parsed = outputSchema.parse(result);

    const primary = normalizeHex(parsed.brand_kit.primary_colors[0]) || "#0A66C2";
    const secondary = normalizeHex(parsed.brand_kit.secondary_colors[0]) || "#0F172A";
    const accent = normalizeHex(parsed.brand_kit.accent_colors[0]) || "#22D3EE";
    const palette = parsed.mood_board.palette_colors
      .map((color) => normalizeHex(color))
      .filter(Boolean) as string[];

    return NextResponse.json({
      brand_kit: {
        ...parsed.brand_kit,
        primary_colors: [primary],
        secondary_colors: [secondary],
        accent_colors: [accent],
      },
      identity: parsed.identity,
      mood_board: {
        ...parsed.mood_board,
        palette_colors: palette.length ? palette : [primary, secondary, accent],
      },
      post_strategy: parsed.post_strategy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brand intake failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
