'use client';

import { useState, useEffect } from 'react';
import { 
  Layers, 
  Plus, 
  Wand2, 
  Download, 
  Copy,
  Image as ImageIcon,
  Type,
  Stamp,
  Sparkles,
  Grid,
  Palette
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageEditor } from './image-editor';
import { BrandStampDesigner } from './brand-stamp-designer';
import { TemplateLibrary } from './template-library';
import { toast } from 'sonner';

interface AdvancedComposerProps {
  brandId: string;
  brandColors: string[];
  logoUrl?: string;
  onExport: (composedImage: ComposedImage) => void;
}

interface ComposedImage {
  url: string;
  layers: Array<{
    type: 'base' | 'text' | 'logo' | 'stamp' | 'overlay';
    data: any;
  }>;
  metadata: {
    size: { width: number; height: number };
    template?: string;
    stamps: string[];
  };
}

export function AdvancedComposer({ brandId, brandColors, logoUrl, onExport }: AdvancedComposerProps) {
  const [activeTab, setActiveTab] = useState('compose');
  const [baseImage, setBaseImage] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [appliedStamps, setAppliedStamps] = useState<any[]>([]);
  const [generatingBase, setGeneratingBase] = useState(false);
  const [composing, setComposing] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleAIEnhancement = async (action: string) => {
    if (!baseImage) {
      toast.warning('No image', { description: 'Generate a base image first.' });
      return;
    }
    setEnhancing(action);
    try {
      const response = await fetch('/api/pro/image/compose-advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          baseImage,
          enhancement: action,
          brandColors,
          logoUrl,
        }),
      });
      if (!response.ok) throw new Error('Enhancement failed');
      const data = await response.json();
      const resolvedUrl = data.url || data.file_url || data.imageUrl;
      if (resolvedUrl) {
        setBaseImage(resolvedUrl);
        toast.success('Enhancement applied');
      }
    } catch {
      toast.error('Enhancement failed', { description: 'Please try again' });
    } finally {
      setEnhancing(null);
    }
  };

  const handleExport = async (format: { name: string; width: number; height: number; label: string }) => {
    if (!baseImage) {
      toast.warning('No image', { description: 'Generate a base image first.' });
      return;
    }
    setExporting(format.name);
    try {
      // Use canvas to resize the image to the target format
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = baseImage;
      });

      const canvas = document.createElement('canvas');
      canvas.width = format.width;
      canvas.height = format.height;
      const ctx = canvas.getContext('2d')!;

      // Cover-fit: scale & center-crop
      const scale = Math.max(format.width / img.width, format.height / img.height);
      const sw = format.width / scale;
      const sh = format.height / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, format.width, format.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `post-${format.name}-${format.width}x${format.height}.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`${format.label} exported`, { description: `${format.width}×${format.height}` });
      }, 'image/png');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const generateBaseImage = async (prompt: string) => {
    setGeneratingBase(true);
    try {
      const response = await fetch('/api/pro/image/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: prompt || 'Professional LinkedIn post background',
          userPrompt: prompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate');

      const data = await response.json();
      const resolvedUrl = data.url || data.file_url || data.imageUrl;
      if (!resolvedUrl) throw new Error('No image URL returned');
      setBaseImage(resolvedUrl);
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setGeneratingBase(false);
    }
  };

  const composeAllLayers = async () => {
    setComposing(true);
    try {
      const response = await fetch('/api/pro/image/compose-advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          baseImage,
          logoUrl,
          stamps: appliedStamps,
          template: selectedTemplate,
        }),
      });

      if (!response.ok) throw new Error('Failed to compose');

      const data = await response.json();
      const resolvedUrl = data.url || data.file_url || data.imageUrl;
      if (!resolvedUrl) throw new Error('No composed image URL returned');
      onExport({
        url: resolvedUrl,
        layers: data.layers || [],
        metadata: data.metadata || { size: { width: 1200, height: 627 }, stamps: [] },
      });
    } catch (error) {
      console.error('Composition error:', error);
    } finally {
      setComposing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Pro Badge */}
      <Card className="p-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Advanced Image Composer</h2>
              <Badge className="bg-white text-purple-600">PRO</Badge>
            </div>
            <p className="text-purple-100">
              Professional-grade image composition with AI-powered templates, brand stamps, and intelligent layout
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{appliedStamps.length + (baseImage ? 1 : 0)}</div>
            <div className="text-sm text-purple-100">Active Layers</div>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="compose">
            <Layers className="w-4 h-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Grid className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="stamps">
            <Stamp className="w-4 h-4 mr-2" />
            Stamps
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Wand2 className="w-4 h-4 mr-2" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Main Composer */}
        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-[1fr_400px] gap-6">
            {/* Left: Canvas */}
            <div className="space-y-4">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Canvas</h3>
                  <div className="flex gap-2">
                    <Badge variant="outline">1200 × 627</Badge>
                    <Badge variant="outline">LinkedIn Optimized</Badge>
                  </div>
                </div>

                <ImageEditor
                  baseImageUrl={baseImage}
                  logoUrl={logoUrl}
                  brandId={brandId}
                  brandColors={brandColors}
                  onExport={(imageData) => {
                    onExport({
                      url: imageData,
                      layers: [],
                      metadata: {
                        size: { width: 1200, height: 627 },
                        stamps: appliedStamps.map(s => s.id),
                      },
                    });
                  }}
                />
              </Card>
            </div>

            {/* Right: Controls */}
            <div className="space-y-4">
              {/* Base Image */}
              <Card className="p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Base Image
                </h4>
                {baseImage ? (
                  <div className="space-y-3">
                    <img src={baseImage} alt="Base" className="w-full rounded-lg" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => generateBaseImage('')}
                      disabled={generatingBase}
                    >
                      {generatingBase ? 'Generating...' : 'Regenerate'}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <Button
                      size="sm"
                      onClick={() => generateBaseImage('Professional gradient background')}
                      disabled={generatingBase}
                    >
                      {generatingBase ? (
                        <>
                          <Sparkles className="w-3 h-3 mr-1 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3 h-3 mr-1" />
                          Generate Base
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Quick Actions */}
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Quick Actions</h4>
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setActiveTab('templates')}
                  >
                    <Grid className="w-3 h-3 mr-2" />
                    Use Template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setActiveTab('stamps')}
                  >
                    <Stamp className="w-3 h-3 mr-2" />
                    Add Stamp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast.info('Use the Image Editor', { description: 'Switch to the Editor tab to add text layers to your canvas' });
                    }}
                  >
                    <Type className="w-3 h-3 mr-2" />
                    Add Text
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleAIEnhancement('brand-filter')}
                    disabled={enhancing === 'brand-filter'}
                  >
                    <Palette className="w-3 h-3 mr-2" />
                    {enhancing === 'brand-filter' ? 'Applying...' : 'Apply Filter'}
                  </Button>
                </div>
              </Card>

              {/* Applied Elements */}
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Applied Elements</h4>
                <div className="space-y-2">
                  {baseImage && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <ImageIcon className="w-4 h-4" />
                      <span className="text-sm flex-1">Base Image</span>
                      <Badge variant="outline" className="text-xs">Layer 1</Badge>
                    </div>
                  )}
                  {logoUrl && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <ImageIcon className="w-4 h-4" />
                      <span className="text-sm flex-1">Logo</span>
                      <Badge variant="outline" className="text-xs">Layer 2</Badge>
                    </div>
                  )}
                  {appliedStamps.map((stamp, idx) => (
                    <div key={stamp.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <Stamp className="w-4 h-4" />
                      <span className="text-sm flex-1">{stamp.name}</span>
                      <Badge variant="outline" className="text-xs">Layer {idx + 3}</Badge>
                    </div>
                  ))}
                  {appliedStamps.length === 0 && !baseImage && (
                    <div className="text-center py-4 text-sm text-gray-500">
                      No elements added yet
                    </div>
                  )}
                </div>
              </Card>

              {/* Export */}
              <Button
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
                onClick={composeAllLayers}
                disabled={!baseImage || composing}
              >
                {composing ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                    Composing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export Final Image
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates">
          <TemplateLibrary
            brandColors={brandColors}
            onTemplateSelect={(template) => {
              setSelectedTemplate(template);
              generateBaseImage(template.example.imagePrompt);
              setActiveTab('compose');
            }}
          />
        </TabsContent>

        {/* Stamps */}
        <TabsContent value="stamps">
          <BrandStampDesigner
            brandColors={brandColors}
            logoUrl={logoUrl}
            onStampCreated={(stamp) => {
              setAppliedStamps([...appliedStamps, stamp]);
            }}
          />
        </TabsContent>

        {/* Advanced */}
        <TabsContent value="advanced">
          <div className="grid grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">AI Enhancements</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAIEnhancement('enhance-colors')}
                  disabled={enhancing === 'enhance-colors'}
                >
                  <Sparkles className={`w-4 h-4 mr-2 ${enhancing === 'enhance-colors' ? 'animate-spin' : ''}`} />
                  {enhancing === 'enhance-colors' ? 'Enhancing...' : 'Auto-enhance Colors'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAIEnhancement('smart-crop')}
                  disabled={enhancing === 'smart-crop'}
                >
                  <Wand2 className={`w-4 h-4 mr-2 ${enhancing === 'smart-crop' ? 'animate-spin' : ''}`} />
                  {enhancing === 'smart-crop' ? 'Processing...' : 'Smart Crop & Resize'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAIEnhancement('brand-filter')}
                  disabled={enhancing === 'brand-filter'}
                >
                  <Palette className={`w-4 h-4 mr-2 ${enhancing === 'brand-filter' ? 'animate-spin' : ''}`} />
                  {enhancing === 'brand-filter' ? 'Applying...' : 'Apply Brand Filter'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleAIEnhancement('generate-headline')}
                  disabled={enhancing === 'generate-headline'}
                >
                  <Type className={`w-4 h-4 mr-2 ${enhancing === 'generate-headline' ? 'animate-spin' : ''}`} />
                  {enhancing === 'generate-headline' ? 'Generating...' : 'Generate Headline'}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Export Options</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport({ name: 'linkedin', width: 1200, height: 627, label: 'LinkedIn' })}
                  disabled={exporting === 'linkedin'}
                >
                  <Download className="w-4 h-4 mr-2" />
                  LinkedIn (1200×627)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport({ name: 'instagram', width: 1080, height: 1080, label: 'Instagram' })}
                  disabled={exporting === 'instagram'}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Instagram (1080×1080)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport({ name: 'twitter', width: 1200, height: 675, label: 'Twitter' })}
                  disabled={exporting === 'twitter'}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Twitter (1200×675)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={async () => {
                    await handleExport({ name: 'linkedin', width: 1200, height: 627, label: 'LinkedIn' });
                    await handleExport({ name: 'instagram', width: 1080, height: 1080, label: 'Instagram' });
                    await handleExport({ name: 'twitter', width: 1200, height: 675, label: 'Twitter' });
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Download All Formats
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Pro Features Highlight */}
      <Card className="p-6 bg-gradient-to-br from-yellow-50 to-amber-500">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 mt-1" />
          <div>
            <h4 className="font-semibold text-amber-900 mb-2">PRO Features Active</h4>
            <div className="grid grid-cols-3 gap-4 text-sm text-amber-800">
              <div>✓ Advanced Templates</div>
              <div>✓ Brand Stamps</div>
              <div>✓ Multi-layer Composition</div>
              <div>✓ AI Enhancements</div>
              <div>✓ Multi-format Export</div>
              <div>✓ Unlimited Generations</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
