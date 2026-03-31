import { NextResponse } from "next/server";
import { fetchWithTimeout, safeJson } from '@/lib/fetch-timeout';

export const maxDuration = 60;

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStructuredChatCompletion, generateImageBase, transcribeMedia } from "@/lib/ai/openai";

type GenerateResponse = {
  title?: string;
  post_content: string;
  image_url?: string | null;
};

type ResponseContentPart = { type?: string; text?: string };
type ResponseOutputItem = { content?: ResponseContentPart[] };
type OpenAIResponse = { output?: ResponseOutputItem[] };

const OPENAI_API_BASE = "https://api.openai.com/v1";
const MAX_IMAGE_ANALYSIS_FILES = 4;
const MAX_IMAGE_ANALYSIS_FILE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_ANALYSIS_TOTAL_BYTES = 16 * 1024 * 1024;

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return key;
}

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

async function summarizeUploadedImagesForPost(files: File[], imageContext: string) {
  const usableFiles = files
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, MAX_IMAGE_ANALYSIS_FILES);

  if (usableFiles.length === 0) {
    return "";
  }

  let totalBytes = 0;
  const content: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: [
        "Analyze these uploaded images for LinkedIn post creation.",
        "Describe what is visibly happening, key objects or scenes, the likely business or personal context, and the strongest post angle.",
        "Keep the summary factual and concise.",
        "Format the response as plain text with four labels: Visual summary, Key details, Context, Post angle.",
        imageContext.trim() ? `User context: ${imageContext.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];

  for (const file of usableFiles) {
    if (
      file.size > MAX_IMAGE_ANALYSIS_FILE_BYTES ||
      totalBytes + file.size > MAX_IMAGE_ANALYSIS_TOTAL_BYTES
    ) {
      continue;
    }

    totalBytes += file.size;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/png";
    content.push({
      type: "input_image",
      image_url: `data:${mime};base64,${buffer.toString("base64")}`,
    });
  }

  if (content.length === 1) {
    return "";
  }

  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini";
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
          content,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn("[generate] image analysis failed:", response.status, errorText.slice(0, 300));
    return "";
  }

  const json = await safeJson<OpenAIResponse>(response);
  if (!json) return "";
  return extractTextFromResponse(json)?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== "production" && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (userError || !actingUserId) {
      return NextResponse.json(
        { error: "Unauthorized. Sign in to continue." },
        { status: 401 }
      );
    }

    const userId = actingUserId;

    // Handle FormData from frontend
    const formData = await request.formData();
    const prompt = formData.get("prompt") as string;
    const tone = (formData.get("tone") as string) || "professional";
    const wantImage = formData.get("wantImage") === "true";
    const approvalRequired = formData.get("approvalRequired") === "true";
    const contentSource = (formData.get("contentSource") as string) || "text";
    const pdfText = (formData.get("pdfText") as string) || "";
    const imageContext = (formData.get("imageContext") as string) || "";
    const rawBrandId = (formData.get("brandId") as string) || "";
    const brandId = rawBrandId.trim() || null;
    // videoContext will be augmented below if a file is uploaded
    let videoContext = (formData.get("videoContext") as string) || "";
    let imageInsights = "";

    const uploadedImages = Array.from(formData.entries())
      .filter(([key, value]) => key.startsWith("image_") && value instanceof File && value.size > 0)
      .map(([, value]) => value as File);

    // handle optional video file attached by the client
    const maybeVideo = formData.get("video") as File | null;
    if (maybeVideo && maybeVideo.size > 0) {
      try {
        // if the user already supplied a manual description, append the
        // transcribed text so the model sees everything.
        const buf = Buffer.from(await maybeVideo.arrayBuffer());
        const transcription = await transcribeMedia(buf, maybeVideo.type || "video/mp4");
        if (transcription) {
          videoContext = videoContext
            ? `${videoContext}\n\n${transcription}`
            : transcription;
        }
      } catch (e) {
        console.warn("Video transcription failed, continuing without it:", e);
      }
    }

    if (contentSource === "image" && uploadedImages.length > 0) {
      try {
        imageInsights = await summarizeUploadedImagesForPost(uploadedImages, imageContext);
      } catch (error) {
        console.warn("Image analysis failed, continuing with user context only:", error);
      }
    }

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is too short." },
        { status: 400 }
      );
    }
    if (prompt.length > 10000) {
      return NextResponse.json(
        { error: "Prompt must be under 10,000 characters." },
        { status: 400 }
      );
    }
    if (pdfText.length > 100000) {
      return NextResponse.json(
        { error: "PDF text must be under 100,000 characters." },
        { status: 400 }
      );
    }

    // --- Direct OpenAI generation ---
    const generatedData = await generateWithOpenAI(
      prompt,
      tone,
      contentSource,
      wantImage,
      pdfText,
      imageContext,
      imageInsights,
      videoContext
    );

    if (!generatedData?.post_content) {
      return NextResponse.json({ error: "Failed to generate post content" }, { status: 500 });
    }

    // Save to database
    const dbClient = user ? supabase : createAdminClient();
    let savedPost: Record<string, unknown> | null = null;
    try {
      const { data, error: saveError } = await dbClient
        .from("posts")
        .insert({
          user_id: userId,
          brand_id: brandId,
          prompt: prompt,
          title: generatedData.title || "Generated Post",
          post_content: generatedData.post_content,
          image_url: generatedData.image_url || null,
          status: approvalRequired ? "pending_approval" : "draft",
        })
        .select("*")
        .single();

      if (saveError) {
        console.error("Save error:", saveError);
      } else {
        savedPost = data;
      }
    } catch (dbErr) {
      console.error("Database error (non-critical):", dbErr);
    }

    // Return generated content even if DB save fails
    if (savedPost) {
      return NextResponse.json(savedPost);
    }

    return NextResponse.json({
      id: `temp-${Date.now()}`,
      post_content: generatedData.post_content,
      title: generatedData.title || "Generated Post",
      image_url: generatedData.image_url || null,
      status: "draft",
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// Direct OpenAI generation
// ============================================================================
async function generateWithOpenAI(
  prompt: string,
  tone: string,
  contentSource: string,
  wantImage: boolean,
  pdfText: string,
  imageContext: string,
  imageInsights: string,
  videoContext: string,
): Promise<GenerateResponse> {
  let contentPrompt = prompt;
  if (contentSource === "pdf" && pdfText) {
    const pdfExcerpt = pdfText.substring(0, 5000);
    contentPrompt = `Parsed PDF text (primary source of truth):
${pdfExcerpt}

User instructions:
${prompt}

Write the post grounded in the parsed PDF text. If anything is unclear, prefer conservative wording instead of inventing claims.`;
  } else if (contentSource === "image" && (imageContext || imageInsights)) {
    const imageContextParts = [
      imageContext
        ? `User-provided context about the uploaded images:\n${imageContext}`
        : null,
      imageInsights
        ? `Visual analysis from the uploaded images:\n${imageInsights}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    contentPrompt = `Create a LinkedIn post about uploaded personal images/photos. Use the visual analysis as the factual grounding and blend in the user context when present.\n\n${imageContextParts}\n\nUser instructions: ${prompt}`;
  } else if (contentSource === "video" && videoContext) {
    contentPrompt = `Create a LinkedIn post about a personal video. The user describes the video as: "${videoContext}". Write an engaging post.\n\nUser instructions: ${prompt}`;
  }

  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o";

  const result = await createStructuredChatCompletion<{
    title: string;
    hook: string;
    body: string;
    cta: string;
    hashtags: string[];
    image_prompt: string;
  }>({
    model,
    system: `You are a top-tier LinkedIn ghostwriter and creative director who has helped executives, founders, and thought leaders build massive audiences. You write posts that feel authentically human — never robotic, never generic.

Your mission: Create a high-performing LinkedIn post that earns real engagement (comments, shares, saves) and a production-ready image brief.

WRITING PRINCIPLES:
- Write in a ${tone} tone that feels like a real person sharing genuine insight
- Open with a hook that creates curiosity, challenges a belief, or stakes a bold position — the first 2 lines determine if anyone reads the rest
- Use short, punchy paragraphs (1-3 sentences max) optimized for mobile scrolling
- Include blank lines between every thought block for visual breathing room
- Build toward a clear, specific call-to-action — not "What do you think?" but something that invites meaningful response
- Include 3-5 relevant hashtags (mix of broad reach + niche targeting)
- Target 150-300 words — long enough to deliver value, short enough to hold attention
- Use 2-6 emojis as visual anchors, not decoration — each emoji should mark a key point or transition
- Write as a knowledgeable human sharing hard-won experience, not as a brand broadcasting
- Every post needs at least one concrete element: a specific number, a real example, a named framework, or a personal story beat
- The title should be brief and compelling (under 60 chars)

FORMATTING RULES:
- NEVER use markdown bullets (*) or bold markers (**)
- Lists should use emoji prefixes (✅, → , 📌) not dashes or bullets
- Keep text completely plain — LinkedIn doesn't render markdown

AVOID THESE CLICHÉS:
- "I'm excited to announce...", "Delighted to share...", "Thrilled to..."
- "In today's fast-paced world...", "It goes without saying..."
- "Game-changer", "Paradigm shift", "Synergy", "Leverage"

IMAGE PROMPT RULES:
- The image_prompt must be detailed and production-ready: [subject] + [scene/environment] + [composition] + [lighting] + [style] + [mood] + [color palette]
- The image should visually reinforce the post's core message
- Must explicitly avoid: text, logos, watermarks, UI, charts, letterforms, human hands`,
    user: contentPrompt,
    schema: {
      name: "linkedin_post",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          hook: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          image_prompt: { type: "string" },
        },
        required: ["title", "hook", "body", "cta", "hashtags", "image_prompt"],
      },
    },
    temperature: 0.7,
  });

  const cleanedHook = cleanPostSection(result.hook);
  const cleanedBody = cleanPostBody(result.body);
  const cleanedCta = cleanPostSection(result.cta);
  const hookLine = hasEmoji(cleanedHook) ? cleanedHook : `✨ ${cleanedHook}`;
  const ctaLine = hasEmoji(cleanedCta) ? cleanedCta : `💬 ${cleanedCta}`;
  const hashtagLine = result.hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ")
    .trim();

  const postContent = [
    hookLine,
    "",
    cleanedBody,
    "",
    ctaLine,
    ...(hashtagLine ? ["", hashtagLine] : []),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  let imageUrl: string | null = null;
  if (wantImage && result.image_prompt) {
    try {
      const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
      const imageBrief = cleanPostSection(result.image_prompt);
      const { base64 } = await generateImageBase({
        model: imageModel,
        prompt: `You are an elite visual designer creating a scroll-stopping LinkedIn image.

QUALITY STANDARD: Magazine-cover quality. Think Bloomberg Businessweek meets Apple keynote — every element intentional, every detail sharp.

TECHNICAL REQUIREMENTS:
- Ultra-sharp rendering with crisp edges and detailed textures
- Professional lighting with directional key light and subtle fill
- Clear visual hierarchy with one dominant focal element
- Modern design sensibility (2024-2026 aesthetic)
- Color harmony that feels deliberate and brand-worthy

ABSOLUTE PROHIBITIONS: No text, no letters, no numbers, no logos, no watermarks, no UI screenshots, no clip-art, no blurry elements, no cheesy stock photo compositions, no human hands.

CREATIVE BRIEF: ${imageBrief}`,
        size: "1536x1024",
        quality: "high",
        outputFormat: "png",
      });
      imageUrl = `data:image/png;base64,${base64}`;
    } catch (imgError) {
      console.error("Image generation failed (non-critical):", imgError);
    }
  }

  return { title: result.title, post_content: postContent, image_url: imageUrl };
}

const EMOJI_REGEX = /[\uD83C-\uDBFF\uDC00-\uDFFF]/;

function hasEmoji(value: string): boolean {
  return EMOJI_REGEX.test(value);
}

function cleanPostSection(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "👉 ")
    .replace(/\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanPostBody(value: string): string {
  const cleaned = cleanPostSection(value);
  return cleaned
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

