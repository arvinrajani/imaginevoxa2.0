'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  Copy,
  Check,
  Search,
  Sparkles,
  Loader2,
  ArrowRight,
  MessageSquare,
  BarChart3,
  AlertTriangle,
  BookOpen,
  HelpCircle,
  Trophy,
  Heart,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

interface Hook {
  id: string;
  text: string;
  category: string;
  type: string;
  engagement_level: 'high' | 'medium' | 'viral';
  best_for: string;
}

const HOOK_LIBRARY: Hook[] = [
  // Bold Statements
  { id: 'bold-1', text: 'Most people get {topic} completely wrong.', category: 'bold', type: 'Bold Statement', engagement_level: 'high', best_for: 'Contrarian takes' },
  { id: 'bold-2', text: 'I spent {time} learning {topic} so you don\'t have to.', category: 'bold', type: 'Bold Statement', engagement_level: 'viral', best_for: 'Sharing expertise' },
  { id: 'bold-3', text: 'Stop doing {bad_practice}. Here\'s what works instead:', category: 'bold', type: 'Bold Statement', engagement_level: 'high', best_for: 'Correcting misconceptions' },
  { id: 'bold-4', text: '{topic} is broken. Here\'s how I\'d fix it.', category: 'bold', type: 'Bold Statement', engagement_level: 'high', best_for: 'Thought leadership' },
  { id: 'bold-5', text: 'Unpopular opinion: {opinion}.', category: 'bold', type: 'Bold Statement', engagement_level: 'viral', best_for: 'Debate starters' },
  { id: 'bold-6', text: 'The harsh truth about {topic} that nobody talks about:', category: 'bold', type: 'Bold Statement', engagement_level: 'high', best_for: 'Authentic insights' },

  // Questions
  { id: 'q-1', text: 'What would you do if {scenario}?', category: 'question', type: 'Question', engagement_level: 'high', best_for: 'Community engagement' },
  { id: 'q-2', text: 'Why do {percent}% of {group} fail at {topic}?', category: 'question', type: 'Question', engagement_level: 'high', best_for: 'Data-driven posts' },
  { id: 'q-3', text: 'Is {common_belief} actually true? Let me share what I found:', category: 'question', type: 'Question', engagement_level: 'medium', best_for: 'Myth-busting' },
  { id: 'q-4', text: 'What\'s the one skill that changed your career? For me, it was {skill}.', category: 'question', type: 'Question', engagement_level: 'viral', best_for: 'Personal branding' },
  { id: 'q-5', text: 'If you could give your younger self one piece of advice about {topic}, what would it be?', category: 'question', type: 'Question', engagement_level: 'viral', best_for: 'Reflection posts' },

  // Stories
  { id: 'story-1', text: '{time_ago}, I was {situation}. Today, I {achievement}. Here\'s what changed:', category: 'story', type: 'Story', engagement_level: 'viral', best_for: 'Transformation stories' },
  { id: 'story-2', text: 'I got rejected from {thing}. It was the best thing that happened to me.', category: 'story', type: 'Story', engagement_level: 'viral', best_for: 'Resilience narratives' },
  { id: 'story-3', text: 'Last week, something happened that completely changed how I think about {topic}.', category: 'story', type: 'Story', engagement_level: 'high', best_for: 'Lesson-learned posts' },
  { id: 'story-4', text: 'My biggest mistake in {field}? {mistake}. Here\'s the lesson:', category: 'story', type: 'Story', engagement_level: 'high', best_for: 'Vulnerability posts' },
  { id: 'story-5', text: 'I talked to {number} {people} about {topic}. The #1 thing they all said:', category: 'story', type: 'Story', engagement_level: 'high', best_for: 'Research insights' },

  // Data & Numbers
  { id: 'data-1', text: '{number}% of {group} don\'t know this about {topic}:', category: 'data', type: 'Data Point', engagement_level: 'high', best_for: 'Educational content' },
  { id: 'data-2', text: 'We went from {before_metric} to {after_metric} in {timeframe}. Here\'s exactly how:', category: 'data', type: 'Data Point', engagement_level: 'viral', best_for: 'Case studies' },
  { id: 'data-3', text: '{number} {things} I learned after {experience}:', category: 'data', type: 'Data Point', engagement_level: 'high', best_for: 'Listicle posts' },
  { id: 'data-4', text: 'I analyzed {number} {things}. Here are the {count} patterns that stood out:', category: 'data', type: 'Data Point', engagement_level: 'high', best_for: 'Analysis posts' },

  // Emotional
  { id: 'emo-1', text: 'This is your sign to {action}. You\'ve been waiting too long.', category: 'emotional', type: 'Emotional', engagement_level: 'medium', best_for: 'Motivational content' },
  { id: 'emo-2', text: 'To everyone struggling with {challenge}: You\'re not alone.', category: 'emotional', type: 'Emotional', engagement_level: 'high', best_for: 'Community building' },
  { id: 'emo-3', text: 'I\'m grateful for {thing}. Here\'s why it matters more than you think:', category: 'emotional', type: 'Emotional', engagement_level: 'medium', best_for: 'Gratitude posts' },
  { id: 'emo-4', text: 'The moment I stopped {old_behavior}, everything changed.', category: 'emotional', type: 'Emotional', engagement_level: 'high', best_for: 'Growth stories' },

  // Lists & Frameworks
  { id: 'list-1', text: '{number} things I wish I knew before {experience}:', category: 'framework', type: 'Framework', engagement_level: 'high', best_for: 'Advice posts' },
  { id: 'list-2', text: 'My {number}-step framework for {outcome}:', category: 'framework', type: 'Framework', engagement_level: 'high', best_for: 'How-to content' },
  { id: 'list-3', text: '{topic} cheat sheet (save this for later):', category: 'framework', type: 'Framework', engagement_level: 'viral', best_for: 'Save-worthy content' },
  { id: 'list-4', text: 'How to {outcome} without {common_approach}:', category: 'framework', type: 'Framework', engagement_level: 'high', best_for: 'Alternative solutions' },
];

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  bold: { icon: <AlertTriangle className="h-4 w-4" />, label: 'Bold Statements', color: 'text-red-500' },
  question: { icon: <HelpCircle className="h-4 w-4" />, label: 'Questions', color: 'text-blue-500' },
  story: { icon: <BookOpen className="h-4 w-4" />, label: 'Stories', color: 'text-green-500' },
  data: { icon: <BarChart3 className="h-4 w-4" />, label: 'Data & Numbers', color: 'text-orange-500' },
  emotional: { icon: <Heart className="h-4 w-4" />, label: 'Emotional', color: 'text-pink-500' },
  framework: { icon: <Target className="h-4 w-4" />, label: 'Frameworks', color: 'text-purple-500' },
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  viral: 'bg-red-100 text-red-700/30',
  high: 'bg-green-100 text-green-700/30',
  medium: 'bg-yellow-100 text-yellow-700/30',
};

interface HookLibraryProps {
  onUseHook?: (hookText: string) => void;
  onCompletePost?: (hookText: string) => void;
}

export default function HookLibrary({ onUseHook, onCompletePost }: HookLibraryProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);

  const filteredHooks = useMemo(() => {
    let hooks = HOOK_LIBRARY;
    if (selectedCategory !== 'all') {
      hooks = hooks.filter((h) => h.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      hooks = hooks.filter(
        (h) =>
          h.text.toLowerCase().includes(q) ||
          h.type.toLowerCase().includes(q) ||
          h.best_for.toLowerCase().includes(q)
      );
    }
    return hooks;
  }, [selectedCategory, search]);

  const handleCopy = (hook: Hook) => {
    navigator.clipboard.writeText(hook.text);
    setCopiedId(hook.id);
    toast.success('Hook copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUse = (hook: Hook) => {
    if (onUseHook) {
      onUseHook(hook.text);
      toast.success('Hook loaded into composer');
    } else {
      navigator.clipboard.writeText(hook.text);
      toast.success('Hook copied to clipboard');
    }
  };

  const handleExpandWithAI = async (hook: Hook) => {
    if (!onCompletePost) {
      toast.info('AI completion is available when using this within the composer');
      return;
    }
    setExpandingId(hook.id);
    onCompletePost(hook.text);
    setTimeout(() => setExpandingId(null), 1000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Hook Library
          </CardTitle>
          <CardDescription>
            Proven LinkedIn opening lines — pick one and let AI complete your post
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search hooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory('all')}
            >
              All ({HOOK_LIBRARY.length})
            </Badge>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <Badge
                key={key}
                variant={selectedCategory === key ? 'default' : 'outline'}
                className="cursor-pointer flex items-center gap-1"
                onClick={() => setSelectedCategory(key)}
              >
                {config.icon}
                {config.label} ({HOOK_LIBRARY.filter((h) => h.category === key).length})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hooks Grid */}
      <div className="grid gap-3">
        {filteredHooks.map((hook) => (
          <Card key={hook.id} className="group hover:shadow-md transition-shadow">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium leading-relaxed">
                    &ldquo;{hook.text}&rdquo;
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs shrink-0 ${ENGAGEMENT_COLORS[hook.engagement_level]}`}
                >
                  {hook.engagement_level === 'viral' && <Trophy className="h-3 w-3 mr-1" />}
                  {hook.engagement_level}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_CONFIG[hook.category]?.icon}
                    <span className="ml-1">{hook.type}</span>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Best for: {hook.best_for}
                  </span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(hook)}
                    className="h-7 px-2"
                  >
                    {copiedId === hook.id ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUse(hook)}
                    className="h-7 px-2"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  {onCompletePost && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleExpandWithAI(hook)}
                      disabled={expandingId === hook.id}
                      className="h-7 px-2"
                    >
                      {expandingId === hook.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1 text-xs">AI Complete</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredHooks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hooks match your search. Try different keywords.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
