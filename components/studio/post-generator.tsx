'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  RefreshCw,
  ThumbsUp,
  Copy,
  Download,
  Eye,
  Edit3,
  Save,
  Check,
  Lightbulb,
  BookOpen,
  Hash,
  BarChart3,
  Zap,
  Target,
  MessageSquare,
  Share2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link2,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { runComplianceChecks } from '@/lib/studio/compliance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostGeneratorProps {
  brandId: string;
  brandColors?: string[];
  brandName?: string;
  logoUrl?: string;
  productId?: string | null;
  productName?: string | null;
  analysisProfile?: {
    tone?: string | null;
    postTypes?: string[];
    contentPillars?: string[];
    targetAudience?: string | null;
    businessFocus?: string | null;
    tagline?: string | null;
    website?: string | null;
    brandDescription?: string | null;
    ctaStyle?: string | null;
    visualDensity?: string | null;
  };
  evidenceContext?: Array<{
    id: string;
    title: string;
    type: string;
    summary?: string;
  }>;
  evidenceIds?: string[];
  brandComplianceRules?: {
    doNotUse?: string[];
    styleRules?: string[];
  };
  onPostGenerated: (post: GeneratedPost, postId?: string) => void;
  /** Called when user confirms a post and wants to move to image creation */
  onPostConfirmed?: (post: GeneratedPost) => void;
  /** Pre-fill topic from URL param (e.g. from My Posts → Regenerate) */
  initialTopic?: string;
}

type PostChannel = 'linkedin' | 'facebook' | 'instagram';

interface PostVariant {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
  testHypothesis?: string;
  qualityScore?: number;
  qualityBreakdown?: {
    relevance: number;
    clarity: number;
    cta: number;
    evidence: number;
    readability: number;
  };
  riskFlags?: string[];
  notes?: string;
}

interface GeneratedPost extends PostVariant {
  channelVariants?: Partial<Record<PostChannel, PostVariant>>;
  primaryChannel?: PostChannel;
  selectedChannels?: PostChannel[];
}

interface OutcomeBrief {
  goal: string;
  audience: string;
  painPoint: string;
  solution: string;
  offer: string;
  proof: string;
  kpiTarget: string;
}

const DOCUMENT_LED_PROMPT_REGEX =
  /\b(pdf|document|documents|file|files|brochure|catalog|catalogue|datasheet|data sheet|spec sheet|manual|deck|summary|summar(?:y|ize|ise)|provided|attached|uploaded)\b/i;

// ---------------------------------------------------------------------------
// Content Frameworks — proven LinkedIn post structures
// ---------------------------------------------------------------------------

const CONTENT_FRAMEWORKS = [
  {
    id: 'aida',
    name: 'AIDA',
    label: '🎯 AIDA',
    description: 'Attention → Interest → Desire → Action',
    template: 'Grab attention with a bold statement. Build interest with details. Create desire by showing benefits. End with a clear call to action.',
    example: 'Use this for product launches, announcements, offers',
  },
  {
    id: 'pas',
    name: 'PAS',
    label: '🔥 PAS',
    description: 'Problem → Agitate → Solution',
    template: 'Start with a relatable problem. Agitate by showing the pain of not solving it. Present your solution.',
    example: 'Great for service offers, case studies, before/after',
  },
  {
    id: 'story',
    name: 'Story',
    label: '📖 Story',
    description: 'Personal narrative with takeaway',
    template: 'Share a personal experience or journey. Include specific details, emotions, and a turning point. End with a lesson others can apply.',
    example: 'Personal brand building, authenticity posts',
  },
  {
    id: 'listicle',
    name: 'Listicle',
    label: '📋 Listicle',
    description: 'Numbered list of insights',
    template: 'Create a numbered list of tips, mistakes, lessons, or tools. Each point should be concise and actionable.',
    example: 'Tips, mistakes to avoid, tools lists, how-tos',
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    label: '⚡ Contrarian',
    description: 'Challenge conventional wisdom',
    template: 'Start with a bold, unexpected take. Back it up with evidence or experience. Invite discussion.',
    example: 'Hot takes, thought leadership, debate starters',
  },
  {
    id: 'beforeafter',
    name: 'Before/After',
    label: '🔄 Before & After',
    description: 'Transformation showcase',
    template: 'Show the before state (the struggle). Then reveal the after state (the result). Explain what changed.',
    example: 'Case studies, results, transformations',
  },
  {
    id: 'howto',
    name: 'How-To',
    label: '🛠 How-To',
    description: 'Step-by-step guide',
    template: 'Teach something practical in 3-7 clear steps. Each step should be actionable and specific.',
    example: 'Tutorials, processes, frameworks',
  },
  {
    id: 'datainsight',
    name: 'Data Insight',
    label: '📊 Data Insight',
    description: 'Lead with a surprising stat',
    template: 'Open with a compelling statistic or data point. Provide context and analysis. Share actionable takeaway.',
    example: 'Industry insights, research findings, benchmarks',
  },
  // --- Product-company focused frameworks ---
  {
    id: 'product-spotlight',
    name: 'Product Spotlight',
    label: '🔦 Product Spotlight',
    description: 'Showcase a product with benefits first',
    template: 'Lead with the #1 benefit your customer cares about. Describe what the product does in plain language. Mention 2-3 key features that deliver that benefit. End with a clear next step (demo, link, DM).',
    example: 'Product launches, hero product promotion, catalogue highlight',
  },
  {
    id: 'customer-win',
    name: 'Customer Win',
    label: '🏅 Customer Win',
    description: 'Case study — problem → result → proof',
    template: 'Describe the customer\'s situation and pain point. Explain how your product/service solved it. Share a specific, quantified result. Close with an invitation for similar readers to reach out.',
    example: 'Case studies, testimonials, success stories',
  },
  {
    id: 'feature-drop',
    name: 'Feature Drop',
    label: '✨ Feature Drop',
    description: 'New feature or product announcement',
    template: 'Open with the "what\'s new" in one sentence. Explain the problem it solves and who it helps. Show how it works in 2-3 bullet points. End with a CTA to try or learn more.',
    example: 'New product launches, updates, version releases',
  },
  {
    id: 'compare',
    name: 'Old Way vs New Way',
    label: '⚖️ Old vs New',
    description: 'Show transformation with your product',
    template: 'Describe the old, painful way your audience currently does something. Contrast it with the new, better way using your product. Quantify the difference if possible. CTA to make the switch.',
    example: 'Competitive positioning, category creation, upgrade campaigns',
  },
];

// ---------------------------------------------------------------------------
// Hook Lines — proven opening lines for LinkedIn
// ---------------------------------------------------------------------------

const HOOK_LINES = [
  { category: 'curiosity', hook: 'I made a $____ mistake so you don\'t have to.', emoji: '💸' },
  { category: 'curiosity', hook: 'Here\'s what nobody tells you about ____.', emoji: '🤫' },
  { category: 'curiosity', hook: 'I spent 3 years figuring this out. Here it is in 30 seconds:', emoji: '⏱️' },
  { category: 'contrarian', hook: 'Unpopular opinion: ____ is overrated.', emoji: '⚡' },
  { category: 'contrarian', hook: 'Stop doing ____. Do this instead:', emoji: '🛑' },
  { category: 'contrarian', hook: 'The worst advice I ever got: "____"', emoji: '💀' },
  { category: 'story', hook: 'Two years ago I was ____. Today I\'m ____.', emoji: '📖' },
  { category: 'story', hook: 'My boss pulled me aside and said something I\'ll never forget:', emoji: '💬' },
  { category: 'story', hook: 'I almost gave up on ____. Here\'s what changed everything:', emoji: '🔄' },
  { category: 'value', hook: '____ tools that replaced my $____ stack:', emoji: '🛠️' },
  { category: 'value', hook: 'The 5-step framework I use to ____:', emoji: '📋' },
  { category: 'value', hook: 'I\'ve ____ for 10 years. Here are 7 lessons:', emoji: '🎓' },
  { category: 'authority', hook: 'After ____ clients and $____ in results, here\'s the pattern:', emoji: '📊' },
  { category: 'authority', hook: 'I\'ve reviewed 500+ ____. Here are the top 3:', emoji: '🏆' },
  { category: 'emotional', hook: 'The hardest part of ____ that nobody talks about:', emoji: '❤️' },
  { category: 'emotional', hook: 'This changed how I think about ____ forever:', emoji: '🧠' },
  { category: 'question', hook: 'Why do most people ____ when they could ____?', emoji: '🤔' },
  { category: 'question', hook: 'What would you do if you knew you couldn\'t fail?', emoji: '🚀' },
];

// ---------------------------------------------------------------------------
// Tone Presets
// ---------------------------------------------------------------------------

const TONE_PRESETS = [
  { id: 'professional', label: '💼 Professional', description: 'Clear, authoritative, polished' },
  { id: 'conversational', label: '💬 Conversational', description: 'Friendly, relatable, warm' },
  { id: 'inspiring', label: '🌟 Inspiring', description: 'Motivational, uplifting, energetic' },
  { id: 'provocative', label: '⚡ Provocative', description: 'Bold, challenging, thought-provoking' },
  { id: 'educational', label: '🎓 Educational', description: 'Informative, structured, practical' },
  { id: 'storytelling', label: '📖 Storytelling', description: 'Narrative, personal, engaging' },
];

// ---------------------------------------------------------------------------
// Quick Post Types – one-click presets for common product company posts
// ---------------------------------------------------------------------------

const QUICK_POST_TYPES = [
  {
    id: 'product-launch',
    label: '🚀 Product Launch',
    description: 'Announce a new product or feature',
    tone: 'inspiring',
    framework: 'feature-drop',
    style: 'natural',
    length: 'standard',
  },
  {
    id: 'customer-story',
    label: '🏅 Customer Win',
    description: 'Share a client success story',
    tone: 'conversational',
    framework: 'customer-win',
    style: 'story-led',
    length: 'standard',
  },
  {
    id: 'spotlight',
    label: '🔦 Product Spotlight',
    description: 'Highlight a product and its benefits',
    tone: 'professional',
    framework: 'product-spotlight',
    style: 'problem-solution',
    length: 'standard',
  },
  {
    id: 'how-to',
    label: '🛠 How-To Guide',
    description: 'Teach your audience something useful',
    tone: 'educational',
    framework: 'howto',
    style: 'how-to',
    length: 'long',
  },
  {
    id: 'compare',
    label: '⚖️ Old vs New',
    description: 'Contrast old way with your solution',
    tone: 'provocative',
    framework: 'compare',
    style: 'natural',
    length: 'short',
  },
  {
    id: 'brand-story',
    label: '📖 Brand Story',
    description: 'Why you built it — origin narrative',
    tone: 'storytelling',
    framework: 'story',
    style: 'story-led',
    length: 'long',
  },
];

const TONE_DEFAULTS: Record<string, { emojiMin: number; emojiMax: number }> = {
  professional: { emojiMin: 1, emojiMax: 4 },
  conversational: { emojiMin: 3, emojiMax: 8 },
  inspiring: { emojiMin: 4, emojiMax: 10 },
  provocative: { emojiMin: 1, emojiMax: 5 },
  educational: { emojiMin: 2, emojiMax: 6 },
  storytelling: { emojiMin: 2, emojiMax: 6 },
};

const LENGTH_PRESETS = [
  { id: 'short', label: 'Short', hint: '120-170 words' },
  { id: 'standard', label: 'Standard', hint: '170-230 words' },
  { id: 'long', label: 'Long', hint: '230-320 words' },
] as const;

const POST_STYLE_PRESETS = [
  {
    id: 'natural',
    label: 'Natural',
    description: 'Normal LinkedIn flow without rigid challenge/solution labels',
  },
  {
    id: 'problem-solution',
    label: 'Problem -> Solution',
    description: 'Structured pain, mechanism, proof, CTA format',
  },
  {
    id: 'story-led',
    label: 'Story-led',
    description: 'Narrative first, then lessons and CTA',
  },
  {
    id: 'how-to',
    label: 'How-To',
    description: 'Step-by-step tactical format',
  },
] as const;

type PostStructureStyle = (typeof POST_STYLE_PRESETS)[number]['id'];

function normalizeAnalysisToken(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function mapAnalysisToneToPostTone(value: string | null | undefined): string | null {
  switch (normalizeAnalysisToken(value)) {
    case 'casual':
    case 'conversational':
      return 'conversational';
    case 'thought-leader':
      return 'educational';
    case 'professional-founder':
      return 'storytelling';
    case 'corporate':
    case 'professional':
    case 'sales-oriented':
      return 'professional';
    default:
      return null;
  }
}

function mapAnalysisPostTypesToStyle(postTypes: string[] | null | undefined): PostStructureStyle | null {
  const normalized = new Set((postTypes || []).map((item) => normalizeAnalysisToken(item)));

  if (normalized.has('personal')) return 'story-led';
  if (normalized.has('product')) return 'problem-solution';
  if (normalized.has('industry-insights')) return 'how-to';
  if (normalized.has('thought-leadership') || normalized.has('hiring') || normalized.has('announcement')) {
    return 'natural';
  }

  return null;
}

function mapAnalysisPostTypesToFramework(postTypes: string[] | null | undefined): string | null {
  const normalized = new Set((postTypes || []).map((item) => normalizeAnalysisToken(item)));

  if (normalized.has('personal')) return 'story';
  if (normalized.has('product')) return 'product-spotlight';
  if (normalized.has('announcement')) return 'feature-drop';
  if (normalized.has('industry-insights')) return 'datainsight';
  if (normalized.has('thought-leadership')) return 'thought-leadership';

  return null;
}

const CHANNEL_OPTIONS: Array<{
  id: PostChannel;
  label: string;
  shortLabel: string;
  hint: string;
}> = [
    {
      id: 'linkedin',
      label: 'LinkedIn',
      shortLabel: 'LI',
      hint: 'Thought-leadership and professional depth',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      shortLabel: 'FB',
      hint: 'Conversational and community-friendly copy',
    },
    {
      id: 'instagram',
      label: 'Instagram',
      shortLabel: 'IG',
      hint: 'Visual-first caption with tighter phrasing',
    },
  ];

const CHANNEL_PROMPT_HINTS: Record<PostChannel, string> = {
  linkedin:
    'Optimize for LinkedIn feed readers: strong hook, insight depth, and professional CTA.',
  facebook:
    'Optimize for Facebook feed readers: conversational tone, clear value, and community CTA.',
  instagram:
    'Optimize for Instagram caption readers: concise storytelling, scannable lines, and hashtag-friendly ending.',
};

const CHANNEL_QUALITY_GUIDANCE: Record<
  PostChannel,
  {
    label: string;
    minChars: number;
    maxChars: number;
    hardMaxChars: number;
    hashtagMin: number;
    hashtagMax: number;
    emojiMin: number;
    emojiMax: number;
  }
> = {
  linkedin: {
    label: 'LinkedIn',
    minChars: 150,
    maxChars: 1200,
    hardMaxChars: 2000,
    hashtagMin: 3,
    hashtagMax: 5,
    emojiMin: 0,
    emojiMax: 3,
  },
  facebook: {
    label: 'Facebook',
    minChars: 80,
    maxChars: 700,
    hardMaxChars: 1500,
    hashtagMin: 1,
    hashtagMax: 4,
    emojiMin: 0,
    emojiMax: 4,
  },
  instagram: {
    label: 'Instagram',
    minChars: 60,
    maxChars: 900,
    hardMaxChars: 1800,
    hashtagMin: 5,
    hashtagMax: 12,
    emojiMin: 1,
    emojiMax: 6,
  },
};

// ---------------------------------------------------------------------------
// Smart Hashtag Groups
// ---------------------------------------------------------------------------

const HASHTAG_GROUPS = [
  { label: '🚀 Startup', tags: ['startup', 'entrepreneurship', 'founders', 'innovation', 'venturecapital'] },
  { label: '💼 Business', tags: ['business', 'leadership', 'management', 'strategy', 'growth'] },
  { label: '📱 Tech', tags: ['technology', 'AI', 'machinelearning', 'software', 'digitaltransformation'] },
  { label: '📈 Marketing', tags: ['marketing', 'digitalmarketing', 'contentmarketing', 'branding', 'socialmedia'] },
  { label: '🎯 Sales', tags: ['sales', 'B2B', 'revenue', 'pipeline', 'closingdeals'] },
  { label: '👤 Personal Brand', tags: ['personalbrand', 'careerdevelopment', 'networking', 'linkedintips', 'thoughtleadership'] },
  { label: '💡 Productivity', tags: ['productivity', 'timemanagement', 'remotework', 'efficiency', 'worklifebalance'] },
  { label: '🌱 Sustainability', tags: ['sustainability', 'ESG', 'greenbusiness', 'climateaction', 'socialimpact'] },
];

const PROMPT_COPILOT_PRESETS = [
  {
    id: 'solution',
    label: 'Solution Brief',
    template:
      'Audience: {audience}. Pain: {pain}. Solution: {solution}. Proof: {proof}. CTA objective: {cta}.',
  },
  {
    id: 'case-study',
    label: 'Case Study',
    template:
      'Before: {before}. Intervention: {intervention}. Result: {result}. Lesson: {lesson}. Ask reader to: {cta}.',
  },
  {
    id: 'thought-leadership',
    label: 'Thought Leadership',
    template:
      'Opinion: {opinion}. Why most teams miss it: {context}. Framework: {framework}. Practical next step: {cta}.',
  },
];

// ---------------------------------------------------------------------------
// Post Quality Scorer
// ---------------------------------------------------------------------------

function scorePost(post: PostVariant, channel: PostChannel = 'linkedin'): {
  overall: number;
  breakdown: { label: string; score: number; tip: string; icon: string }[];
} {
  const guidance = CHANNEL_QUALITY_GUIDANCE[channel];
  const breakdown: { label: string; score: number; tip: string; icon: string }[] = [];

  // 1. Hook strength (headline)
  const headlineLen = (post.headline || '').length;
  const hasHook = /[?!:]|\d|mistake|secret|stop|never|always|how|why/i.test(post.headline || '');
  const hookScore = Math.min(
    100,
    (headlineLen > 10 ? 30 : 10) + (headlineLen < 80 ? 30 : 15) + (hasHook ? 40 : 10)
  );
  breakdown.push({
    label: 'Hook Strength',
    score: hookScore,
    tip: hookScore < 70 ? 'Use numbers, questions, or power words to grab attention' : 'Great hook!',
    icon: 'H',
  });

  // 2. Body length (platform-specific sweet spot)
  const bodyLen = (post.body || '').length;
  let lenScore = 0;
  if (bodyLen < Math.round(guidance.minChars * 0.45)) lenScore = 20;
  else if (bodyLen < guidance.minChars) lenScore = 55;
  else if (bodyLen <= guidance.maxChars) lenScore = 100;
  else if (bodyLen <= guidance.hardMaxChars) lenScore = 78;
  else lenScore = 60;
  breakdown.push({
    label: 'Ideal Length',
    score: lenScore,
    tip:
      bodyLen < guidance.minChars
        ? `${guidance.label}: aim for ${guidance.minChars}-${guidance.maxChars} characters.`
        : bodyLen > guidance.hardMaxChars
          ? `${guidance.label}: trim this caption for better completion rate.`
          : 'Perfect length!',
    icon: 'L',
  });

  // 3. Readability (short sentences, line breaks, whitespace)
  const sentences = (post.body || '').split(/[.!?]+/).filter(Boolean);
  const avgSentenceLen = sentences.length ? (post.body || '').length / sentences.length : 999;
  const lineBreaks = (post.body || '').split('\n\n').length - 1;
  const readScore = Math.min(
    100,
    (avgSentenceLen < 120 ? 40 : 15) + (lineBreaks >= 2 ? 40 : lineBreaks * 15) + (sentences.length >= 3 ? 20 : 10)
  );
  breakdown.push({
    label: 'Readability',
    score: readScore,
    tip: readScore < 70 ? 'Add line breaks and keep sentences short for easy scanning' : 'Easy to read!',
    icon: 'R',
  });

  // 4. CTA presence & quality
  const hasCta = (post.cta || '').length > 3;
  const ctaHasAction = /comment|share|follow|like|click|visit|sign|join|tell|drop|dm|message/i.test(
    post.cta || ''
  );
  const ctaScore = hasCta ? (ctaHasAction ? 100 : 65) : 20;
  breakdown.push({
    label: 'Call to Action',
    score: ctaScore,
    tip:
      !hasCta
        ? 'Add a CTA to make your next step explicit.'
        : !ctaHasAction
          ? 'Use action verbs like "Comment", "Save", "Share", or "Message".'
          : 'Strong CTA!',
    icon: 'C',
  });

  // 5. Hashtags (platform-specific guidance)
  const tagCount = (post.hashtags || []).length;
  let tagScore = 0;
  if (tagCount === 0) tagScore = 20;
  else if (tagCount >= guidance.hashtagMin && tagCount <= guidance.hashtagMax) tagScore = 100;
  else if (tagCount >= 1 && tagCount <= guidance.hashtagMax + 3) tagScore = 72;
  else tagScore = 40;
  breakdown.push({
    label: 'Hashtags',
    score: tagScore,
    tip:
      tagCount === 0
        ? `${guidance.label}: add ${guidance.hashtagMin}-${guidance.hashtagMax} relevant hashtags.`
        : tagCount > guidance.hashtagMax
          ? `${guidance.label}: reduce hashtag count for a cleaner post.`
          : 'Good hashtag count!',
    icon: '#',
  });

  // 6. Emoji usage
  const emojiCount =
    ((post.body || '') + (post.headline || '')).match(
      /[\u{1F600}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6C5}]/gu
    )?.length || 0;
  const emojiScore =
    emojiCount >= guidance.emojiMin && emojiCount <= guidance.emojiMax
      ? 100
      : emojiCount === 0 && guidance.emojiMin === 0
        ? 82
        : emojiCount > guidance.emojiMax
          ? 60
          : 65;
  breakdown.push({
    label: 'Visual Appeal',
    score: emojiScore,
    tip:
      emojiCount < guidance.emojiMin
        ? `${guidance.label}: add ${guidance.emojiMin}-${guidance.emojiMax} emojis for visual rhythm.`
        : emojiCount > guidance.emojiMax
          ? `${guidance.label}: too many emojis can reduce clarity.`
          : 'Nice visual balance!',
    icon: '*',
  });

  const overall = Math.round(breakdown.reduce((sum, b) => sum + b.score, 0) / breakdown.length);

  return { overall, breakdown };
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-400';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-400';
}

function getScoreLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Weak';
}

function sanitizeTemplatePlaceholders(input: string) {
  const cleaned = input
    .replace(/\[(audience|pain|solution|proof|cta|before|intervention|result|lesson|opinion|context|framework)\]/gi, '')
    .replace(
      /\b(audience|pain|solution|proof|cta(?:\s*objective|\s*action)?|goal|kpi(?:\s*target)?|before|intervention|result|lesson|opinion|context|framework|practical next step)\s*:\s*/gi,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .replace(/:\s*(,|\.)/g, ': ')
    .trim();

  return cleaned;
}

function normalizeOptionalUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return raw;
  }
}

function trimToWordCount(value: string, maxWords: number): string {
  const words = value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length <= maxWords) return value.trim();
  return words.slice(0, maxWords).join(' ').trim();
}

function normalizeHashtagList(tags: string[], maxCount: number): string[] {
  const cleaned = tags
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, maxCount);
}

function adaptPostForChannel(post: PostVariant, channel: PostChannel): PostVariant {
  const base: PostVariant = {
    ...post,
    headline: (post.headline || '').trim(),
    body: (post.body || '').trim(),
    cta: (post.cta || '').trim(),
    hashtags: normalizeHashtagList(post.hashtags || [], 8),
  };

  if (channel === 'linkedin') {
    return {
      ...base,
      body: trimToWordCount(base.body, 320),
      hashtags: normalizeHashtagList(base.hashtags, 6),
    };
  }

  if (channel === 'facebook') {
    return {
      ...base,
      body: trimToWordCount(base.body, 180),
      cta:
        base.cta ||
        'Tell us what you think in the comments.',
      hashtags: normalizeHashtagList(base.hashtags, 4),
    };
  }

  return {
    ...base,
    body: trimToWordCount(base.body, 110),
    cta: base.cta || 'Save this post and share it with your team.',
    hashtags: normalizeHashtagList(base.hashtags, 8),
  };
}

function getPostVariantForChannel(post: GeneratedPost, channel: PostChannel): PostVariant {
  const saved = post.channelVariants?.[channel];
  if (saved) {
    return {
      headline: saved.headline || '',
      body: saved.body || '',
      cta: saved.cta || '',
      hashtags: Array.isArray(saved.hashtags) ? saved.hashtags : [],
      imageUrl: saved.imageUrl || post.imageUrl,
      imagePrompt: saved.imagePrompt || post.imagePrompt,
      variantLabel: saved.variantLabel || post.variantLabel,
    };
  }
  return adaptPostForChannel(post, channel);
}

type ApiGeneratedOption = {
  headline: string;
  body: string;
  cta: string;
  hashtags?: string[];
  image_prompt?: string;
  variant_label?: string;
  test_hypothesis?: string;
  quality_score?: number;
  quality_breakdown?: {
    relevance?: number;
    clarity?: number;
    cta?: number;
    evidence?: number;
    readability?: number;
  };
  risk_flags?: string[];
  notes?: string;
};

function cleanPostTextForDisplay(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1: $2')
    .replace(/<((?:https?:\/\/)[^>]+)>/gi, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*/g, '')
    .trim();
}

function mapApiOptionToPost(opt: ApiGeneratedOption): GeneratedPost {
  return {
    headline: cleanPostTextForDisplay(opt.headline),
    body: cleanPostTextForDisplay(opt.body),
    cta: cleanPostTextForDisplay(opt.cta),
    hashtags: (opt.hashtags || []).map((tag) => tag.replace(/^#/, '')),
    imagePrompt: cleanPostTextForDisplay(opt.image_prompt || opt.headline),
    variantLabel: cleanPostTextForDisplay(opt.variant_label),
    testHypothesis: cleanPostTextForDisplay(opt.test_hypothesis),
    qualityScore: typeof opt.quality_score === 'number' ? opt.quality_score : undefined,
    qualityBreakdown: opt.quality_breakdown
      ? {
        relevance: Number(opt.quality_breakdown.relevance || 0),
        clarity: Number(opt.quality_breakdown.clarity || 0),
        cta: Number(opt.quality_breakdown.cta || 0),
        evidence: Number(opt.quality_breakdown.evidence || 0),
        readability: Number(opt.quality_breakdown.readability || 0),
      }
      : undefined,
    riskFlags: Array.isArray(opt.risk_flags)
      ? opt.risk_flags.map((item) => cleanPostTextForDisplay(item)).filter(Boolean)
      : undefined,
    notes: cleanPostTextForDisplay(opt.notes),
  };
}

function scoreForSelection(post: GeneratedPost) {
  return typeof post.qualityScore === 'number'
    ? post.qualityScore
    : scorePost(post, post.primaryChannel || 'linkedin').overall;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
interface PostHistoryEntry {
  id: string;
  timestamp: string; // ISO
  topic: string;
  posts: GeneratedPost[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PostGenerator({
  brandId,
  brandColors = ['#0A66C2'],
  brandName = 'Your Brand',
  logoUrl,
  productId,
  productName,
  analysisProfile,
  evidenceContext = [],
  evidenceIds = [],
  brandComplianceRules,
  onPostGenerated,
  onPostConfirmed,
  initialTopic,
}: PostGeneratorProps) {
  const [topic, setTopic] = useState(initialTopic || '');
  const [generating, setGenerating] = useState(false);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [previewMode, setPreviewMode] = useState<'post' | 'edit' | 'image' | 'score'>('post');
  const [generatingComplete, setGeneratingComplete] = useState(false);
  const [postPreviewChannel, setPostPreviewChannel] = useState<PostChannel>('linkedin');
  const [selectedOutputChannels, setSelectedOutputChannels] = useState<PostChannel[]>([
    'linkedin',
    'facebook',
    'instagram',
  ]);
  const [primaryChannel, setPrimaryChannel] = useState<PostChannel>('linkedin');
  const [channelAdaptEnabled, setChannelAdaptEnabled] = useState(true);

  // Content framework & tone
  const [selectedFramework, setSelectedFramework] = useState<string>('');
  const [selectedTone, setSelectedTone] = useState<string>('professional');
  const [postLength, setPostLength] = useState<'short' | 'standard' | 'long'>('long');
  const [postStyle, setPostStyle] = useState<PostStructureStyle>('natural');
  const [selectedQuickType, setSelectedQuickType] = useState<string>('');
  const [showHooks, setShowHooks] = useState(false);
  const [showHashtags, setShowHashtags] = useState(false);
  const [showOutcomeBrief, setShowOutcomeBrief] = useState(false);
  const [experimentMode, setExperimentMode] = useState(true);
  const [experimentAxes, setExperimentAxes] = useState<string[]>(['hook', 'cta']);
  const [emojiRange, setEmojiRange] = useState<{ min: number; max: number }>({ min: 1, max: 4 });
  const [selectedPromptPreset, setSelectedPromptPreset] = useState<string>('');
  const [generatingCampaign, setGeneratingCampaign] = useState(false);
  const [campaignSummary, setCampaignSummary] = useState<string>('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [chatbotLink, setChatbotLink] = useState('');
  const [trackedUrl, setTrackedUrl] = useState('');
  const [buildingUtm, setBuildingUtm] = useState(false);
  const [outcomeBrief, setOutcomeBrief] = useState<OutcomeBrief>({
    goal: '',
    audience: '',
    painPoint: '',
    solution: '',
    offer: '',
    proof: '',
    kpiTarget: '',
  });

  // History of generated post batches (session-scoped)
  const [postHistory, setPostHistory] = useState<PostHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Auto-save draft ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedAnalysisDefaultsRef = useRef({
    tone: false,
    style: false,
    framework: false,
    website: false,
  });
  const analyzedToneDefault = useMemo(
    () => mapAnalysisToneToPostTone(analysisProfile?.tone),
    [analysisProfile?.tone]
  );
  const analyzedStyleDefault = useMemo(
    () => mapAnalysisPostTypesToStyle(analysisProfile?.postTypes),
    [analysisProfile?.postTypes]
  );
  const analyzedFrameworkDefault = useMemo(
    () => mapAnalysisPostTypesToFramework(analysisProfile?.postTypes),
    [analysisProfile?.postTypes]
  );
  const analyzedWebsiteDefault = useMemo(
    () => normalizeOptionalUrl(analysisProfile?.website || ''),
    [analysisProfile?.website]
  );

  const buildPostWithChannelVariants = useCallback(
    (post: GeneratedPost): GeneratedPost => {
      const channels = channelAdaptEnabled
        ? Array.from(
          new Set<PostChannel>([
            ...(selectedOutputChannels.length > 0
              ? selectedOutputChannels
              : [primaryChannel]),
            primaryChannel,
          ])
        )
        : [primaryChannel];

      const variants: Partial<Record<PostChannel, PostVariant>> = {};
      for (const channel of channels) {
        const existing = post.channelVariants?.[channel];
        const source = existing
          ? {
            ...post,
            ...existing,
            hashtags: Array.isArray(existing.hashtags)
              ? existing.hashtags
              : post.hashtags,
            imageUrl: existing.imageUrl || post.imageUrl,
            imagePrompt: existing.imagePrompt || post.imagePrompt,
          }
          : post;
        variants[channel] = adaptPostForChannel(source, channel);
      }

      return {
        ...post,
        channelVariants: variants,
        primaryChannel,
        selectedChannels: channels,
      };
    },
    [channelAdaptEnabled, primaryChannel, selectedOutputChannels]
  );

  // Editable fields
  const [editHeadline, setEditHeadline] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCta, setEditCta] = useState('');
  const [editHashtags, setEditHashtags] = useState('');

  const activePreviewPost = useMemo(() => {
    if (!selectedPost) return null;
    return getPostVariantForChannel(selectedPost, postPreviewChannel);
  }, [selectedPost, postPreviewChannel]);

  // Score for selected post
  const postScore = useMemo(() => {
    if (!activePreviewPost) return null;
    return scorePost(activePreviewPost, postPreviewChannel);
  }, [activePreviewPost, postPreviewChannel]);

  const completedOutcomeFields = useMemo(
    () =>
      [
        outcomeBrief.goal,
        outcomeBrief.audience,
        outcomeBrief.painPoint,
        outcomeBrief.solution,
        outcomeBrief.offer,
        outcomeBrief.proof,
        outcomeBrief.kpiTarget,
      ].filter((item) => item.trim()).length,
    [outcomeBrief]
  );

  const activeToneLabel = useMemo(
    () => TONE_PRESETS.find((tone) => tone.id === selectedTone)?.label || 'Professional',
    [selectedTone]
  );

  const activeFrameworkLabel = useMemo(
    () => CONTENT_FRAMEWORKS.find((fw) => fw.id === selectedFramework)?.name || 'None',
    [selectedFramework]
  );

  const previewChannelLabel = useMemo(
    () => CHANNEL_OPTIONS.find((item) => item.id === postPreviewChannel)?.label || 'LinkedIn',
    [postPreviewChannel]
  );

  const previewGuidance = useMemo(
    () => CHANNEL_QUALITY_GUIDANCE[postPreviewChannel],
    [postPreviewChannel]
  );

  const evidenceBrief = useMemo(() => {
    if (!Array.isArray(evidenceContext) || evidenceContext.length === 0) return '';
    return evidenceContext
      .slice(0, 8)
      .map((item, index) => {
        const summary = typeof item.summary === 'string' && item.summary.trim()
          ? item.summary.trim()
          : item.title;
        return `${index + 1}. (${item.type}) ${summary}`;
      })
      .join('\n');
  }, [evidenceContext]);

  const visibleEvidenceSources = useMemo(
    () =>
      evidenceContext.slice(0, 4).map((item) => ({
        ...item,
        typeLabel: item.type.replace(/[_-]+/g, ' ').trim() || 'source',
        displaySummary:
          typeof item.summary === 'string' && item.summary.trim()
            ? item.summary.trim()
            : `${item.title} will still be passed into the prompt as a grounding source.`,
      })),
    [evidenceContext]
  );

  const hiddenEvidenceCount = Math.max(0, evidenceContext.length - visibleEvidenceSources.length);

  const complianceChecks = useMemo(() => {
    if (!activePreviewPost) return [];
    return runComplianceChecks({
      content: [activePreviewPost.headline, activePreviewPost.body, activePreviewPost.cta]
        .filter(Boolean)
        .join('\n\n'),
      hashtags: activePreviewPost.hashtags || [],
      doNotUse: brandComplianceRules?.doNotUse || [],
      toneGuidelines: brandComplianceRules?.styleRules || [],
    });
  }, [activePreviewPost, brandComplianceRules]);

  const complianceSummary = useMemo(() => {
    const fails = complianceChecks.filter((check) => check.status === 'fail').length;
    const warns = complianceChecks.filter((check) => check.status === 'warn').length;
    if (fails > 0) return { label: 'Brand compliance: fail', tone: 'text-red-600 border-red-200 bg-red-50' };
    if (warns > 0) return { label: 'Brand compliance: warning', tone: 'text-amber-700 border-amber-200 bg-amber-50' };
    if (complianceChecks.length > 0) return { label: 'Brand compliance: pass', tone: 'text-emerald-700 border-emerald-200 bg-emerald-50' };
    return { label: 'Brand compliance: unavailable', tone: 'text-slate-600 border-slate-200 bg-slate-50' };
  }, [complianceChecks]);

  useEffect(() => {
    const defaults = TONE_DEFAULTS[selectedTone];
    if (!defaults) return;
    setEmojiRange({ min: defaults.emojiMin, max: defaults.emojiMax });
  }, [selectedTone]);

  useEffect(() => {
    appliedAnalysisDefaultsRef.current = {
      tone: false,
      style: false,
      framework: false,
      website: false,
    };
  }, [brandId]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.tone) return;
    if (selectedTone !== 'professional') {
      appliedAnalysisDefaultsRef.current.tone = true;
      return;
    }
    if (!analyzedToneDefault) return;
    setSelectedTone(analyzedToneDefault);
    appliedAnalysisDefaultsRef.current.tone = true;
  }, [analyzedToneDefault, selectedTone]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.style) return;
    if (postStyle !== 'natural') {
      appliedAnalysisDefaultsRef.current.style = true;
      return;
    }
    if (!analyzedStyleDefault) return;
    setPostStyle(analyzedStyleDefault);
    appliedAnalysisDefaultsRef.current.style = true;
  }, [analyzedStyleDefault, postStyle]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.framework) return;
    if (selectedFramework) {
      appliedAnalysisDefaultsRef.current.framework = true;
      return;
    }
    if (!analyzedFrameworkDefault) return;
    setSelectedFramework(analyzedFrameworkDefault);
    appliedAnalysisDefaultsRef.current.framework = true;
  }, [analyzedFrameworkDefault, selectedFramework]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.website) return;
    if (websiteLink.trim()) {
      appliedAnalysisDefaultsRef.current.website = true;
      return;
    }
    if (!analyzedWebsiteDefault) return;
    setWebsiteLink(analyzedWebsiteDefault);
    appliedAnalysisDefaultsRef.current.website = true;
  }, [analyzedWebsiteDefault, websiteLink]);

  useEffect(() => {
    if (!selectedOutputChannels.includes(primaryChannel)) {
      setSelectedOutputChannels((prev) =>
        Array.from(new Set<PostChannel>([...prev, primaryChannel]))
      );
    }
  }, [primaryChannel, selectedOutputChannels]);

  useEffect(() => {
    if (!selectedOutputChannels.includes(postPreviewChannel)) {
      setPostPreviewChannel(selectedOutputChannels[0] || primaryChannel || 'linkedin');
    }
  }, [selectedOutputChannels, postPreviewChannel, primaryChannel]);

  useEffect(() => {
    if (generatedPosts.length === 0) return;
    setGeneratedPosts((prev) => prev.map((post) => buildPostWithChannelVariants(post)));
    setSelectedPost((prev) =>
      prev ? buildPostWithChannelVariants(prev) : prev
    );
  }, [buildPostWithChannelVariants, generatedPosts.length]);

  // ─── Auto-save draft to localStorage (debounced 800ms) ───
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!brandId) return;
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          `voxa_draft_${brandId}`,
          JSON.stringify({ topic, tone: selectedTone, style: postStyle, length: postLength, emojiMin: emojiRange.min, emojiMax: emojiRange.max, framework: selectedFramework })
        );
      } catch { /* storage quota exceeded – ignore */ }
    }, 800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [topic, selectedTone, postStyle, postLength, emojiRange.min, emojiRange.max, selectedFramework, brandId]);

  // ─── Restore draft from localStorage on mount / brandId change ───
  useEffect(() => {
    if (!brandId) return;
    try {
      const saved = localStorage.getItem(`voxa_draft_${brandId}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { topic?: string; tone?: string; style?: string; length?: string; emojiMin?: number; emojiMax?: number; framework?: string };
      if (parsed.topic && !initialTopic) setTopic(parsed.topic);
      if (parsed.tone) setSelectedTone(parsed.tone);
      if (parsed.style) setPostStyle(parsed.style as typeof postStyle);
      if (parsed.length) setPostLength(parsed.length as typeof postLength);
      if (typeof parsed.emojiMin === 'number' && typeof parsed.emojiMax === 'number') {
        setEmojiRange({ min: parsed.emojiMin, max: parsed.emojiMax });
      }
      if (parsed.framework) setSelectedFramework(parsed.framework);
    } catch { /* corrupted data – ignore */ }
  // Run once on mount (brandId change resets the form which is intentional)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // ─── Cmd/Ctrl+Enter to generate ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !generating && topic.trim().length >= 3) {
        e.preventDefault();
        void generatePosts();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // generatePosts is recreated on every render; using topic + generating as deps is sufficient
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, topic]);

  const startEditing = useCallback(
    (post: GeneratedPost, channel: PostChannel = postPreviewChannel) => {
      const target = getPostVariantForChannel(post, channel);
      setEditHeadline(target.headline);
      setEditBody(target.body);
      setEditCta(target.cta);
      setEditHashtags((target.hashtags || []).join(', '));
      setPreviewMode('edit');
    },
    [postPreviewChannel]
  );

  const saveEdits = useCallback(() => {
    if (!selectedPost) return;
    const editedVariant = adaptPostForChannel(
      {
        headline: editHeadline,
        body: editBody,
        cta: editCta,
        hashtags: editHashtags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
      },
      postPreviewChannel
    );
    const updatedVariants: Partial<Record<PostChannel, PostVariant>> = {
      ...(selectedPost.channelVariants || {}),
      [postPreviewChannel]: editedVariant,
    };
    const updatedPost: GeneratedPost = {
      ...selectedPost,
      ...(postPreviewChannel === primaryChannel
        ? {
          headline: editedVariant.headline,
          body: editedVariant.body,
          cta: editedVariant.cta,
          hashtags: editedVariant.hashtags,
        }
        : {}),
      channelVariants: updatedVariants,
    };
    const normalizedPost = buildPostWithChannelVariants(updatedPost);
    setSelectedPost(normalizedPost);
    setGeneratedPosts((prev) => prev.map((p) => (p === selectedPost ? normalizedPost : p)));
    setPreviewMode('post');
    toast.success(`${previewChannelLabel} variant updated`);
  }, [
    selectedPost,
    editHeadline,
    editBody,
    editCta,
    editHashtags,
    postPreviewChannel,
    primaryChannel,
    buildPostWithChannelVariants,
    previewChannelLabel,
  ]);

  const toggleExperimentAxis = useCallback((axis: string) => {
    setExperimentAxes((prev) => {
      if (prev.includes(axis)) {
        return prev.filter((item) => item !== axis);
      }
      if (prev.length >= 3) return prev;
      return [...prev, axis];
    });
  }, []);

  const toggleOutputChannel = useCallback(
    (channel: PostChannel) => {
      setSelectedOutputChannels((prev) => {
        if (prev.includes(channel)) {
          if (prev.length <= 1) return prev;
          const next = prev.filter((item) => item !== channel);
          if (primaryChannel === channel) {
            setPrimaryChannel(next[0] || 'linkedin');
          }
          return next;
        }
        return [...prev, channel];
      });
    },
    [primaryChannel]
  );

  const applyPromptPreset = useCallback((presetId: string) => {
    const preset = PROMPT_COPILOT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    // Keep Prompt Copilot selection visual only; never overwrite user prompt input.
    setSelectedPromptPreset(presetId);
  }, []);

  const requestPostOptions = useCallback(
    async ({
      prompt,
      channel,
      count,
      overrideAxes,
    }: {
      prompt: string;
      channel: PostChannel;
      count: number;
      overrideAxes?: string[];
    }) => {
      const hasOutcomeBrief = Boolean(
        outcomeBrief.goal ||
        outcomeBrief.audience ||
        outcomeBrief.painPoint ||
        outcomeBrief.solution ||
        outcomeBrief.offer ||
        outcomeBrief.proof ||
        outcomeBrief.kpiTarget
      );
      const normalizedWebsiteLink = normalizeOptionalUrl(websiteLink);
      const normalizedChatbotLink = normalizeOptionalUrl(chatbotLink);
      const hasQuickLinks = Boolean(normalizedWebsiteLink || normalizedChatbotLink);

      const response = await fetch('/api/pro/post-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          productId: productId || undefined,
          prompt,
          postType: channel,
          count,
          solutionMode: postStyle === 'problem-solution',
          structureStyle: postStyle,
          experimentMode,
          experimentAxes: overrideAxes || experimentAxes,
          length: postLength,
          evidenceIds: evidenceIds.length ? evidenceIds : undefined,
          outcomeBrief: hasOutcomeBrief ? outcomeBrief : undefined,
          links: hasQuickLinks
            ? {
              website: normalizedWebsiteLink || undefined,
              chatbot: normalizedChatbotLink || undefined,
            }
            : undefined,
          emojiPolicy: emojiRange,
          tone: selectedTone || 'professional',
          framework: selectedFramework || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({} as Record<string, string>));
        const detail = errData.detail || errData.error || '';
        if (response.status === 405) {
          throw new Error('Post generator route is unavailable (405). Refresh and try again.');
        }
        throw new Error(detail || `Generation failed (${response.status})`);
      }

      return (await response.json()) as {
        options?: ApiGeneratedOption[];
        claimGuardrailApplied?: boolean;
        strictClaimGuardrail?: boolean;
        avgQualityScore?: number;
      };
    },
    [
      brandId,
      postStyle,
      experimentMode,
      experimentAxes,
      postLength,
      evidenceIds,
      outcomeBrief,
      websiteLink,
      chatbotLink,
      emojiRange,
      selectedTone,
      selectedFramework,
      productId,
    ]
  );

  const fetchAdditionalChannelVariants = useCallback(
    async (basePrompt: string, count: number) => {
      if (!channelAdaptEnabled) return {};

      const channels = Array.from(
        new Set<PostChannel>([
          ...(selectedOutputChannels.length > 0 ? selectedOutputChannels : [primaryChannel]),
          primaryChannel,
        ])
      );
      const secondaryChannels = channels.filter((channel) => channel !== primaryChannel);
      const byChannel: Partial<Record<PostChannel, GeneratedPost[]>> = {};

      if (secondaryChannels.length === 0 || count <= 0) return byChannel;

      const settled = await Promise.allSettled(
        secondaryChannels.map(async (channel) => {
          const channelPrompt = [
            basePrompt,
            `Primary channel: ${channel}.`,
            `Generate copy optimized for ${channel}.`,
            'Keep the strategic message aligned across channels while adjusting formatting and tone.',
            CHANNEL_PROMPT_HINTS[channel],
          ]
            .filter(Boolean)
            .join('\n\n');
          const data = await requestPostOptions({
            prompt: channelPrompt,
            channel,
            count,
            overrideAxes: experimentMode ? experimentAxes : undefined,
          });

          return {
            channel,
            posts: (data.options || [])
              .map((option) => mapApiOptionToPost(option))
              .sort((a, b) => scoreForSelection(b) - scoreForSelection(a)),
          };
        })
      );

      const failedChannels: string[] = [];
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          byChannel[item.value.channel] = item.value.posts;
        } else {
          const message = item.reason instanceof Error ? item.reason.message : '';
          const channel = secondaryChannels.find((candidate) =>
            message.toLowerCase().includes(candidate)
          );
          failedChannels.push(channel || 'a selected channel');
        }
      }

      if (failedChannels.length > 0) {
        toast.message('Some channel variants used automatic adaptation', {
          description:
            'AI variant generation was partially unavailable, so fallback formatting was applied.',
        });
      }

      return byChannel;
    },
    [
      channelAdaptEnabled,
      selectedOutputChannels,
      primaryChannel,
      requestPostOptions,
      experimentMode,
      experimentAxes,
    ]
  );

  const generateCampaignPlan = async () => {
    if (!outcomeBrief.goal || !outcomeBrief.audience || !outcomeBrief.painPoint || !outcomeBrief.solution) {
      toast.error('Outcome brief incomplete', {
        description: 'Add goal, audience, pain point, and solution before planning a campaign.',
      });
      return;
    }

    setGeneratingCampaign(true);
    try {
      const response = await fetch('/api/pro/campaign/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          durationDays: 30,
          postsPerWeek: 3,
          createDrafts: true,
          outcomeBrief,
        }),
      });
      if (!response.ok) throw new Error('Failed to create campaign plan');
      const data = await response.json();
      const generatedCount = Array.isArray(data?.draftPosts) ? data.draftPosts.length : 0;
      setCampaignSummary(`${data?.plan?.campaign_name || 'Campaign'} • ${generatedCount} draft posts created`);
      toast.success('Campaign plan created', {
        description: `${generatedCount} draft posts added for this brand.`,
      });
    } catch {
      toast.error('Campaign planning failed', { description: 'Please try again.' });
    } finally {
      setGeneratingCampaign(false);
    }
  };

  const buildTrackedLink = async () => {
    if (!ctaUrl.trim()) {
      toast.error('Add a URL first');
      return;
    }
    setBuildingUtm(true);
    try {
      const response = await fetch('/api/pro/utm/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: ctaUrl,
          campaign: outcomeBrief.goal || topic || `${primaryChannel}-campaign`,
          source: primaryChannel,
          medium: 'social',
          content: selectedFramework || 'organic',
        }),
      });
      if (!response.ok) throw new Error('Failed to build tracked URL');
      const data = await response.json();
      const nextUrl = data.trackedUrl || '';
      setTrackedUrl(nextUrl);
      if (nextUrl) {
        copyToClipboard(nextUrl);
      }
      toast.success('Tracked URL generated');
    } catch {
      toast.error('Failed to build tracked URL');
    } finally {
      setBuildingUtm(false);
    }
  };

  const generateCompletedPost = async (post: GeneratedPost) => {
    setGeneratingComplete(true);
    try {
      const response = await fetch('/api/pro/workflow/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          headline: post.headline,
          bodyText: post.body,
          cta: post.cta,
          hashtags: post.hashtags,
          imagePrompt: post.imagePrompt || post.headline,
          outcomeBrief,
          experimentMode,
          experimentAxes,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate complete post');

      const data = await response.json();

      const updatedPost = {
        ...post,
        imageUrl: data.composedImageUrl,
        imagePrompt: post.imagePrompt || post.headline,
      };
      const normalizedPost = buildPostWithChannelVariants(updatedPost);
      setSelectedPost(normalizedPost);
      setGeneratedPosts((prev) => prev.map((p) => (p === post ? normalizedPost : p)));

      toast.success('Post generated!', {
        description: `Post ID: ${data.postId} — Review in your drafts before publishing.`,
      });
    } catch {
      toast.error('Generation failed', { description: 'Could not generate complete post. Please try again.' });
    } finally {
      setGeneratingComplete(false);
    }
  };

  const generatePosts = async () => {
    const normalizedPrompt = sanitizeTemplatePlaceholders(topic);
    if (!normalizedPrompt.trim()) return;
    if (normalizedPrompt.trim().split(/\s+/).length < 3) {
      toast.error('Add a clearer prompt', {
        description: 'Use at least one full sentence so AI can match your exact intent.',
      });
      return;
    }

    setGenerating(true);
    try {
      const channels = channelAdaptEnabled
        ? Array.from(
          new Set<PostChannel>([
            ...(selectedOutputChannels.length > 0 ? selectedOutputChannels : [primaryChannel]),
            primaryChannel,
          ])
        )
        : [primaryChannel];
      const documentLedPrompt =
        evidenceContext.length > 0 && DOCUMENT_LED_PROMPT_REGEX.test(normalizedPrompt);
      const evidenceTitles = evidenceContext
        .slice(0, 6)
        .map((item) => item.title)
        .filter(Boolean);
      const channelPrompt = [
        normalizedPrompt,
        documentLedPrompt
          ? 'Selected PDFs are the main source for this post. Infer the topic, product, and proof points from those PDFs and write the post from that material.'
          : null,
        evidenceTitles.length ? `Selected PDF titles: ${evidenceTitles.join(' | ')}` : null,
        evidenceBrief ? `Knowledge base context:\n${evidenceBrief}` : null,
        `Primary channel: ${primaryChannel}.`,
        `Generate copy for these channels: ${channels.join(', ')}.`,
        CHANNEL_PROMPT_HINTS[primaryChannel],
      ]
        .filter(Boolean)
        .join('\n\n');

      const data = await requestPostOptions({
        prompt: channelPrompt,
        channel: primaryChannel,
        count: 3,
      });
      const {
        options,
        claimGuardrailApplied,
        strictClaimGuardrail,
        avgQualityScore,
      } = data;
      const posts = (options || []).map((opt: ApiGeneratedOption) => mapApiOptionToPost(opt));
      const rankedPosts = [...posts].sort((a, b) => scoreForSelection(b) - scoreForSelection(a));

      if (rankedPosts.length === 0) throw new Error('No posts generated');

      const aiVariantsByChannel = await fetchAdditionalChannelVariants(
        [
          normalizedPrompt,
          documentLedPrompt
            ? 'Use the selected PDFs as the main source of truth for the post topic and proof.'
            : null,
          evidenceTitles.length ? `Selected PDF titles: ${evidenceTitles.join(' | ')}` : null,
          evidenceBrief ? `Knowledge base context:\n${evidenceBrief}` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        rankedPosts.length
      );

      const preparedPosts = rankedPosts.map((post, index) => {
        const seeded = buildPostWithChannelVariants(post);
        const variants: Partial<Record<PostChannel, PostVariant>> = {
          ...(seeded.channelVariants || {}),
        };

        for (const channel of channels) {
          if (channel === primaryChannel) {
            variants[channel] = adaptPostForChannel(seeded, channel);
            continue;
          }
          const aiVariant = aiVariantsByChannel[channel]?.[index];
          variants[channel] = adaptPostForChannel(aiVariant || seeded, channel);
        }

        return buildPostWithChannelVariants({
          ...seeded,
          channelVariants: variants,
          primaryChannel,
          selectedChannels: channels,
        });
      });

      setGeneratedPosts(preparedPosts);
      if (preparedPosts.length > 0) {
        setSelectedPost(preparedPosts[0]);
        setPreviewMode('post');
      }

      // ─── Push to session history ───
      setPostHistory((prev) => [
        { id: Date.now().toString(), timestamp: new Date().toISOString(), topic: topic.slice(0, 80), posts: preparedPosts },
        ...prev.slice(0, 9), // keep last 10
      ]);

      if (claimGuardrailApplied && strictClaimGuardrail) {
        toast.message('Factual guardrail applied', {
          description:
            'No sources were provided, so specific numeric claims were softened to keep output credible.',
          duration: 5000,
        });
      }
      toast.success(`${rankedPosts.length} variation${rankedPosts.length > 1 ? 's' : ''} generated`, {
        description:
          typeof avgQualityScore === 'number'
            ? `Average AI fit score: ${avgQualityScore}/100`
            : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Generation failed', { description: message });
    } finally {
      setGenerating(false);
    }
  };

  const generateImage = async (post: GeneratedPost) => {
    setGeneratingImage(true);
    try {
      const imagePrompt = post.imagePrompt || `${post.headline}. ${post.body.slice(0, 100)}`;

      const response = await fetch('/api/pro/image/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, prompt: imagePrompt, userPrompt: post.headline }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Image generation failed: ${response.status}`);
      }

      const data = await response.json();
      const resolvedUrl = data.url || data.file_url || data.imageUrl;

      if (!resolvedUrl) throw new Error('No image URL returned');
      const updatedPost = { ...post, imageUrl: resolvedUrl, imagePrompt };
      const normalizedPost = buildPostWithChannelVariants(updatedPost);
      setSelectedPost(normalizedPost);
      setGeneratedPosts((prev) => prev.map((p) => (p === post ? normalizedPost : p)));
      toast.success('Image generated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Image generation failed', { description: message });
    } finally {
      setGeneratingImage(false);
    }
  };

  const regeneratePost = async (post: GeneratedPost) => {
    setGenerating(true);
    try {
      const channels = channelAdaptEnabled
        ? Array.from(
          new Set<PostChannel>([
            ...(selectedOutputChannels.length > 0 ? selectedOutputChannels : [primaryChannel]),
            primaryChannel,
          ])
        )
        : [primaryChannel];
      const data = await requestPostOptions({
        prompt: sanitizeTemplatePlaceholders(
          `${post.headline}. Regenerate with a different angle for ${primaryChannel}. ${CHANNEL_PROMPT_HINTS[primaryChannel]}${evidenceBrief ? `\n\nEvidence locker context:\n${evidenceBrief}` : ''
          }`
        ),
        channel: primaryChannel,
        count: 1,
        overrideAxes: ['angle'],
      });
      const options = (data.options || []) as ApiGeneratedOption[];

      if (options.length > 0) {
        const ranked = options
          .map((option) => mapApiOptionToPost(option))
          .sort((a, b) => scoreForSelection(b) - scoreForSelection(a));
        const seeded = buildPostWithChannelVariants(ranked[0]);
        const aiVariantsByChannel = await fetchAdditionalChannelVariants(
          sanitizeTemplatePlaceholders(
            `${ranked[0].headline}\n\n${ranked[0].body}\n\n${ranked[0].cta}${evidenceBrief ? `\n\nEvidence locker context:\n${evidenceBrief}` : ''
            }`
          ),
          1
        );
        const variants: Partial<Record<PostChannel, PostVariant>> = {
          ...(seeded.channelVariants || {}),
        };
        for (const channel of channels) {
          if (channel === primaryChannel) {
            variants[channel] = adaptPostForChannel(seeded, channel);
            continue;
          }
          const aiVariant = aiVariantsByChannel[channel]?.[0];
          variants[channel] = adaptPostForChannel(aiVariant || seeded, channel);
        }
        const newPost = buildPostWithChannelVariants({
          ...seeded,
          channelVariants: variants,
          primaryChannel,
          selectedChannels: channels,
        });

        setGeneratedPosts((prev) => prev.map((p) => (p === post ? newPost : p)));
        if (selectedPost === post) {
          setSelectedPost(newPost);
        }
        toast.success('Post regenerated');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Regeneration failed';
      toast.error('Regeneration failed', { description: message });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const [savingDraft, setSavingDraft] = useState(false);

  const saveDraft = async () => {
    if (!selectedPost || savingDraft) return;
    const draftContent = activePreviewPost || selectedPost;
    setSavingDraft(true);

    try {
      const response = await fetch('/api/pro/post/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: topic || draftContent.imagePrompt || draftContent.headline,
          headline: draftContent.headline,
          body: draftContent.body,
          cta: draftContent.cta,
          hashtags: draftContent.hashtags,
          imageUrl: draftContent.imageUrl || selectedPost.imageUrl,
          imagePrompt: draftContent.imagePrompt || selectedPost.imagePrompt,
          publishChannels: selectedPost.selectedChannels || selectedOutputChannels,
          primaryChannel: selectedPost.primaryChannel || primaryChannel,
          channelVariants: selectedPost.channelVariants || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to save draft');

      const data = await response.json();
      toast.success('Saved as draft', { description: `Post ID: ${data.postId}` });
      onPostGenerated(selectedPost, data.postId);
    } catch {
      toast.error('Save failed', { description: 'Could not save draft. Please try again.' });
    } finally {
      setSavingDraft(false);
    }
  };

  const addHashtagGroup = useCallback((tags: string[]) => {
    if (previewMode === 'edit') {
      const current = editHashtags.split(',').map(t => t.trim()).filter(Boolean);
      const merged = [...new Set([...current, ...tags])];
      setEditHashtags(merged.join(', '));
      toast.success(`${tags.length} hashtags added`);
    } else if (selectedPost) {
      const current = selectedPost.hashtags;
      const merged = [...new Set([...current, ...tags])];
      const updated = buildPostWithChannelVariants({ ...selectedPost, hashtags: merged });
      setSelectedPost(updated);
      setGeneratedPosts((prev) => prev.map((p) => (p === selectedPost ? updated : p)));
      toast.success(`${tags.length} hashtags added`);
    }
  }, [previewMode, editHashtags, selectedPost, buildPostWithChannelVariants]);

  const renderSocialPreview = (post: GeneratedPost, channel: PostChannel) => {
    const content = getPostVariantForChannel(post, channel);
    const channelLabel = channel === 'linkedin' ? 'LinkedIn' : channel === 'facebook' ? 'Facebook' : 'Instagram';
    const normalizePreviewText = (value: string) =>
      value
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1: $2')
        .replace(/<((?:https?:\/\/)[^>]+)>/gi, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*/g, '');

    const normalizedHeadline = normalizePreviewText(content.headline || '');
    const normalizedBody = normalizePreviewText(content.body || '');
    const normalizedCta = normalizePreviewText(content.cta || '');

    return (
      <div className="w-full max-w-[620px] rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)]200">
        <div className="px-5 pt-4 pb-1">
          <Badge className="bg-cyan-100 text-cyan-700 border border-cyan-200 text-[10px]">
            {channelLabel} Preview
          </Badge>
        </div>
        {/* Header */}
        <div className="flex items-center gap-3 p-5">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold overflow-hidden"
            style={{
              background: logoUrl
                ? undefined
                : `linear-gradient(135deg, ${brandColors[0] || '#0A66C2'}, ${brandColors[1] || '#0F172A'})`,
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="w-full h-full rounded-full object-cover" />
            ) : (
              brandName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">{brandName || 'Your Brand'}</div>
            <div className="text-xs text-gray-400">Just now | Public</div>
          </div>
        </div>

        {/* Post Content */}
        <div className="px-5 pb-4">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] leading-7 text-slate-800">
            {normalizedHeadline && (
              <span className="mb-2 block break-words [overflow-wrap:anywhere] font-semibold">
                {normalizedHeadline}
              </span>
            )}
            {normalizedBody}
          </p>
          {content.hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {content.hashtags.map((tag) => (
                <span key={tag} className="break-all text-sm text-cyan-600">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Image */}
        {content.imageUrl && (
          <div className="w-full bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.imageUrl}
              alt="Post visual"
              className="w-full object-contain"
              style={{ maxHeight: '420px' }}
            />
          </div>
        )}

        {/* CTA Bar */}
        {normalizedCta && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <Button
              variant="outline"
              size="sm"
              className="h-auto w-full whitespace-normal break-words [overflow-wrap:anywhere] border-2 px-3 py-3 text-left text-sm font-semibold leading-relaxed text-cyan-700 hover:bg-cyan-50/30"
              style={{ borderColor: brandColors[0] || '#0A66C2' }}
            >
              {normalizedCta}
            </Button>
          </div>
        )}

        {/* Engagement Buttons (decorative) */}
        <div className="px-4 py-2 border-t border-slate-200">
          <div className="flex justify-between text-xs text-gray-400">
            <button className="flex items-center gap-1 hover:bg-slate-100 px-3 py-2 rounded">
              <ThumbsUp className="w-4 h-4" />
              Like
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 px-3 py-2 rounded">
              Comment
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 px-3 py-2 rounded">
              Repost
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 px-3 py-2 rounded">
              Send
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Score ring component
  const renderScoreRing = (score: number, size = 80) => {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#f87171';

    return (
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#374151" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="transform rotate-90 origin-center"
          fill={color}
          fontSize={size * 0.28}
          fontWeight="bold"
        >
          {score}
        </text>
      </svg>
    );
  };

  return (
    <div className="space-y-6 pb-2">
      <Card className="relative overflow-hidden border border-cyan-200/70 bg-gradient-to-br from-[#e8f6ff] via-[#f5fbff] to-[#eef5ff] shadow-[0_18px_40px_-26px_rgba(14,116,144,0.6)]">
        <div className="absolute -top-16 -right-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl500/20" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl500/20" />
        <div className="relative p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">
                AI Writing Studio
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Build Channel-Ready Posts in Minutes
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Strong prompt, strong tone, clear CTA. Configure once and generate polished options for LinkedIn, Facebook, and Instagram.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-white/85 px-4 py-3 text-sm shadow-sm80080">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Current Setup</p>
              <p className="mt-1 font-semibold text-slate-900">{activeToneLabel.replace(/^[^\s]+\s/, '')} Tone</p>
              <p className="text-xs text-slate-600">
                {postLength} length • {activeFrameworkLabel} framework • {CHANNEL_OPTIONS.find((item) => item.id === primaryChannel)?.label} primary
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-200/80 bg-white/80 px-4 py-3/6070">
              <p className="text-[11px] uppercase tracking-[0.12em] text-gray-400">Prompt</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {topic.trim() ? 'Ready' : 'Waiting for topic'}
              </p>
            </div>
            <div className="rounded-xl border border-violet-200/80 bg-white/80 px-4 py-3/6070">
              <p className="text-[11px] uppercase tracking-[0.12em] text-gray-400">Outcome Brief</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {completedOutcomeFields}/7 fields
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-white/80 px-4 py-3/6070">
              <p className="text-[11px] uppercase tracking-[0.12em] text-gray-400">Options Generated</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {generatedPosts.length} option{generatedPosts.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {evidenceContext.length > 0 ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/80 px-4 py-2.5 text-xs text-cyan-800">
                Evidence grounding active: {evidenceContext.length} selected source{evidenceContext.length === 1 ? '' : 's'}.
              </div>
              <div className="rounded-2xl border border-cyan-200/70 bg-white/85 p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                      Grounding Sources
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      These summaries are sent into generation, so you can see exactly what evidence is steering the output.
                    </p>
                  </div>
                  <Badge className="w-fit border-cyan-200 bg-cyan-50 text-cyan-700">
                    {visibleEvidenceSources.length} visible
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {visibleEvidenceSources.map((source, index) => (
                    <div
                      key={source.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Source {index + 1}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {source.title}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize border-slate-200 text-slate-600">
                          {source.typeLabel}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {source.displaySummary}
                      </p>
                    </div>
                  ))}
                </div>
                {hiddenEvidenceCount > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    +{hiddenEvidenceCount} more selected source{hiddenEvidenceCount === 1 ? '' : 's'} will also be passed into generation.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {productName ? (
            <div className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/80 px-4 py-2.5 text-xs text-violet-800">
              Product context active: <span className="font-semibold">{productName}</span>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ─── STEP 1: What do you want to post about? (FIRST) ─── */}
      <Card className="relative overflow-hidden p-7 border border-cyan-200/60 bg-gradient-to-br from-white via-cyan-50/60 to-sky-100/30 shadow-[0_12px_32px_-22px_rgba(14,116,144,0.65)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-lg font-semibold flex items-center gap-2 text-slate-900">
                <div className="w-7 h-7 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                What do you want to post about?
              </label>
              <button
                onClick={() => setShowHooks(!showHooks)}
                className="text-sm text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-100/90 border border-amber-200 hover:bg-amber-200/80 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {showHooks ? 'Hide' : 'Need'} Hook Ideas
                {showHooks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Hook Lines Library */}
            {showHooks && (
              <div className="mb-3 p-4 rounded-xl bg-amber-100/70 border border-amber-200 space-y-2">
                <p className="text-sm text-amber-700 font-medium">🎣 Click any hook to use it as your starting point:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
                  {HOOK_LINES.map((hook, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setTopic(hook.hook);
                        setShowHooks(false);
                      }}
                      className="text-left px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm hover:border-amber-400 hover:bg-amber-50/20 transition-all"
                    >
                      <span className="mr-1.5">{hook.emoji}</span>
                      {hook.hook}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Describe your post topic in detail — the more specific, the better the AI output.&#10;&#10;Examples:&#10;• Make a LinkedIn post about ABB TruONE ATS using the selected PDF summary and product details&#10;• Write a post from the uploaded PDF about our change-over switch product line&#10;• Announce our new AI feature that saves marketers 3 hours/week"
              className="min-h-[150px] text-base leading-7 bg-white/9570 border-2 border-cyan-200 placeholder:text-gray-400 focus-visible:ring-cyan-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  generatePosts();
                }
              }}
            />
            <p className="text-sm text-gray-600 mt-2 flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 text-[10px] bg-gray-100 border border-gray-300 rounded font-mono">Ctrl+Enter</kbd>
              <span>to generate instantly</span>
            </p>

            <div className="mt-4 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-100/70 to-blue-100/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-800">
                <Link2 className="w-4 h-4" />
                Optional Link Bar
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="relative">
                  <Input
                    value={websiteLink}
                    onChange={(e) => setWebsiteLink(e.target.value)}
                    onBlur={() => setWebsiteLink((prev) => normalizeOptionalUrl(prev))}
                    placeholder="Website URL (e.g. https://zaincom.com)"
                    className="h-10 bg-white pl-9 border-cyan-200 focus-visible:ring-cyan-50"
                  />
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                </div>
                <div className="relative">
                  <Input
                    value={chatbotLink}
                    onChange={(e) => setChatbotLink(e.target.value)}
                    onBlur={() => setChatbotLink((prev) => normalizeOptionalUrl(prev))}
                    placeholder="Chatbot URL (e.g. https://wa.me/...)"
                    className="h-10 bg-white pl-9 border-cyan-200 focus-visible:ring-cyan-50"
                  />
                  <Bot className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                </div>
              </div>
              <p className="mt-2 text-xs text-cyan-700">
                If provided, AI will add these links in the final CTA section of your generated post.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-100/70 to-sky-100/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-800">
                <Share2 className="w-4 h-4" />
                Channel Targeting
              </div>
              <p className="text-xs text-indigo-700 mb-3">
                Choose where this post should be prepared. Preview will show channel-specific versions.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {CHANNEL_OPTIONS.map((channel) => {
                  const selected = selectedOutputChannels.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => toggleOutputChannel(channel.id)}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-all ${selected
                          ? 'border-indigo-50 bg-indigo-100/80 text-indigo-800/30'
                          : 'border-indigo-200 bg-white/90 text-slate-600 hover:border-indigo-300'
                        }`}
                    >
                      <p className="text-xs font-semibold">{channel.label}</p>
                      <p className="text-[10px] opacity-80">{channel.shortLabel}</p>
                    </button>
                  );
                })}
              </div>
              <label className="text-xs font-medium text-indigo-700">
                Primary writing style channel
              </label>
              <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3">
                {CHANNEL_OPTIONS.filter((channel) =>
                  selectedOutputChannels.includes(channel.id)
                ).map((channel) => (
                  <button
                    key={`primary-${channel.id}`}
                    type="button"
                    onClick={() => setPrimaryChannel(channel.id)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${primaryChannel === channel.id
                        ? 'border-cyan-300 bg-cyan-100/80 text-cyan-800'
                        : 'border-slate-200 bg-white/90 text-slate-600 hover:border-cyan-300'
                      }`}
                  >
                    <p className="font-semibold">{channel.label}</p>
                    <p className="mt-0.5 text-[10px] opacity-80">{channel.hint}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-indigo-200 bg-white/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-indigo-700">Channel Adapt</p>
                    <p className="text-[11px] text-indigo-600">
                      {channelAdaptEnabled
                        ? 'Generate channel-specific variants automatically'
                        : 'Use primary-channel copy only'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChannelAdaptEnabled((prev) => !prev)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${channelAdaptEnabled
                        ? 'border-cyan-400 bg-cyan-100 text-cyan-700/30'
                        : 'border-slate-300 bg-slate-100 text-slate-600'
                      }`}
                  >
                    {channelAdaptEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── STEP 2: Style & Strategy (collapsible, cleaner) ─── */}
      <Card className="relative overflow-hidden p-6 border border-violet-200/80 bg-gradient-to-br from-white via-violet-50/50 to-indigo-100/50 shadow-[0_12px_36px_-24px_rgba(79,70,229,0.55)]">
        <div className="absolute -top-16 right-0 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl600/20" />
        <div className="space-y-5">
          {/* Tone Selector — larger, clearer */}
          <div>
            <label className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-900">
              <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</div>
              Tone, Framework & Style
            </label>
            <p className="text-base text-slate-700 mb-3">Pick tone and structure. Natural is default and avoids rigid challenge/solution labels.</p>

            {/* Quick Post Types — one-click presets */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-700">Quick Post Types</span>
                <span className="text-xs text-gray-400 font-normal">— auto-selects tone & framework</span>
                {selectedQuickType && (
                  <button
                    onClick={() => setSelectedQuickType('')}
                    className="ml-auto text-xs text-gray-500 hover:text-slate-600 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                {QUICK_POST_TYPES.map((qpt) => (
                  <button
                    key={qpt.id}
                    onClick={() => {
                      const isActive = selectedQuickType === qpt.id;
                      setSelectedQuickType(isActive ? '' : qpt.id);
                      if (!isActive) {
                        setSelectedTone(qpt.tone);
                        setSelectedFramework(qpt.framework);
                        setPostStyle(qpt.style as PostStructureStyle);
                        setPostLength(qpt.length as 'short' | 'standard' | 'long');
                      }
                    }}
                    className={`p-3 rounded-xl text-left transition-all border-2 ${selectedQuickType === qpt.id
                        ? 'bg-amber-50/20 border-amber-400 shadow-sm shadow-amber-400/20'
                        : 'bg-white/9070 border-slate-200 hover:border-amber-300'
                      }`}
                  >
                    <div className="text-sm font-semibold text-slate-800">{qpt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-tight">{qpt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone selector */}
            <div className="mb-1">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-slate-700">Tone</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5">
              {TONE_PRESETS.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => { setSelectedTone(tone.id); setSelectedQuickType(''); }}
                  className={`px-3 py-3 rounded-xl text-left transition-all ${selectedTone === tone.id
                      ? 'bg-violet-100/90 border-2 border-violet-200 text-violet-800 font-semibold shadow-sm shadow-violet-200/20'
                      : 'bg-white/9070 border-2 border-slate-200 text-slate-700 hover:border-violet-300'
                    }`}
                >
                  <div className="text-sm font-semibold">{tone.label}</div>
                  <div className="text-xs mt-1 opacity-80">{tone.description}</div>
                </button>
              ))}
            </div>

            {/* Content Framework Selector */}
            <label className="text-sm font-medium mb-2 flex items-center gap-2 text-slate-700">
              <BookOpen className="w-4 h-4 text-blue-500" />
              Content Framework
              <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {CONTENT_FRAMEWORKS.map((fw) => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedFramework(selectedFramework === fw.id ? '' : fw.id)}
                  className={`p-3.5 rounded-xl text-left transition-all ${selectedFramework === fw.id
                      ? 'bg-blue-100/80 border-2 border-blue-200 shadow-sm shadow-blue-200/20'
                      : 'bg-white/9070 border-2 border-slate-200 hover:border-blue-300'
                    }`}
                >
                  <div className="text-sm font-semibold">{fw.label}</div>
                  <div className="text-sm text-slate-600 mt-1">{fw.description}</div>
                </button>
              ))}
            </div>
            {selectedFramework && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-blue-100/80 border border-blue-200 text-sm text-blue-800">
                💡 <strong>Tip:</strong> {CONTENT_FRAMEWORKS.find(f => f.id === selectedFramework)?.example}
              </div>
            )}

            <div className="mt-4">
              <label className="text-base font-semibold mb-2 flex items-center gap-2 text-slate-800">
                <MessageSquare className="w-4 h-4 text-emerald-500" />
                Post Length
              </label>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPostLength(preset.id)}
                    className={`p-3 rounded-xl text-left transition-all ${postLength === preset.id
                        ? 'bg-emerald-100/80 border-2 border-emerald-200 shadow-sm shadow-emerald-200/20'
                        : 'bg-white/9070 border-2 border-slate-200 hover:border-emerald-300'
                      }`}
                  >
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{preset.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-base font-semibold mb-2 block text-slate-800">
                Post Style
              </label>
              <Select value={postStyle} onValueChange={(value) => setPostStyle(value as PostStructureStyle)}>
                <SelectTrigger className="w-full h-11 bg-white text-base border-slate-300 focus:ring-violet-50">
                  <SelectValue placeholder="Choose post style" />
                </SelectTrigger>
                <SelectContent>
                  {POST_STYLE_PRESETS.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-sm text-slate-600">
                {POST_STYLE_PRESETS.find((style) => style.id === postStyle)?.description}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── STEP 3: Outcome Brief (collapsible) ─── */}
      <Card className="relative overflow-hidden p-6 border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/55 to-cyan-100/55 shadow-[0_12px_36px_-24px_rgba(16,185,129,0.55)]">
        <div className="absolute -right-12 top-0 h-32 w-32 rounded-full bg-emerald-300/20 blur-3xl500/20" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-lg font-semibold flex items-center gap-2 text-slate-900">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">3</div>
              Outcome Brief
              <span className="text-sm font-normal text-gray-400 ml-1">(optional advanced input)</span>
            </label>
            <button
              onClick={() => setShowOutcomeBrief((prev) => !prev)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showOutcomeBrief ? 'bg-emerald-100/20 text-emerald-800 border border-emerald-300' : 'bg-white/9050 text-slate-700 border border-slate-300'}`}
            >
              {showOutcomeBrief ? 'Hide' : 'Show'}
            </button>
          </div>
          {showOutcomeBrief && (
            <>
              <p className="text-base text-slate-700 -mt-1">Fill in what you know. AI uses this to write more targeted, conversion-focused posts.</p>
              <p className="text-sm text-slate-600 -mt-1">
                Use this when you want explicit pain/solution/proof details injected. Leave blank for more natural posts.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Goal</label>
                  <Input
                    value={outcomeBrief.goal}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, goal: e.target.value }))}
                    placeholder="e.g. Book 10 demos this month"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Audience</label>
                  <Input
                    value={outcomeBrief.audience}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, audience: e.target.value }))}
                    placeholder="e.g. B2B SaaS founders, Series A-B"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Pain Point</label>
                  <Input
                    value={outcomeBrief.painPoint}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, painPoint: e.target.value }))}
                    placeholder="e.g. Wasting time on low-quality content"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Solution</label>
                  <Input
                    value={outcomeBrief.solution}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, solution: e.target.value }))}
                    placeholder="e.g. AI-powered content that converts"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Proof</label>
                  <Input
                    value={outcomeBrief.proof}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, proof: e.target.value }))}
                    placeholder="e.g. 3x more engagement in 30 days"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">CTA Action</label>
                  <Input
                    value={outcomeBrief.offer}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, offer: e.target.value }))}
                    placeholder="e.g. DM me for a free audit"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">KPI Target</label>
                  <Input
                    value={outcomeBrief.kpiTarget}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, kpiTarget: e.target.value }))}
                    placeholder="e.g. 25 qualified leads"
                    className="text-base h-11 bg-white border-slate-300"
                  />
                </div>
              </div>
            </>
          )}
          {showOutcomeBrief && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="Optional CTA URL for UTM tracking"
                  className="bg-white border-slate-300"
                />
                <Button size="sm" variant="outline" onClick={buildTrackedLink} disabled={buildingUtm}>
                  {buildingUtm ? 'Building...' : 'Build UTM'}
                </Button>
              </div>
              {trackedUrl && (
                <div className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700">
                  {trackedUrl}
                </div>
              )}
            </div>
          )}

          {/* Prompt Copilot */}
          <div>
            <label className="mb-2 block text-base font-semibold text-slate-800">Prompt Copilot</label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {PROMPT_COPILOT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPromptPreset(preset.id)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition-all ${selectedPromptPreset === preset.id
                      ? 'border-cyan-300 bg-cyan-100/80 text-cyan-800 font-medium shadow-sm shadow-cyan-200/20'
                      : 'border-slate-200 bg-white/9070 text-slate-700 hover:border-cyan-300'
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Experiment Controls — compact */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-100/70 p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-base font-semibold text-indigo-800 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Experiment Mode
              </label>
              <button
                onClick={() => setExperimentMode((prev) => !prev)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${experimentMode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
              >
                {experimentMode ? 'ON' : 'OFF'}
              </button>
            </div>
            {experimentMode && (
              <>
                <p className="text-sm text-indigo-700 mb-2">AI will vary these axes across your post options:</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {['hook', 'cta', 'emotion', 'proof', 'angle'].map((axis) => (
                    <button
                      key={axis}
                      onClick={() => toggleExperimentAxis(axis)}
                      className={`rounded-full border px-3.5 py-2 text-sm capitalize transition-colors ${experimentAxes.includes(axis)
                          ? 'border-indigo-50 bg-indigo-200/30 text-indigo-800 font-medium'
                          : 'border-slate-300 bg-white text-slate-700'
                        }`}
                    >
                      {axis}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-indigo-700 mb-1 block">Min emojis</label>
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      value={emojiRange.min}
                      onChange={(e) =>
                        setEmojiRange((prev) => ({
                          ...prev,
                          min: Math.max(0, Math.min(12, Number(e.target.value || 0))),
                        }))
                      }
                      className="text-base h-11 bg-white border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-indigo-700 mb-1 block">Max emojis</label>
                    <Input
                      type="number"
                      min={0}
                      max={15}
                      value={emojiRange.max}
                      onChange={(e) =>
                        setEmojiRange((prev) => ({
                          ...prev,
                          max: Math.max(prev.min, Math.min(15, Number(e.target.value || 0))),
                        }))
                      }
                      className="text-base h-11 bg-white border-slate-300"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ─── GENERATE — always at the bottom of config ─── */}
      <Card className="p-7 border border-cyan-300/80 bg-gradient-to-r from-cyan-100/85 via-sky-100/70 to-blue-100/80 shadow-[0_14px_36px_-24px_rgba(14,116,144,0.6)]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Button
              onClick={generatePosts}
              disabled={!topic.trim() || generating}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 py-7 text-lg font-bold shadow-lg hover:shadow-xl hover:from-cyan-700 hover:to-blue-700 transition-all hover:scale-[1.01]"
            >
              {generating ? (
                <>
                  <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                  Generating Posts...
                </>
              ) : (
                <>  
                  <Wand2 className="w-5 h-5 mr-2" />
                  Generate Post Variations
                  <span className="ml-2 rounded px-1.5 py-0.5 bg-white/20 text-[10px] font-mono">⌘↵</span>
                  {selectedFramework && (
                    <Badge className="ml-2 bg-white/20 text-white text-[10px]">
                      {CONTENT_FRAMEWORKS.find(f => f.id === selectedFramework)?.name}
                    </Badge>
                  )}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={generateCampaignPlan}
              disabled={generatingCampaign}
              className="w-full py-7 text-base border-slate-300 bg-white/7040 hover:bg-white"
            >
              {generatingCampaign ? (
                <>
                  <TrendingUp className="mr-2 h-5 w-5 animate-spin" />
                  Planning Campaign...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-5 w-5" />
                  Build 30-Day Campaign
                </>
              )}
            </Button>
          </div>

          {!topic.trim() && (
            <p className="text-sm text-center text-slate-700">
              Fill in your topic above, then click Generate
            </p>
          )}

          {campaignSummary && (
            <div className="rounded-lg border border-green-200 bg-green-50/20 px-3 py-2 text-sm text-green-700">
              ✅ {campaignSummary}
            </div>
          )}
        </div>
      </Card>

      {/* ─── Session History ─── */}
      {postHistory.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50/60 transition-colors"
            onClick={() => setShowHistory((v) => !v)}
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-gray-500" />
              Session History ({postHistory.length})
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="divide-y divide-slate-100">
              {postHistory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{entry.topic || '(no topic)'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.posts.length} variant{entry.posts.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs h-7"
                    onClick={() => {
                      setGeneratedPosts(entry.posts);
                      setSelectedPost(entry.posts[0] ?? null);
                      setTopic(entry.topic);
                      setPreviewMode('post');
                      setShowHistory(false);
                    }}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Results ─── */}
      {generatedPosts.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          {/* Post Options List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-700">Generated Options</h3>
            {generatedPosts.map((post, idx) => {
              const score = scorePost(post);
              const scoreValue =
                typeof post.qualityScore === 'number' ? post.qualityScore : score.overall;
              return (
                <Card
                  key={idx}
                  onClick={() => {
                    setSelectedPost(post);
                    setPreviewMode('post');
                  }}
                  className={`p-4 cursor-pointer transition-all hover:shadow-md bg-white text-slate-900 border border-slate-200 ${selectedPost === post ? 'ring-2 ring-cyan-50 bg-cyan-50/30 shadow-[0_10px_24px_-18px_rgba(6,182,212,0.8)]' : ''
                    }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="outline">Option {idx + 1}</Badge>
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-bold ${getScoreColor(scoreValue)}`}>
                        {scoreValue}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          regeneratePost(post);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                        title="Regenerate"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold mb-1 line-clamp-2">{post.headline}</p>
                  {post.variantLabel && (
                    <p className="mb-1 text-[11px] font-medium text-indigo-600">{post.variantLabel}</p>
                  )}
                  <p className="text-xs text-slate-700 line-clamp-2 leading-5">{post.body}</p>
                  {post.riskFlags && post.riskFlags.length > 0 && (
                    <p className="mt-1 text-[11px] text-amber-700 line-clamp-2">
                      {post.riskFlags[0]}
                    </p>
                  )}
                  <div className="flex gap-1 mt-2">
                    {post.imageUrl && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">
                        <Check className="w-2.5 h-2.5 mr-0.5" />
                        Image
                      </Badge>
                    )}
                    <Badge className={`text-[10px] ${scoreValue >= 80 ? 'bg-green-100 text-green-700' : scoreValue >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {getScoreLabel(scoreValue)}
                    </Badge>
                  </div>
                  {onPostConfirmed && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const postWithChannels = buildPostWithChannelVariants(post);
                        setSelectedPost(postWithChannels);
                        onPostConfirmed(postWithChannels);
                        toast.success('Post confirmed! Moving to Image Creator…');
                      }}
                      className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white text-xs font-semibold h-8"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Use This & Continue →
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Preview / Edit / Score Area */}
          <div className="space-y-4">
            {generatedPosts.length > 1 && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/80 p-2">
                {generatedPosts.map((post, idx) => {
                  const isSelected = selectedPost === post;
                  const label = post.variantLabel || `Variant ${idx + 1}`;
                  return (
                    <button
                      key={`variant-tab-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedPost(post);
                        setPreviewMode('post');
                      }}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${isSelected
                          ? 'border-cyan-50 bg-cyan-50 text-cyan-700/40'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300'
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={previewMode === 'post' ? 'default' : 'outline'}
                  onClick={() => setPreviewMode('post')}
                  className={previewMode === 'post' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === 'edit' ? 'default' : 'outline'}
                  onClick={() => selectedPost && startEditing(selectedPost)}
                  className={previewMode === 'edit' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === 'score' ? 'default' : 'outline'}
                  onClick={() => setPreviewMode('score')}
                  className={previewMode === 'score' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Score
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === 'image' ? 'default' : 'outline'}
                  onClick={() => setPreviewMode('image')}
                  className={previewMode === 'image' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Image
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!selectedPost) return;
                    const preview = activePreviewPost || selectedPost;
                    const fullText = `${preview.headline}\n\n${preview.body}\n\n${preview.hashtags.map((t) => `#${t}`).join(' ')}`;
                    copyToClipboard(fullText);
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
                <Button size="sm" onClick={saveDraft} disabled={savingDraft}>
                  {savingDraft ? (
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3 mr-1" />
                  )}
                  {savingDraft ? 'Saving…' : 'Save Draft'}
                </Button>
                {onPostConfirmed && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (selectedPost) {
                        onPostConfirmed(buildPostWithChannelVariants(selectedPost));
                        toast.success('Post confirmed! Moving to Image Creator…');
                      }
                    }}
                    className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Confirm & Continue →
                  </Button>
                )}
              </div>
              <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${complianceSummary.tone}`}>
                {complianceSummary.label}
              </div>
            </div>

            {/* ─── Social Preview ─── */}
            {selectedPost?.testHypothesis && (
              <div className="rounded-md border border-indigo-200 bg-indigo-100/80 px-3 py-2 text-xs text-indigo-800">
                <strong>Experiment hypothesis:</strong> {selectedPost.testHypothesis}
              </div>
            )}

            {selectedPost && (
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.filter((channel) =>
                  selectedOutputChannels.includes(channel.id)
                ).map((channel) => (
                  <button
                    key={`preview-channel-${channel.id}`}
                    type="button"
                    onClick={() => setPostPreviewChannel(channel.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${postPreviewChannel === channel.id
                        ? 'border-cyan-50 bg-cyan-50 text-cyan-700/30'
                        : 'border-slate-200 text-gray-400 hover:border-cyan-300'
                      }`}
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            )}

            {previewMode === 'post' && selectedPost && (
              <div className="flex justify-center">
                {renderSocialPreview(selectedPost, postPreviewChannel)}
              </div>
            )}

            {/* ─── Post Quality Score ─── */}
            {previewMode === 'score' && selectedPost && postScore && (
              <Card className="p-6 space-y-6 border border-slate-200 bg-white/9580">
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    {renderScoreRing(postScore.overall, 100)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">
                      Post Quality: <span className={getScoreColor(postScore.overall)}>{getScoreLabel(postScore.overall)}</span>
                    </h3>
                    <p className="text-sm text-slate-600">
                      {postScore.overall >= 80
                        ? `This ${previewChannelLabel} variant is well-optimized for engagement.`
                        : postScore.overall >= 60
                          ? `Good start for ${previewChannelLabel} � check the tips below to boost performance.`
                          : 'This post needs improvements. Follow the tips below.'}
                    </p>
                  </div>
                </div>

                {selectedPost.qualityBreakdown && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-800/25">
                    <strong>AI fit breakdown:</strong>{" "}
                    relevance {selectedPost.qualityBreakdown.relevance}, clarity{" "}
                    {selectedPost.qualityBreakdown.clarity}, CTA {selectedPost.qualityBreakdown.cta},
                    evidence {selectedPost.qualityBreakdown.evidence}, readability{" "}
                    {selectedPost.qualityBreakdown.readability}
                  </div>
                )}

                <div className="space-y-3">
                  {postScore.breakdown.map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{item.icon}</span>
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <span className={`text-sm font-bold ${getScoreColor(item.score)}`}>{item.score}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${getScoreBg(item.score)}`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                      <div className="flex items-start gap-1.5">
                        {item.score >= 80 ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                        ) : item.score >= 60 ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Target className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                        )}
                        <span className="text-xs text-slate-600">{item.tip}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-200">
                  <Button size="sm" variant="outline" onClick={() => selectedPost && startEditing(selectedPost)}>
                    <Edit3 className="w-3 h-3 mr-1" />
                    Edit to Improve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => selectedPost && regeneratePost(selectedPost)}>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Regenerate
                  </Button>
                </div>
              </Card>
            )}

            {/* ─── Edit Mode ─── */}
            {previewMode === 'edit' && selectedPost && (
              <Card className="p-6 space-y-4 border border-slate-200 bg-white/9580">
                <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-700/20">
                  Editing <strong>{previewChannelLabel}</strong> variant.
                  Recommended body length: {previewGuidance.minChars}-{previewGuidance.maxChars} characters.
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Headline</label>
                  <Input
                    value={editHeadline}
                    onChange={(e) => setEditHeadline(e.target.value)}
                    placeholder="Post headline..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Body</label>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    placeholder="Post body..."
                    className="resize-none"
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-xs text-gray-400">{editBody.length} / 3,000 characters</p>
                    <p className={`text-xs font-medium ${editBody.length >= previewGuidance.minChars && editBody.length <= previewGuidance.maxChars ? 'text-green-600' : editBody.length > previewGuidance.hardMaxChars ? 'text-red-500' : 'text-yellow-600'}`}>
                      {editBody.length < previewGuidance.minChars ? 'Too short' : editBody.length <= previewGuidance.maxChars ? 'Optimal' : editBody.length <= previewGuidance.hardMaxChars ? 'Getting long' : 'Too long'}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Call to Action</label>
                  <Input
                    value={editCta}
                    onChange={(e) => setEditCta(e.target.value)}
                    placeholder="Learn more, Sign up, etc."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">Hashtags</label>
                    <button
                      onClick={() => setShowHashtags(!showHashtags)}
                      className="text-xs text-cyan-600 hover:text-cyan-700 font-medium flex items-center gap-1"
                    >
                      <Hash className="w-3 h-3" />
                      {showHashtags ? 'Hide' : 'Show'} Suggestions
                    </button>
                  </div>
                  <Input
                    value={editHashtags}
                    onChange={(e) => setEditHashtags(e.target.value)}
                    placeholder="tag1, tag2, tag3"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {editHashtags.split(',').filter(t => t.trim()).length} hashtags — {
                      editHashtags.split(',').filter(t => t.trim()).length >= 3 && editHashtags.split(',').filter(t => t.trim()).length <= 5
                        ? '✅ Optimal (3-5)'
                        : editHashtags.split(',').filter(t => t.trim()).length > 5
                          ? '⚠️ Too many'
                          : '💡 Add more (3-5 is ideal)'
                    }
                  </p>
                </div>

                {/* Hashtag suggestions */}
                {showHashtags && (
                  <div className="p-3 rounded-xl bg-cyan-100/70 border border-cyan-200 space-y-2">
                    <p className="text-xs text-cyan-800 font-medium"># Click a group to add relevant hashtags:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {HASHTAG_GROUPS.map((group) => (
                        <button
                          key={group.label}
                          onClick={() => addHashtagGroup(group.tags)}
                          className="text-left p-2 rounded-lg bg-white/9070 border border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50/30 transition-all"
                        >
                          <div className="text-xs font-medium">{group.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {group.tags.map(t => `#${t}`).join(' ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={saveEdits} className="bg-green-600 hover:bg-green-700">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setPreviewMode('post')}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}

            {/* ─── Image Mode ─── */}
            {previewMode === 'image' && selectedPost && (
              <Card className="p-6 border border-slate-200 bg-white/9580">
                {selectedPost.imageUrl ? (
                  <div className="space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedPost.imageUrl} alt="Generated" className="w-full rounded-lg" />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => generateImage(selectedPost)}
                      disabled={generatingImage}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate Image
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-slate-600 mb-4">No image generated yet</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => generateImage(selectedPost)}
                        disabled={generatingImage || generatingComplete}
                        variant="outline"
                      >
                        {generatingImage ? (
                          <>
                            <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                            Generating Base...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Base Image Only
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => generateCompletedPost(selectedPost)}
                        disabled={generatingImage || generatingComplete}
                        className="bg-gradient-to-r from-purple-500 to-pink-500"
                      >
                        {generatingComplete ? (
                          <>
                            <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                            Generating Complete...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Complete Post
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Empty State ─── */}
      {generatedPosts.length === 0 && !generating && (
        <Card className="relative overflow-hidden p-12 text-center border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-100/50 shadow-[0_12px_30px_-24px_rgba(6,182,212,0.65)]">
          <div className="absolute -top-20 right-0 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl500/20" />
          <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mb-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-2">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <p className="text-xs text-slate-700 font-medium">Choose Tone</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-xs text-slate-700 font-medium">Pick Framework</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-cyan-100 flex items-center justify-center mx-auto mb-2">
                <Wand2 className="w-6 h-6 text-cyan-600" />
              </div>
              <p className="text-xs text-slate-700 font-medium">Generate</p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">
            Ready to Create Amazing Posts
          </h3>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            Select your tone, pick a framework, describe your topic, and let AI generate
            platform-ready posts for LinkedIn, Facebook, and Instagram.
          </p>
        </Card>
      )}
    </div>
  );
}
