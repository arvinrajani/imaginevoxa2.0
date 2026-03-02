'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  Sparkles,
  Search,
  Palette,
  TrendingUp,
  Loader2,
  Globe,
  Users,
  Target,
  Boxes,
  Building2,
  FileText,
  CheckCircle2,
  BarChart3,
  Eye,
  Megaphone,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface LinkedInAnalysis {
  brand_name?: string;
  brand_description?: string;
  tagline?: string;
  website?: string;
  tone: string;
  primary_colors: string[];
  accent_colors: string[];
  color_names?: Record<string, string>;
  image_style: string;
  post_types: string[];
  content_pillars: string[];
  cta_style: string;
  visual_density: string;
  consistency_score: number;
  products?: string[];
  business_focus?: string;
  target_audience?: string;
  key_offerings?: string[];
  industry?: string;
  company_size?: string;
}

interface BrandAnalyzerProps {
  onAnalysisComplete: (analysis: LinkedInAnalysis) => void;
  brandId: string;
  brandContext?: {
    name?: string;
    description?: string;
    industry?: string;
    website?: string;
    products?: string[];
    offerings?: string[];
    targetAudience?: string;
  };
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseJsonStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function BrandAnalyzer({ onAnalysisComplete, brandId, brandContext }: BrandAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [manualBrief, setManualBrief] = useState('');
  const [tab, setTab] = useState<'linkedin' | 'manual' | 'upload'>('linkedin');
  const [analysis, setAnalysis] = useState<LinkedInAnalysis | null>(null);
  const [contextName, setContextName] = useState('');
  const [contextDescription, setContextDescription] = useState('');
  const [contextIndustry, setContextIndustry] = useState('');
  const [contextWebsite, setContextWebsite] = useState('');
  const [contextProducts, setContextProducts] = useState('');
  const [contextOfferings, setContextOfferings] = useState('');
  const [contextAudience, setContextAudience] = useState('');

  const incomingProductsKey = useMemo(
    () => JSON.stringify(brandContext?.products || []),
    [brandContext?.products]
  );
  const incomingOfferingsKey = useMemo(
    () => JSON.stringify(brandContext?.offerings || []),
    [brandContext?.offerings]
  );
  const incomingProducts = useMemo(
    () => parseJsonStringArray(incomingProductsKey),
    [incomingProductsKey]
  );
  const incomingOfferings = useMemo(
    () => parseJsonStringArray(incomingOfferingsKey),
    [incomingOfferingsKey]
  );

  const incomingContext = useMemo(() => ({
    name: brandContext?.name?.trim() || '',
    description: brandContext?.description?.trim() || '',
    industry: brandContext?.industry?.trim() || '',
    website: brandContext?.website?.trim() || '',
    products: incomingProducts,
    offerings: incomingOfferings,
    targetAudience: brandContext?.targetAudience?.trim() || '',
  }), [
    brandContext?.name,
    brandContext?.description,
    brandContext?.industry,
    brandContext?.website,
    incomingProducts,
    incomingOfferings,
    brandContext?.targetAudience,
  ]);

  const incomingContextFingerprint = useMemo(
    () => JSON.stringify(incomingContext),
    [incomingContext]
  );

  useEffect(() => {
    setContextName(incomingContext.name);
    setContextDescription(incomingContext.description);
    setContextIndustry(incomingContext.industry);
    setContextWebsite(incomingContext.website);
    setContextProducts(incomingContext.products.join(', '));
    setContextOfferings(incomingContext.offerings.join(', '));
    setContextAudience(incomingContext.targetAudience);
  }, [incomingContextFingerprint, incomingContext]);

  const contextPayload = useMemo(
    () => ({
      name: contextName.trim() || undefined,
      description: contextDescription.trim() || undefined,
      industry: contextIndustry.trim() || undefined,
      website: contextWebsite.trim() || undefined,
      products: parseCsv(contextProducts),
      offerings: parseCsv(contextOfferings),
      targetAudience: contextAudience.trim() || undefined,
    }),
    [
      contextName,
      contextDescription,
      contextIndustry,
      contextWebsite,
      contextProducts,
      contextOfferings,
      contextAudience,
    ]
  );

  const analyzeLinkedIn = async () => {
    if (!linkedinUrl) return;
    setAnalyzing(true);
    try {
      const response = await fetch('/api/pro/marketing-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          linkedinUrl,
          analysisType: 'linkedin',
          brandContext: contextPayload,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || 'Failed to analyze LinkedIn profile');
      }
      const { analysis: result } = await response.json();

      const analysisResult: LinkedInAnalysis = {
        brand_name: result.brand_name || '',
        brand_description: result.brand_description || '',
        tagline: result.tagline || '',
        website: result.website || '',
        tone: result.tone || 'professional',
        primary_colors: result.primary_colors || [],
        accent_colors: result.accent_colors || [],
        color_names: result.color_names || result.evidence?.color_names || {},
        image_style: result.image_style || 'clean-minimal',
        post_types: result.post_types || [],
        content_pillars: result.content_pillars || [],
        cta_style: result.cta_style || 'soft',
        visual_density: result.visual_density || 'medium',
        consistency_score: result.consistency_score || 85,
        products: result.products || [],
        business_focus: result.business_focus || '',
        target_audience: result.target_audience || '',
        key_offerings: result.key_offerings || [],
        industry: result.industry || '',
        company_size: result.company_size || '',
      };

      setAnalysis(analysisResult);
      onAnalysisComplete(analysisResult);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis Failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Failed to analyze LinkedIn profile. Please try again.',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeBrief = async () => {
    if (!manualBrief) return;
    setAnalyzing(true);
    try {
      const contextSummaryParts = [
        contextPayload.name ? `Brand name: ${contextPayload.name}` : '',
        contextPayload.description ? `Brand description: ${contextPayload.description}` : '',
        contextPayload.industry ? `Industry: ${contextPayload.industry}` : '',
        contextPayload.website ? `Website: ${contextPayload.website}` : '',
        contextPayload.targetAudience ? `Target audience: ${contextPayload.targetAudience}` : '',
        contextPayload.products?.length ? `Products: ${contextPayload.products.join(', ')}` : '',
        contextPayload.offerings?.length
          ? `Key offerings: ${contextPayload.offerings.join(', ')}`
          : '',
      ].filter(Boolean);

      const enrichedBrief =
        contextSummaryParts.length > 0
          ? `Existing brand context:\n${contextSummaryParts.join('\n')}\n\nDetailed brief:\n${manualBrief}`
          : manualBrief;

      const response = await fetch('/api/pro/marketing-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          manualBrief: enrichedBrief,
          analysisType: 'manual',
          brandContext: contextPayload,
        }),
      });

      if (!response.ok) throw new Error('Failed to analyze brand brief');
      const { analysis: result } = await response.json();

      const analysisResult: LinkedInAnalysis = {
        brand_name: result.brand_name || '',
        brand_description: result.brand_description || '',
        tagline: result.tagline || '',
        website: result.website || '',
        tone: result.tone || 'professional',
        primary_colors: result.primary_colors || [],
        accent_colors: result.accent_colors || [],
        color_names: result.color_names || result.evidence?.color_names || {},
        image_style: result.image_style || 'clean-minimal',
        post_types: result.post_types || [],
        content_pillars: result.content_pillars || [],
        cta_style: result.cta_style || 'soft',
        visual_density: result.visual_density || 'medium',
        consistency_score: result.consistency_score || 90,
        products: result.products || [],
        business_focus: result.business_focus || '',
        target_audience: result.target_audience || '',
        key_offerings: result.key_offerings || [],
        industry: result.industry || '',
        company_size: result.company_size || '',
      };

      setAnalysis(analysisResult);
      onAnalysisComplete(analysisResult);
      toast.success('Brand profile generated!', {
        description: analysisResult.brand_name
          ? `Brand: ${analysisResult.brand_name}`
          : 'Analysis complete',
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis Failed', {
        description: 'Failed to analyze brand brief. Please try again.',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const filledFieldsCount = [
    contextName,
    contextIndustry,
    contextWebsite,
    contextAudience,
    contextProducts,
    contextOfferings,
    contextDescription,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-50/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              AI-Powered Brand Analysis
            </h3>
            <p className="text-sm text-gray-400">
              Feed in brand data to power AI-generated posts and images
            </p>
          </div>
        </div>
        {analysis && (
          <Badge className="bg-emerald-50/15 text-emerald-600 border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Analysis Complete
          </Badge>
        )}
      </div>

      {/* ─── Brand Context Card ─── */}
      <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-b from-slate-50 to-white/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/50 bg-white/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-cyan-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Brand Context
                </p>
                <p className="text-xs text-gray-400">
                  Pre-fill known details for better analysis accuracy
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div
                className={`w-2 h-2 rounded-full ${
                  filledFieldsCount >= 5
                    ? 'bg-emerald-50'
                    : filledFieldsCount >= 3
                      ? 'bg-amber-50'
                      : 'bg-slate-300'
                }`}
              />
              {filledFieldsCount}/7 fields
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Building2 className="w-3 h-3" />
                Brand Name
              </label>
              <Input
                value={contextName}
                onChange={(e) => setContextName(e.target.value)}
                placeholder="e.g., ABB, Nike, Stripe"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Target className="w-3 h-3" />
                Industry
              </label>
              <Input
                value={contextIndustry}
                onChange={(e) => setContextIndustry(e.target.value)}
                placeholder="e.g., Electrical, SaaS, Healthcare"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Globe className="w-3 h-3" />
                Website
              </label>
              <Input
                value={contextWebsite}
                onChange={(e) => setContextWebsite(e.target.value)}
                placeholder="https://example.com"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Users className="w-3 h-3" />
                Target Audience
              </label>
              <Input
                value={contextAudience}
                onChange={(e) => setContextAudience(e.target.value)}
                placeholder="e.g., Dealers, distributors, facility managers"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Boxes className="w-3 h-3" />
                Products
                <span className="text-gray-500 font-normal">(comma-separated)</span>
              </label>
              <Input
                value={contextProducts}
                onChange={(e) => setContextProducts(e.target.value)}
                placeholder="e.g., Drives, Motors, Switchgear"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Zap className="w-3 h-3" />
                Key Offerings
                <span className="text-gray-500 font-normal">(comma-separated)</span>
              </label>
              <Input
                value={contextOfferings}
                onChange={(e) => setContextOfferings(e.target.value)}
                placeholder="e.g., Automation, Energy efficiency"
                className="h-10 bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <FileText className="w-3 h-3" />
                Brand Description / Positioning
              </label>
              <Textarea
                value={contextDescription}
                onChange={(e) => setContextDescription(e.target.value)}
                placeholder="A global leader in electrification and automation, serving industrial and infrastructure sectors with energy-efficient solutions."
                className="min-h-[80px] bg-white/80 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20 resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tab Selection — pill tabs ─── */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100/60 border border-slate-200/50">
        <button
          onClick={() => setTab('linkedin')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            tab === 'linkedin'
              ? 'bg-white text-cyan-600 shadow-sm border border-slate-200/80'
              : 'text-gray-400 hover:text-slate-700'
          }`}
        >
          <Search className="w-4 h-4" />
          Analyze LinkedIn
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            tab === 'manual'
              ? 'bg-white text-cyan-600 shadow-sm border border-slate-200/80'
              : 'text-gray-400 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Brand Brief
        </button>
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            tab === 'upload'
              ? 'bg-white text-cyan-600 shadow-sm border border-slate-200/80'
              : 'text-gray-400 hover:text-slate-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload Assets
        </button>
      </div>

      {/* ─── LinkedIn Analysis Tab ─── */}
      {tab === 'linkedin' && (
        <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden">
          <div className="p-6 space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2.5">
                <Globe className="w-4 h-4 text-blue-500" />
                LinkedIn Profile or Company Page URL
              </label>
              <Input
                type="url"
                placeholder="https://linkedin.com/in/your-profile or https://linkedin.com/company/your-company"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full h-11 text-sm bg-slate-50/80 border-slate-200"
              />
            </div>

            {/* What we'll analyze — premium grid */}
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50/30 border border-blue-200/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                What we&apos;ll analyze
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {[
                  { icon: Building2, label: 'Brand identity & positioning' },
                  { icon: Boxes, label: 'Products & offerings' },
                  { icon: Megaphone, label: 'Post topics & themes' },
                  { icon: TrendingUp, label: 'Writing tone & style' },
                  { icon: Users, label: 'Audience engagement' },
                  { icon: Palette, label: 'Visual preferences' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 border border-blue-100/60"
                  >
                    <Icon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-blue-800">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={analyzeLinkedIn}
              disabled={!linkedinUrl || analyzing}
              size="lg"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-50/20 hover:shadow-cyan-50/30 transition-all"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing LinkedIn Profile...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Analyze Profile
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Manual Brief Tab ─── */}
      {tab === 'manual' && (
        <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden">
          <div className="p-6 space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2.5">
                <FileText className="w-4 h-4 text-purple-500" />
                Describe Your Brand
              </label>
              <Textarea
                placeholder={`Tell us about your brand in detail...\n\nInclude:\n1. Who you serve (target audience)\n2. What you do (products/services)\n3. How you sound (professional, casual, bold, inspiring?)\n4. Your visual style (colors, imagery preferences)\n5. Key messages or values\n\nExample: We're a B2B SaaS platform for marketing teams. Our audience is CMOs and marketing directors at mid-size companies.`}
                value={manualBrief}
                onChange={(e) => setManualBrief(e.target.value)}
                className="w-full min-h-[200px] text-sm bg-slate-50/80 border-slate-200 resize-none"
              />
              <p className="text-xs text-gray-400 mt-2 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>
                  The more specific you are, the better we can match your brand voice and style in
                  generated content
                </span>
              </p>
            </div>
            <Button
              onClick={analyzeBrief}
              disabled={!manualBrief || analyzing}
              size="lg"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 shadow-lg shadow-purple-50/20"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing Brand Brief...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Brand Profile
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Upload Tab ─── */}
      {tab === 'upload' && (
        <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden">
          <div className="p-6 space-y-4">
            <label className="block cursor-pointer group">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center transition-all group-hover:border-cyan-400 group-hover:bg-cyan-50/30">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-4 group-hover:from-cyan-100 group-hover:to-blue-100/30 transition-all">
                  <Upload className="w-7 h-7 text-gray-500 group-hover:text-cyan-500 transition-colors" />
                </div>
                <p className="text-base font-semibold text-slate-700 mb-1.5">
                  Upload brand assets for analysis
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  Brand guidelines (PDF), logo files, or sample posts
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-sm font-medium text-slate-600 group-hover:bg-cyan-50 group-hover:text-gray-900 transition-all">
                  <Upload className="w-4 h-4" />
                  Choose Files
                </div>
              </div>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.svg"
                multiple
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  setAnalyzing(true);
                  try {
                    const fileContents: string[] = [];
                    for (const file of Array.from(files)) {
                      if (file.type === 'application/pdf') {
                        try {
                          const pdfForm = new FormData();
                          pdfForm.append('file', file);
                          const pdfRes = await fetch('/api/extract-pdf', {
                            method: 'POST',
                            body: pdfForm,
                          });
                          if (pdfRes.ok) {
                            const pdfData = await pdfRes.json();
                            fileContents.push(
                              `[PDF: ${file.name}] ${pdfData.text || pdfData.content || ''}`
                            );
                          } else {
                            fileContents.push(`[PDF: ${file.name}] (could not extract text)`);
                          }
                        } catch {
                          fileContents.push(`[PDF: ${file.name}] (extraction failed)`);
                        }
                      } else if (file.type.startsWith('image/')) {
                        await new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(file);
                        });
                        fileContents.push(
                          `[Image: ${file.name}] Visual asset uploaded (${file.type}, ${Math.round(file.size / 1024)}KB). Base64 preview available.`
                        );
                      } else {
                        const text = await file.text();
                        fileContents.push(`[File: ${file.name}] ${text.slice(0, 3000)}`);
                      }
                    }

                    const combinedBrief = `Analyze brand based on these uploaded assets:\n\n${fileContents.join('\n\n')}\n\nGenerate comprehensive brand DNA including tone, colors, visual style, target audience, and content strategy.`;

                    const response = await fetch('/api/pro/marketing-dna', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        brandId,
                        manualBrief: combinedBrief,
                        analysisType: 'manual',
                        brandContext: contextPayload,
                      }),
                    });
                    if (!response.ok) throw new Error('Analysis failed');
                    const { analysis: result } = await response.json();
                    const analysisResult: LinkedInAnalysis = {
                      brand_name: result.brand_name || '',
                      brand_description: result.brand_description || '',
                      tagline: result.tagline || '',
                      website: result.website || '',
                      tone: result.tone || 'professional',
                      primary_colors: result.primary_colors || [],
                      accent_colors: result.accent_colors || [],
                      color_names: result.color_names || result.evidence?.color_names || {},
                      image_style: result.image_style || 'clean-minimal',
                      post_types: result.post_types || [],
                      content_pillars: result.content_pillars || [],
                      cta_style: result.cta_style || 'soft',
                      visual_density: result.visual_density || 'medium',
                      consistency_score: result.consistency_score || 80,
                      products: result.products || [],
                      business_focus: result.business_focus || '',
                      target_audience: result.target_audience || '',
                      key_offerings: result.key_offerings || [],
                      industry: result.industry || '',
                      company_size: result.company_size || '',
                    };
                    setAnalysis(analysisResult);
                    onAnalysisComplete(analysisResult);
                  } catch (error) {
                    console.error('Upload analysis error:', error);
                    toast.error('Upload Failed', {
                      description: 'Failed to analyze uploaded files.',
                    });
                  } finally {
                    setAnalyzing(false);
                  }
                }}
                className="hidden"
              />
            </label>
            {analyzing && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing uploaded assets...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Analysis Results — Premium Dashboard ─── */}
      {analysis && (
        <div className="rounded-2xl border border-slate-200/60 overflow-hidden shadow-xl shadow-slate-200/50">
          {/* Results header — premium gradient banner */}
          <div className="relative px-6 py-5 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 overflow-hidden">
            <div className="absolute inset-0">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-400/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl" />
              <div className="absolute top-0 right-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBzdHJva2Utb3BhY2l0eT0iMC4wNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40" />
            </div>
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-50/30 ring-2 ring-white/10">
                  <Palette className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900 tracking-tight">Brand DNA Extracted</h4>
                  <p className="text-sm text-blue-200/80">
                    Comprehensive analysis powering your AI content
                  </p>
                </div>
              </div>

              {/* Animated score ring */}
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
                    <circle
                      cx="32" cy="32" r="26"
                      fill="none"
                      stroke="url(#scoreGradient)"
                      strokeWidth="5"
                      strokeDasharray={`${analysis.consistency_score * 1.634} 163.4`}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-black text-gray-900 leading-none">{analysis.consistency_score}</span>
                    <span className="text-[9px] text-cyan-600 font-medium">SCORE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white space-y-6">
            {/* Brand Profile Card — hero card */}
            {(analysis.brand_name || analysis.brand_description || analysis.tagline) && (
              <div className="relative rounded-2xl bg-gradient-to-br from-slate-50 via-white to-blue-50/20 border border-slate-200/50 p-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-cyan-100/40 to-transparent rounded-bl-full" />
                <div className="relative flex items-start gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-black flex-shrink-0 shadow-lg shadow-blue-50/25 ring-4 ring-white">
                    {(analysis.brand_name || 'B').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    {analysis.brand_name && (
                      <h5 className="text-xl font-black text-slate-900 tracking-tight">
                        {analysis.brand_name}
                      </h5>
                    )}
                    {analysis.tagline && (
                      <p className="text-sm font-medium text-blue-600 italic bg-blue-50/30 rounded-lg px-3 py-1.5 inline-block border border-blue-100/40">
                        &ldquo;{analysis.tagline}&rdquo;
                      </p>
                    )}
                    {analysis.brand_description && (
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {analysis.brand_description}
                      </p>
                    )}
                    {analysis.website && (
                      <a
                        href={analysis.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-semibold bg-cyan-50/30 px-3 py-1 rounded-lg border border-cyan-100/40 transition-colors hover:bg-cyan-100/40"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        {analysis.website}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Brand Strength Indicators — horizontal bar chart */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white/20 border border-slate-200/50 p-5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 mb-4">
                <BarChart3 className="w-4 h-4 text-cyan-500" />
                Brand Strength Analysis
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Brand Identity', value: analysis.brand_name && analysis.brand_description ? 95 : analysis.brand_name ? 60 : 20, color: 'from-blue-500 to-cyan-500' },
                  { label: 'Visual Consistency', value: analysis.consistency_score, color: 'from-cyan-500 to-emerald-500' },
                  { label: 'Audience Clarity', value: analysis.target_audience ? 90 : 30, color: 'from-violet-500 to-purple-500' },
                  { label: 'Content Strategy', value: (analysis.content_pillars?.length || 0) > 2 ? 85 : (analysis.content_pillars?.length || 0) > 0 ? 55 : 15, color: 'from-amber-500 to-orange-500' },
                  { label: 'Product Positioning', value: (analysis.products?.length || 0) > 2 ? 90 : (analysis.products?.length || 0) > 0 ? 60 : 20, color: 'from-pink-500 to-rose-500' },
                ].map((metric) => (
                  <div key={metric.label} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">{metric.label}</span>
                      <span className="text-xs font-bold text-gray-400">{metric.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${metric.color} transition-all duration-1000 ease-out`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key metrics grid — glass cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {analysis.industry && (
                <div className="group rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200/60 p-4 transition-all hover:shadow-lg hover:shadow-violet-200/30 hover:-translate-y-0.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-50/10 flex items-center justify-center mb-2">
                    <Building2 className="w-4 h-4 text-violet-500" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mb-0.5">
                    Industry
                  </p>
                  <p className="text-sm font-bold text-violet-900">
                    {analysis.industry}
                  </p>
                </div>
              )}
              {analysis.company_size && (
                <div className="group rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/60 p-4 transition-all hover:shadow-lg hover:shadow-blue-200/30 hover:-translate-y-0.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50/10 flex items-center justify-center mb-2">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-0.5">
                    Company Size
                  </p>
                  <p className="text-sm font-bold text-blue-900">
                    {analysis.company_size}
                  </p>
                </div>
              )}
              <div className="group rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/60 p-4 transition-all hover:shadow-lg hover:shadow-emerald-200/30 hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50/10 flex items-center justify-center mb-2">
                  <Megaphone className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-0.5">
                  Tone
                </p>
                <p className="text-sm font-bold text-emerald-900 capitalize">
                  {analysis.tone}
                </p>
              </div>
              <div className="group rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200/60 p-4 transition-all hover:shadow-lg hover:shadow-amber-200/30 hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50/10 flex items-center justify-center mb-2">
                  <Eye className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5">
                  Visual Style
                </p>
                <p className="text-sm font-bold text-amber-900 capitalize">
                  {analysis.image_style.replace(/-/g, ' ')}
                </p>
              </div>
            </div>

            {/* Target Audience + Business Focus — side by side cards with icons */}
            {(analysis.target_audience || analysis.business_focus) && (
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.target_audience && (
                  <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white/20 border border-sky-200/60 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-sky-500" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-600">
                        Target Audience
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">
                      {analysis.target_audience}
                    </p>
                  </div>
                )}
                {analysis.business_focus && (
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white/20 border border-indigo-200/60 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50/10 flex items-center justify-center">
                        <Target className="w-4 h-4 text-indigo-50" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                        Business Focus
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">
                      {analysis.business_focus}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Products & Offerings — enhanced with counts */}
            {((analysis.products && analysis.products.length > 0) ||
              (analysis.key_offerings && analysis.key_offerings.length > 0)) && (
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.products && analysis.products.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-cyan-50/80 to-white/20 border border-cyan-200/60 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center">
                          <Boxes className="w-4 h-4 text-cyan-500" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-cyan-600">
                          Products & Services
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-cyan-500 bg-cyan-100/40 px-2 py-0.5 rounded-full">
                        {analysis.products.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.products.map((product, i) => (
                        <Badge
                          key={i}
                          className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white border-none text-xs px-3 py-1 shadow-sm shadow-cyan-50/20"
                        >
                          {product}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.key_offerings && analysis.key_offerings.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-purple-50/80 to-white/20 border border-purple-200/60 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-50/10 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-purple-500" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-purple-600">
                          Key Offerings
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-purple-500 bg-purple-100/40 px-2 py-0.5 rounded-full">
                        {analysis.key_offerings.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.key_offerings.map((offering, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="border-purple-300 text-purple-700 text-xs px-3 py-1 bg-purple-50/50"
                        >
                          {offering}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Colors section — with click-to-copy and gradient preview */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white/20 border border-slate-200/50 p-5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 mb-4">
                <Palette className="w-4 h-4 text-cyan-500" />
                Brand Color Palette
              </p>
              
              {/* Gradient preview bar */}
              <div className="mb-4 h-3 rounded-full overflow-hidden flex shadow-inner">
                {[...analysis.primary_colors, ...(analysis.accent_colors || [])].map((color, i, arr) => (
                  <div
                    key={i}
                    className="h-full"
                    style={{ backgroundColor: color, flex: 1 }}
                  />
                ))}
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
                    Primary
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {analysis.primary_colors.map((color, i) => (
                      <button
                        key={i}
                        className="text-center group cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(color);
                          toast.success(`Copied ${color}`);
                        }}
                        title={`Click to copy ${color}`}
                      >
                        <div
                          className="w-12 h-12 rounded-xl border-2 border-white shadow-lg group-hover:scale-110 transition-transform ring-2 ring-transparent group-hover:ring-cyan-400/50"
                          style={{ backgroundColor: color }}
                        />
                        <p className="text-[10px] text-slate-600 mt-1.5 font-medium group-hover:text-cyan-500 transition-colors max-w-[3.5rem] truncate">
                          {analysis.color_names?.[color] || color}
                        </p>
                        <p className="text-[9px] text-gray-500 font-mono">
                          {color}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
                    Accent
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {analysis.accent_colors?.map((color, i) => (
                      <button
                        key={i}
                        className="text-center group cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(color);
                          toast.success(`Copied ${color}`);
                        }}
                        title={`Click to copy ${color}`}
                      >
                        <div
                          className="w-12 h-12 rounded-xl border-2 border-white shadow-lg group-hover:scale-110 transition-transform ring-2 ring-transparent group-hover:ring-purple-400/50"
                          style={{ backgroundColor: color }}
                        />
                        <p className="text-[10px] text-slate-600 mt-1.5 font-medium group-hover:text-purple-500 transition-colors max-w-[3.5rem] truncate">
                          {analysis.color_names?.[color] || color}
                        </p>
                        <p className="text-[9px] text-gray-500 font-mono">
                          {color}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Content Types and Pillars — with visual improvements */}
            {((analysis.post_types && analysis.post_types.length > 0) ||
              (analysis.content_pillars && analysis.content_pillars.length > 0)) && (
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.post_types && analysis.post_types.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white/20 border border-slate-200/50 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-500" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Content Types
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.post_types.slice(0, 6).map((type, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs border-blue-200 text-blue-700 bg-blue-50/50 px-3 py-1"
                        >
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.content_pillars && analysis.content_pillars.length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white/20 border border-slate-200/50 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50/10 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Content Pillars
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.content_pillars.slice(0, 6).map((pillar, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50/50 px-3 py-1"
                        >
                          {pillar}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CTA, Visual Density — additional metadata */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50/30 border border-slate-200/60 p-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">CTA Style</p>
                <p className="text-sm font-bold text-slate-700 capitalize">{analysis.cta_style}</p>
              </div>
              <div className="rounded-xl bg-slate-50/30 border border-slate-200/60 p-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Visual Density</p>
                <p className="text-sm font-bold text-slate-700 capitalize">{analysis.visual_density}</p>
              </div>
              <div className="rounded-xl bg-slate-50/30 border border-slate-200/60 p-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Post Types</p>
                <p className="text-sm font-bold text-slate-700">{analysis.post_types?.length || 0} detected</p>
              </div>
            </div>

            {/* Footer — powered by tag */}
            <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-gray-400">
                  This analysis powers all AI-generated posts and images for this brand
                </p>
              </div>
              <Badge className="bg-emerald-50/10 text-emerald-600 border-emerald-200 text-[10px]">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Powered
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
