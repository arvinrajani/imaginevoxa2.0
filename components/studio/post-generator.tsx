'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostGeneratorProps {
  brandId: string;
  brandColors?: string[];
  brandName?: string;
  logoUrl?: string;
  onPostGenerated: (post: GeneratedPost) => void;
  /** Called when user confirms a post and wants to move to image creation */
  onPostConfirmed?: (post: GeneratedPost) => void;
}

interface GeneratedPost {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
  testHypothesis?: string;
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

const TONE_DEFAULTS: Record<string, { emojiMin: number; emojiMax: number }> = {
  professional: { emojiMin: 0, emojiMax: 2 },
  conversational: { emojiMin: 1, emojiMax: 4 },
  inspiring: { emojiMin: 2, emojiMax: 6 },
  provocative: { emojiMin: 0, emojiMax: 3 },
  educational: { emojiMin: 0, emojiMax: 2 },
  storytelling: { emojiMin: 1, emojiMax: 4 },
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

function scorePost(post: GeneratedPost): {
  overall: number;
  breakdown: { label: string; score: number; tip: string; icon: string }[];
} {
  const breakdown: { label: string; score: number; tip: string; icon: string }[] = [];

  // 1. Hook strength (headline)
  const headlineLen = (post.headline || '').length;
  const hasHook = /[?!:]|\d|mistake|secret|stop|never|always|how|why/i.test(post.headline || '');
  const hookScore = Math.min(100, (headlineLen > 10 ? 30 : 10) + (headlineLen < 80 ? 30 : 15) + (hasHook ? 40 : 10));
  breakdown.push({
    label: 'Hook Strength',
    score: hookScore,
    tip: hookScore < 70 ? 'Use numbers, questions, or power words to grab attention' : 'Great hook!',
    icon: '🎣',
  });

  // 2. Body length (sweet spot: 150-1200 chars)
  const bodyLen = (post.body || '').length;
  let lenScore = 0;
  if (bodyLen < 50) lenScore = 20;
  else if (bodyLen < 150) lenScore = 50;
  else if (bodyLen <= 1200) lenScore = 100;
  else if (bodyLen <= 2000) lenScore = 80;
  else lenScore = 60;
  breakdown.push({
    label: 'Ideal Length',
    score: lenScore,
    tip: bodyLen < 150 ? 'Posts with 150-1200 characters get the most engagement' : bodyLen > 2000 ? 'Consider shortening — concise posts perform better' : 'Perfect length!',
    icon: '📏',
  });

  // 3. Readability (short sentences, line breaks, whitespace)
  const sentences = (post.body || '').split(/[.!?]+/).filter(Boolean);
  const avgSentenceLen = sentences.length ? (post.body || '').length / sentences.length : 999;
  const lineBreaks = (post.body || '').split('\n\n').length - 1;
  const readScore = Math.min(100, (avgSentenceLen < 120 ? 40 : 15) + (lineBreaks >= 2 ? 40 : lineBreaks * 15) + (sentences.length >= 3 ? 20 : 10));
  breakdown.push({
    label: 'Readability',
    score: readScore,
    tip: readScore < 70 ? 'Add line breaks and keep sentences short for easy scanning' : 'Easy to read!',
    icon: '👁️',
  });

  // 4. CTA presence & quality
  const hasCta = (post.cta || '').length > 3;
  const ctaHasAction = /comment|share|follow|like|click|visit|sign|join|tell|drop|DM/i.test(post.cta || '');
  const ctaScore = hasCta ? (ctaHasAction ? 100 : 65) : 20;
  breakdown.push({
    label: 'Call to Action',
    score: ctaScore,
    tip: !hasCta ? 'Add a CTA — posts with CTAs get 3x more engagement' : !ctaHasAction ? 'Use action verbs like "Comment", "Share", "Follow"' : 'Strong CTA!',
    icon: '🎯',
  });

  // 5. Hashtags (3-5 is optimal for LinkedIn)
  const tagCount = (post.hashtags || []).length;
  let tagScore = 0;
  if (tagCount === 0) tagScore = 20;
  else if (tagCount >= 3 && tagCount <= 5) tagScore = 100;
  else if (tagCount >= 1 && tagCount <= 7) tagScore = 70;
  else tagScore = 40;
  breakdown.push({
    label: 'Hashtags',
    score: tagScore,
    tip: tagCount === 0 ? 'Add 3-5 relevant hashtags for discoverability' : tagCount > 5 ? 'Reduce to 3-5 — too many hashtags look spammy' : 'Good hashtag count!',
    icon: '#️⃣',
  });

  // 6. Emoji usage
  const emojiCount = ((post.body || '') + (post.headline || '')).match(/[\u{1F600}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6C5}]/gu)?.length || 0;
  const emojiScore = emojiCount >= 1 && emojiCount <= 5 ? 100 : emojiCount === 0 ? 50 : 60;
  breakdown.push({
    label: 'Visual Appeal',
    score: emojiScore,
    tip: emojiCount === 0 ? 'Add 1-3 emojis to break up text and add visual interest' : emojiCount > 5 ? 'Too many emojis can look unprofessional' : 'Nice visual balance!',
    icon: '✨',
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
  if (score >= 80) return 'bg-green-500';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PostGenerator({
  brandId,
  brandColors = ['#0A66C2'],
  brandName = 'Your Brand',
  logoUrl,
  onPostGenerated,
  onPostConfirmed,
}: PostGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [previewMode, setPreviewMode] = useState<'post' | 'edit' | 'image' | 'score'>('post');
  const [generatingComplete, setGeneratingComplete] = useState(false);

  // Content framework & tone
  const [selectedFramework, setSelectedFramework] = useState<string>('');
  const [selectedTone, setSelectedTone] = useState<string>('professional');
  const [postLength, setPostLength] = useState<'short' | 'standard' | 'long'>('long');
  const [postStyle, setPostStyle] = useState<PostStructureStyle>('natural');
  const [showHooks, setShowHooks] = useState(false);
  const [showHashtags, setShowHashtags] = useState(false);
  const [showOutcomeBrief, setShowOutcomeBrief] = useState(false);
  const [experimentMode, setExperimentMode] = useState(true);
  const [experimentAxes, setExperimentAxes] = useState<string[]>(['hook', 'cta']);
  const [emojiRange, setEmojiRange] = useState<{ min: number; max: number }>({ min: 0, max: 2 });
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

  // Editable fields
  const [editHeadline, setEditHeadline] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCta, setEditCta] = useState('');
  const [editHashtags, setEditHashtags] = useState('');

  // Score for selected post
  const postScore = useMemo(() => {
    if (!selectedPost) return null;
    return scorePost(selectedPost);
  }, [selectedPost]);

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

  useEffect(() => {
    const defaults = TONE_DEFAULTS[selectedTone];
    if (!defaults) return;
    setEmojiRange({ min: defaults.emojiMin, max: defaults.emojiMax });
  }, [selectedTone]);

  const startEditing = useCallback((post: GeneratedPost) => {
    setEditHeadline(post.headline);
    setEditBody(post.body);
    setEditCta(post.cta);
    setEditHashtags(post.hashtags.join(', '));
    setPreviewMode('edit');
  }, []);

  const saveEdits = useCallback(() => {
    if (!selectedPost) return;
    const updatedPost: GeneratedPost = {
      ...selectedPost,
      headline: editHeadline,
      body: editBody,
      cta: editCta,
      hashtags: editHashtags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    };
    setSelectedPost(updatedPost);
    setGeneratedPosts((prev) => prev.map((p) => (p === selectedPost ? updatedPost : p)));
    setPreviewMode('post');
    toast.success('Post updated');
  }, [selectedPost, editHeadline, editBody, editCta, editHashtags]);

  const toggleExperimentAxis = useCallback((axis: string) => {
    setExperimentAxes((prev) => {
      if (prev.includes(axis)) {
        return prev.filter((item) => item !== axis);
      }
      if (prev.length >= 3) return prev;
      return [...prev, axis];
    });
  }, []);

  const applyPromptPreset = useCallback((presetId: string) => {
    const preset = PROMPT_COPILOT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const audience = outcomeBrief.audience || 'B2B decision-makers';
    const pain = outcomeBrief.painPoint || 'slow or inconsistent results';
    const solution = outcomeBrief.solution || 'a practical step-by-step method';
    const proof = outcomeBrief.proof || 'real implementation details';
    const cta = outcomeBrief.offer || 'share your use case';
    const before = outcomeBrief.painPoint || 'manual process and weak outcomes';
    const intervention = outcomeBrief.solution || 'focused execution plan';
    const result = outcomeBrief.proof || 'measurable improvement over time';
    const lesson = outcomeBrief.goal || 'clarity beats complexity';
    const opinion = outcomeBrief.goal || 'simple systems outperform scattered tactics';
    const context = outcomeBrief.audience || 'most teams in this market';
    const framework = selectedFramework || 'problem -> solution -> proof';

    const renderByPreset: Record<string, string> = {
      solution: `Write a LinkedIn post for ${audience} who struggle with ${pain}. Explain a practical solution: ${solution}. Include proof: ${proof}. End with CTA: ${cta}.`,
      'case-study': `Create a case-study LinkedIn post. Before: ${before}. What we changed: ${intervention}. Result: ${result}. Key lesson: ${lesson}. End with CTA: ${cta}.`,
      'thought-leadership': `Write a thought-leadership post with this viewpoint: ${opinion}. Context: ${context}. Use framework: ${framework}. End with practical next step and CTA: ${cta}.`,
    };
    const fallbackRender = preset.template
      .replace('{audience}', audience)
      .replace('{pain}', pain)
      .replace('{solution}', solution)
      .replace('{proof}', proof)
      .replace('{cta}', cta)
      .replace('{before}', before)
      .replace('{intervention}', intervention)
      .replace('{result}', result)
      .replace('{lesson}', lesson)
      .replace('{opinion}', opinion)
      .replace('{context}', context)
      .replace('{framework}', framework);

    const render = renderByPreset[presetId] || fallbackRender;
    setTopic(sanitizeTemplatePlaceholders(render));
    setSelectedPromptPreset(presetId);
  }, [outcomeBrief, selectedFramework]);

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
          campaign: outcomeBrief.goal || topic || 'linkedin-campaign',
          source: 'linkedin',
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
      setSelectedPost(updatedPost);
      setGeneratedPosts((prev) => prev.map((p) => (p === post ? updatedPost : p)));

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

    setGenerating(true);
    try {
      let posts: GeneratedPost[] = [];

      const response = await fetch('/api/pro/post-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: normalizedPrompt,
          count: 3,
          solutionMode: postStyle === 'problem-solution',
          structureStyle: postStyle,
          experimentMode,
          experimentAxes,
          length: postLength,
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
        const detail = errData.error || errData.detail || '';
        if (response.status === 405) {
          throw new Error('Post generator route is unavailable (405). Refresh and try again.');
        }
        throw new Error(detail || `Generation failed (${response.status})`);
      }

      const data = await response.json();
      const { options, fallback, warning, fallbackReason } = data;
      posts = (options || []).map((opt: { headline: string; body: string; cta: string; hashtags?: string[]; image_prompt?: string; variant_label?: string; test_hypothesis?: string }) => ({
        headline: opt.headline,
        body: opt.body,
        cta: opt.cta,
        hashtags: opt.hashtags || [],
        imagePrompt: opt.image_prompt || opt.headline,
        variantLabel: opt.variant_label,
        testHypothesis: opt.test_hypothesis,
      }));

      if (posts.length === 0) throw new Error('No posts generated');

      setGeneratedPosts(posts);
      if (posts.length > 0) {
        setSelectedPost(posts[0]);
        setPreviewMode('post');
      }

      if (fallback) {
        toast.warning('AI was unavailable — showing template results', {
          description: fallbackReason
            ? `Using fallback: ${fallbackReason}`
            : 'Try regenerating for AI-powered content.',
          duration: 6000,
        });
      } else {
        toast.success(`${posts.length} variation${posts.length > 1 ? 's' : ''} generated`);
      }
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
      setSelectedPost(updatedPost);
      setGeneratedPosts((prev) => prev.map((p) => (p === post ? updatedPost : p)));
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
          prompt: sanitizeTemplatePlaceholders(`${post.headline}. Regenerate with different angle.`),
          count: 1,
          solutionMode: postStyle === 'problem-solution',
          structureStyle: postStyle,
          experimentMode: true,
          experimentAxes: ['angle'],
          length: postLength,
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Regeneration failed');
      }

      const data = await response.json();
      const options = data.options || [];

      if (options.length > 0) {
        const newPost: GeneratedPost = {
          headline: options[0].headline,
          body: options[0].body,
          cta: options[0].cta,
          hashtags: options[0].hashtags || [],
          imagePrompt: options[0].image_prompt || options[0].headline,
          variantLabel: options[0].variant_label,
          testHypothesis: options[0].test_hypothesis,
        };

        setGeneratedPosts((prev) => prev.map((p) => (p === post ? newPost : p)));
        if (selectedPost === post) {
          setSelectedPost(newPost);
        }
        toast.success('Post regenerated');
      }
    } catch {
      toast.error('Regeneration failed');
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
    setSavingDraft(true);

    try {
      const response = await fetch('/api/pro/post/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: topic || selectedPost.imagePrompt || selectedPost.headline,
          headline: selectedPost.headline,
          body: selectedPost.body,
          cta: selectedPost.cta,
          hashtags: selectedPost.hashtags,
          imageUrl: selectedPost.imageUrl,
          imagePrompt: selectedPost.imagePrompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to save draft');

      const data = await response.json();
      toast.success('Saved as draft', { description: `Post ID: ${data.postId}` });
      onPostGenerated(selectedPost);
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
      const updated = { ...selectedPost, hashtags: merged };
      setSelectedPost(updated);
      setGeneratedPosts((prev) => prev.map((p) => (p === selectedPost ? updated : p)));
      toast.success(`${tags.length} hashtags added`);
    }
  }, [previewMode, editHashtags, selectedPost]);

  const renderLinkedInPreview = (post: GeneratedPost) => {
    return (
      <div className="w-full max-w-[620px] rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
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
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{brandName || 'Your Brand'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Just now | Public</div>
          </div>
        </div>

        {/* Post Content */}
        <div className="px-5 pb-4">
          <p className="whitespace-pre-wrap text-[16px] leading-7 text-slate-800 dark:text-slate-200">
            {post.headline && <span className="font-semibold block mb-2">{post.headline}</span>}
            {post.body}
          </p>
          {post.hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {post.hashtags.map((tag) => (
                <span key={tag} className="text-cyan-600 dark:text-cyan-400 text-sm">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Image */}
        {post.imageUrl && (
          <div className="w-full bg-slate-100 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt="Post visual"
              className="w-full object-contain"
              style={{ maxHeight: '420px' }}
            />
          </div>
        )}

        {/* CTA Bar */}
        {post.cta && (
          <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-5 py-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
              style={{ borderColor: brandColors[0] || '#0A66C2' }}
            >
              {post.cta}
            </Button>
          </div>
        )}

        {/* Engagement Buttons (decorative) */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <button className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded">
              <ThumbsUp className="w-4 h-4" />
              Like
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded">
              Comment
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded">
              Repost
            </button>
            <button className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded">
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
      <Card className="relative overflow-hidden border border-cyan-200/70 bg-gradient-to-br from-[#e8f6ff] via-[#f5fbff] to-[#eef5ff] shadow-[0_18px_40px_-26px_rgba(14,116,144,0.6)] dark:border-cyan-800/40 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/35">
        <div className="absolute -top-16 -right-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/20" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/20" />
        <div className="relative p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
                AI Writing Studio
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                Build a Better LinkedIn Post in Minutes
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Strong prompt, strong tone, clear CTA. Configure once and generate multiple polished options with a real preview.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-white/85 px-4 py-3 text-sm shadow-sm dark:border-cyan-800 dark:bg-slate-900/80">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Current Setup</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{activeToneLabel.replace(/^[^\s]+\s/, '')} Tone</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {postLength} length • {activeFrameworkLabel} framework
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-200/80 bg-white/80 px-4 py-3 dark:border-cyan-800/60 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Prompt</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {topic.trim() ? 'Ready' : 'Waiting for topic'}
              </p>
            </div>
            <div className="rounded-xl border border-violet-200/80 bg-white/80 px-4 py-3 dark:border-violet-800/60 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Outcome Brief</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {completedOutcomeFields}/7 fields
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-white/80 px-4 py-3 dark:border-emerald-800/60 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Options Generated</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {generatedPosts.length} option{generatedPosts.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── STEP 1: What do you want to post about? (FIRST) ─── */}
      <Card className="relative overflow-hidden p-7 border border-cyan-200 dark:border-cyan-700/60 bg-gradient-to-br from-white via-cyan-50/60 to-sky-100/70 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 shadow-[0_12px_32px_-22px_rgba(14,116,144,0.65)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <div className="w-7 h-7 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                What do you want to post about?
              </label>
              <button
                onClick={() => setShowHooks(!showHooks)}
                className="text-sm text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-100/90 border border-amber-200 hover:bg-amber-200/80 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {showHooks ? 'Hide' : 'Need'} Hook Ideas
                {showHooks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Hook Lines Library */}
            {showHooks && (
              <div className="mb-3 p-4 rounded-xl bg-amber-100/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-2">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">🎣 Click any hook to use it as your starting point:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
                  {HOOK_LINES.map((hook, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setTopic(hook.hook);
                        setShowHooks(false);
                      }}
                      className="text-left px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-sm hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
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
              placeholder="Describe your post topic in detail — the more specific, the better the AI output.&#10;&#10;Examples:&#10;• Share 5 lessons from growing our team from 2 to 20&#10;• Announce our new AI feature that saves marketers 3 hours/week&#10;• Tell the story of how we pivoted and grew 10x"
              className="min-h-[150px] text-base leading-7 bg-white/95 dark:bg-slate-950/70 border-2 border-cyan-200 dark:border-cyan-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-cyan-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  generatePosts();
                }
              }}
            />
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono">Ctrl+Enter</kbd>
              <span>to generate instantly</span>
            </p>

            <div className="mt-4 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-gradient-to-r from-cyan-100/70 to-blue-100/60 dark:from-cyan-950/20 dark:to-blue-950/15 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-800 dark:text-cyan-300">
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
                    className="h-10 bg-white dark:bg-slate-900 pl-9 border-cyan-200 dark:border-cyan-700 focus-visible:ring-cyan-500"
                  />
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                </div>
                <div className="relative">
                  <Input
                    value={chatbotLink}
                    onChange={(e) => setChatbotLink(e.target.value)}
                    onBlur={() => setChatbotLink((prev) => normalizeOptionalUrl(prev))}
                    placeholder="Chatbot URL (e.g. https://wa.me/...)"
                    className="h-10 bg-white dark:bg-slate-900 pl-9 border-cyan-200 dark:border-cyan-700 focus-visible:ring-cyan-500"
                  />
                  <Bot className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                </div>
              </div>
              <p className="mt-2 text-xs text-cyan-700 dark:text-cyan-300">
                If provided, AI will add these links in the final CTA section of your generated post.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── STEP 2: Style & Strategy (collapsible, cleaner) ─── */}
      <Card className="relative overflow-hidden p-6 border border-violet-200/80 dark:border-violet-800/40 bg-gradient-to-br from-white via-violet-50/50 to-indigo-100/50 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/25 shadow-[0_12px_36px_-24px_rgba(79,70,229,0.55)]">
        <div className="absolute -top-16 right-0 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-600/20" />
        <div className="space-y-5">
          {/* Tone Selector — larger, clearer */}
          <div>
            <label className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <div className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</div>
              Tone, Framework & Style
            </label>
            <p className="text-base text-slate-700 dark:text-slate-300 mb-4">Pick tone and structure. Natural is default and avoids rigid challenge/solution labels.</p>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5">
              {TONE_PRESETS.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => setSelectedTone(tone.id)}
                  className={`px-3 py-3 rounded-xl text-left transition-all ${
                    selectedTone === tone.id
                      ? 'bg-violet-100/90 dark:bg-violet-900/30 border-2 border-violet-500 text-violet-800 dark:text-violet-200 font-semibold shadow-sm shadow-violet-500/20'
                      : 'bg-white/90 dark:bg-slate-900/70 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-600'
                  }`}
                >
                  <div className="text-sm font-semibold">{tone.label}</div>
                  <div className="text-xs mt-1 opacity-80">{tone.description}</div>
                </button>
              ))}
            </div>

            {/* Content Framework Selector */}
            <label className="text-sm font-medium mb-2 flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <BookOpen className="w-4 h-4 text-blue-500" />
              Content Framework
              <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {CONTENT_FRAMEWORKS.map((fw) => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedFramework(selectedFramework === fw.id ? '' : fw.id)}
                  className={`p-3.5 rounded-xl text-left transition-all ${
                    selectedFramework === fw.id
                      ? 'bg-blue-100/80 dark:bg-blue-900/25 border-2 border-blue-500 shadow-sm shadow-blue-500/20'
                      : 'bg-white/90 dark:bg-slate-900/70 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="text-sm font-semibold">{fw.label}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">{fw.description}</div>
                </button>
              ))}
            </div>
            {selectedFramework && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-blue-100/80 dark:bg-blue-900/25 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                💡 <strong>Tip:</strong> {CONTENT_FRAMEWORKS.find(f => f.id === selectedFramework)?.example}
              </div>
            )}

            <div className="mt-4">
              <label className="text-base font-semibold mb-2 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <MessageSquare className="w-4 h-4 text-emerald-500" />
                Post Length
              </label>
              <div className="grid grid-cols-3 gap-2">
                {LENGTH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPostLength(preset.id)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      postLength === preset.id
                        ? 'bg-emerald-100/80 dark:bg-emerald-900/30 border-2 border-emerald-500 shadow-sm shadow-emerald-500/20'
                        : 'bg-white/90 dark:bg-slate-900/70 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600'
                    }`}
                  >
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{preset.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-base font-semibold mb-2 block text-slate-800 dark:text-slate-200">
                Post Style
              </label>
              <Select value={postStyle} onValueChange={(value) => setPostStyle(value as PostStructureStyle)}>
                <SelectTrigger className="w-full h-11 bg-white dark:bg-slate-900 text-base border-slate-300 dark:border-slate-700 focus:ring-violet-500">
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
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {POST_STYLE_PRESETS.find((style) => style.id === postStyle)?.description}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── STEP 3: Outcome Brief (collapsible) ─── */}
      <Card className="relative overflow-hidden p-6 border border-emerald-200/80 dark:border-emerald-800/40 bg-gradient-to-br from-white via-emerald-50/55 to-cyan-100/55 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/25 shadow-[0_12px_36px_-24px_rgba(16,185,129,0.55)]">
        <div className="absolute -right-12 top-0 h-32 w-32 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/20" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">3</div>
              Outcome Brief
              <span className="text-sm font-normal text-slate-500 dark:text-slate-300 ml-1">(optional advanced input)</span>
            </label>
            <button
              onClick={() => setShowOutcomeBrief((prev) => !prev)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showOutcomeBrief ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' : 'bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'}`}
            >
              {showOutcomeBrief ? 'Hide' : 'Show'}
            </button>
          </div>
          {showOutcomeBrief && (
            <>
              <p className="text-base text-slate-700 dark:text-slate-300 -mt-1">Fill in what you know. AI uses this to write more targeted, conversion-focused posts.</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 -mt-1">
                Use this when you want explicit pain/solution/proof details injected. Leave blank for more natural posts.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Goal</label>
                  <Input
                    value={outcomeBrief.goal}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, goal: e.target.value }))}
                    placeholder="e.g. Book 10 demos this month"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Audience</label>
                  <Input
                    value={outcomeBrief.audience}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, audience: e.target.value }))}
                    placeholder="e.g. B2B SaaS founders, Series A-B"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Pain Point</label>
                  <Input
                    value={outcomeBrief.painPoint}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, painPoint: e.target.value }))}
                    placeholder="e.g. Wasting time on low-quality content"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Solution</label>
                  <Input
                    value={outcomeBrief.solution}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, solution: e.target.value }))}
                    placeholder="e.g. AI-powered content that converts"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">Proof</label>
                  <Input
                    value={outcomeBrief.proof}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, proof: e.target.value }))}
                    placeholder="e.g. 3x more engagement in 30 days"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">CTA Action</label>
                  <Input
                    value={outcomeBrief.offer}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, offer: e.target.value }))}
                    placeholder="e.g. DM me for a free audit"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">KPI Target</label>
                  <Input
                    value={outcomeBrief.kpiTarget}
                    onChange={(e) => setOutcomeBrief((prev) => ({ ...prev, kpiTarget: e.target.value }))}
                    placeholder="e.g. 25 qualified leads"
                    className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
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
                  className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
                <Button size="sm" variant="outline" onClick={buildTrackedLink} disabled={buildingUtm}>
                  {buildingUtm ? 'Building...' : 'Build UTM'}
                </Button>
              </div>
              {trackedUrl && (
                <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                  {trackedUrl}
                </div>
              )}
            </div>
          )}

          {/* Prompt Copilot */}
          <div>
            <label className="mb-2 block text-base font-semibold text-slate-800 dark:text-slate-100">Prompt Copilot</label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {PROMPT_COPILOT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPromptPreset(preset.id)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition-all ${
                    selectedPromptPreset === preset.id
                      ? 'border-cyan-500 bg-cyan-100/80 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 font-medium shadow-sm shadow-cyan-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 hover:border-cyan-300 dark:hover:border-cyan-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Experiment Controls — compact */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-100/70 dark:bg-indigo-950/20 p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-base font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Experiment Mode
              </label>
              <button
                onClick={() => setExperimentMode((prev) => !prev)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  experimentMode ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {experimentMode ? 'ON' : 'OFF'}
              </button>
            </div>
            {experimentMode && (
              <>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-2">AI will vary these axes across your post options:</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {['hook', 'cta', 'emotion', 'proof', 'angle'].map((axis) => (
                    <button
                      key={axis}
                      onClick={() => toggleExperimentAxis(axis)}
                      className={`rounded-full border px-3.5 py-2 text-sm capitalize transition-colors ${
                        experimentAxes.includes(axis)
                          ? 'border-indigo-500 bg-indigo-200 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-medium'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {axis}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-indigo-700 dark:text-indigo-300 mb-1 block">Min emojis</label>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      value={emojiRange.min}
                      onChange={(e) =>
                        setEmojiRange((prev) => ({
                          ...prev,
                          min: Math.max(0, Math.min(5, Number(e.target.value || 0))),
                        }))
                      }
                      className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-indigo-700 dark:text-indigo-300 mb-1 block">Max emojis</label>
                    <Input
                      type="number"
                      min={0}
                      max={8}
                      value={emojiRange.max}
                      onChange={(e) =>
                        setEmojiRange((prev) => ({
                          ...prev,
                          max: Math.max(prev.min, Math.min(8, Number(e.target.value || 0))),
                        }))
                      }
                      className="text-base h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ─── GENERATE — always at the bottom of config ─── */}
      <Card className="p-7 border border-cyan-300/80 dark:border-cyan-700/50 bg-gradient-to-r from-cyan-100/85 via-sky-100/70 to-blue-100/80 dark:from-cyan-950/35 dark:via-slate-900 dark:to-blue-950/35 shadow-[0_14px_36px_-24px_rgba(14,116,144,0.6)]">
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
              className="w-full py-7 text-base border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900"
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
            <p className="text-sm text-center text-slate-700 dark:text-slate-300">
              Fill in your topic above, then click Generate
            </p>
          )}

          {campaignSummary && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              ✅ {campaignSummary}
            </div>
          )}
        </div>
      </Card>

      {/* ─── Results ─── */}
      {generatedPosts.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          {/* Post Options List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Generated Options</h3>
            {generatedPosts.map((post, idx) => {
              const score = scorePost(post);
              return (
                <Card
                  key={idx}
                  onClick={() => {
                    setSelectedPost(post);
                    setPreviewMode('post');
                  }}
                  className={`p-4 cursor-pointer transition-all hover:shadow-md bg-white text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 ${
                    selectedPost === post ? 'ring-2 ring-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 shadow-[0_10px_24px_-18px_rgba(6,182,212,0.8)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="outline">Option {idx + 1}</Badge>
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-bold ${getScoreColor(score.overall)}`}>
                        {score.overall}
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
                    <p className="mb-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">{post.variantLabel}</p>
                  )}
                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-5">{post.body}</p>
                  <div className="flex gap-1 mt-2">
                    {post.imageUrl && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">
                        <Check className="w-2.5 h-2.5 mr-0.5" />
                        Image
                      </Badge>
                    )}
                    <Badge className={`text-[10px] ${score.overall >= 80 ? 'bg-green-100 text-green-700' : score.overall >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {getScoreLabel(score.overall)}
                    </Badge>
                  </div>
                  {onPostConfirmed && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPost(post);
                        onPostConfirmed(post);
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
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
                    const fullText = `${selectedPost.headline}\n\n${selectedPost.body}\n\n${selectedPost.hashtags.map((t) => `#${t}`).join(' ')}`;
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
                        onPostConfirmed(selectedPost);
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
            </div>

            {/* ─── LinkedIn Preview ─── */}
            {selectedPost?.testHypothesis && (
              <div className="rounded-md border border-indigo-200 bg-indigo-100/80 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-300">
                <strong>Experiment hypothesis:</strong> {selectedPost.testHypothesis}
              </div>
            )}

            {previewMode === 'post' && selectedPost && (
              <div className="flex justify-center">
                {renderLinkedInPreview(selectedPost)}
              </div>
            )}

            {/* ─── Post Quality Score ─── */}
            {previewMode === 'score' && selectedPost && postScore && (
              <Card className="p-6 space-y-6 border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80">
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    {renderScoreRing(postScore.overall, 100)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">
                      Post Quality: <span className={getScoreColor(postScore.overall)}>{getScoreLabel(postScore.overall)}</span>
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {postScore.overall >= 80
                        ? 'This post is well-optimized for LinkedIn engagement!'
                        : postScore.overall >= 60
                        ? 'Good start — check the tips below to boost performance.'
                        : 'This post needs improvements. Follow the tips below.'}
                    </p>
                  </div>
                </div>

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
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
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
                        <span className="text-xs text-slate-600 dark:text-slate-300">{item.tip}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
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
              <Card className="p-6 space-y-4 border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80">
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">{editBody.length} / 3,000 characters</p>
                    <p className={`text-xs font-medium ${editBody.length >= 150 && editBody.length <= 1200 ? 'text-green-600' : editBody.length > 2000 ? 'text-red-500' : 'text-yellow-600'}`}>
                      {editBody.length < 150 ? '⚠️ Too short' : editBody.length <= 1200 ? '✅ Optimal' : editBody.length <= 2000 ? '⚠️ Getting long' : '🔴 Too long'}
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                  <div className="p-3 rounded-xl bg-cyan-100/70 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 space-y-2">
                    <p className="text-xs text-cyan-800 dark:text-cyan-300 font-medium"># Click a group to add relevant hashtags:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {HASHTAG_GROUPS.map((group) => (
                        <button
                          key={group.label}
                          onClick={() => addHashtagGroup(group.tags)}
                          className="text-left p-2 rounded-lg bg-white/90 dark:bg-slate-900/70 border border-cyan-200 dark:border-cyan-800 hover:border-cyan-400 dark:hover:border-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-all"
                        >
                          <div className="text-xs font-medium">{group.label}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
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
              <Card className="p-6 border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80">
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
                    <p className="text-slate-600 dark:text-slate-300 mb-4">No image generated yet</p>
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
        <Card className="relative overflow-hidden p-12 text-center border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-white via-slate-50 to-cyan-100/50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 shadow-[0_12px_30px_-24px_rgba(6,182,212,0.65)]">
          <div className="absolute -top-20 right-0 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl dark:bg-cyan-500/20" />
          <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mb-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-2">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Choose Tone</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Pick Framework</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-cyan-100 flex items-center justify-center mx-auto mb-2">
                <Wand2 className="w-6 h-6 text-cyan-600" />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Generate</p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Ready to Create Amazing Posts
          </h3>
          <p className="text-slate-600 dark:text-slate-300 text-sm max-w-md mx-auto">
            Select your tone, pick a framework, describe your topic, and let AI generate
            professional LinkedIn posts scored for maximum engagement.
          </p>
        </Card>
      )}
    </div>
  );
}
