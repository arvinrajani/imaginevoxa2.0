import { NextResponse } from "next/server";
import { fetchWithTimeout, safeJson } from '@/lib/fetch-timeout';

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  imageUrl: z.string().url(),
});

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return key;
}

type ResponseContentPart = { type?: string; text?: string };
type ResponseOutputItem = { content?: ResponseContentPart[] };
type OpenAIResponse = { output?: ResponseOutputItem[] };

function extractTextFromResponse(response: OpenAIResponse) {
  const output = response.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const part of content) {
      if (part.type === "output_text" && part.text) {
        return part.text;
      }
    }
  }
  return null;
}

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

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    const response = await fetchWithTimeout(`${OPENAI_API_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Analyze the visual style of this reference image.",
                  "Return JSON with: style_summary (short sentence), palette (array of 3-5 hex colors).",
                  "Focus on lighting, mood, texture, and overall tone.",
                ].join(" "),
              },
              { type: "input_image", image_url: input.imageUrl },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `OpenAI style analysis failed: ${errorText}` }, { status: 500 });
    }

    const json = await safeJson<OpenAIResponse>(response);
    if (!json) {
      return NextResponse.json({ error: "Failed to parse OpenAI response" }, { status: 502 });
    }
    const text = extractTextFromResponse(json);
    if (!text) {
      return NextResponse.json({ error: "Style analysis returned no text" }, { status: 502 });
    }

    let parsed: { style_summary?: string; palette?: string[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { style_summary: text, palette: [] };
    }

    return NextResponse.json({
      style_summary: parsed.style_summary || text,
      palette: Array.isArray(parsed.palette) ? parsed.palette : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}