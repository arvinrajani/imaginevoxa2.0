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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    // Build the request payload based on content source
    const payload: Record<string, any> = { 
      prompt, 
      tone, 
      wantImage,
      contentSource 
    };

    // Add additional context based on source
    if (contentSource === 'pdf' && pdfText) {
      payload.pdfContent = pdfText.substring(0, 5000); // Limit PDF text
      payload.prompt = `Create a LinkedIn post based on this PDF document content. Make it engaging and summarize the key points:\n\n${pdfText.substring(0, 3000)}`;
    } else if (contentSource === 'image' && imageContext) {
      payload.imageContext = imageContext;
      payload.prompt = `Create a LinkedIn post about personal images/photos. The user describes the images as: "${imageContext}". Write an engaging post that would accompany these personal photos.`;
    } else if (contentSource === 'video' && videoContext) {
      payload.videoContext = videoContext;
      payload.prompt = `Create a LinkedIn post about a personal video. The user describes the video as: "${videoContext}". Write an engaging post that would accompany this video.`;
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
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

    const generatedData = (await n8nResponse.json()) as GenerateResponse;

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
