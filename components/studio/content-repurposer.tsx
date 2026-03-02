'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LinkIcon,
  Loader2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ThumbsUp,
  BookOpen,
  Target,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';

interface RepurposedPost {
  headline: string;
  body: string;
  hashtags: string[];
  angle: string;
  hook_type: string;
}

interface RepurposeResult {
  posts: RepurposedPost[];
  source_summary: string;
  key_takeaways: string[];
}

interface ContentRepurposerProps {
  brandId?: string;
  onUsePost?: (content: string) => void;
}

const HOOK_ICONS: Record<string, React.ReactNode> = {
  question: <BookOpen className="h-4 w-4" />,
  'bold statement': <Megaphone className="h-4 w-4" />,
  story: <BookOpen className="h-4 w-4" />,
  'data point': <Target className="h-4 w-4" />,
  'contrarian take': <Megaphone className="h-4 w-4" />,
};

const HOOK_COLORS: Record<string, string> = {
  question: 'bg-blue-100 text-blue-800',
  'bold statement': 'bg-purple-100 text-purple-800',
  story: 'bg-green-100 text-green-800',
  'data point': 'bg-orange-100 text-orange-800',
  'contrarian take': 'bg-red-100 text-red-800',
};

export default function ContentRepurposer({ brandId, onUsePost }: ContentRepurposerProps) {
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editedContent, setEditedContent] = useState('');

  const handleRepurpose = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      new URL(url);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/pro/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, brandId, tone, audience, goal }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to repurpose content');
      }

      const data: RepurposeResult = await res.json();
      setResult(data);
      toast.success('Content repurposed into 3 LinkedIn post variations!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to repurpose content');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (post: RepurposedPost, idx: number) => {
    const text = `${post.body}\n\n${post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleUsePost = (post: RepurposedPost) => {
    const text = `${post.body}\n\n${post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    if (onUsePost) {
      onUsePost(text);
      toast.success('Post loaded into composer');
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Post copied to clipboard');
    }
  };

  const startEditing = (idx: number, post: RepurposedPost) => {
    setEditingIdx(idx);
    setEditedContent(`${post.body}\n\n${post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`);
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-blue-500" />
            Content Repurposer
          </CardTitle>
          <CardDescription>
            Turn any article, blog post, or web page into engaging LinkedIn posts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Paste article URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button onClick={handleRepurpose} disabled={loading || !url.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Repurposing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Repurpose
                </>
              )}
            </Button>
          </div>

          {/* Advanced Options (collapsible) */}
          <details className="group">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Advanced options
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Tone
                </label>
                <Input
                  placeholder="e.g. professional, casual"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Target Audience
                </label>
                <Input
                  placeholder="e.g. CTOs, marketers"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Goal
                </label>
                <Input
                  placeholder="e.g. drive traffic, thought leadership"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
            <p className="text-lg font-medium">Analyzing content...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Extracting key insights and generating LinkedIn posts
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Source Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Source Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{result.source_summary}</p>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Key Takeaways
                </h4>
                <ul className="space-y-1">
                  {result.key_takeaways.map((takeaway, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <ThumbsUp className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                      {takeaway}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Post Variations */}
          <Tabs defaultValue="0" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              {result.posts.map((post, idx) => (
                <TabsTrigger key={idx} value={String(idx)} className="text-xs">
                  Variation {idx + 1}
                </TabsTrigger>
              ))}
            </TabsList>

            {result.posts.map((post, idx) => (
              <TabsContent key={idx} value={String(idx)}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={HOOK_COLORS[post.hook_type.toLowerCase()] || ''}
                        >
                          {HOOK_ICONS[post.hook_type.toLowerCase()] || (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1 capitalize">{post.hook_type}</span>
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {post.angle}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(post, idx)}
                          className="h-8"
                        >
                          {copiedIdx === idx ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUsePost(post)}
                          className="h-8"
                        >
                          <ArrowRight className="h-3.5 w-3.5 mr-1" />
                          Use This
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {editingIdx === idx ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="min-h-[200px] font-mono text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingIdx(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (onUsePost) {
                                onUsePost(editedContent);
                                toast.success('Edited post loaded into composer');
                              } else {
                                navigator.clipboard.writeText(editedContent);
                                toast.success('Edited post copied to clipboard');
                              }
                              setEditingIdx(null);
                            }}
                          >
                            Use Edited Version
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="text-sm whitespace-pre-wrap leading-relaxed cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                          onClick={() => startEditing(idx, post)}
                          title="Click to edit"
                        >
                          {post.body}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {post.hashtags.map((tag, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-xs font-normal"
                            >
                              {tag.startsWith('#') ? tag : `#${tag}`}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground italic">
                          Click the post text to edit before using
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* Regenerate */}
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleRepurpose} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate Variations
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
