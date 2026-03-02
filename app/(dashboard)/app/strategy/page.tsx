'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Loader2, Sparkles, Target, CalendarDays, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';

type Brand = {
  id: string;
  name: string;
};

type OptimizationResponse = {
  windowDays: number;
  postsAnalyzed: number;
  insufficientData: boolean;
  baseline: {
    averageScore: number;
    averageViews: number;
    averageLikes: number;
    averageComments: number;
    averageShares: number;
  };
  topPatterns: {
    hookType: Array<{ name: string; count: number; avgScore: number }>;
    length: Array<{ name: string; count: number; avgScore: number }>;
    postingWindows: Array<{ name: string; count: number; avgScore: number }>;
  };
  recommendations: string[];
  promptBooster: string;
};

type CampaignPlanResult = {
  campaign: {
    id: string;
    name: string;
  } | null;
  draftPosts: Array<{
    id: string;
    title: string;
    scheduled_for: string;
  }>;
  plan: {
    campaign_name: string;
    summary: string;
    pillars: string[];
    posts: Array<{
      day_offset: number;
      headline: string;
      objective: string;
      experiment_tag: string;
    }>;
  };
};

const DEFAULT_BRIEF = {
  goal: 'Generate qualified inbound leads from LinkedIn.',
  audience: 'Founders and marketing leaders at B2B SaaS companies.',
  painPoint: 'Pipeline is inconsistent and content does not convert to conversations.',
  solution: 'Structured content system with clear angles, social proof, and conversion CTA.',
  offer: 'Free growth audit call',
  proof: 'Helped clients increase inbound demos in 60 days.',
  kpiTarget: '10 qualified discovery calls per month',
};

export default function StrategyPage() {
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [optimization, setOptimization] = useState<OptimizationResponse | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);

  const [durationDays, setDurationDays] = useState(30);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [createDrafts, setCreateDrafts] = useState(true);
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [planning, setPlanning] = useState(false);
  const [planResult, setPlanResult] = useState<CampaignPlanResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === selectedBrandId) || null,
    [brands, selectedBrandId]
  );

  const fetchOptimization = useCallback(async () => {
    setOptimizationLoading(true);
    setOptimizationError(null);
    try {
      const response = await fetch('/api/pro/optimization/recommend?windowDays=90');
      const data = (await response.json()) as OptimizationResponse | { error?: string };
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to load optimization insights.');
      }
      setOptimization(data as OptimizationResponse);
    } catch (error) {
      setOptimizationError(error instanceof Error ? error.message : 'Failed to load optimization insights.');
      setOptimization(null);
    } finally {
      setOptimizationLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: brandRows, error: brandError } = await supabase
        .from('brands')
        .select('id, name')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });

      if (!brandError) {
        const nextBrands = (brandRows || []) as Brand[];
        setBrands(nextBrands);
        if (nextBrands.length > 0) {
          setSelectedBrandId(nextBrands[0].id);
        }
      }

      await fetchOptimization();
      setLoading(false);
    };

    void load();
  }, [fetchOptimization]);

  const handleBriefChange = (key: keyof typeof DEFAULT_BRIEF, value: string) => {
    setBrief((prev) => ({ ...prev, [key]: value }));
  };

  const handleCopyBooster = async () => {
    if (!optimization?.promptBooster) return;
    await navigator.clipboard.writeText(optimization.promptBooster);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 1500);
  };

  const handleGenerateCalendar = async () => {
    if (!selectedBrandId) {
      setPlanError('Select a brand first.');
      return;
    }

    setPlanning(true);
    setPlanError(null);
    setPlanResult(null);

    try {
      const response = await fetch('/api/pro/campaign/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          durationDays,
          postsPerWeek,
          createDrafts,
          outcomeBrief: brief,
        }),
      });

      const data = (await response.json()) as CampaignPlanResult | { error?: string };
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to generate campaign calendar.');
      }

      setPlanResult(data as CampaignPlanResult);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Failed to generate campaign calendar.');
    } finally {
      setPlanning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-600">Strategy Lab</p>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">Optimization + 30-Day Calendar</h1>
        <p className="text-gray-500 mt-2">
          Improve content decisions from real performance data, then generate a practical campaign sequence.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white border-gray-200/60 p-6 text-gray-900">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-600" />
              <h2 className="text-lg font-semibold">Closed-Loop Optimization</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchOptimization()}
              disabled={optimizationLoading}
              className="border-gray-200/60 text-gray-700"
            >
              {optimizationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {optimizationError && (
            <p className="text-sm text-red-300 mb-3">{optimizationError}</p>
          )}

          {optimization ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Posts analyzed</p>
                  <p className="text-xl font-semibold">{optimization.postsAnalyzed}</p>
                </div>
                <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Avg score</p>
                  <p className="text-xl font-semibold">{optimization.baseline.averageScore}</p>
                </div>
              </div>

              {optimization.insufficientData && (
                <p className="text-xs text-amber-300">
                  Add more published posts with synced analytics for stronger recommendations.
                </p>
              )}

              <div>
                <p className="text-sm font-semibold mb-2">Recommendations</p>
                <div className="space-y-2">
                  {optimization.recommendations.map((item) => (
                    <div key={item} className="text-sm text-gray-700 rounded-lg border border-gray-200/60 bg-gray-50 px-3 py-2">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-cyan-100">Prompt Booster</p>
                  <Button size="sm" variant="ghost" onClick={handleCopyBooster} className="text-cyan-100 hover:bg-cyan-400/20">
                    <Copy className="h-4 w-4 mr-1" />
                    {copyState === 'copied' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-sm text-cyan-100/90 mt-2">{optimization.promptBooster}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No optimization data yet.</p>
          )}
        </Card>

        <Card className="bg-white border-gray-200/60 p-6 text-gray-900">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-cyan-600" />
            <h2 className="text-lg font-semibold">AI 30-Day Calendar</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Brand</label>
              <select
                value={selectedBrandId}
                onChange={(event) => setSelectedBrandId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200/60 bg-gray-50 px-3 py-2 text-sm text-gray-900"
              >
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Duration (days)</label>
                <Input
                  type="number"
                  min={7}
                  max={60}
                  value={durationDays}
                  onChange={(event) => setDurationDays(Math.max(7, Math.min(60, Number(event.target.value) || 30)))}
                  className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Posts / week</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={postsPerWeek}
                  onChange={(event) => setPostsPerWeek(Math.max(1, Math.min(10, Number(event.target.value) || 3)))}
                  className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">Goal</label>
              <Input value={brief.goal} onChange={(event) => handleBriefChange('goal', event.target.value)} className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Audience</label>
              <Input value={brief.audience} onChange={(event) => handleBriefChange('audience', event.target.value)} className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Pain Point</label>
              <Textarea value={brief.painPoint} onChange={(event) => handleBriefChange('painPoint', event.target.value)} className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900 min-h-[72px]" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Solution Angle</label>
              <Textarea value={brief.solution} onChange={(event) => handleBriefChange('solution', event.target.value)} className="mt-1 bg-gray-50 border-gray-200/60 text-gray-900 min-h-[72px]" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={createDrafts}
                onChange={(event) => setCreateDrafts(event.target.checked)}
                className="accent-cyan-500"
              />
              Create scheduled draft posts automatically
            </label>

            {planError && <p className="text-sm text-red-300">{planError}</p>}

            <Button onClick={handleGenerateCalendar} disabled={planning} className="w-full bg-voxa-gradient text-white hover:opacity-90">
              {planning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Building Calendar...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Campaign Plan
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>

      {planResult && (
        <Card className="bg-white border-gray-200/60 p-6 text-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-300">Plan Ready</p>
              <h3 className="text-xl font-semibold mt-1">{planResult.plan.campaign_name}</h3>
              <p className="text-sm text-gray-500 mt-1">{planResult.plan.summary}</p>
            </div>
            {createDrafts && planResult.draftPosts.length > 0 && (
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Link href="/app/posts">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  View Draft Posts
                </Link>
              </Button>
            )}
          </div>

          <div className="grid gap-2">
            {planResult.plan.posts.slice(0, 10).map((post, index) => (
              <div key={`${post.headline}-${index}`} className="rounded-xl border border-gray-200/60 bg-gray-50 px-3 py-2">
                <p className="text-sm font-medium text-gray-900">
                  Day {post.day_offset + 1}: {post.headline}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Objective: {post.objective} • Experiment: {post.experiment_tag}
                </p>
              </div>
            ))}
          </div>

          {planResult.plan.posts.length > 10 && (
            <p className="text-xs text-gray-400 mt-3">
              Showing first 10 posts out of {planResult.plan.posts.length} planned posts.
            </p>
          )}
        </Card>
      )}

      <Card className="bg-white border-gray-200/60 p-5 text-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-cyan-600" />
          <p className="font-semibold">Execution Tip</p>
        </div>
        <p className="text-sm text-gray-600">
          Run optimization weekly, regenerate the calendar monthly, and keep the best-performing hook style as your default baseline.
        </p>
      </Card>
    </div>
  );
}
