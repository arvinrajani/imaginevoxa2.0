'use client';

import { useEffect, useMemo, useState } from 'react';
import { Upload, Sparkles, Search, Palette, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      toast.error('Analysis Failed', { description: error instanceof Error ? error.message : 'Failed to analyze LinkedIn profile. Please try again.' });
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
        contextPayload.offerings?.length ? `Key offerings: ${contextPayload.offerings.join(', ')}` : '',
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
      toast.success('Brand profile generated!', { description: analysisResult.brand_name ? `Brand: ${analysisResult.brand_name}` : 'Analysis complete' });
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis Failed', { description: 'Failed to analyze brand brief. Please try again.' });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-cyan-500" />
        <h3 className="text-lg font-semibold">AI-Powered Brand Analysis</h3>
      </div>

      <Card className="p-4 border-cyan-200/40 bg-cyan-50/40 dark:bg-cyan-950/10">
        <div className="mb-3">
          <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">Brand Context (Used by Analyzer)</p>
          <p className="text-xs text-cyan-700/80 dark:text-cyan-300/80">
            Add known details so analysis and generation use the correct brand name, products, and audience.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={contextName}
            onChange={(e) => setContextName(e.target.value)}
            placeholder="Brand name"
            className="bg-white/80 dark:bg-slate-900/70"
          />
          <Input
            value={contextIndustry}
            onChange={(e) => setContextIndustry(e.target.value)}
            placeholder="Industry"
            className="bg-white/80 dark:bg-slate-900/70"
          />
          <Input
            value={contextWebsite}
            onChange={(e) => setContextWebsite(e.target.value)}
            placeholder="Website URL"
            className="bg-white/80 dark:bg-slate-900/70 md:col-span-2"
          />
          <Input
            value={contextAudience}
            onChange={(e) => setContextAudience(e.target.value)}
            placeholder="Target audience"
            className="bg-white/80 dark:bg-slate-900/70 md:col-span-2"
          />
          <Input
            value={contextProducts}
            onChange={(e) => setContextProducts(e.target.value)}
            placeholder="Products (comma separated)"
            className="bg-white/80 dark:bg-slate-900/70"
          />
          <Input
            value={contextOfferings}
            onChange={(e) => setContextOfferings(e.target.value)}
            placeholder="Key offerings (comma separated)"
            className="bg-white/80 dark:bg-slate-900/70"
          />
          <Textarea
            value={contextDescription}
            onChange={(e) => setContextDescription(e.target.value)}
            placeholder="Short brand description / positioning"
            className="min-h-[80px] bg-white/80 dark:bg-slate-900/70 md:col-span-2"
          />
        </div>
      </Card>

      {/* Tab Selection */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('linkedin')}
          className={`px-4 py-2 font-medium transition-colors ${
            tab === 'linkedin'
              ? 'text-cyan-500 border-b-2 border-cyan-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Analyze LinkedIn
          </div>
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`px-4 py-2 font-medium transition-colors ${
            tab === 'manual'
              ? 'text-cyan-500 border-b-2 border-cyan-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Brand Brief
          </div>
        </button>
        <button
          onClick={() => setTab('upload')}
          className={`px-4 py-2 font-medium transition-colors ${
            tab === 'upload'
              ? 'text-cyan-500 border-b-2 border-cyan-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Assets
          </div>
        </button>
      </div>

      {/* LinkedIn Analysis Tab */}
      {tab === 'linkedin' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                LinkedIn Profile or Company Page URL
              </label>
              <Input
                type="url"
                placeholder="https://linkedin.com/in/your-profile or https://linkedin.com/company/your-company"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full"
              />
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1.5">ℹ️ What we&apos;ll analyze:
                </p>
                <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-disc">
                  <li>Brand name, description, and positioning</li>
                  <li>Products, offerings, and target audience</li>
                  <li>Recent post topics and themes</li>
                  <li>Writing tone and style patterns</li>
                  <li>Audience engagement signals</li>
                  <li>Visual preferences (when detectable)</li>
                </ul>
              </div>
            </div>
            <Button
              onClick={analyzeLinkedIn}
              disabled={!linkedinUrl || analyzing}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing LinkedIn Profile...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Analyze Profile
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Manual Brief Tab */}
      {tab === 'manual' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Describe Your Brand
              </label>
              <Textarea
                placeholder="Tell us about your brand in detail...\n\nInclude:\n1. Who you serve (target audience)\n2. What you do (products/services)\n3. How you sound (professional, casual, bold, inspiring?)\n4. Your visual style (colors, imagery preferences)\n5. Key messages or values\n\nExample: We're a B2B SaaS platform for marketing teams. Our audience is CMOs and marketing directors at mid-size companies. We're professional but friendly - think 'trusted advisor' not 'corporate robot'. We use navy blue and teal with clean, modern visuals. Core message: Marketing should be simple, data-driven, and effective."
                value={manualBrief}
                onChange={(e) => setManualBrief(e.target.value)}
                className="w-full min-h-[180px]"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-start gap-1">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                <span>The more specific you are, the better we can match your brand voice and style in generated content</span>
              </p>
            </div>
            <Button
              onClick={analyzeBrief}
              disabled={!manualBrief || analyzing}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Brand Brief...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Brand Profile
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Upload Tab */}
      {tab === 'upload' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-600 mb-2">
                Upload existing brand assets for analysis
              </p>
              <p className="text-xs text-gray-500">
                Brand guidelines (PDF), logo files, or sample posts
              </p>
              <label>
                <Button variant="outline" className="mt-4">
                  Choose Files
                </Button>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.svg"
                  multiple
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    setAnalyzing(true);
                    try {
                      // Read actual file content for real analysis
                      const fileContents: string[] = [];
                      for (const file of Array.from(files)) {
                        if (file.type === 'application/pdf') {
                          // Send PDF to extract-pdf API for text extraction
                          try {
                            const pdfForm = new FormData();
                            pdfForm.append('file', file);
                            const pdfRes = await fetch('/api/extract-pdf', {
                              method: 'POST',
                              body: pdfForm,
                            });
                            if (pdfRes.ok) {
                              const pdfData = await pdfRes.json();
                              fileContents.push(`[PDF: ${file.name}] ${pdfData.text || pdfData.content || ''}`);
                            } else {
                              fileContents.push(`[PDF: ${file.name}] (could not extract text)`);
                            }
                          } catch {
                            fileContents.push(`[PDF: ${file.name}] (extraction failed)`);
                          }
                        } else if (file.type.startsWith('image/')) {
                          // Convert image to base64 for vision analysis
                          await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(file);
                          });
                          fileContents.push(`[Image: ${file.name}] Visual asset uploaded (${file.type}, ${Math.round(file.size / 1024)}KB). Base64 preview available.`);
                        } else {
                          // Read as text
                          const text = await file.text();
                          fileContents.push(`[File: ${file.name}] ${text.slice(0, 3000)}`);
                        }
                      }

                      const combinedBrief = `Analyze brand based on these uploaded assets:\n\n${fileContents.join('\n\n')}\n\nGenerate comprehensive brand DNA including tone, colors, visual style, target audience, and content strategy.`;
                      
                      // Use manual brief analysis with actual file content
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
                      toast.error('Upload Failed', { description: 'Failed to analyze uploaded files.' });
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* Analysis Results */}
      {analysis && (
        <Card className="p-6 bg-gradient-to-br from-cyan-50 to-blue-50">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-cyan-600" />
            <h4 className="font-semibold text-cyan-900">Brand DNA Extracted</h4>
            <Badge variant="outline" className="ml-auto">
              {analysis.consistency_score}% Match
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {(analysis.brand_name || analysis.brand_description || analysis.tagline || analysis.website) && (
              <div className="col-span-full rounded-lg border border-cyan-200 bg-white/70 p-3">
                <p className="text-xs font-semibold text-cyan-700 mb-2">Extracted Brand Profile</p>
                {analysis.brand_name && (
                  <div className="mb-1">
                    <p className="text-xs text-gray-600">Brand Name</p>
                    <p className="text-sm font-semibold text-gray-900">{analysis.brand_name}</p>
                  </div>
                )}
                {analysis.tagline && (
                  <div className="mb-1">
                    <p className="text-xs text-gray-600">Tagline</p>
                    <p className="text-sm font-medium text-gray-800">{analysis.tagline}</p>
                  </div>
                )}
                {analysis.brand_description && (
                  <div className="mb-1">
                    <p className="text-xs text-gray-600">Description</p>
                    <p className="text-sm text-gray-800">{analysis.brand_description}</p>
                  </div>
                )}
                {analysis.website && (
                  <div>
                    <p className="text-xs text-gray-600">Website</p>
                    <a
                      href={analysis.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-cyan-700 hover:underline"
                    >
                      {analysis.website}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Business Details Section */}
            {analysis.products && analysis.products.length > 0 && (
              <div className="col-span-full">
                <p className="text-xs font-semibold text-cyan-700 mb-2">Products & Services</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.products.map((product, i) => (
                    <Badge key={i} className="bg-cyan-600 text-white">
                      {product}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {analysis.business_focus && (
              <div className="col-span-full">
                <p className="text-xs font-semibold text-blue-700 mb-1">Business Focus</p>
                <p className="text-sm font-medium text-blue-900">{analysis.business_focus}</p>
              </div>
            )}

            {analysis.target_audience && (
              <div>
                <p className="text-xs text-gray-600 mb-1">Target Audience</p>
                <p className="text-sm font-medium">{analysis.target_audience}</p>
              </div>
            )}

            {analysis.industry && (
              <div>
                <p className="text-xs text-gray-600 mb-1">Industry</p>
                <p className="text-sm font-medium">{analysis.industry}</p>
              </div>
            )}

            {analysis.key_offerings && analysis.key_offerings.length > 0 && (
              <div className="col-span-full">
                <p className="text-xs font-semibold text-purple-700 mb-2">Key Offerings</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.key_offerings.map((offering, i) => (
                    <Badge key={i} variant="outline" className="border-purple-500 text-purple-700">
                      {offering}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <p className="text-xs text-gray-600 mb-1">Tone</p>
              <p className="text-sm font-medium">{analysis.tone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Visual Style</p>
              <p className="text-sm font-medium">{analysis.image_style}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Primary Colors</p>
              <div className="flex gap-1 mt-1">
                {analysis.primary_colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-lg border-2 border-white shadow-md"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Accent Colors</p>
              <div className="flex gap-1 mt-1">
                {analysis.accent_colors?.map((color, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-lg border-2 border-white shadow-md"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-600 mb-1">Content Types</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.post_types?.slice(0, 5).map((type, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-600 mt-4 border-t pt-4">
            ✓ This comprehensive analysis will be used to generate perfectly on-brand posts automatically
          </p>
        </Card>
      )}
    </div>
  );
}
