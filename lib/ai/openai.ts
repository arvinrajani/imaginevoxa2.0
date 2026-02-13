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
