export type PromptTemplate = {
  id: string;
  name: string;
  type: "text" | "image" | "edit";
  template: string;
  notes: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "solution-post",
    name: "Solution Post",
    type: "text",
    template:
      "Audience: {audience}. Problem: {pain}. Solution: {solution}. Proof: {proof}. CTA goal: {cta_goal}. Tone: {tone}. Keep it concise and actionable.",
    notes: "Strong for consulting, SaaS, B2B service positioning.",
  },
  {
    id: "case-study-post",
    name: "Case Study",
    type: "text",
    template:
      "Write a LinkedIn case study post: Before state: {before}. Intervention: {intervention}. Result: {result}. Lesson: {lesson}. End with CTA: {cta_goal}.",
    notes: "Good for trust-building and social proof.",
  },
  {
    id: "hero-image",
    name: "Hero Image",
    type: "image",
    template:
      "Create a clean LinkedIn hero image for {topic}. Composition: {composition}. Palette: {brand_colors}. Mood: {mood}. No text, no logo, no watermark.",
    notes: "Use when text overlays are composed later.",
  },
  {
    id: "brand-edit",
    name: "Brand Edit",
    type: "edit",
    template:
      "Keep all existing composition unchanged except: {change}. Preserve aspect ratio, subject framing, and lighting continuity. Do not add text unless requested.",
    notes: "Reliable for localized image edits.",
  },
];

export function renderPromptTemplate(template: string, values: Record<string, string | undefined>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value && value.trim() ? value.trim() : `[${key}]`;
  });
}
