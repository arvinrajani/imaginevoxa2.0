type BrandKit = {
  brand_name?: string | null;
  primary_colors?: string[] | null;
  secondary_colors?: string[] | null;
  accent_colors?: string[] | null;
  font_personality?: string | null;
  tone_guidelines?: string[] | null;
  allowed_image_styles?: string[] | null;
};

type MoodBoard = {
  name?: string | null;
  palette_colors?: string[] | null;
  typography_mood?: string | null;
  image_density?: string | null;
  composition_style?: string | null;
  emotional_tone?: string | null;
};

type ImageProfile = {
  name?: string | null;
  category?: string | null;
  description?: string | null;
};

function isHiringCreative(topic: string) {
  return /\b(hiring|hire|internship|intern|open position|job opening|recruitment)\b/i.test(topic);
}

export function buildBaseImagePrompt(params: {
  userPrompt: string;
  brandKit?: BrandKit | null;
  moodBoard?: MoodBoard | null;
  imageProfile?: ImageProfile | null;
}) {
  const { userPrompt, brandKit, moodBoard, imageProfile } = params;
  const hiringCreative = isHiringCreative(userPrompt);

  const palette = [
    ...(brandKit?.primary_colors || []),
    ...(brandKit?.secondary_colors || []),
    ...(brandKit?.accent_colors || []),
    ...(moodBoard?.palette_colors || []),
  ].filter(Boolean);

  const styleNotes = [
    moodBoard?.composition_style,
    moodBoard?.image_density ? `${moodBoard.image_density} visual density` : null,
    moodBoard?.emotional_tone ? `${moodBoard.emotional_tone} mood` : null,
    brandKit?.allowed_image_styles?.join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = [
    `You are an elite brand creative director for LinkedIn growth campaigns.`,
    `Generate one production-ready visual concept with clear art direction and strong feed impact.`,
    ``,
    `TOPIC: "${userPrompt}"`,
    imageProfile?.name ? `Style profile: ${imageProfile.name}.` : null,
    imageProfile?.category ? `Category: ${imageProfile.category}.` : null,
    ``,
    `CREATIVE BRIEF:`,
    `- Output must feel premium, modern, and marketing-team quality.`,
    hiringCreative
      ? `- Build a recruitment campaign visual with strong hierarchy: hero focal point + supporting detail zones + CTA-ready space.`
      : `- Build a thematic visual with one clear focal subject that communicates the core message instantly.`,
    hiringCreative
      ? `- Keep composition clean and conversion-oriented for hiring campaigns.`
      : `- Use cinematic photography, premium 3D, or refined conceptual illustration (pick one coherent style).`,
    `- Compose for LinkedIn landscape placement and mobile readability.`,
    `- Use deliberate lighting, depth, and visual hierarchy to direct attention.`,
    `- Make it emotionally relevant to the topic while staying professional.`,
    styleNotes ? `Style preferences: ${styleNotes}.` : null,
    palette.length
      ? `Brand color direction: ${palette.join(", ")}. Use these as dominant palette anchors.`
      : null,
    brandKit?.font_personality ? `Typography mood reference: ${brandKit.font_personality}.` : null,
    ``,
    `IMAGE QUALITY STANDARD:`,
    `- Ultra-clean edges, realistic depth, high detail, no visual noise`,
    `- Balanced spacing and polished composition`,
    `- Strong contrast and color harmony`,
    `- Professional final look suitable for executive audiences`,
    ``,
    `HARD CONSTRAINTS:`,
    `- No logos, no watermarks, no UI screenshots`,
    `- No gibberish text, broken letters, unreadable typography, or random symbols`,
    `- No generic stock cliches (handshake, random boardroom poses, light bulb trope)`,
    `- No blurry output, compression artifacts, or cluttered layout`,
    hiringCreative
      ? `- If text-like blocks appear, keep them minimal and visually clean without dense copy`
      : `- Avoid text-heavy overlays; visuals should carry the message primarily through imagery`,
  ]
    .filter(Boolean)
    .join("\n");

  const negativePrompt = [
    "blurry",
    "low quality",
    "watermark",
    "clip art",
    "cartoon",
    "amateur",
    "unreadable text",
    "gibberish letters",
    "noisy background",
    "messy layout",
    hiringCreative ? "garbled text" : "text-heavy clutter",
  ].filter(Boolean) as string[];

  return { prompt, negativePrompt, palette, styleNotes, hiringCreative };
}

export function buildPostContent(parts: {
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string[];
}) {
  const sections = [
    parts.hook?.trim(),
    parts.body?.trim(),
    parts.cta?.trim(),
    parts.hashtags?.length ? parts.hashtags.join(" ") : null,
  ].filter(Boolean);
  return sections.join("\n\n");
}
