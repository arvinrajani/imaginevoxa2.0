import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStructuredChatCompletion } from "@/lib/ai/openai";
import { buildPostContent } from "@/lib/studio/prompt-builder";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  brandKitId: z.string().uuid().optional().nullable(),
  moodBoardId: z.string().uuid().optional().nullable(),
  imageProfileId: z.string().uuid().optional().nullable(),
  prompt: z.string().min(5),
  postType: z.string().optional(),
  length: z.enum(["short", "standard", "long"]).optional(),
  audienceLevel: z.enum(["executive", "practitioner", "general"]).optional(),
  count: z.number().int().min(1).max(5).optional(),
  sourceIds: z.array(z.string().uuid()).optional(),
  evidenceIds: z.array(z.string().uuid()).max(20).optional(),
  outcomeBrief: z
    .object({
      goal: z.string().optional(),
      audience: z.string().optional(),
      painPoint: z.string().optional(),
      solution: z.string().optional(),
      offer: z.string().optional(),
      proof: z.string().optional(),
      kpiTarget: z.string().optional(),
    })
    .optional(),
  links: z
    .object({
      website: z.string().optional(),
      chatbot: z.string().optional(),
    })
    .optional(),
  productId: z.string().uuid().optional().nullable(),
  solutionMode: z.boolean().optional(),
  experimentMode: z.boolean().optional(),
  experimentAxes: z
    .array(z.enum(["hook", "cta", "emotion", "proof", "angle"]))
    .max(3)
    .optional(),
  emojiPolicy: z
    .object({
      min: z.number().int().min(0).max(15).optional(),
      max: z.number().int().min(0).max(15).optional(),
      style: z.enum(["none", "minimal", "balanced"]).optional(),
    })
    .optional(),
  tone: z
    .enum([
      "professional",
      "conversational",
      "inspiring",
      "provocative",
      "educational",
      "storytelling",
    ])
    .optional(),
  framework: z.string().optional(),
  structureStyle: z
    .enum(["natural", "problem-solution", "story-led", "how-to"])
    .optional(),
});

const MAX_SOURCE_CHARS = 3000;
const MAX_SELECTED_EVIDENCE_CONTENT_CHARS = 9000;
const PLACEHOLDER_TOKEN_REGEX =
  /\[(audience|pain|solution|proof|cta|before|intervention|result|lesson|opinion|context|framework)\]/gi;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "we",
  "with",
  "you",
  "your",
  "audience",
  "pain",
  "solution",
  "proof",
  "cta",
  "goal",
  "kpi",
  "target",
  "brief",
  "before",
  "after",
  "intervention",
  "result",
  "lesson",
  "opinion",
  "context",
  "framework",
  "pdf",
  "document",
  "documents",
  "file",
  "files",
  "summary",
  "summarize",
  "summarise",
  "provided",
  "attached",
  "based",
  "according",
  "post",
  "make",
  "create",
]);

const DOCUMENT_LED_PROMPT_REGEX =
  /\b(pdf|document|documents|file|files|brochure|catalog|catalogue|datasheet|data sheet|spec sheet|manual|deck|summary|summar(?:y|ize|ise)|provided|attached|uploaded)\b/i;

type ToneId =
  | "professional"
  | "conversational"
  | "inspiring"
  | "provocative"
  | "educational"
  | "storytelling";

type LengthId = "short" | "standard" | "long";
type StructureStyle = "natural" | "problem-solution" | "story-led" | "how-to";
type ContentIntent =
  | "hiring"
  | "internship"
  | "product"
  | "event"
  | "thought-leadership"
  | "general";

type GeneratedOption = {
  headline: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  image_prompt: string;
  variant_label?: string;
  test_hypothesis?: string;
  risk_flags?: string[];
  notes?: string;
};

type OutcomeBrief = z.infer<typeof inputSchema>["outcomeBrief"];
type InputLinks = z.infer<typeof inputSchema>["links"];

type NormalizedLinks = {
  website: string | null;
  chatbot: string | null;
};

const TONE_EMOJI_DEFAULTS: Record<
  ToneId,
  { min: number; max: number; style: "none" | "minimal" | "balanced" }
> = {
  professional: { min: 1, max: 4, style: "minimal" },
  conversational: { min: 3, max: 8, style: "balanced" },
  inspiring: { min: 4, max: 10, style: "balanced" },
  provocative: { min: 1, max: 5, style: "minimal" },
  educational: { min: 2, max: 6, style: "balanced" },
  storytelling: { min: 2, max: 6, style: "balanced" },
};

const LENGTH_GUIDANCE: Record<
  LengthId,
  { words: string; minWords: number; guidance: string }
> = {
  short: {
    words: "120-170",
    minWords: 120,
    guidance: "Compact and direct. One clear takeaway and one clear CTA.",
  },
  standard: {
    words: "170-230",
    minWords: 170,
    guidance: "Balanced depth with practical examples and a clear structure.",
  },
  long: {
    words: "230-320",
    minWords: 230,
    guidance:
      "Deep post with story + method + proof + practical steps the reader can apply today.",
  },
};

const TONE_DIRECTIVES: Record<ToneId, string> = {
  professional:
    "Authoritative and polished. Use crisp language, executive clarity, and concrete business wording. Avoid fluff.",
  conversational:
    "Natural and warm. Use contractions and direct second-person language like a trusted advisor.",
  inspiring:
    "Optimistic and energizing. Use forward momentum and belief-building language without hype.",
  provocative:
    "Bold and contrarian. Challenge assumptions with sharp but credible arguments and one tension point.",
  educational:
    "Teacher mode. Explain clearly with practical examples and explicit takeaways.",
  storytelling:
    "Narrative-first. Start with a scene, show a turning point, then land on a practical lesson.",
};

const STRUCTURE_STYLE_GUIDANCE: Record<StructureStyle, string> = {
  natural:
    `Write like a polished native LinkedIn post. No rigid section labels. Use a MIX of short paragraphs AND bullet points/pointers throughout.
    FORMAT RULES:
    - Start with a compelling 1-2 line hook paragraph
    - Follow with a short context paragraph (2-3 sentences max)
    - Then use bullet points (•, ✅, →, ▸) for key insights, tips, or takeaways (3-6 bullets)
    - After bullets, add a bridging paragraph with personal insight or analogy
    - Optionally add another set of bullets for action steps
    - End with a clear CTA paragraph
    - Use line breaks between sections for readability
    - Vary bullet styles: use emojis as bullet markers (🔹, ✅, 💡, ➡️, 🎯) to make them visually engaging`,
  "problem-solution":
    `Use a clear problem -> solution -> proof -> CTA arc.
    FORMAT RULES:
    - Open with the problem as a punchy 1-2 line paragraph
    - Use 2-3 bullet points to list pain symptoms
    - Bridge with a "Here's what works:" or similar transition
    - Present solution as 3-5 actionable bullet points with emoji markers
    - Add a proof/results paragraph
    - Close with CTA
    - Mix paragraphs and bullets — never write a wall of text`,
  "story-led":
    `Lead with a real narrative moment, then transition to insights.
    FORMAT RULES:
    - Start with a vivid 2-3 sentence story hook
    - Continue the narrative in a short paragraph
    - Transition with "Here's what I learned:" or similar
    - List 3-5 key lessons as bullet points with emoji markers
    - End with a reflection paragraph and CTA
    - The post should feel like paragraphs interspersed with scannable takeaway bullets`,
  "how-to":
    `Use a tactical how-to format with concrete steps.
    FORMAT RULES:
    - Open with why this matters (1-2 sentences)
    - Use numbered steps (1., 2., 3.) or emoji-numbered bullets for the main process
    - Under each step, add 1-2 sentences of context or a sub-bullet
    - After the steps, add a "Pro tip:" or "Bonus:" paragraph
    - Close with CTA
    - Each step should feel like a mini-section with its own paragraph`,
};

const FRAMEWORK_HINTS: Record<string, string> = {
  aida: "Follow AIDA: Attention, Interest, Desire, Action.",
  pas: "Follow PAS: Problem, Agitate, Solution.",
  story: "Follow Story arc: setup, challenge, turning point, lesson.",
  listicle: "Use a numbered list with clear, practical points.",
  contrarian: "Lead with an unconventional claim and support with evidence.",
  beforeafter: "Show before state, intervention, and after state.",
  howto: "Use a step-by-step how-to structure.",
  datainsight: "Lead with a stat or benchmark, then explain implications.",
};

const KNOWN_SKILLS = [
  "web development",
  "frontend",
  "backend",
  "python",
  "java",
  "c++",
  "javascript",
  "typescript",
  "machine learning",
  "data science",
  "data analysis",
  "marketing",
  "sales",
  "design",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizePromptText(value: string) {
  return value
    .replace(PLACEHOLDER_TOKEN_REGEX, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*/g, "")
    .replace(
      /\b(audience|pain|solution|proof|cta(?:\s*objective|\s*action)?|goal|kpi(?:\s*target)?|before|intervention|result|lesson|opinion|context|framework|practical next step)\s*:\s*/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanGeneratedText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    // Convert markdown links to plain-text label + URL for LinkedIn-friendly output.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1: $2")
    .replace(/<((?:https?:\/\/)[^>]+)>/gi, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*]\s+/gm, "👉 ")
    .replace(/\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInputUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function normalizeLinks(links: InputLinks | undefined): NormalizedLinks {
  return {
    website: normalizeInputUrl(links?.website),
    chatbot: normalizeInputUrl(links?.chatbot),
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asContextString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asContextStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function hasAnyLinks(links: NormalizedLinks): boolean {
  return Boolean(links.website || links.chatbot);
}

function appendLinksToCta(cta: string, links: NormalizedLinks): string {
  if (!cta && !hasAnyLinks(links)) return cta;

  const output = cta.trim();
  const additions: string[] = [];

  if (links.website && !output.includes(links.website)) {
    additions.push(`Website: ${links.website}`);
  }
  if (links.chatbot && !output.includes(links.chatbot)) {
    additions.push(`Chatbot: ${links.chatbot}`);
  }

  if (!additions.length) return output;
  if (!output) return additions.join(" | ");
  return `${output}\n${additions.join(" | ")}`;
}

function sanitizeFallbackReason(reason: string | null) {
  if (!reason) return null;
  return reason
    .replace(/sk-[A-Za-z0-9_\-]+/g, "sk-[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, "Bearer [redacted]")
    .slice(0, 260);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enforceCanonicalBrandName(text: string, canonicalBrandName: string | null) {
  if (!text || !canonicalBrandName) return text;

  const canonical = canonicalBrandName.trim();
  if (!canonical) return text;

  const words = canonical.split(/\s+/).filter(Boolean);
  if (words.length !== 1) {
    return text;
  }

  const primaryToken = words[0];
  const suffixPattern = new RegExp(
    `\\b${escapeRegExp(primaryToken)}\\s+(solutions?|solution|technologies?|technology|tech|systems?|services?|inc\\.?|llc|ltd\\.?|company|corp(?:oration)?|group|global)\\b`,
    "gi"
  );

  return text.replace(suffixPattern, canonical);
}

function inferContentIntent(prompt: string, brief?: OutcomeBrief): ContentIntent {
  const text = `${prompt} ${brief?.goal || ""} ${brief?.solution || ""}`.toLowerCase();
  if (/\b(hiring|hire|recruit|recruiting|job opening|open position|apply)\b/.test(text)) {
    return "hiring";
  }
  if (/\b(intern|internship|fresher|graduate program|campus)\b/.test(text)) {
    return "internship";
  }
  if (/\b(launch|feature|product|release|new tool|new platform)\b/.test(text)) {
    return "product";
  }
  if (/\b(webinar|event|workshop|meetup|conference)\b/.test(text)) {
    return "event";
  }
  if (/\b(opinion|take|trend|future|leadership|mindset)\b/.test(text)) {
    return "thought-leadership";
  }
  return "general";
}

function extractSkillMentions(prompt: string, limit = 6) {
  const normalized = prompt.toLowerCase();
  const hits = KNOWN_SKILLS.filter((skill) => normalized.includes(skill));
  return hits.slice(0, limit);
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function stripStructuredScaffolding(value: string) {
  return value
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(
        normalized.startsWith("the challenge:") ||
        normalized.startsWith("the approach:") ||
        normalized.startsWith("proof signal:") ||
        normalized.startsWith("framework note:") ||
        normalized.startsWith("what works in practice:")
      );
    })
    .join("\n");
}

function extractKeywords(prompt: string, limit = 6) {
  const tokens = (prompt.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
    (token) => !STOP_WORDS.has(token)
  );
  return Array.from(new Set(tokens)).slice(0, limit);
}

function toHashtag(token: string) {
  if (!token) return "#LinkedIn";
  return `#${token[0].toUpperCase()}${token.slice(1)}`;
}

function normalizeHashtags(tags: unknown): string[] {
  const defaults = ["#LinkedIn", "#B2B", "#ContentStrategy", "#Marketing"];

  if (!Array.isArray(tags)) {
    return defaults.slice(0, 4);
  }

  const normalized = tags
    .filter((item): item is string => typeof item === "string")
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .map((tag) => `#${tag.replace(/\s+/g, "")}`);

  const unique = Array.from(new Set(normalized));
  return Array.from(new Set([...unique, ...defaults])).slice(0, 8);
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function scoreRelevanceToPrompt(prompt: string, option: GeneratedOption) {
  const keywords = extractKeywords(prompt, 6);
  if (!keywords.length) return 1;
  const haystack = `${option.headline} ${option.hook} ${option.body}`.toLowerCase();
  const hits = keywords.filter((keyword) => haystack.includes(keyword)).length;
  return hits / keywords.length;
}

function isDocumentLedPrompt(prompt: string) {
  return DOCUMENT_LED_PROMPT_REGEX.test(prompt);
}

function ensureBodyLength(body: string, length: LengthId, topic: string) {
  const minWords = LENGTH_GUIDANCE[length].minWords;
  let output = sanitizePromptText(body);

  const expansionPool = [
    `What makes this relevant now is that teams are expected to do more with less while keeping quality high.`,
    `The practical move is to standardize the process so execution does not depend on individual heroics.`,
    `When you document the workflow, coach the team, and review outcomes weekly, the quality curve changes fast.`,
    `A simple scorecard helps: content quality, response quality, and conversion quality over time.`,
    `If you apply this to ${topic}, you can create repeatable output without sacrificing brand trust.`,
    `This is where most strategies fail: they focus on volume but ignore positioning and message clarity.`,
    `The better approach is to start from audience needs, then map each paragraph to one decision the reader should make.`,
    `When readers can see themselves in the example, they are much more likely to respond and take action.`,
  ];

  let i = 0;
  while (countWords(output) < minWords && i < expansionPool.length * 3) {
    output += `\n\n${expansionPool[i % expansionPool.length]}`;
    i += 1;
  }

  return output;
}

function resolveEmojiPolicy(input: z.infer<typeof inputSchema>, tone: ToneId) {
  const defaults = TONE_EMOJI_DEFAULTS[tone];
  const min = clamp(input.emojiPolicy?.min ?? defaults.min, 0, 15);
  const max = clamp(input.emojiPolicy?.max ?? defaults.max, min, 15);
  return {
    min,
    max,
    style: input.emojiPolicy?.style ?? defaults.style,
  };
}

function buildFallbackOptions(params: {
  prompt: string;
  count: number;
  tone: ToneId;
  length: LengthId;
  structureStyle: StructureStyle;
  framework?: string;
  experimentMode: boolean;
  experimentAxes: string[];
  outcomeBrief?: OutcomeBrief;
  emojiPolicy: { min: number; max: number; style: "none" | "minimal" | "balanced" };
}): GeneratedOption[] {
  const keywords = extractKeywords(params.prompt, 8);
  const intent = inferContentIntent(params.prompt, params.outcomeBrief);
  const skills = extractSkillMentions(params.prompt, 6);
  const primaryTopic = keywords[0] || "content strategy";
  const secondaryTopic = keywords[1] || "pipeline growth";
  const audience = params.outcomeBrief?.audience || "your ideal buyers";
  const pain =
    params.outcomeBrief?.painPoint ||
    `inconsistent output and low trust around ${primaryTopic}`;
  const solution =
    params.outcomeBrief?.solution ||
    `a clear, repeatable operating system for ${primaryTopic}`;
  const proof =
    params.outcomeBrief?.proof ||
    "improved engagement quality and stronger conversion intent";
  const goal = params.outcomeBrief?.goal || "start qualified conversations";
  const ctaOffer = params.outcomeBrief?.offer || "comment and I will share the exact template";

  const toneHooks: Record<ToneId, string[]> = {
    professional: [
      `Most teams treat ${primaryTopic} as a creative task. It is an operating system problem.`,
      `If ${audience} want predictable results, the process must be designed before content is written.`,
      `The biggest mistake in ${primaryTopic} is measuring activity instead of business outcomes.`,
    ],
    conversational: [
      `Quick truth: ${primaryTopic} gets easier once you stop trying to reinvent every post.`,
      `I kept seeing the same issue with ${audience}, so we simplified the whole workflow.`,
      `If ${secondaryTopic} feels random right now, this structure will help immediately.`,
    ],
    inspiring: [
      `You do not need a bigger team to win at ${primaryTopic}; you need a better system.`,
      `The moment we simplified ${primaryTopic}, momentum changed for the whole team.`,
      `This is your reminder: consistent execution beats sporadic brilliance every time.`,
    ],
    provocative: [
      `Hot take: most ${primaryTopic} advice is designed to look smart, not drive outcomes.`,
      `If your strategy cannot survive weekly execution pressure, it was never a strategy.`,
      `The market does not reward noise. It rewards sharp positioning and clear proof.`,
    ],
    educational: [
      `If you are building ${primaryTopic}, use this 3-part structure to improve results quickly.`,
      `Here is a practical framework to fix weak ${secondaryTopic} outcomes.`,
      `Most teams miss this sequence, so here is the exact order to follow.`,
    ],
    storytelling: [
      `A few months ago, our ${primaryTopic} process was chaotic. Then we changed one thing.`,
      `I remember the week we realized our output looked busy but performed weakly.`,
      `We thought the problem was creativity. It turned out to be process design.`,
    ],
  };

  const frameworkHint = params.framework ? FRAMEWORK_HINTS[params.framework] : null;
  const hashtagPool = Array.from(new Set(keywords.map(toHashtag))).slice(0, 5);
  const variantLabels = ["Core", "Audience-first", "Proof-first", "How-to", "Contrarian"];

  return Array.from({ length: params.count }).map((_, index) => {
    const axis = params.experimentAxes[index % Math.max(1, params.experimentAxes.length)] || "angle";
    const hook = toneHooks[params.tone][index % toneHooks[params.tone].length];
    const hiringLike = intent === "hiring" || intent === "internship";
    const skillList = skills.length
      ? skills.map((skill) => `- ${toTitleCase(skill)}`).join("\n")
      : [
          "- Web Development",
          "- Python / Java",
          "- Data Analysis / Data Science",
          "- AI / Machine Learning",
        ].join("\n");

    const headlineSets: Record<StructureStyle, string[]> = {
      natural: [
        hiringLike
          ? intent === "internship"
            ? "Career-focused internship opportunities are open"
            : "We are hiring: join our growing team"
          : `${primaryTopic[0]?.toUpperCase() || "S"}${primaryTopic.slice(1)}: the repeatable playbook`,
        hiringLike
          ? "Open positions for practical, growth-focused roles"
          : `How strong teams execute ${primaryTopic} without complexity`,
        hiringLike
          ? "Build your portfolio with real-world projects"
          : `A better operating model for ${secondaryTopic}`,
        hiringLike
          ? "Apply now for high-impact roles"
          : `What finally made ${primaryTopic} predictable`,
      ],
      "problem-solution": [
        hiringLike ? "The talent gap is real. Here is how we are solving it." : `From ${pain} to predictable outcomes`,
        hiringLike ? "Why most candidates miss practical growth opportunities" : `The execution gap behind weak ${secondaryTopic}`,
        hiringLike ? "A clearer pathway from learning to career outcomes" : `Why ${primaryTopic} fails and how to fix it`,
        hiringLike ? "Hiring playbook: practical skills first" : `${primaryTopic[0]?.toUpperCase() || "S"}${primaryTopic.slice(1)}: problem to playbook`,
      ],
      "story-led": [
        hiringLike ? "How we redesigned our hiring funnel for better fit" : `The week our ${primaryTopic} process finally clicked`,
        hiringLike ? "A practical path from internship to real outcomes" : `We changed one thing and ${secondaryTopic} improved`,
        hiringLike ? "What candidates taught us about building better roles" : `What a messy quarter taught us about ${primaryTopic}`,
        hiringLike ? "The turning point in our recruitment process" : `The turning point in our ${primaryTopic} workflow`,
      ],
      "how-to": [
        hiringLike ? "How to apply for our open positions" : `How to build a repeatable ${primaryTopic} workflow`,
        hiringLike ? "A practical checklist for applicants" : `A practical 3-step system for ${secondaryTopic}`,
        hiringLike ? "How we evaluate candidates for impact roles" : `The operator's guide to ${primaryTopic}`,
        hiringLike ? "Steps to stand out in this hiring cycle" : `Use this framework to improve ${secondaryTopic}`,
      ],
    };

    const headline = sanitizePromptText(
      headlineSets[params.structureStyle][index % headlineSets[params.structureStyle].length]
    );

    const bodyTemplateByStyle: Record<StructureStyle, string> = {
      natural: [
        hook,
        "",
        hiringLike
          ? intent === "internship"
            ? "We run a career-focused internship program built around practical projects and real skill growth."
            : "We are hiring for practical, execution-focused roles where real skills matter."
          : `Most teams struggle with ${pain}, not because they lack effort, but because the system is unclear.`,
        hiringLike
          ? "If you are looking for work that builds portfolio credibility and measurable outcomes, this is for you."
          : `We simplified the model around one idea: ${solution}.`,
        hiringLike
          ? "Open domains:"
          : `That shift improved outcomes quickly: ${proof}.`,
        hiringLike ? skillList : `That shift improved outcomes quickly: ${proof}.`,
        "",
        hiringLike ? "Why this matters:" : "What actually helped:",
        hiringLike
          ? "1) Hands-on execution with mentorship."
          : "1) Define one audience and one decision the post should drive.",
        hiringLike
          ? "2) Industry-relevant exposure and project ownership."
          : "2) Keep each post focused on one mechanism, one example, and one action.",
        hiringLike
          ? "3) Stronger readiness for real hiring pipelines."
          : "3) Review response quality weekly and refine the hook/CTA accordingly.",
        frameworkHint ? `You can layer this with ${frameworkHint}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "problem-solution": [
        hook,
        "",
        hiringLike ? "The challenge: candidates struggle to find practical, career-relevant opportunities." : `The challenge: ${pain}.`,
        hiringLike ? "The approach: structured roles, project-based learning, and mentor-backed execution." : `The approach: ${solution}.`,
        hiringLike ? "Proof signal: stronger portfolios, better readiness, and higher confidence." : `Proof signal: ${proof}.`,
        "",
        "What works in practice:",
        hiringLike ? "1) Focus on skills that employers evaluate in real workflows." : "1) Define the audience and one core decision they should make.",
        hiringLike ? "2) Build portfolio-backed evidence, not just theory." : "2) Build every post around one problem, one mechanism, and one clear action.",
        hiringLike ? "3) Apply with clear intent and relevant examples of execution." : "3) Review results weekly, then refine the hook, proof, and CTA based on response quality.",
        frameworkHint ? `Framework note: ${frameworkHint}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "story-led": [
        hook,
        "",
        hiringLike
          ? "At first, we thought candidates needed more information. What they really needed was practical direction."
          : `At first, we assumed the issue was content quality. The real issue was process discipline around ${primaryTopic}.`,
        hiringLike
          ? "We redesigned the journey around projects, mentorship, and role clarity."
          : `Once we introduced ${solution}, the team could execute consistently.`,
        hiringLike
          ? "That shift led to stronger portfolios and better career outcomes."
          : `Within weeks, we saw ${proof}.`,
        "",
        "Lesson:",
        hiringLike
          ? "Candidates grow fastest when they work on real problems with clear accountability."
          : "Strong content is rarely about writing harder. It is about designing a system that compounds.",
        frameworkHint ? `We reinforced this using ${frameworkHint}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "how-to": [
        hook,
        "",
        hiringLike ? "Application checklist:" : "Use this 3-step playbook:",
        hiringLike ? "1) Pick the role area that matches your strongest practical skill." : `1) Diagnose the current gap: ${pain}.`,
        hiringLike ? "2) Share relevant projects or examples of execution." : `2) Implement the mechanism: ${solution}.`,
        hiringLike ? "3) Submit a concise application with clear motivation." : `3) Validate with proof and iteration: ${proof}.`,
        "",
        hiringLike ? "Tip:" : "Execution tip:",
        hiringLike
          ? "Specificity beats generic resumes. Show what you built and what results you created."
          : "Run the sequence weekly and measure response quality, not just impressions.",
        frameworkHint ? `Optional structure: ${frameworkHint}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const body = ensureBodyLength(
      bodyTemplateByStyle[params.structureStyle],
      params.length,
      primaryTopic
    );

    const cta = sanitizePromptText(
      hiringLike
        ? intent === "internship"
          ? "If this fits your goals, comment or DM to get application details and next steps."
          : "Interested candidates can comment or DM for role details and application steps."
        : params.tone === "professional"
        ? `If your priority is to ${goal}, ${ctaOffer}.`
        : params.tone === "provocative"
        ? `If you disagree, challenge this in the comments. If you agree, ${ctaOffer}.`
        : `If this is useful for your team, ${ctaOffer}.`
    );

    const hashtags = normalizeHashtags([
      ...hashtagPool,
      "#LinkedIn",
      "#B2B",
      "#ContentMarketing",
      "#DemandGen",
    ]);

    const imagePrompt = sanitizePromptText(
      hiringLike
        ? `LinkedIn recruitment poster for ${intent === "internship" ? "internship openings" : "hiring campaign"}. Clean corporate layout, strong title area, role list section, high contrast, brand-safe colors, modern professional design.`
        : `LinkedIn hero visual about ${primaryTopic}. Show ${audience} overcoming ${pain} using ${solution}. Clean professional composition, brand-safe.`
    );

    return {
      headline,
      hook,
      body,
      cta,
      hashtags,
      image_prompt: imagePrompt,
      variant_label: params.experimentMode
        ? `${variantLabels[index % variantLabels.length]} (${axis})`
        : variantLabels[index % variantLabels.length],
      test_hypothesis: params.experimentMode
        ? `Varying ${axis} will improve qualified engagement.`
        : undefined,
      notes: "Fallback template used because model output was unavailable.",
      risk_flags: [],
    };
  });
}

function normalizeOption(params: {
  option: Partial<GeneratedOption>;
  fallback: GeneratedOption;
  length: LengthId;
  structureStyle: StructureStyle;
  prompt: string;
  experimentMode: boolean;
}) {
  const headline = cleanGeneratedText(
    sanitizePromptText(params.option.headline || params.fallback.headline)
  ).slice(0, 180);
  const hook = cleanGeneratedText(sanitizePromptText(params.option.hook || params.fallback.hook));

  const rawBody = cleanGeneratedText(
    sanitizePromptText(params.option.body || params.fallback.body)
  );
  const cleanedBody =
    params.structureStyle === "problem-solution"
      ? rawBody
      : stripStructuredScaffolding(rawBody);
  const body = ensureBodyLength(cleanedBody, params.length, params.prompt);

  const cta = cleanGeneratedText(sanitizePromptText(params.option.cta || params.fallback.cta));
  const hashtags = normalizeHashtags(params.option.hashtags || params.fallback.hashtags);
  const image_prompt = cleanGeneratedText(
    sanitizePromptText(
      params.option.image_prompt || params.fallback.image_prompt || `${headline}. ${body.slice(0, 180)}`
    )
  );

  return {
    headline,
    hook,
    body,
    cta,
    hashtags,
    image_prompt,
    variant_label: params.experimentMode
      ? cleanGeneratedText(
          sanitizePromptText(params.option.variant_label || params.fallback.variant_label || "Core")
        )
      : undefined,
    test_hypothesis: params.experimentMode
      ? cleanGeneratedText(
          sanitizePromptText(
            params.option.test_hypothesis ||
              params.fallback.test_hypothesis ||
              "This variation should improve engagement quality."
          )
        )
      : undefined,
    risk_flags: Array.isArray(params.option.risk_flags)
      ? params.option.risk_flags
          .filter((item): item is string => typeof item === "string")
          .map((item) => cleanGeneratedText(sanitizePromptText(item)))
          .filter(Boolean)
      : [],
    notes: params.option.notes
      ? cleanGeneratedText(sanitizePromptText(params.option.notes))
      : params.fallback.notes,
  } as GeneratedOption;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const desiredCount = clamp(input.count ?? 3, 1, 5);
    const tone: ToneId = input.tone ?? "professional";
    const length: LengthId = input.length ?? "long";
    const structureStyle: StructureStyle = input.structureStyle ?? "natural";
    const solutionMode =
      input.solutionMode ?? structureStyle === "problem-solution";
    const experimentMode = input.experimentMode ?? false;
    const experimentAxes = (input.experimentAxes || []).slice(0, 3);
    const emojiPolicy = resolveEmojiPolicy(input, tone);

    const sanitizedPrompt = sanitizePromptText(input.prompt);
    if (sanitizedPrompt.length < 5) {
      return NextResponse.json(
        { error: "Prompt is too short after sanitization." },
        { status: 400 }
      );
    }

    const normalizedLinks = normalizeLinks(input.links);
    const includeLinks = hasAnyLinks(normalizedLinks);

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, owner_user_id, name")
      .eq("id", input.brandId)
      .maybeSingle();

    if (brandError) {
      return NextResponse.json({ error: "Failed to load brand." }, { status: 500 });
    }

    if (!brand) {
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }

    const canonicalBrandName = sanitizePromptText(brand.name || "Unknown brand");

    if (brand.owner_user_id !== user.id) {
      const { data: member } = await supabase
        .from("brand_members")
        .select("id")
        .eq("brand_id", input.brandId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!member) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [brandKitRes, moodBoardRes, identityRes, marketingDnaRes] = await Promise.all([
      input.brandKitId
        ? supabase
            .from("brand_kits")
            .select("*")
            .eq("id", input.brandKitId)
            .eq("brand_id", input.brandId)
            .maybeSingle()
        : supabase
            .from("brand_kits")
            .select("*")
            .eq("brand_id", input.brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
      input.moodBoardId
        ? supabase
            .from("mood_boards")
            .select("*")
            .eq("id", input.moodBoardId)
            .eq("brand_id", input.brandId)
            .maybeSingle()
        : supabase
            .from("mood_boards")
            .select("*")
            .eq("brand_id", input.brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
      supabase
        .from("marketing_identities")
        .select("*")
        .eq("brand_id", input.brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("marketing_dna")
        .select("id, source, tone, image_style, post_types, cta_style, visual_density, evidence, created_at")
        .eq("brand_id", input.brandId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ── Fetch evolved voice profile (if available) ──
    const { data: voiceEvolution } = await supabase
      .from("marketing_dna")
      .select("evidence")
      .eq("brand_id", input.brandId)
      .eq("source", "voice-evolution")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let productContext: { id: string; name: string; description: string | null } | null = null;
    if (input.productId) {
      const { data: productRow } = await supabase
        .from("products")
        .select("id, name, description")
        .eq("id", input.productId)
        .eq("brand_id", input.brandId)
        .maybeSingle();
      productContext = productRow as { id: string; name: string; description: string | null } | null;
    }

    const brandKit = brandKitRes.data || null;
    const moodBoard = moodBoardRes.data || null;
    const identity = identityRes.data || null;
    const marketingDna = marketingDnaRes.data || null;
    const marketingDnaEvidence = asObjectRecord(marketingDna?.evidence);
    const marketingDnaContext = marketingDna
      ? {
          source: marketingDna.source || null,
          analyzed_at: marketingDna.created_at || null,
          tone: asContextString(marketingDna.tone),
          image_style: asContextString(marketingDna.image_style),
          post_types: asContextStringList(marketingDna.post_types, 10),
          cta_style: asContextString(marketingDna.cta_style),
          visual_density: asContextString(marketingDna.visual_density),
          brand_name: asContextString(marketingDnaEvidence.brand_name),
          brand_description: asContextString(marketingDnaEvidence.brand_description),
          tagline: asContextString(marketingDnaEvidence.tagline),
          products: asContextStringList(marketingDnaEvidence.products, 10),
          key_offerings: asContextStringList(marketingDnaEvidence.key_offerings, 10),
          target_audience: asContextString(marketingDnaEvidence.target_audience),
          business_focus: asContextString(marketingDnaEvidence.business_focus),
          content_pillars: asContextStringList(marketingDnaEvidence.content_pillars, 10),
          industry: asContextString(marketingDnaEvidence.industry),
          company_size: asContextString(marketingDnaEvidence.company_size),
          website: asContextString(marketingDnaEvidence.website),
        }
      : null;

    const sourceIds = (input.sourceIds ?? []).slice(0, 4);
    const evidenceIds = (input.evidenceIds ?? []).slice(0, 20);

    type SourceRow = {
      id: string;
      source_url: string;
      title?: string | null;
      content_excerpt?: string | null;
      content?: string | null;
      metadata?: Record<string, unknown> | null;
      source_type?: string | null;
      created_at?: string | null;
    };

    let sources: SourceRow[] = [];

    if (sourceIds.length) {
      const { data: sourceData } = await supabase
        .from("content_sources")
        .select("id, source_url, title, content_excerpt, content, metadata, source_type, created_at")
        .eq("brand_id", input.brandId)
        .in("id", sourceIds);
      sources = (sourceData || []) as SourceRow[];
    }

    let selectedEvidenceAssets: Array<{
      id: string;
      type: "pdf" | "image" | "url" | "note";
      title: string;
      description: string | null;
      tags: string[] | null;
      note_text: string | null;
      url: string | null;
    }> = [];

    if (evidenceIds.length) {
      const { data: evidenceRows } = await supabase
        .from("evidence_assets")
        .select("id, type, title, description, tags, note_text, url")
        .eq("brand_id", input.brandId)
        .in("id", evidenceIds);

      selectedEvidenceAssets = (evidenceRows || []) as typeof selectedEvidenceAssets;

      const selectedEvidenceIdSet = new Set(evidenceIds);
      const pdfEvidenceIds = selectedEvidenceAssets
        .filter((item) => item.type === "pdf")
        .map((item) => item.id);

      if (pdfEvidenceIds.length) {
        const { data: documentSourceRows } = await supabase
          .from("content_sources")
          .select("id, source_url, title, content_excerpt, content, metadata, source_type, created_at")
          .eq("brand_id", input.brandId)
          .eq("source_type", "document")
          .order("created_at", { ascending: false })
          .limit(250);

        const matchedByEvidenceId = new Map<string, SourceRow>();
        for (const row of (documentSourceRows || []) as SourceRow[]) {
          const metadata = asObjectRecord(row.metadata);
          const evidenceAssetId = asContextString(metadata.evidence_asset_id);
          if (!evidenceAssetId) continue;
          if (!selectedEvidenceIdSet.has(evidenceAssetId)) continue;
          if (!matchedByEvidenceId.has(evidenceAssetId)) {
            matchedByEvidenceId.set(evidenceAssetId, row);
          }
        }

        const evidenceBackedSources = pdfEvidenceIds
          .map((evidenceId) => matchedByEvidenceId.get(evidenceId))
          .filter((item): item is SourceRow => Boolean(item));

        const dedupedById = new Map<string, SourceRow>();
        for (const source of [...sources, ...evidenceBackedSources]) {
          if (!dedupedById.has(source.id)) {
            dedupedById.set(source.id, source);
          }
        }
        sources = Array.from(dedupedById.values());
      }
    }

    const frameworkHint = input.framework ? FRAMEWORK_HINTS[input.framework] : null;
    const lengthGuide = LENGTH_GUIDANCE[length];
    const intent = inferContentIntent(sanitizedPrompt, input.outcomeBrief);
    const skillMentions = extractSkillMentions(sanitizedPrompt, 6);
    const evidenceTitles = selectedEvidenceAssets
      .map((asset) => asContextString(asset.title))
      .filter(Boolean)
      .slice(0, 8);
    const documentLedPrompt =
      selectedEvidenceAssets.length > 0 && isDocumentLedPrompt(sanitizedPrompt);
    const relevancePrompt = documentLedPrompt
      ? [sanitizedPrompt, evidenceTitles.join(" "), sources.map((source) => source.title || "").join(" ")]
          .filter(Boolean)
          .join(" ")
      : sanitizedPrompt;

    const sourcesPrompt = sources.length
      ? [
          "Sources (use for factual grounding when relevant):",
          ...sources.map((source, index) => {
            const label = source.title || source.source_url;
            const excerptRaw = (source.content_excerpt || source.content || "").trim();
            const excerpt = excerptRaw ? excerptRaw.slice(0, MAX_SOURCE_CHARS) : "No excerpt available.";
            return `Source ${index + 1}: ${label}\n${excerpt}`;
          }),
        ].join("\n\n")
      : "No external sources provided. Use broad professional claims only; do not invent data points.";

    // Build a map of evidence ID → full source content for PDFs so we can
    // inject the actual extracted text (not just the metadata description).
    const evidenceSourceContentMap = new Map<string, string>();
    for (const source of sources) {
      const metadata = asObjectRecord(source.metadata);
      const evidenceAssetId = asContextString(metadata.evidence_asset_id);
      if (evidenceAssetId && !evidenceSourceContentMap.has(evidenceAssetId)) {
        const fullText = (source.content || source.content_excerpt || "").trim();
        if (fullText.length > 80) {
          evidenceSourceContentMap.set(
            evidenceAssetId,
            fullText.slice(0, MAX_SELECTED_EVIDENCE_CONTENT_CHARS)
          );
        }
      }
    }

    const evidencePrompt = selectedEvidenceAssets.length
      ? [
          "Selected brand knowledge assets (use these as primary source material for the post — extract key facts, figures, insights, and talking points):",
          ...selectedEvidenceAssets.slice(0, 12).map((asset, index) => {
            const tags = Array.isArray(asset.tags) && asset.tags.length
              ? ` [tags: ${asset.tags.join(", ")}]`
              : "";
            const summary =
              asContextString(asset.description) ||
              asContextString(asset.note_text) ||
              (asset.type === "url" ? asContextString(asset.url) : null) ||
              "No summary provided.";
            // For PDFs, append the actual extracted content so the model has
            // real data to ground the post on.
            const pdfContent = asset.type === "pdf"
              ? evidenceSourceContentMap.get(asset.id)
              : null;
            const contentSection = pdfContent
              ? `\n--- Extracted PDF content ---\n${pdfContent}\n--- End of extracted content ---`
              : "";
            return `${index + 1}. (${asset.type}) ${asset.title}${tags}\n${summary}${contentSection}`;
          }),
        ].join("\n\n")
      : null;

    const systemPrompt = [
      "You are ImagineVoxa Pro, a principal-level LinkedIn ghostwriter, content strategist, and thought-leadership architect specializing in B2B brands that drive real business outcomes.",
      "Return JSON only and strictly follow schema.",
      "",
      "CORE MANDATE:",
      "- Write complete, publication-ready copy that sounds like a seasoned executive or respected industry voice — never like an AI or marketing bot.",
      "- Every option must feel materially different (different hook angle, structure, emotional lever) while keeping the same core business intent.",
      "- The post must stay tightly aligned to the user prompt and selected brand knowledge.",
      "- Never output placeholders like [audience], [proof], or [X%]. Every claim, stat, and example must be concrete and real.",
      "",
      "CONTENT INTELLIGENCE:",
      "- When PDF documents or knowledge assets are provided, deeply analyze them: extract key statistics, quotes, case study details, product features, metrics, client outcomes, and unique insights.",
      "- Transform raw document data into compelling narrative — do not just summarize. Find the most interesting angle, the surprising stat, the counterintuitive insight.",
      "- Cross-reference multiple sources when available to build a richer, more credible narrative.",
      "- If a PDF contains data points, use specific numbers (e.g., '43% reduction' not 'significant reduction').",
      sources.length || selectedEvidenceAssets.length
        ? "Knowledge grounding rule: treat provided sources/knowledge/PDF content as primary truth. Mine them for specific facts, figures, and examples. If data is uncertain, use conservative wording and avoid invented numbers."
        : "No factual sources are provided. Do not invent statistics, client names, or precise claims.",
      "",
      "WRITING CRAFT:",
      `- Brand naming rule: when you mention the brand/company, use this exact token only: "${canonicalBrandName}". Do not append words like Solutions, Inc, Group, etc unless they already exist in that exact token.`,
      "- Open with a hook that creates an information gap, challenges a belief, or stakes a bold position — the first line must stop the scroll.",
      "- Write in a natural human voice with rhythm: vary sentence length, use sentence fragments for punch, and let ideas breathe with whitespace.",
      "- Replace vague claims with specific proof: instead of 'we help companies grow' say 'we helped 127 SaaS teams cut onboarding time by 40%'.",
      "- End every post with a clear CTA that tells the reader exactly what to do next.",
      "- Avoid corporate clichés: 'leverage', 'synergy', 'cutting-edge', 'game-changer', 'revolutionize', 'delighted to announce'.",
      "- If the core prompt explicitly names a product, model, SKU, or product family, keep the post centered on that named product even when no structured product dropdown selection was made.",
      selectedEvidenceAssets.length > 0
        ? "- When the prompt names a product and PDF knowledge is attached, pull facts, features, specifications, proof points, and use cases for that product from the PDFs instead of drifting into generic brand copy."
        : null,
      documentLedPrompt
        ? "- Document-led request detected: treat the selected PDFs as the primary topic source. Infer the core product, solution, or narrative from those documents even if the user's prompt wording is generic."
        : null,
      `Structure style: ${STRUCTURE_STYLE_GUIDANCE[structureStyle]}`,
      productContext
        ? `Product focus: all options must specifically reference and highlight the product "${productContext.name}" with concrete capabilities and outcomes.`
        : null,
      productContext && selectedEvidenceAssets.length > 0
        ? `Fusion rule: connect the selected product "${productContext.name}" directly to the uploaded PDF knowledge. Ground product claims in the document details, features, proof points, differentiators, use cases, and metrics whenever the source material supports them.`
        : null,
      solutionMode
        ? "Each option must explicitly include: problem (with felt pain), mechanism/solution (how it works), proof signal (data or example), and CTA."
        : null,
      structureStyle !== "problem-solution"
        ? "Do not use rigid section labels like 'The challenge:' or 'The approach:'. Keep prose natural and flowing."
        : null,
      `Tone directive: ${TONE_DIRECTIVES[tone]}`,
      `Emoji policy: use at least ${emojiPolicy.min} and up to ${emojiPolicy.max} emojis. Style: ${emojiPolicy.style}. Spread emojis naturally across hook, key pointers, and CTA. Never cluster emojis together.`,
      "",
      "FORMATTING:",
      "- Never use markdown asterisk bullets (*) or markdown emphasis syntax (**).",
      "- Keep spacing clean: one idea per paragraph, 1-3 sentences max per block.",
      "- Use line breaks generously — LinkedIn mobile readers need visual breathing room.",
      "- List items should start with an emoji (e.g., '✅ ...', '→ ...') not dashes or bullets.",
      `Length requirement: ${lengthGuide.words} words. ${lengthGuide.guidance}`,
      input.audienceLevel
        ? `Audience level: ${input.audienceLevel}. Calibrate vocabulary, technical depth, and examples accordingly.`
        : null,
      includeLinks
        ? "If website/chatbot links are provided, weave them naturally into the CTA (no URL edits, no placeholders). Make the link feel like a natural next step."
        : null,
      "",
      "IMAGE PROMPT ENGINEERING:",
      "- Each option must provide a high-quality, production-ready image_prompt that a DALL-E or GPT-Image model can execute flawlessly.",
      "- Structure: [subject] + [scene/environment] + [composition/framing] + [lighting] + [style/aesthetic] + [mood/atmosphere] + [color palette direction].",
      "- The image must visually reinforce the post's core message — not be generic stock imagery.",
      "- If the post discusses a specific product, feature, or outcome, the image should reflect that context.",
      "- Constraints: no text overlays, no logos, no watermarks, no UI screenshots, no charts with readable labels, no human faces unless explicitly relevant.",
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = [
      `Brand (exact name to preserve): ${canonicalBrandName}`,
      `Core prompt: ${sanitizedPrompt}`,
      documentLedPrompt
        ? "Document-led instruction: the user wants the post written from the selected PDF summaries/content. Use the PDFs to determine the topic, product, proof points, and angle."
        : null,
      evidenceTitles.length
        ? `Selected PDF titles: ${evidenceTitles.join(" | ")}`
        : null,
      `Detected intent: ${intent}`,
      skillMentions.length ? `Detected skill/domain mentions: ${skillMentions.join(", ")}` : null,
      intent === "hiring" || intent === "internship"
        ? "Write like a real LinkedIn recruitment post: clear opportunity summary, role/domain bullets, and practical CTA."
        : null,
      input.postType ? `Post type: ${input.postType}` : null,
      `Requested structure style: ${structureStyle}`,
      frameworkHint ? `Preferred framework: ${frameworkHint}` : null,
      input.outcomeBrief
        ? `Outcome brief: ${JSON.stringify({
            goal: input.outcomeBrief.goal || "",
            audience: input.outcomeBrief.audience || "",
            pain_point: input.outcomeBrief.painPoint || "",
            solution: input.outcomeBrief.solution || "",
            offer: input.outcomeBrief.offer || "",
            proof: input.outcomeBrief.proof || "",
            kpi_target: input.outcomeBrief.kpiTarget || "",
          })}`
        : null,
      includeLinks
        ? `Optional link bar to include at post end/CTA: ${JSON.stringify({
            website: normalizedLinks.website || "",
            chatbot: normalizedLinks.chatbot || "",
          })}`
        : null,
      productContext
        ? `Specific product context (write about this product): ${JSON.stringify({
            name: productContext.name,
            description: productContext.description || null,
          })}`
        : null,
      `Brand kit context: ${JSON.stringify({
        brand_name: brandKit?.brand_name || null,
        tone_guidelines: brandKit?.tone_guidelines || [],
        primary_colors: brandKit?.primary_colors || [],
        allowed_image_styles: brandKit?.allowed_image_styles || [],
      })}`,
      marketingDnaContext
        ? `Latest marketing DNA context: ${JSON.stringify(marketingDnaContext)}`
        : null,
      `Mood board context: ${JSON.stringify({
        name: moodBoard?.name || null,
        emotional_tone: moodBoard?.emotional_tone || null,
        composition_style: moodBoard?.composition_style || null,
      })}`,
      identity
        ? `Marketing identity context: ${JSON.stringify({
            voice_traits: identity.voice_traits || [],
            positioning: identity.positioning || null,
            audience_personas: identity.audience_personas || [],
            preferred_phrases: identity.preferred_phrases || [],
            do_not_use: identity.do_not_use || [],
          })}`
        : null,
      // ── Evolved voice context (from performance-based voice analysis) ──
      voiceEvolution?.evidence?.evolved_voice
        ? `Evolved brand voice (learned from top-performing posts):\n${JSON.stringify({
            tone: voiceEvolution.evidence.evolved_voice.tone,
            tone_keywords: voiceEvolution.evidence.evolved_voice.tone_keywords,
            writing_style: voiceEvolution.evidence.evolved_voice.writing_style,
            hook_patterns: voiceEvolution.evidence.evolved_voice.hook_patterns,
            cta_patterns: voiceEvolution.evidence.evolved_voice.cta_patterns,
            vocabulary_signature: voiceEvolution.evidence.evolved_voice.vocabulary_signature,
            sentence_rhythm: voiceEvolution.evidence.evolved_voice.sentence_rhythm,
          })}\nThis voice profile was derived from actual engagement data. Prioritize these patterns.`
        : null,
      voiceEvolution?.evidence?.voice_summary
        ? `Brand voice summary: ${voiceEvolution.evidence.voice_summary}`
        : null,
      evidencePrompt,
      selectedEvidenceAssets.length > 0 && sources.length === 0
        ? "Selected evidence is present but no parsed source excerpts were found. Use available evidence summaries carefully and avoid specific unverifiable claims."
        : null,
      sourcesPrompt,
      experimentMode
        ? `Experiment mode ON. Vary across these axes where possible: ${
            experimentAxes.length ? experimentAxes.join(", ") : "hook, angle, cta"
          }.`
        : "Experiment mode OFF. Keep variations high quality and useful.",
      "If prompt words look like labels (e.g., audience/pain/solution), infer the real business topic from context and write about that topic, not the labels themselves.",
      `Generate exactly ${desiredCount} options.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const schema = {
      name: "post_options",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          options: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                headline: { type: "string" },
                hook: { type: "string" },
                body: { type: "string" },
                cta: { type: "string" },
                hashtags: {
                  type: "array",
                  minItems: 3,
                  maxItems: 8,
                  items: { type: "string" },
                },
                image_prompt: { type: "string" },
                variant_label: { type: "string" },
                test_hypothesis: { type: "string" },
                risk_flags: { type: "array", items: { type: "string" } },
                notes: { type: "string" },
              },
              required: [
                "headline",
                "hook",
                "body",
                "cta",
                "hashtags",
                "image_prompt",
              ],
            },
          },
        },
        required: ["options"],
      },
    };

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-2024-08-06";
    let options: GeneratedOption[] = [];
    let aiFailureReason: string | null = null;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;

    for (const temperature of [0.8, 0.45]) {
      try {
        const result = await createStructuredChatCompletion<{ options: GeneratedOption[] }>({
          model,
          system: systemPrompt,
          user: userPrompt,
          schema,
          temperature,
        });
        options = Array.isArray(result.options) ? result.options : [];
        if (options.length >= desiredCount) {
          break;
        }
        aiFailureReason = `Model returned ${options.length}/${desiredCount} options.`;
      } catch (error) {
        aiFailureReason = error instanceof Error ? error.message : "Unknown model error";
      }
    }

    const fallbackOptions = buildFallbackOptions({
      prompt: relevancePrompt,
      count: desiredCount,
      tone,
      length,
      structureStyle,
      framework: input.framework,
      experimentMode,
      experimentAxes,
      outcomeBrief: input.outcomeBrief,
      emojiPolicy,
    });

    if (!options.length || options.length < desiredCount) {
      fallbackUsed = true;
      fallbackReason = sanitizeFallbackReason(aiFailureReason) || "Model did not return enough options.";
    }

    const normalized = Array.from({ length: desiredCount }).map((_, index) => {
      const option = options[index] || {};
      const fallback = fallbackOptions[index];

      if (fallbackUsed) {
        return normalizeOption({
          option,
          fallback,
          length,
          structureStyle,
          prompt: relevancePrompt,
          experimentMode,
        });
      }

      if (
        !option?.headline ||
        !option?.body ||
        !option?.cta ||
        !Array.isArray(option?.hashtags) ||
        !option?.image_prompt
      ) {
        throw new Error("AI output was incomplete. Please regenerate.");
      }

      return {
        headline: enforceCanonicalBrandName(
          cleanGeneratedText(sanitizePromptText(option.headline)).slice(0, 180),
          canonicalBrandName
        ),
        hook: enforceCanonicalBrandName(
          cleanGeneratedText(sanitizePromptText(option.hook || option.headline)),
          canonicalBrandName
        ),
        body: ensureBodyLength(
          enforceCanonicalBrandName(
            structureStyle === "problem-solution"
              ? cleanGeneratedText(sanitizePromptText(option.body))
              : stripStructuredScaffolding(cleanGeneratedText(sanitizePromptText(option.body))),
            canonicalBrandName
          ),
          length,
          relevancePrompt
        ),
        cta: appendLinksToCta(
          enforceCanonicalBrandName(cleanGeneratedText(sanitizePromptText(option.cta)), canonicalBrandName),
          normalizedLinks
        ),
        hashtags: normalizeHashtags(option.hashtags),
        image_prompt: enforceCanonicalBrandName(
          cleanGeneratedText(sanitizePromptText(option.image_prompt)),
          canonicalBrandName
        ),
        variant_label: experimentMode
          ? sanitizePromptText(option.variant_label || "Core")
          : undefined,
        test_hypothesis: experimentMode
          ? enforceCanonicalBrandName(
              sanitizePromptText(
                option.test_hypothesis || "This variation should improve engagement quality."
              ),
              canonicalBrandName
            )
          : undefined,
        risk_flags: Array.isArray(option.risk_flags)
          ? option.risk_flags
              .filter((item): item is string => typeof item === "string")
              .map((item) => sanitizePromptText(item))
              .filter(Boolean)
          : [],
        notes: option.notes ? sanitizePromptText(option.notes) : undefined,
      } as GeneratedOption;
    });

    const lowRelevance = !fallbackUsed && normalized.some(
      (option) => scoreRelevanceToPrompt(relevancePrompt, option) < 0.2
    );
    const finalOptions = lowRelevance
      ? Array.from({ length: desiredCount }).map((_, index) =>
          normalizeOption({
            option: options[index] || {},
            fallback: fallbackOptions[index],
            length,
            structureStyle,
            prompt: relevancePrompt,
            experimentMode,
          })
        )
      : normalized;

    if (lowRelevance) {
      fallbackUsed = true;
      fallbackReason = "AI output did not match the requested topic closely enough.";
    }

    const dbCandidates: unknown[] = [];
    try {
      dbCandidates.push(createAdminClient());
    } catch {
      // Service role env may not be available in local/dev. Fall back to user client.
    }
    dbCandidates.push(supabase);

    const primary = finalOptions[0];
    // Full payload (requires migration to have run)
    const postPayloadFull = {
      user_id: user.id,
      prompt: sanitizedPrompt,
      title: primary.headline,
      post_content: buildPostContent(primary),
      status: "draft",
      brand_id: input.brandId,
      brand_kit_id: brandKit?.id ?? null,
      mood_board_id: moodBoard?.id ?? null,
      image_profile_id: input.imageProfileId ?? null,
      product_id: productContext?.id ?? null,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Minimal payload (only columns guaranteed to exist in base schema)
    const postPayloadMinimal = {
      user_id: user.id,
      prompt: sanitizedPrompt,
      title: primary.headline,
      post_content: buildPostContent(primary),
      status: "draft",
    };

    let post: { id: string } | null = null;
    let postInsertError: { message?: string } | null = null;

    for (const dbClient of dbCandidates) {
      const db = dbClient as typeof supabase;
      // Try full payload first
      const { data, error } = await db.from("posts").insert(postPayloadFull).select("id").single();
      if (!error && data && typeof data.id === "string") {
        post = { id: data.id };
        break;
      }
      // If full payload fails (e.g. missing columns), fall back to minimal payload
      const { data: dataMin, error: errorMin } = await db.from("posts").insert(postPayloadMinimal).select("id").single();
      if (!errorMin && dataMin && typeof dataMin.id === "string") {
        post = { id: dataMin.id };
        break;
      }
      postInsertError = errorMin
        ? { message: typeof errorMin.message === "string" ? errorMin.message : undefined }
        : { message: typeof (error as { message?: string } | null)?.message === "string" ? (error as { message?: string }).message : undefined };
    }

    if (!post) {
      return NextResponse.json(
        {
          error: "Failed to create post draft.",
          detail: postInsertError?.message || "Unknown database error",
        },
        { status: 500 }
      );
    }

    const optionsPayload = finalOptions.map((option, index) => ({
      post_id: post.id,
      option_index: index,
      title: option.headline,
      post_content: buildPostContent(option),
      ai_model: model,
      generation_prompt: JSON.stringify({
        prompt: sanitizedPrompt,
        tone,
        framework: input.framework || null,
        length,
        structure_style: structureStyle,
        variant_label: option.variant_label || null,
        test_hypothesis: option.test_hypothesis || null,
        outcome_brief: input.outcomeBrief || null,
        solution_mode: solutionMode,
        experiment_mode: experimentMode,
        experiment_axes: experimentAxes,
        emoji_policy: emojiPolicy,
        links: includeLinks ? normalizedLinks : null,
        evidence_ids: evidenceIds,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
      }),
      created_by: user.id,
    }));

    let optionsSaved = false;
    let optionsError: { message?: string } | null = null;

    for (const dbClient of dbCandidates) {
      const db = dbClient as typeof supabase;
      const { error } = await db.from("post_options").insert(optionsPayload);
      if (!error) {
        optionsSaved = true;
        break;
      }
      optionsError = {
        message: typeof error.message === "string" ? error.message : undefined,
      };
    }

    if (!optionsSaved) {
      return NextResponse.json(
        {
          error: "Failed to save post options.",
          detail: optionsError?.message || "Unknown database error",
        },
        { status: 500 }
      );
    }

    const usedSourceIds = sources.map((source) => source.id);
    if (usedSourceIds.length) {
      await supabase
        .from("content_sources")
        .update({ post_id: post.id })
        .in("id", usedSourceIds)
        .eq("brand_id", input.brandId);
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "post_options_generated",
      entity_type: "post",
      entity_id: post.id,
      metadata: {
        options_count: finalOptions.length,
        model,
        source_ids: usedSourceIds,
        evidence_ids: evidenceIds,
        tone,
        length,
        framework: input.framework || null,
        structure_style: structureStyle,
        solution_mode: solutionMode,
        experiment_mode: experimentMode,
        experiment_axes: experimentAxes,
        outcome_brief: input.outcomeBrief || null,
        product_id: productContext?.id ?? null,
        product_name: productContext?.name ?? null,
        links: includeLinks ? normalizedLinks : null,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
      },
    });

    return NextResponse.json({
      postId: post.id,
      post_id: post.id,
      options: finalOptions,
      fallback: fallbackUsed,
      fallbackReason,
      warning: fallbackUsed
        ? "AI model response was incomplete, so a deterministic fallback template was used for one or more options."
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
