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
    `You are an award-winning creative director. Create a high-performing image for a LinkedIn post.`,
    ``,
    `TOPIC: "${userPrompt}"`,
    imageProfile?.name ? `Image style: ${imageProfile.name}.` : null,
    imageProfile?.category ? `Category: ${imageProfile.category}.` : null,
    ``,
    `CREATIVE DIRECTION:`,
    `- This should look like polished work from a serious marketing team.`,
    hiringCreative
      ? `- Use a LinkedIn campaign-poster composition with clear hierarchy and clean typography blocks.`
      : `- Create a compelling thematic visual that tells a story and evokes emotion related to the topic.`,
    hiringCreative
      ? `- Include a strong headline area, role/detail section, and CTA zone for a recruitment style creative.`
      : `- Use one of these approaches: professional photography, high-end 3D illustration, or conceptual art.`,
    `- Strong composition with clear focal hierarchy and feed-stopping presence.`,
    `- Premium color grading and modern visual polish.`,
    `- Optimized for LinkedIn feed impact.`,
    styleNotes ? `Style preferences: ${styleNotes}.` : null,
    palette.length
      ? `Brand color palette: ${palette.join(", ")}. Use these in background, accents, and UI-like blocks.`
      : null,
    brandKit?.font_personality ? `Typography mood: ${brandKit.font_personality}.` : null,
    ``,
    `TECHNICAL QUALITY:`,
    `- Ultra-sharp and production-grade quality`,
    `- Clean edges, balanced spacing, and visual consistency`,
    `- Realistic depth, lighting, and texture`,
    `- Landscape orientation for LinkedIn (1200x628 or similar ratio)`,
    ``,
    `ABSOLUTELY AVOID:`,
    `- Generic abstract blobs and random gradients`,
    `- Stock cliches (handshake, light bulb, generic office poses)`,
    `- Blurry output, noisy details, or low-resolution artifacts`,
    hiringCreative
      ? `- Garbled or unreadable text, placeholder copy, broken typography`
      : `- Excessive text overlays or cluttered composition`,
    `- Overly busy layout with weak hierarchy`,
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
