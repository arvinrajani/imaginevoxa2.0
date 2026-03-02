type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

type ChatOptions = {
  model: string;
  system: string;
  user: string;
  schema: JsonSchema;
  temperature?: number;
};

type ImageGenerationOptions = {
  model: string;
  prompt: string;
  size?: string;
  quality?: "low" | "medium" | "high";
  outputFormat?: "png" | "jpeg" | "webp";
  background?: "transparent" | "opaque";
  outputCompression?: number;
};

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return key;
}

async function openaiRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function createStructuredChatCompletion<T>({
  model,
  system,
  user,
  schema,
  temperature = 0.3,
}: ChatOptions): Promise<T> {
  const payload = {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schema.name,
        strict: schema.strict ?? true,
        schema: schema.schema,
      },
    },
  };

  const response = await openaiRequest<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", payload);

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response missing content.");
  }

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${content}`);
  }
}

// Valid sizes per model
const VALID_SIZES: Record<string, string[]> = {
  "dall-e-3": ["1024x1024", "1024x1792", "1792x1024"],
  "dall-e-2": ["256x256", "512x512", "1024x1024"],
  "gpt-image-1": ["1024x1024", "1024x1536", "1536x1024", "auto"],
  "gpt-image-1.5": ["1024x1024", "1024x1536", "1536x1024", "auto"],
};

function normalizeSize(model: string, requestedSize: string): string {
  const validSizes = VALID_SIZES[model] || VALID_SIZES["gpt-image-1"];
  if (validSizes.includes(requestedSize)) return requestedSize;

  // Map non-standard sizes to closest valid size
  const [w, h] = requestedSize.split("x").map(Number);
  if (!w || !h) return "1024x1024";

  const ratio = w / h;
  if (ratio > 1.3) {
    // Wide/landscape
    return validSizes.includes("1536x1024") ? "1536x1024" : 
           validSizes.includes("1792x1024") ? "1792x1024" : "1024x1024";
  } else if (ratio < 0.77) {
    // Tall/portrait
    return validSizes.includes("1024x1536") ? "1024x1536" :
           validSizes.includes("1024x1792") ? "1024x1792" : "1024x1024";
  }
  return "1024x1024";
}

export async function generateImageBase({
  model,
  prompt,
  size = "1024x1024",
  quality = "high",
  outputFormat = "png",
  background,
}: ImageGenerationOptions): Promise<{ base64: string }> {
  const isGptImage = model.startsWith("gpt-image");
  const isDalle3 = model === "dall-e-3";
  const normalizedSize = normalizeSize(model, size);

  const payload: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: normalizedSize,
  };

  // Quality & format mapping differs per model
  if (isGptImage) {
    // gpt-image-1 does NOT support response_format — it uses output_format
    payload.quality = quality;
    payload.output_format = outputFormat || "png";
    if (background) payload.background = background;
  } else if (isDalle3) {
    // dall-e-3 uses response_format for b64
    payload.response_format = "b64_json";
    payload.quality = quality === "high" ? "hd" : "standard";
    payload.style = "vivid";
  } else {
    // dall-e-2 also uses response_format
    payload.response_format = "b64_json";
    payload.quality = quality === "high" ? "hd" : "standard";
  }

  const response = await openaiRequest<{
    data?: Array<{ b64_json?: string; url?: string }>;
  }>("/images/generations", payload);

  // gpt-image-1 returns b64_json directly; DALL-E models return it via response_format
  const base64 = response.data?.[0]?.b64_json;

  if (!base64) {
    // If we got a URL instead, fetch it and convert to base64
    const url = response.data?.[0]?.url;
    if (url) {
      const imgRes = await fetch(url);
      const buf = await imgRes.arrayBuffer();
      return { base64: Buffer.from(buf).toString("base64") };
    }
    throw new Error("OpenAI image generation did not return base64 output.");
  }

  return { base64 };
}

// ---------------------------------------------------------------------------
// Image editing – pass reference image(s) + prompt to gpt-image-1
// ---------------------------------------------------------------------------

type ImageEditOptions = {
  model: string;
  prompt: string;
  /** PNG image buffers to use as reference inputs (logo, product photo, etc.) */
  images: Array<{ buffer: Buffer; filename?: string }>;
  size?: string;
  quality?: "low" | "medium" | "high";
};

/**
 * Uses the OpenAI /images/edits endpoint (gpt-image-1) to generate a new
 * image that incorporates the supplied reference image(s) into the design
 * according to the prompt.  This is the key to "baking" logos and reference
 * photos into the AI-generated creative rather than overlaying them after.
 */
export async function generateImageEdit({
  model,
  prompt,
  images,
  size = "1536x1024",
  quality = "high",
}: ImageEditOptions): Promise<{ base64: string }> {
  const normalizedSize = normalizeSize(model, size);

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", normalizedSize);
  form.append("quality", quality);
  form.append("n", "1");

  for (const img of images) {
    const blob = new Blob([new Uint8Array(img.buffer)], { type: "image/png" });
    form.append("image[]", blob, img.filename || "image.png");
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: form as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image edit failed: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const base64 = result.data?.[0]?.b64_json;
  if (base64) return { base64 };

  const url = result.data?.[0]?.url;
  if (url) {
    const imgRes = await fetch(url);
    const buf = await imgRes.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64") };
  }

  throw new Error("OpenAI image edit did not return output.");
}

// ---------------------------------------------------------------------------
// Audio / media transcription
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio or video buffer using OpenAI's transcription endpoint.
 *
 * Accepts any media type supported by the API (mp3, wav, mp4, m4a, webm, etc.).
 * Returns the raw text that Whisper/OAI generates. In the future we could run
 * a summarization step on this result, but for now the full transcription is
 * returned so it can be concatenated with any user-provided context.
 */
export async function transcribeMedia(
  buffer: Buffer,
  mimeType: string = "audio/mpeg"
): Promise<string> {
  const url = `${OPENAI_API_BASE}/audio/transcriptions`;

  // `fetch` running on Node >=18 supports FormData/Blob out of the box.
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  form.append("file", blob, "media");
  form.append("model", "whisper-1");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      // NOTE: do NOT set Content-Type explicitly; the form will set it.
    },
    body: form as any, // TS doesn't know about Node's FormData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  return (result as any).text || "";
}
