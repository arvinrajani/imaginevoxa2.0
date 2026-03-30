export type VoxaFormat = "landscape" | "portrait" | "square";

export type VoxaSupportedThemeId =
  | "alliance-poster"
  | "industrial-campaign"
  | "brand-story"
  | "clean-brand"
  | "launch-banner"
  | "datasheet-frame";

type VoxaBenefitsMode = "required" | "optional" | "none";
type VoxaFooterMode = "required" | "optional" | "minimal";

export type VoxaPromptInput = {
  themeId: string;
  format: VoxaFormat;
  aiOwnsFullPoster?: boolean;
  hasStructuredBranding?: boolean;
  brandColors?: string[];
  brandName?: string;
  productName?: string;
  headline?: string;
  tagline?: string;
  benefits?: string[];
  contextBrief?: string;
  customPrompt?: string;
  sceneBrief?: string;
  industry?: string | null;
  website?: string;
  email?: string;
  partnerName?: string;
  partnerTagline?: string;
  hasPrimaryLogo?: boolean;
  secondaryLogoCount?: number;
  hasReferenceImage?: boolean;
  referenceSummary?: string;
};

export type VoxaPreflightResult = {
  supported: boolean;
  themeId: string;
  themeLabel: string;
  score: number;
  passed: boolean;
  errors: string[];
  warnings: string[];
  headlineWordCount: number;
  taglineWordCount: number;
  benefitCount: number;
  maxHeadlineWords: number;
  maxTaglineWords: number;
};

export type VoxaPromptPackage = {
  supported: boolean;
  themeGuide: { label: string; direction: string } | null;
  positivePrompt: string;
  negativePrompt: string;
  qualityGate: string;
  preflight: VoxaPreflightResult;
};

type VoxaThemeDefinition = {
  id: VoxaSupportedThemeId;
  displayName: string;
  canonicalName: string;
  summary: string;
  composition: string;
  background: string;
  header: string;
  hero: string;
  footer: string;
  style: string;
  overlay: string;
  benefitsMode: VoxaBenefitsMode;
  footerMode: VoxaFooterMode;
  negative: string;
};

type VoxaFormatRule = {
  dimensions: string;
  layout: string;
  headlineMaxWords: number;
  taglineMaxWords: number;
};

const UNIVERSAL_NEGATIVE_PROMPT = [
  "duplicate text",
  "same text appearing twice",
  "text overlapping product image",
  "text crossing into product zone",
  "footer covering product",
  "header overlapping content",
  "low contrast text",
  "unreadable text",
  "multiple headlines",
  "echo text effect",
  "ghost text",
  "misaligned elements",
  "floating elements",
  "no grid alignment",
  "clipart style",
  "amateur design",
  "pixelated images",
  "blurry product",
  "generation artifacts",
  "decorative fonts",
  "all-caps body text",
  "centered bullet points",
  "busy background competing with foreground",
  "background elements over 20% opacity",
  "competing focal points",
  "crowded layout",
  "no breathing room",
  "elements touching edges",
  "off-brand colors",
  "wrong logo colors",
  "sticker logo",
  "pasted logo overlay",
  "floating brand mark",
  "random corner badge",
  "corner watermark logo",
  "generic frosted white logo card",
].join(", ");

const FORMAT_RULES: Record<VoxaFormat, VoxaFormatRule> = {
  landscape: {
    dimensions: "1536x1024",
    layout:
      "Landscape uses a 12-column grid with a 40% hero zone on the left, 60% content zone on the right, a top header band, and a bottom footer band.",
    headlineMaxWords: 8,
    taglineMaxWords: 10,
  },
  portrait: {
    dimensions: "1024x1536",
    layout:
      "Portrait stacks the composition vertically: header, headline zone, hero zone, benefits zone, and footer. Maintain strong F-pattern readability.",
    headlineMaxWords: 6,
    taglineMaxWords: 8,
  },
  square: {
    dimensions: "1024x1024",
    layout:
      "Square uses a balanced stack or side-by-side composition with a top header, a concise headline block, a hero plus benefits zone, and a disciplined footer.",
    headlineMaxWords: 5,
    taglineMaxWords: 6,
  },
};

const INDUSTRY_ATMOSPHERES: Record<string, string> = {
  energy:
    "Power transmission towers, electrical grid patterns, substation silhouettes, and controlled energy-line accents at 5-15% opacity only.",
  tech:
    "Server infrastructure, data-flow lines, network topology, and subtle circuit traces at 5-15% opacity only.",
  manufacturing:
    "Factory silhouettes, mechanical gear outlines, engineered metal texture, and assembly-line depth at 5-15% opacity only.",
  healthcare:
    "Clean geometric patterns, molecular hints, soft waveform lines, and clinical structure at 5-15% opacity only.",
  construction:
    "Building silhouettes, crane outlines, blueprint grids, and structural-beam patterns at 5-15% opacity only.",
};

const THEME_DEFINITIONS: Record<VoxaSupportedThemeId, VoxaThemeDefinition> = {
  "alliance-poster": {
    id: "alliance-poster",
    displayName: "Alliance Poster",
    canonicalName: "alliance_poster",
    summary:
      "Structured brand-plus-product poster with a disciplined header, protected hero bay, readable proof lane, and enterprise-grade finish.",
    composition:
      "Use a 40/60 split layout with one focal point, protected safe zones, minimum 4% edge margins, and clean Z-pattern flow from logo to headline to hero to benefits to footer.",
    background:
      "Use a professional dark brand gradient with subtle industry atmosphere. The right-side text lane must stay calmer and darker than the hero side.",
    header:
      "Use a disciplined co-branded header fascia with the primary logo integrated on the left, the campaign headline centered or left-anchored in the content lane, and optional partner branding integrated on the right. The lockups must feel built into the band, not pasted on top.",
    hero:
      "Keep the product hero inside the left 40% with studio lighting, a soft shadow, clear separation from the background, and no text inside the protected hero zone.",
    footer:
      "Use a separate footer band with industry icons and contact information. It must never overlap the hero or benefits lane.",
    style:
      "Fortune 500 industrial campaign quality. Reference the polish of Siemens, ABB, Schneider Electric, and Honeywell product marketing.",
    overlay:
      "Use a dark brand-matched gradient shield when readability needs help. Match the overlay to the palette instead of defaulting to generic black.",
    benefitsMode: "required",
    footerMode: "required",
    negative:
      "informal layout, asymmetric chaos, missing footer icons, playful ad styling, pasted sticker logos, floating brand badges, generic frosted logo cards",
  },
  "industrial-campaign": {
    id: "industrial-campaign",
    displayName: "Industrial Campaign",
    canonicalName: "industrial_campaign",
    summary:
      "High-impact industrial advertisement with dramatic lighting, infrastructure scale, and power-oriented visual rhythm.",
    composition:
      "Use a dynamic industrial composition with one commanding hero, bold hierarchy, and a disciplined information lane. Maintain breathing room and a clear single focal point.",
    background:
      "Use a deep industrial gradient with real environmental context, infrastructure depth, and only restrained energy accents.",
    header:
      "Use a clear top brand band that feels engineered and structural. Brand elements should feel integrated into a beam, fascia, plated strip, or glass rail rather than decorative overlays.",
    hero:
      "Treat the hero as premium industrial equipment or infrastructure in context. Use dramatic key lighting, edge light, and strong subject separation.",
    footer:
      "Use a darker industrial footer with heavier application icons and exact contact details if they fit cleanly.",
    style:
      "Reference Caterpillar, Komatsu, GE industrial systems, and premium electrification campaign art.",
    overlay:
      "Favor directional brand-tinted overlays that protect the copy lane without flattening industrial depth or metallic contrast.",
    benefitsMode: "required",
    footerMode: "required",
    negative:
      "soft imagery, gentle aesthetics, weak typography, polite brochure energy, pasted sticker logos, floating brand marks, generic frosted logo cards",
  },
  "brand-story": {
    id: "brand-story",
    displayName: "Brand Story",
    canonicalName: "brand_story",
    summary:
      "Warm editorial narrative visual focused on story, leadership, company values, or premium brand heritage.",
    composition:
      "Use a cinematic editorial structure with a human or story-led focal point, premium whitespace, and calm narrative hierarchy.",
    background:
      "Use warm professional tones or elegant abstract brand patterns at very low opacity. Keep the atmosphere inviting and premium.",
    header:
      "Use restrained brand placement. The logo should feel tasteful and editorial, never loud or sticker-like.",
    hero:
      "Use a portrait, team scene, or abstract brand image that feels warm, trustworthy, and magazine-quality.",
    footer:
      "Use a minimal footer or a single elegant website lockup only when it improves the composition.",
    style:
      "Reference company annual reports, editorial brand stories, and premium founder-profile visuals.",
    overlay:
      "Use a light warm overlay only if needed to preserve narrative readability. Avoid heavy industrial contrast treatment.",
    benefitsMode: "optional",
    footerMode: "minimal",
    negative: "harsh industrial feel, cold colors, impersonal layout, overly technical styling",
  },
  "clean-brand": {
    id: "clean-brand",
    displayName: "Minimal / Clean",
    canonicalName: "minimal_clean",
    summary:
      "Typography-first premium brand layout with maximum whitespace, restrained chrome, and one strong focal element.",
    composition:
      "Use maximum whitespace, a single focal anchor, and no more than three meaningful design elements in the final hierarchy.",
    background:
      "Use a solid or near-solid clean background with no patterns, no atmosphere layer, and no unnecessary visual noise.",
    header:
      "Keep the brand mark small and refined. Any header treatment should feel almost invisible.",
    hero:
      "If a product appears, it must be clean, centered or elegantly offset, and surrounded by strong negative space.",
    footer:
      "Avoid a heavy footer band. Any supporting info should sit quietly in a corner if used at all.",
    style:
      "Reference Apple product marketing, Braun restraint, and premium editorial minimalism.",
    overlay:
      "Use the lightest possible overlay or none. Let the natural negative space do the work.",
    benefitsMode: "none",
    footerMode: "minimal",
    negative: "clutter, multiple competing elements, decorative patterns, heavy textures, busy gradients",
  },
  "launch-banner": {
    id: "launch-banner",
    displayName: "Bold Announcement",
    canonicalName: "bold_announcement",
    summary:
      "Bold high-contrast announcement visual where typography is the hero and the supporting image never steals the headline's job.",
    composition:
      "Use maximum impact hierarchy with one dominant headline, a supporting cue only, and disciplined announcement energy.",
    background:
      "Use saturated brand colors, dynamic geometric motion, or a bold gradient sweep. Avoid muted or hesitant color decisions.",
    header:
      "Keep branding intentional but secondary to the announcement headline. Use clear separation from the main message.",
    hero:
      "If a product is present, it supports the headline rather than competing with it. Keep the visual treatment confident and simplified.",
    footer:
      "Use a minimal footer or restrained CTA cue only if it remains clean and readable.",
    style:
      "Reference keynote launch art, premium event posters, and bold product reveal campaigns.",
    overlay:
      "Use a high-contrast brand overlay only when needed to protect the main headline. Preserve launch energy and saturation.",
    benefitsMode: "none",
    footerMode: "optional",
    negative: "subtle colors, muted tones, small typography, understated hierarchy",
  },
  "datasheet-frame": {
    id: "datasheet-frame",
    displayName: "Technical / Data",
    canonicalName: "technical_data",
    summary:
      "Technical specification layout with structured product presentation, modular information zones, and engineering-grade clarity.",
    composition:
      "Use disciplined information hierarchy, modular blocks, and exact alignment. The visual should feel like a modern technical sell-sheet for LinkedIn.",
    background:
      "Use a clean, non-distracting technical surface with optional grid hints or blueprint cues at very low opacity.",
    header:
      "Use a technical header with product name, model, or series designation and precise alignment.",
    hero:
      "Keep the product or diagram crisp, technical, and clearly separated from the information grid. Avoid dramatic decorative staging.",
    footer:
      "Use a slim disciplined footer only when contact or supporting data remains legible and relevant.",
    style:
      "Reference engineering brochures, industrial spec sheets, technical sell sheets, and enterprise product catalogs.",
    overlay:
      "Prefer light technical overlays or subtle contrast correction. Avoid cinematic mood treatment.",
    benefitsMode: "required",
    footerMode: "optional",
    negative: "decorative elements, artistic interpretation, vague data, promotional hype energy",
  },
};

function sanitizeLine(value: string | null | undefined, maxLength = 180) {
  if (!value) return "";

  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function countWords(value: string | null | undefined) {
  const safe = sanitizeLine(value, 240);
  return safe ? safe.split(/\s+/).length : 0;
}

function dedupeList(values: string[] | undefined, max: number) {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const picked: string[] = [];

  for (const raw of values) {
    const safe = sanitizeLine(raw, 140);
    const key = safe.toLowerCase();
    if (!safe || seen.has(key)) continue;
    seen.add(key);
    picked.push(safe);
    if (picked.length >= max) break;
  }

  return picked;
}

function deriveColorSystem(colors: string[] | undefined) {
  const palette = dedupeList(colors, 4);
  const primary = palette[0] || "#0a1628";
  const secondary = palette[1] || "#1a365d";
  const accent = palette[2] || palette[1] || "#00d4aa";
  const support = palette[3] || accent;

  return {
    palette,
    primary,
    secondary,
    accent,
    support,
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 55%, ${accent} 100%)`,
  };
}

function resolveIndustryAtmosphere(industry: string | null | undefined) {
  const safe = sanitizeLine(industry, 64).toLowerCase();
  if (!safe) return INDUSTRY_ATMOSPHERES.energy;

  if (/(energy|power|utility|electr|grid|substation)/.test(safe)) {
    return INDUSTRY_ATMOSPHERES.energy;
  }
  if (/(tech|software|data|digital|cloud|ai|saas|server)/.test(safe)) {
    return INDUSTRY_ATMOSPHERES.tech;
  }
  if (/(manufact|factory|industrial|automation|machin)/.test(safe)) {
    return INDUSTRY_ATMOSPHERES.manufacturing;
  }
  if (/(health|medical|hospital|clinic|pharma)/.test(safe)) {
    return INDUSTRY_ATMOSPHERES.healthcare;
  }
  if (/(construct|infra|building|civil|real estate|contractor)/.test(safe)) {
    return INDUSTRY_ATMOSPHERES.construction;
  }

  return INDUSTRY_ATMOSPHERES.energy;
}

export function isVoxaSupportedTheme(themeId: string): themeId is VoxaSupportedThemeId {
  return themeId in THEME_DEFINITIONS;
}

export function getVoxaThemeDefinition(themeId: string) {
  if (!isVoxaSupportedTheme(themeId)) {
    return null;
  }

  return THEME_DEFINITIONS[themeId];
}

export function buildVoxaPreflight(input: VoxaPromptInput): VoxaPreflightResult {
  const theme = getVoxaThemeDefinition(input.themeId);
  const format = FORMAT_RULES[input.format];
  const benefits = dedupeList(input.benefits, 6);
  const headline = sanitizeLine(input.headline, 140);
  const tagline = sanitizeLine(input.tagline, 160);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!theme) {
    return {
      supported: false,
      themeId: input.themeId,
      themeLabel: "Unsupported",
      score: 25,
      passed: true,
      errors,
      warnings,
      headlineWordCount: countWords(headline),
      taglineWordCount: countWords(tagline),
      benefitCount: benefits.length,
      maxHeadlineWords: format.headlineMaxWords,
      maxTaglineWords: format.taglineMaxWords,
    };
  }

  const headlineWordCount = countWords(headline);
  const taglineWordCount = countWords(tagline);

  if (!headline && !sanitizeLine(input.contextBrief, 120) && !sanitizeLine(input.customPrompt, 120)) {
    errors.push("A headline, vision brief, or context brief is required for VOXA themes.");
  }

  if (headlineWordCount > format.headlineMaxWords) {
    warnings.push(
      `Headline is ${headlineWordCount} words. ${theme.displayName} in ${input.format} format works best at ${format.headlineMaxWords} words or fewer.`
    );
  } else if (headlineWordCount > 0 && headlineWordCount < 3) {
    warnings.push("Headline is very short. VOXA works best when the headline carries a clear message in 3 or more words.");
  }

  if (taglineWordCount > format.taglineMaxWords) {
    warnings.push(
      `Tagline is ${taglineWordCount} words. ${input.format} format works best at ${format.taglineMaxWords} words or fewer.`
    );
  }

  if (theme.benefitsMode === "required") {
    if (benefits.length === 0) {
      warnings.push(`${theme.displayName} works best with 3 to 6 proof bullets or feature lines.`);
    } else if (benefits.length < 3) {
      warnings.push(`${theme.displayName} looks stronger with at least 3 concise proof bullets.`);
    }
  }

  if (benefits.length > 6) {
    warnings.push("Only the strongest 6 benefit lines should be used. Extra lines should be removed or merged.");
  }

  if (!input.brandColors || input.brandColors.length === 0) {
    warnings.push("No explicit brand palette was provided. VOXA can run, but the result is stronger with locked brand colors.");
  }

  if (!input.hasPrimaryLogo && !sanitizeLine(input.brandName, 80)) {
    warnings.push("No primary logo or brand-name lockup is available. Brand fidelity may rely on typography alone.");
  }

  if (
    theme.footerMode === "required" &&
    !sanitizeLine(input.website, 64) &&
    !sanitizeLine(input.email, 64)
  ) {
    warnings.push(`${theme.displayName} normally benefits from a footer website or email lockup.`);
  }

  if (
    (theme.id === "alliance-poster" ||
      theme.id === "industrial-campaign" ||
      theme.id === "datasheet-frame") &&
    !sanitizeLine(input.productName, 80) &&
    !input.hasReferenceImage &&
    !sanitizeLine(input.referenceSummary, 120)
  ) {
    warnings.push(`${theme.displayName} is strongest when a product or reference visual is provided as the hero anchor.`);
  }

  let compositionQuality = 5;
  if (!headline && !sanitizeLine(input.contextBrief, 120)) compositionQuality -= 3;
  if (!input.hasReferenceImage && !sanitizeLine(input.productName, 80) && theme.benefitsMode === "required") {
    compositionQuality -= 1;
  }

  let typographyQuality = 5;
  if (headlineWordCount > format.headlineMaxWords) typographyQuality -= 2;
  if (headlineWordCount > 0 && headlineWordCount < 3) typographyQuality -= 1;
  if (taglineWordCount > format.taglineMaxWords) typographyQuality -= 1;
  if (theme.benefitsMode === "required" && benefits.length > 0 && benefits.length < 3) typographyQuality -= 1;

  let brandAlignment = 5;
  if (!input.brandColors || input.brandColors.length === 0) brandAlignment -= 2;
  if (!input.hasPrimaryLogo) brandAlignment -= 1;
  if (input.secondaryLogoCount && input.secondaryLogoCount > 3) brandAlignment -= 1;

  let professionalFinish = 5;
  if (!sanitizeLine(input.sceneBrief, 120) && !sanitizeLine(input.contextBrief, 120)) professionalFinish -= 1;
  if (theme.footerMode === "required" && !sanitizeLine(input.website, 64) && !sanitizeLine(input.email, 64)) {
    professionalFinish -= 1;
  }
  if (theme.benefitsMode === "required" && benefits.length === 0) professionalFinish -= 2;

  let technicalExecution = 5;
  if (!format.dimensions) technicalExecution -= 3;
  if (input.hasStructuredBranding && !input.hasPrimaryLogo && !sanitizeLine(input.brandName, 80)) technicalExecution -= 1;

  compositionQuality = Math.max(1, compositionQuality);
  typographyQuality = Math.max(1, typographyQuality);
  brandAlignment = Math.max(1, brandAlignment);
  professionalFinish = Math.max(1, professionalFinish);
  technicalExecution = Math.max(1, technicalExecution);

  const score =
    compositionQuality +
    typographyQuality +
    brandAlignment +
    professionalFinish +
    technicalExecution;

  return {
    supported: true,
    themeId: theme.id,
    themeLabel: theme.displayName,
    score,
    passed: errors.length === 0 && score >= 20,
    errors,
    warnings,
    headlineWordCount,
    taglineWordCount,
    benefitCount: benefits.length,
    maxHeadlineWords: format.headlineMaxWords,
    maxTaglineWords: format.taglineMaxWords,
  };
}

export function buildVoxaPromptPackage(input: VoxaPromptInput): VoxaPromptPackage {
  const theme = getVoxaThemeDefinition(input.themeId);
  const preflight = buildVoxaPreflight(input);

  if (!theme) {
    return {
      supported: false,
      themeGuide: null,
      positivePrompt: "",
      negativePrompt: "",
      qualityGate: "",
      preflight,
    };
  }

  const format = FORMAT_RULES[input.format];
  const benefits = dedupeList(input.benefits, 6);
  const colors = deriveColorSystem(input.brandColors);
  const headline = sanitizeLine(input.headline, 140);
  const tagline = sanitizeLine(input.tagline, 160);
  const contextBrief = sanitizeLine(input.contextBrief, 220);
  const customPrompt = sanitizeLine(input.customPrompt, 220);
  const sceneBrief = sanitizeLine(input.sceneBrief, 220);
  const referenceSummary = sanitizeLine(input.referenceSummary, 180);
  const productName = sanitizeLine(input.productName, 120);
  const brandName = sanitizeLine(input.brandName, 120);
  const website = sanitizeLine(input.website, 80);
  const email = sanitizeLine(input.email, 80);
  const partnerName = sanitizeLine(input.partnerName, 80);
  const partnerTagline = sanitizeLine(input.partnerTagline, 120);
  const industryAtmosphere = resolveIndustryAtmosphere(input.industry);
  const renderMode = input.aiOwnsFullPoster
    ? "Render the complete final poster yourself, including hierarchy, typography, and composition."
    : "Render a background/hero plate that respects the theme structure. Overlay typography and locked brand chrome may be applied afterward.";

  const contentLines = [
    headline ? `Headline: "${headline}"` : null,
    tagline ? `Tagline: "${tagline}"` : null,
    benefits.length > 0 ? `Benefits: ${benefits.join("; ")}` : null,
    productName ? `Product / Hero: ${productName}` : null,
    sceneBrief ? `Scene direction: ${sceneBrief}` : null,
    brandName ? `Brand: ${brandName}` : null,
    partnerName ? `Partner: ${partnerName}` : null,
    partnerTagline ? `Partner line: ${partnerTagline}` : null,
    website || email ? `Footer contact: ${[website, email].filter(Boolean).join(" | ")}` : null,
    referenceSummary ? `Reference anchor: ${referenceSummary}` : null,
    contextBrief ? `Context brief: ${contextBrief}` : null,
    customPrompt ? `My Vision override: ${customPrompt}` : null,
  ]
    .filter(Boolean)
    .join("\n- ");

  const positivePrompt = [
    `VOXA PRO STUDIO SPEC`,
    `Create a ${theme.displayName} visual in ${input.format} format (${format.dimensions}).`,
    ``,
    `RENDER MODE`,
    `- ${renderMode}`,
    `- ${theme.summary}`,
    ``,
    `UNIVERSAL LAYOUT SYSTEM`,
    `- ${format.layout}`,
    `- Keep exactly one primary focal point and maintain 4% edge-safe margins with protected breathing room around the hero.`,
    `- Use clean alignment, no floating elements, and no overlap between header, content, hero, and footer zones.`,
    ``,
    `TYPOGRAPHY HIERARCHY`,
    `- Use exactly one primary headline.`,
    `- Keep the headline at ${format.headlineMaxWords} words or fewer for this format.`,
    `- HEADLINE: Bold 800-900 weight sans-serif (Inter, Helvetica Neue, DM Sans, or similar). The headline must be 3-4x larger than bullet text and 2x larger than the tagline. Tight letter-spacing (-0.02em to -0.01em). Line height 1.05-1.15.`,
    `- Keep the tagline at ${format.taglineMaxWords} words or fewer for this format.`,
    `- TAGLINE: Medium weight (400-500), 50-60% of headline size. Place directly below headline with clear breathing room.`,
    `- PROOF BULLETS: Regular weight (400-500). Stack with identical vertical spacing and consistent markers (filled circles or brand accent bars). All bullets must share one clean left edge. Keep each to one line.`,
    `- Use body/supporting text as Level 3 hierarchy only. Footer details remain Level 4 and visually secondary.`,
    `- ALL text in a column must align to one shared vertical left edge. No scattered or randomly staggered positions.`,
    ``,
    `COLOR AND GRADIENT SYSTEM`,
    `- Primary palette: ${colors.palette.length ? colors.palette.join(", ") : "derive from brand-safe professional tones"}.`,
    `- Preferred gradient: ${colors.gradient}.`,
    `- Use ${theme.overlay.toLowerCase()}.`,
    `- Atmospheric layer: ${industryAtmosphere}`,
    ``,
    `HEADER / FOOTER ARCHITECTURE`,
    `- Header: ${theme.header}`,
    `- Footer: ${theme.footer}`,
    `- Never let footer or header elements collide with the hero or copy lanes.`,
    ``,
    `LOGO INTEGRATION`,
    `- Any supplied logo must feel native to the composition: built into a header fascia, plated strip, glass band, negative-space lockup, or structural brand surface.`,
    `- Never render the logo as a pasted sticker, floating corner watermark, random brand badge, or default frosted white logo card unless a restrained plated module is absolutely necessary for contrast.`,
    theme.id === "alliance-poster" || theme.id === "industrial-campaign"
      ? `- For ${theme.displayName}, make the header/logo treatment read like a real enterprise campaign lockup with deliberate spacing, believable edges, and premium integration.`
      : null,
    ``,
    `HERO / PRODUCT TREATMENT`,
    `- ${theme.hero}`,
    `- Keep the hero separated from text and background with clear lighting, controlled shadow, and safe-zone breathing room.`,
    ``,
    `THEME EXECUTION`,
    `- Composition: ${theme.composition}`,
    `- Background: ${theme.background}`,
    `- Style reference: ${theme.style}`,
    ``,
    `CONTENT INPUTS`,
    contentLines ? `- ${contentLines}` : `- Use the confirmed post and brand context as the message anchor.`,
    ``,
    `QUALITY ANCHOR`,
    `- Target Fortune 500 B2B marketing quality.`,
    `- Benchmark against Siemens, ABB, Schneider Electric, Honeywell, GE industrial, or equivalent enterprise brand execution.`,
    `- Enforce readable text, strong contrast, one focal point, and premium spacing.`,
  ]
    .filter(Boolean)
    .join("\n");

  const qualityGate = [
    `VOXA preflight score: ${preflight.score}/25 (${preflight.passed ? "pass" : "needs attention"})`,
    `Checklist: one headline only; protected hero zone; no footer collisions; disciplined grid alignment; readable text without zooming.`,
    preflight.warnings.length > 0
      ? `Warnings: ${preflight.warnings.join(" ")}`
      : `Warnings: none.`,
  ].join("\n");

  return {
    supported: true,
    themeGuide: {
      label: theme.displayName,
      direction: `${theme.summary} ${theme.composition}`,
    },
    positivePrompt,
    negativePrompt: `${UNIVERSAL_NEGATIVE_PROMPT}, ${theme.negative}`,
    qualityGate,
    preflight,
  };
}
