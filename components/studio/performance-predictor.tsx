'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Loader2,
  TrendingUp,
  ThumbsUp,
  MessageSquare,
  Share2,
  Eye,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface PredictionResult {
  overall_score: number;
  engagement_prediction: {
    likes_range: string;
    comments_range: string;
    shares_range: string;
    impressions_range: string;
  };
  breakdown: {
    hook_strength: number;
    readability: number;
    emotional_resonance: number;
    value_density: number;
    cta_effectiveness: number;
    visual_complement: number;
    hashtag_strategy: number;
    length_optimization: number;
  };
  strengths: string[];
  improvements: Array<{
    issue: string;
    suggestion: string;
    impact: string;
  }>;
  best_posting_times: string[];
  rewritten_hook: string;
  content_type: string;
}

interface PerformancePredictorProps {
  initialContent?: string;
  onUseHook?: (hook: string) => void;
}

const SCORE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  hook_strength: { label: 'Hook Strength', icon: <Zap className="h-3.5 w-3.5" /> },
  readability: { label: 'Readability', icon: <Eye className="h-3.5 w-3.5" /> },
  emotional_resonance: { label: 'Emotional Impact', icon: <ThumbsUp className="h-3.5 w-3.5" /> },
  value_density: { label: 'Value Density', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  cta_effectiveness: { label: 'CTA Strength', icon: <ArrowRight className="h-3.5 w-3.5" /> },
  visual_complement: { label: 'Visual Match', icon: <Eye className="h-3.5 w-3.5" /> },
  hashtag_strategy: { label: 'Hashtag Strategy', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  length_optimization: { label: 'Length', icon: <BarChart3 className="h-3.5 w-3.5" /> },
};

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBarColor(score: number) {
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-50';
}

function getScoreGrade(score: number) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export default function PerformancePredictor({ initialContent = '', onUseHook }: PerformancePredictorProps) {
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);

  const handlePredict = async () => {
    if (!content.trim()) {
      toast.error('Please enter your post content');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/pro/post/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Prediction failed');
      }

      const data: PredictionResult = await res.json();
      setResult(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to predict performance');
    } finally {
      setLoading(false);
    }
  };

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-orange-500" />
            Performance Predictor
          </CardTitle>
          <CardDescription>
            AI-powered engagement prediction — score your post before publishing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Textarea
              placeholder="Paste your LinkedIn post here to predict its performance..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[150px]"
              disabled={loading}
            />
            <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">
              {wordCount} words
            </span>
          </div>
          <Button onClick={handlePredict} disabled={loading || !content.trim()} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing post...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Predict Performance
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Overall Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-6">
                {/* Score Circle */}
                <div className="relative h-24 w-24 shrink-0">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray={`${result.overall_score * 2.64} 264`}
                      strokeLinecap="round"
                      className={getScoreColor(result.overall_score)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-bold ${getScoreColor(result.overall_score)}`}>
                      {result.overall_score}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getScoreGrade(result.overall_score)}
                    </span>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Likes</p>
                      <p className="text-sm font-semibold">{result.engagement_prediction.likes_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Comments</p>
                      <p className="text-sm font-semibold">{result.engagement_prediction.comments_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Shares</p>
                      <p className="text-sm font-semibold">{result.engagement_prediction.shares_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Impressions</p>
                      <p className="text-sm font-semibold">{result.engagement_prediction.impressions_range}</p>
                    </div>
                  </div>
                </div>
              </div>

              <Badge variant="outline" className="mt-3 text-xs">
                Content type: {result.content_type}
              </Badge>
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(result.breakdown).map(([key, score]) => {
                const config = SCORE_LABELS[key];
                if (!config) return null;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm">
                        {config.icon}
                        {config.label}
                      </div>
                      <span className={`text-sm font-semibold ${getScoreColor(score)}`}>
                        {score}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getScoreBarColor(score)}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Improvements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {result.improvements.map((imp, i) => (
                    <li key={i} className="text-sm space-y-0.5">
                      <p className="font-medium">{imp.issue}</p>
                      <p className="text-muted-foreground">{imp.suggestion}</p>
                      <Badge variant="secondary" className="text-xs">
                        Impact: {imp.impact}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Rewritten Hook */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  AI-Rewritten Hook
                </CardTitle>
                {onUseHook && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onUseHook(result.rewritten_hook);
                      toast.success('Hook applied!');
                    }}
                    className="h-7"
                  >
                    Use This Hook
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-yellow-50/20 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm font-medium">{result.rewritten_hook}</p>
              </div>
            </CardContent>
          </Card>

          {/* Best Posting Times */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Best Posting Times
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {result.best_posting_times.map((time, i) => (
                  <Badge key={i} variant="secondary">
                    <Clock className="h-3 w-3 mr-1" />
                    {time}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reanalyze */}
          <div className="flex justify-center">
            <Button variant="outline" onClick={handlePredict} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-analyze
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
