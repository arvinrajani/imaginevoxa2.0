import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type GenerateRequest = {
  prompt: string;
  wantImage?: boolean;
  approvalRequired?: boolean;
  contentSource?: 'text' | 'pdf' | 'image' | 'video';
};

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
    const actingUserId = user?.id || devUserId;

    if (userError || !actingUserId) {
      return NextResponse.json(
        { error: "Unauthorized. Sign in or set DEV_USER_ID in .env.local." },
        { status: 401 }
      );
    }

    const userId = actingUserId;

    // Handle FormData from frontend
    const formData = await request.formData();
    const prompt = formData.get("prompt") as string;
    const tone = formData.get("tone") as string || "professional";
    const wantImage = formData.get("wantImage") === "true";
    const approvalRequired = formData.get("approvalRequired") === "true";
    const contentSource = formData.get("contentSource") as string || "text";
    const pdfText = formData.get("pdfText") as string || "";
    const imageContext = formData.get("imageContext") as string || "";
    const videoContext = formData.get("videoContext") as string || "";

    if (!prompt || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is too short." },
        { status: 400 }
      );
    }

    const rawWebhookUrl = process.env.N8N_GENERATE_WEBHOOK_URL;
    const apiKey = process.env.N8N_X_API_KEY;
    if (!rawWebhookUrl) {
      return NextResponse.json({ error: "n8n not configured." }, { status: 500 });
    }

    const webhookUrl = rawWebhookUrl;
    console.log("Calling n8n webhook:", webhookUrl, "with tone:", tone, "source:", contentSource);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const hasBinary = Array.from(formData.values()).some((value) => {
      if (typeof value === "string") return false;
      if (typeof File !== "undefined" && value instanceof File) return true;
      if (typeof Blob !== "undefined" && value instanceof Blob) return true;
      return false;
    });

    const n8nFormData = new FormData();
    const n8nJsonPayload: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        n8nJsonPayload[key] = value;
        n8nFormData.append(key, value);
      } else {
        n8nFormData.append(key, value);
      }
    }
    n8nJsonPayload.userId = userId;
    n8nJsonPayload.tone = tone;
    n8nJsonPayload.contentSource = contentSource;
    n8nJsonPayload.wantImage = wantImage;
    n8nJsonPayload.approvalRequired = approvalRequired;

    n8nFormData.set("userId", userId);
    n8nFormData.set("tone", tone);
    n8nFormData.set("contentSource", contentSource);
    n8nFormData.set("wantImage", wantImage ? "true" : "false");
    n8nFormData.set("approvalRequired", approvalRequired ? "true" : "false");

    // Add additional context based on source
    if (contentSource === 'pdf' && pdfText) {
      n8nFormData.set("pdfText", pdfText.substring(0, 5000));
      n8nJsonPayload.pdfText = pdfText.substring(0, 5000);
      const promptText =
        `Create a LinkedIn post based on this PDF document content. Make it engaging and summarize the key points:\n\n${pdfText.substring(0, 3000)}`;
      n8nFormData.set(
        "prompt",
        promptText
      );
      n8nJsonPayload.prompt = promptText;
    } else if (contentSource === 'image' && imageContext) {
      n8nFormData.set("imageContext", imageContext);
      n8nJsonPayload.imageContext = imageContext;
      const promptText =
        `Create a LinkedIn post about personal images/photos. The user describes the images as: "${imageContext}". Write an engaging post that would accompany these personal photos.`;
      n8nFormData.set(
        "prompt",
        promptText
      );
      n8nJsonPayload.prompt = promptText;
    } else if (contentSource === 'video' && videoContext) {
      n8nFormData.set("videoContext", videoContext);
      n8nJsonPayload.videoContext = videoContext;
      const promptText =
        `Create a LinkedIn post about a personal video. The user describes the video as: "${videoContext}". Write an engaging post that would accompany this video.`;
      n8nFormData.set(
        "prompt",
        promptText
      );
      n8nJsonPayload.prompt = promptText;
    }

    if (typeof n8nJsonPayload.prompt !== "string" && typeof prompt === "string") {
      n8nJsonPayload.prompt = prompt;
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: hasBinary
        ? headers
        : {
            ...headers,
            "Content-Type": "application/json",
          },
      body: hasBinary ? n8nFormData : JSON.stringify(n8nJsonPayload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error("n8n error:", errorText);
      const hint =
        n8nResponse.status === 404 && webhookUrl.includes("/webhook-test/")
          ? " Activate the workflow and click Execute Workflow in n8n to enable the test webhook."
          : "";
      return NextResponse.json(
        { error: "n8n error: " + errorText.substring(0, 200) + hint },
        { status: 502 }
      );
    }

    const responseText = await n8nResponse.text();
    if (!responseText.trim()) {
      return NextResponse.json(
        {
          error:
            "n8n returned an empty response. Add a 'Respond to Webhook' node (or set the Webhook node to respond with JSON) and return { post_content }.",
        },
        { status: 502 }
      );
    }

    let generatedData: GenerateResponse;
    try {
      generatedData = JSON.parse(responseText) as GenerateResponse;
    } catch (parseError) {
      console.error("n8n response parse error:", parseError);
      console.error("n8n response body:", responseText.substring(0, 200));
      return NextResponse.json(
        {
          error:
            "n8n returned a non-JSON response. Add a 'Respond to Webhook' node (or set the Webhook node to respond with JSON) and return { post_content }.",
        },
        { status: 502 }
      );
    }

    if (!generatedData.post_content) {
      return NextResponse.json(
        { error: "n8n response missing post_content" },
        { status: 502 }
      );
    }

    const dbClient = user ? supabase : createAdminClient();
    const { data: savedPost, error: saveError } = await dbClient
      .from("posts")
      .insert({
        user_id: userId,
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
      return NextResponse.json(
        { error: "Failed to save post" },
        { status: 500 }
      );
    }

    console.log("Post saved:", savedPost.id);
    return NextResponse.json(savedPost);
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
