'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  RotateCw,
  Eye,
  Lightbulb,
  FlipHorizontal,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';

interface RemixedPost {
  title: string;
  body: string;
  hashtags: string[];
  approach: string;
  difference_from_original: string;
}

interface RemixResult {
  remixes: RemixedPost[];
  original_analysis: {
    core_message: string;
    structure: string;
    engagement_drivers: string[];
  };
}

interface PostRemixerProps {
  initialPost?: string;
  onUsePost?: (content: string) => void;
}

const APPROACH_ICONS: Record<string, React.ReactNode> = {
  'Fresh Angle': <RotateCw className="h-4 w-4" />,
  'Deep Dive': <Maximize2 className="h-4 w-4" />,
  'Flip It': <FlipHorizontal className="h-4 w-4" />,
};

const APPROACH_COLORS: Record<string, string> = {
  'Fresh Angle': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Deep Dive': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'Flip It': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export default function PostRemixer({ initialPost = '', onUsePost }: PostRemixerProps) {
  const [originalPost, setOriginalPost] = useState(initialPost);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RemixResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleRemix = async () => {
    if (!originalPost.trim()) {
      toast.error('Please enter your original post');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/pro/post/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalPost }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remix post');
      }

      const data: RemixResult = await res.json();
      setResult(data);
      toast.success('3 remixed variations generated!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remix post');
    } finally {
      setLoading(false);
    }
  };

  const copyPost = (remix: RemixedPost, idx: number) => {
    const text = `${remix.body}\n\n${remix.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copied!');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const usePost = (remix: RemixedPost) => {
    const text = `${remix.body}\n\n${remix.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    if (onUsePost) {
      onUsePost(text);
      toast.success('Remix loaded into composer');
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Remix copied to clipboard');
    }
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-500" />
            Post Remixer
          </CardTitle>
          <CardDescription>
            Paste a top-performing post to generate fresh variations with the same winning formula
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Paste your best-performing LinkedIn post here..."
            value={originalPost}
            onChange={(e) => setOriginalPost(e.target.value)}
            className="min-h-[120px]"
            disabled={loading}
          />
          <Button onClick={handleRemix} disabled={loading || !originalPost.trim()} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Remixing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Remixes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Original Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Why This Post Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Core Message
                </span>
                <p className="text-sm mt-1">{result.original_analysis.core_message}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Structure
                </span>
                <p className="text-sm mt-1">{result.original_analysis.structure}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Engagement Drivers
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {result.original_analysis.engagement_drivers.map((driver, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      <Lightbulb className="h-3 w-3 mr-1" />
                      {driver}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Remixed Variations */}
          <Tabs defaultValue="0">
            <TabsList className="grid w-full grid-cols-3">
              {result.remixes.map((remix, idx) => (
                <TabsTrigger key={idx} value={String(idx)} className="text-xs">
                  {APPROACH_ICONS[remix.approach] || <RotateCw className="h-3.5 w-3.5 mr-1" />}
                  <span className="ml-1 truncate">{remix.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {result.remixes.map((remix, idx) => (
              <TabsContent key={idx} value={String(idx)}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={APPROACH_COLORS[remix.approach] || ''}
                        >
                          {APPROACH_ICONS[remix.approach] || <Sparkles className="h-3.5 w-3.5" />}
                          <span className="ml-1">{remix.approach}</span>
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyPost(remix, idx)}
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
                          onClick={() => usePost(remix)}
                          className="h-8"
                        >
                          <ArrowRight className="h-3.5 w-3.5 mr-1" />
                          Use This
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-4">
                      {remix.body}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {remix.hashtags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          {tag.startsWith('#') ? tag : `#${tag}`}
                        </Badge>
                      ))}
                    </div>

                    <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground">
                      <strong>What changed:</strong> {remix.difference_from_original}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* Regenerate */}
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleRemix} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Remix Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
