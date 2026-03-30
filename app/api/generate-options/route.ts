import { NextResponse } from "next/server";
import { z } from "zod";
import { createStructuredChatCompletion } from "@/lib/ai/openai";

const inputSchema = z.object({
  prompt: z.string().min(5).max(10000),
  count: z.number().int().min(1).max(5).optional(),
  tone: z.string().max(50).optional(),
});

type GeneratedOption = {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  image_prompt: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeText(value: string) {
  return value.replace(/\s{2,}/g, " ").trim();
}

function normalizeHashtags(input: string[] | unknown): string[] {
  const defaults = ["#LinkedIn", "#ContentMarketing", "#B2B", "#Growth"];
  if (!Array.isArray(input)) return defaults;

  const tags = input
    .filter((item): item is string => typeof item === "string")
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .map((tag) => `#${tag.replace(/\s+/g, "")}`);

  return Array.from(new Set([...tags, ...defaults])).slice(0, 8);
}

function buildFallbackOptions(prompt: string, count: number): GeneratedOption[] {
  const topic = sanitizeText(prompt).slice(0, 140);
  return Array.from({ length: count }).map((_, index) => ({
    headline: [
      `A practical playbook for ${topic}`,
      `The mistake teams make with ${topic}`,
      `How to get better outcomes from ${topic}`,
      `A clearer strategy for ${topic}`,
      `What changed our results with ${topic}`,
    ][index % 5],
    body: [
      `Most teams struggle with ${topic} because execution is inconsistent, not because ideas are weak.`,
      `The better approach is to define one clear audience, one pain point, and one concrete action per post.`,
      `When you review response quality weekly and refine hooks + CTA, results become predictable and compounding.`,
      `Use this framework: clarify the problem, show the mechanism, add proof, and end with one clear next step.`,
    ].join("\n\n"),
    cta: "If you want the exact template, comment and I will share it.",
    hashtags: ["#LinkedIn", "#B2B", "#ContentStrategy", "#DemandGen"],
    image_prompt: `Professional LinkedIn visual for ${topic}. Clean composition, modern business style, no text.`,
  }));
}

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const count = clamp(input.count ?? 3, 1, 5);
    const tone = sanitizeText(input.tone || "professional").slice(0, 30);
    const prompt = sanitizeText(input.prompt);

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    let options: GeneratedOption[] = [];
    let fallback = false;
    let fallbackReason: string | null = null;

    try {
      const result = await createStructuredChatCompletion<{ options: GeneratedOption[] }>({
        model,
        system: [
          "You are a LinkedIn ghostwriter.",
          "Return JSON only.",
          "Each option must include headline, body, cta, hashtags, and image_prompt.",
          "Body should be practical and readable with short paragraphs.",
          `Use a ${tone} tone.`,
        ].join(" "),
        user: `Generate ${count} distinct LinkedIn post options for: ${prompt}`,
        schema: {
          name: "generate_options_lite",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              options: {
                type: "array",
                minItems: count,
                maxItems: count,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    headline: { type: "string" },
                    body: { type: "string" },
                    cta: { type: "string" },
                    hashtags: { type: "array", items: { type: "string" } },
                    image_prompt: { type: "string" },
                  },
                  required: ["headline", "body", "cta", "hashtags", "image_prompt"],
                },
              },
            },
            required: ["options"],
          },
        },
        temperature: 0.7,
      });
      options = Array.isArray(result.options) ? result.options : [];
    } catch (error) {
      fallback = true;
      fallbackReason = error instanceof Error ? error.message : "Model generation failed";
    }

    if (options.length < count) {
      fallback = true;
      if (!fallbackReason) fallbackReason = `Model returned ${options.length}/${count} options`;
      options = buildFallbackOptions(prompt, count);
    }

    const normalized = options.slice(0, count).map((option) => ({
      headline: sanitizeText(option.headline).slice(0, 180),
      body: sanitizeText(option.body),
      cta: sanitizeText(option.cta).slice(0, 280),
      hashtags: normalizeHashtags(option.hashtags),
      image_prompt: sanitizeText(option.image_prompt).slice(0, 500),
    }));

    return NextResponse.json({
      options: normalized,
      fallback,
      fallbackReason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
