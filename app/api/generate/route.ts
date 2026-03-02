import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStructuredChatCompletion, generateImageBase, transcribeMedia } from "@/lib/ai/openai";

type GenerateResponse = {
  title?: string;
  post_content: string;
  image_url?: string | null;
};

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

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is too short." },
        { status: 400 }
      );
    }

    // --- Try n8n first if configured, otherwise use direct OpenAI ---
    let generatedData: GenerateResponse | null = null;
    const rawWebhookUrl = process.env.N8N_GENERATE_WEBHOOK_URL;

    if (rawWebhookUrl) {
      try {
        generatedData = await callN8n(rawWebhookUrl, formData, prompt, tone, contentSource, wantImage, approvalRequired, userId, pdfText, imageContext, videoContext);
      } catch (err) {
        console.warn("n8n unavailable, using direct OpenAI:", err);
      }
    }

    // --- Direct OpenAI generation (primary path) ---
    if (!generatedData) {
      generatedData = await generateWithOpenAI(prompt, tone, contentSource, wantImage, pdfText, imageContext, videoContext);
    }

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
  videoContext: string,
): Promise<GenerateResponse> {
  let contentPrompt = prompt;
  if (contentSource === "pdf" && pdfText) {
    contentPrompt = `Create a LinkedIn post based on this PDF document content. Summarize the key points engagingly:\n\n${pdfText.substring(0, 4000)}\n\nUser instructions: ${prompt}`;
  } else if (contentSource === "image" && imageContext) {
    contentPrompt = `Create a LinkedIn post about personal images/photos. The user describes the images as: "${imageContext}". Write an engaging post.\n\nUser instructions: ${prompt}`;
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
    system: `You are a world-class LinkedIn content strategist. Create highly engaging, professional LinkedIn posts.

Rules:
- Write in a ${tone} tone
- Start with a powerful hook that stops the scroll
- Use short paragraphs (1-2 sentences each) for mobile readability
- Include line breaks between paragraphs
- End with a clear call-to-action
- Add 3-5 relevant hashtags
- Posts should be 150-300 words
- Use emojis sparingly (0-3 max)
- Write as a real person, not a brand
- Include a concrete insight, story, or data point
- The title should be brief and compelling (under 60 chars)
- The image_prompt should describe a professional, clean image (NO text, NO logos)`,
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

  const postContent = [
    result.hook,
    "",
    result.body,
    "",
    result.cta,
    "",
    result.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" "),
  ].join("\n");

  let imageUrl: string | null = null;
  if (wantImage && result.image_prompt) {
    try {
      const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
      const { base64 } = await generateImageBase({
        model: imageModel,
        prompt: `Professional LinkedIn post image: ${result.image_prompt}. Clean, modern, high-quality. No text, no logos, no watermarks.`,
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

// ============================================================================
// n8n webhook call (optional, legacy)
// ============================================================================
async function callN8n(
  webhookUrl: string,
  formData: FormData,
  prompt: string,
  tone: string,
  contentSource: string,
  wantImage: boolean,
  approvalRequired: boolean,
  userId: string,
  pdfText: string,
  imageContext: string,
  videoContext: string,
): Promise<GenerateResponse> {
  const apiKey = process.env.N8N_X_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const n8nPayload: Record<string, unknown> = { prompt, userId, tone, contentSource, wantImage, approvalRequired };

  if (contentSource === "pdf" && pdfText) {
    n8nPayload.pdfText = pdfText.substring(0, 5000);
    n8nPayload.prompt = `Create a LinkedIn post based on this PDF:\n\n${pdfText.substring(0, 3000)}`;
  } else if (contentSource === "image" && imageContext) {
    n8nPayload.imageContext = imageContext;
  } else if (contentSource === "video" && videoContext) {
    n8nPayload.videoContext = videoContext;
  }

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(n8nPayload),
  });

  if (!resp.ok) throw new Error(`n8n ${resp.status}`);
  const text = await resp.text();
  if (!text.trim()) throw new Error("Empty n8n response");
  const data = JSON.parse(text) as GenerateResponse;
  if (!data.post_content) throw new Error("Missing post_content");
  return data;
}
