'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  X,
  Sparkles,
  Palette,
  Wand2,
  SkipForward,
  Brush,
  Camera,
  Layers,
  RefreshCw,
  Check,
  ZoomIn,
  Lightbulb,
  Download,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LogoAsset {
  id: string;
  url: string;
  name: string;
  type: 'primary' | 'secondary' | 'icon';
  width?: number;
  height?: number;
}

interface BannerAsset {
  id: string;
  url: string;
  name: string;
  category: 'header' | 'footer' | 'background' | 'pattern';
}

interface AssetManagerProps {
  brandId: string;
  brandKitId?: string;
  brandName?: string;
  brandColors?: string[];
  onLogosUpdate: (logos: LogoAsset[]) => void;
  onBannersUpdate: (banners: BannerAsset[]) => void;
  onSkip?: () => void;
}

const LOGO_STYLES = [
  { id: 'minimal', label: 'Minimal', icon: '◯', desc: 'Clean & simple' },
  { id: 'modern', label: 'Modern', icon: '⬡', desc: 'Bold & contemporary' },
  { id: 'elegant', label: 'Elegant', icon: '✦', desc: 'Premium & refined' },
  { id: 'playful', label: 'Playful', icon: '★', desc: 'Fun & creative' },
  { id: 'tech', label: 'Tech', icon: '⚡', desc: 'Digital & innovative' },
  { id: 'organic', label: 'Organic', icon: '☘', desc: 'Natural & warm' },
];

const BG_STYLES = [
  { id: 'gradient', label: 'Gradient', desc: 'Smooth color transitions' },
  { id: 'geometric', label: 'Geometric', desc: 'Abstract shapes & lines' },
  { id: 'wave', label: 'Wave', desc: 'Flowing wave patterns' },
  { id: 'minimal', label: 'Minimal', desc: 'Clean solid backgrounds' },
  { id: 'texture', label: 'Texture', desc: 'Subtle material textures' },
  { id: 'bokeh', label: 'Bokeh', desc: 'Soft light effects' },
];

const LOGO_PROMPT_IDEAS = [
  { emoji: '🎯', label: 'Iconic Mark', prompt: 'Simple iconic symbol mark, single color, memorable and distinctive' },
  { emoji: '✍️', label: 'Wordmark', prompt: 'Custom typographic wordmark with unique letterforms, clean and legible' },
  { emoji: '🔷', label: 'Geometric Abstract', prompt: 'Abstract geometric shape logo, interlocking forms, modern and balanced' },
  { emoji: '🌊', label: 'Flowing Lines', prompt: 'Fluid flowing line art logo, organic curves, elegant movement' },
  { emoji: '⚡', label: 'Tech Symbol', prompt: 'Futuristic tech-inspired symbol, circuit-like patterns, innovative feel' },
  { emoji: '🏛️', label: 'Crest / Shield', prompt: 'Professional shield or crest emblem, structured and authoritative' },
  { emoji: '🍃', label: 'Nature Inspired', prompt: 'Organic leaf or nature-inspired symbol, growth and sustainability' },
  { emoji: '💎', label: 'Luxury Monogram', prompt: 'Elegant monogram with intertwined initials, luxury and premium feel' },
];

const BG_PROMPT_IDEAS = [
  { emoji: '🌅', label: 'Warm Sunset', prompt: 'Warm sunset gradient with golden and coral tones, soft and inviting' },
  { emoji: '🌌', label: 'Deep Space', prompt: 'Deep space dark background with subtle star particles and nebula colors' },
  { emoji: '🏔️', label: 'Mountain Mist', prompt: 'Misty mountain layers in soft grays and blues, atmospheric depth' },
  { emoji: '💠', label: 'Crystal Grid', prompt: 'Geometric crystal grid pattern with translucent facets, modern and precise' },
  { emoji: '🌿', label: 'Botanical', prompt: 'Subtle botanical leaf pattern overlay on soft neutral background' },
  { emoji: '🔮', label: 'Neon Glow', prompt: 'Dark background with soft neon light accents and glow effects, tech-forward' },
  { emoji: '🎨', label: 'Watercolor Wash', prompt: 'Soft watercolor wash blending muted tones, artistic and creative' },
  { emoji: '📐', label: 'Isometric Lines', prompt: 'Clean isometric grid lines on light background, professional and structured' },
];

export function AssetManager({
  brandId,
  brandKitId,
  brandName = 'My Brand',
  brandColors = [],
  onLogosUpdate,
  onBannersUpdate,
  onSkip,
}: AssetManagerProps) {
  const [logos, setLogos] = useState<LogoAsset[]>([]);
  const [banners, setBanners] = useState<BannerAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState<'logo' | 'banner' | null>(null);

  // AI generation state
  const [generatingLogo, setGeneratingLogo] = useState(false);
  const [generatingBg, setGeneratingBg] = useState(false);
  const [logoPrompt, setLogoPrompt] = useState('');
  const [bgPrompt, setBgPrompt] = useState('');
  const [selectedLogoStyle, setSelectedLogoStyle] = useState('minimal');
  const [selectedBgStyle, setSelectedBgStyle] = useState('gradient');
  const [activeTab, setActiveTab] = useState('logos');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const logoFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const generateAIAsset = useCallback(
    async (type: 'logo' | 'background') => {
      const setter = type === 'logo' ? setGeneratingLogo : setGeneratingBg;
      setter(true);
      try {
        const extraPrompt = type === 'logo' ? logoPrompt : bgPrompt;
        const style = type === 'logo' ? selectedLogoStyle : selectedBgStyle;

        const response = await fetch('/api/pro/image/asset/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            type,
            brandName,
            brandColors,
            prompt: `Style: ${style}. ${extraPrompt}`.trim(),
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Generation failed');
        }

        const { url } = await response.json();

        if (type === 'logo') {
          const newLogo: LogoAsset = {
            id: `logo-ai-${Date.now()}`,
            url,
            name: `AI Logo (${style})`,
            type: 'primary',
          };
          const updated = [...logos, newLogo];
          setLogos(updated);
          onLogosUpdate(updated);
        } else {
          const newBanner: BannerAsset = {
            id: `banner-ai-${Date.now()}`,
            url,
            name: `AI Background (${style})`,
            category: 'background',
          };
          const updated = [...banners, newBanner];
          setBanners(updated);
          onBannersUpdate(updated);
        }
        toast.success(`${type === 'logo' ? 'Logo' : 'Background'} generated!`, {
          description: 'Your AI asset is ready to use.',
        });
      } catch (error: any) {
        console.error(`Error generating ${type}:`, error);
        toast.error(`Failed to generate ${type}`, {
          description: error.message || 'Please try again.',
        });
      } finally {
        setter(false);
      }
    },
    [
      brandId,
      brandName,
      brandColors,
      logoPrompt,
      bgPrompt,
      selectedLogoStyle,
      selectedBgStyle,
      logos,
      banners,
      onLogosUpdate,
      onBannersUpdate,
    ]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent, zone: 'logo' | 'banner') => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive(zone);
      } else if (e.type === 'dragleave') {
        setDragActive(null);
      }
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, assetType: 'logo' | 'banner') => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(null);
      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files, assetType);
    },
    []
  );

  const handleFileInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
    assetType: 'logo' | 'banner'
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(files, assetType);
  };

  const uploadFiles = async (files: File[], assetType: 'logo' | 'banner') => {
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large`, { description: 'Maximum file size is 5MB.' });
        continue;
      }

      // Upload to server for persistent storage
      let persistedUrl: string | null = null;
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('brandId', brandId);
        formData.append('type', assetType);
        if (brandKitId) formData.append('brandKitId', brandKitId);

        const res = await fetch('/api/pro/image/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          persistedUrl = data.url || data.file_url || null;
        }
      } catch (err) {
        console.warn('Server upload failed, falling back to local preview:', err);
      }

      // Use persisted URL if available, otherwise local blob
      const url = persistedUrl || URL.createObjectURL(file);

      if (!persistedUrl) {
        toast.warning(`${file.name} saved locally only`, {
          description: 'Server upload failed. This asset won\u2019t persist across sessions.',
        });
      }

      if (assetType === 'logo') {
        const newLogo: LogoAsset = {
          id: `logo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          name: file.name,
          type: logos.length === 0 ? 'primary' : 'secondary',
        };
        const updated = [...logos, newLogo];
        setLogos(updated);
        onLogosUpdate(updated);
      } else {
        const newBanner: BannerAsset = {
          id: `banner-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          name: file.name,
          category: 'background',
        };
        const updated = [...banners, newBanner];
        setBanners(updated);
        onBannersUpdate(updated);
      }
    }

    toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    setUploading(false);
  };

  const removeLogo = useCallback(
    (id: string) => {
      const updated = logos.filter((l) => l.id !== id);
      setLogos(updated);
      onLogosUpdate(updated);
    },
    [logos, onLogosUpdate]
  );

  const removeBanner = useCallback(
    (id: string) => {
      const updated = banners.filter((b) => b.id !== id);
      setBanners(updated);
      onBannersUpdate(updated);
    },
    [banners, onBannersUpdate]
  );

  const updateLogoType = useCallback(
    (id: string, type: 'primary' | 'secondary' | 'icon') => {
      const updated = logos.map((l) => (l.id === id ? { ...l, type } : l));
      setLogos(updated);
      onLogosUpdate(updated);
    },
    [logos, onLogosUpdate]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-black bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
          Brand Assets
        </h2>
        <p className="text-slate-500 mt-2 max-w-lg mx-auto">
          Upload your logos and backgrounds, or let AI generate professional assets for you. These
          will be used in your LinkedIn posts.
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 p-1.5 h-auto bg-slate-100 rounded-2xl">
          <TabsTrigger
            value="logos"
            className="data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl py-3.5 font-semibold transition-all"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Logos
            {logos.length > 0 && (
              <Badge className="ml-2 bg-cyan-100 text-cyan-700 text-xs">{logos.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="backgrounds"
            className="data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl py-3.5 font-semibold transition-all"
          >
            <Layers className="w-4 h-4 mr-2" />
            Backgrounds
            {banners.length > 0 && (
              <Badge className="ml-2 bg-purple-100 text-purple-700 text-xs">
                {banners.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* === LOGOS TAB === */}
        <TabsContent value="logos" className="mt-6 space-y-6">
          {/* Upload Zone */}
          <Card className="overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-cyan-50 to-blue-50 border-b">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-600" />
                <h3 className="font-semibold text-slate-800">Upload Logo</h3>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                PNG with transparent background recommended
              </p>
            </div>
            <div
              onDragEnter={(e) => handleDrag(e, 'logo')}
              onDragLeave={(e) => handleDrag(e, 'logo')}
              onDragOver={(e) => handleDrag(e, 'logo')}
              onDrop={(e) => handleDrop(e, 'logo')}
              className={`p-8 text-center transition-all cursor-pointer ${
                dragActive === 'logo'
                  ? 'bg-cyan-50 border-2 border-dashed border-cyan-400'
                  : 'bg-white hover:bg-slate-50'
              }`}
              onClick={() => logoFileRef.current?.click()}
            >
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Camera className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 mb-1 font-medium">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-slate-400">PNG, SVG, JPG • Max 5MB</p>
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFileInput(e, 'logo')}
                className="hidden"
              />
            </div>
          </Card>

          {/* AI Logo Generator */}
          <Card className="overflow-hidden border-violet-200">
            <div className="p-5 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-100">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold text-violet-900">AI Logo Generator</h3>
                <Badge className="bg-violet-100 text-violet-700 text-xs">AI</Badge>
              </div>
              <p className="text-sm text-violet-600 mt-1">
                Generate a unique logo with AI in seconds
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Style Selection */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Choose a style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LOGO_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedLogoStyle(style.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedLogoStyle === style.id
                          ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                          : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{style.icon}</span>
                        <span className="text-sm font-semibold text-slate-800">{style.label}</span>
                        {selectedLogoStyle === style.id && (
                          <Check className="w-3.5 h-3.5 text-violet-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom prompt */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Additional details{' '}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input
                  placeholder="e.g., Include a lightning bolt, use blue tones, abstract mark..."
                  value={logoPrompt}
                  onChange={(e) => setLogoPrompt(e.target.value)}
                  className="border-slate-200"
                />
                {!logoPrompt && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Quick ideas — click to use
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {LOGO_PROMPT_IDEAS.map((idea) => (
                        <button
                          key={idea.label}
                          onClick={() => setLogoPrompt(idea.prompt)}
                          className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors"
                        >
                          {idea.emoji} {idea.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {brandColors.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>Using brand colors:</span>
                  <div className="flex gap-1">
                    {brandColors.slice(0, 5).map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-md border border-white shadow-sm"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={() => generateAIAsset('logo')}
                disabled={generatingLogo}
                className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold shadow-lg shadow-violet-200 transition-all hover:scale-[1.02]"
              >
                {generatingLogo ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating Logo...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Logo with AI
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Logo Gallery */}
          {logos.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-500" />
                Your Logos
                <Badge className="bg-cyan-100 text-cyan-700">{logos.length}</Badge>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {logos.map((logo) => (
                  <div key={logo.id} className="group relative">
                    <div
                      className="aspect-square border-2 border-slate-200 rounded-2xl p-4 bg-white flex items-center justify-center hover:border-cyan-300 transition-colors overflow-hidden cursor-pointer"
                      onClick={() => setPreviewImage(logo.url)}
                    >
                      <img
                        src={logo.url}
                        alt={logo.name}
                        className="max-w-full max-h-full object-contain"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 rounded-2xl transition-colors">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-600 truncate font-medium">{logo.name}</p>
                      <select
                        value={logo.type}
                        onChange={(e) =>
                          updateLogoType(logo.id, e.target.value as 'primary' | 'secondary' | 'icon')
                        }
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none"
                      >
                        <option value="primary">⭐ Primary</option>
                        <option value="secondary">◐ Secondary</option>
                        <option value="icon">⬡ Icon</option>
                      </select>
                    </div>
                    <button
                      onClick={() => removeLogo(logo.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 hover:scale-110"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* === BACKGROUNDS TAB === */}
        <TabsContent value="backgrounds" className="mt-6 space-y-6">
          {/* Upload Zone */}
          <Card className="overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 border-b">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-slate-800">Upload Background</h3>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Recommended: 1200×627px (LinkedIn post size)
              </p>
            </div>
            <div
              onDragEnter={(e) => handleDrag(e, 'banner')}
              onDragLeave={(e) => handleDrag(e, 'banner')}
              onDragOver={(e) => handleDrag(e, 'banner')}
              onDrop={(e) => handleDrop(e, 'banner')}
              className={`p-8 text-center transition-all cursor-pointer ${
                dragActive === 'banner'
                  ? 'bg-purple-50 border-2 border-dashed border-purple-400'
                  : 'bg-white hover:bg-slate-50'
              }`}
              onClick={() => bannerFileRef.current?.click()}
            >
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Layers className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 mb-1 font-medium">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-slate-400">PNG, JPG • Max 5MB</p>
              <input
                ref={bannerFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFileInput(e, 'banner')}
                className="hidden"
              />
            </div>
          </Card>

          {/* AI Background Generator */}
          <Card className="overflow-hidden border-purple-200">
            <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
              <div className="flex items-center gap-2">
                <Brush className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">AI Background Generator</h3>
                <Badge className="bg-purple-100 text-purple-700 text-xs">AI</Badge>
              </div>
              <p className="text-sm text-purple-600 mt-1">
                Create stunning post backgrounds with AI
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Style Selection */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Choose a style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {BG_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedBgStyle(style.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedBgStyle === style.id
                          ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100'
                          : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-800 flex items-center justify-between">
                        {style.label}
                        {selectedBgStyle === style.id && (
                          <Check className="w-3.5 h-3.5 text-purple-600" />
                        )}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom prompt */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Additional details{' '}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input
                  placeholder="e.g., Dark theme, tech vibes, warm sunset tones..."
                  value={bgPrompt}
                  onChange={(e) => setBgPrompt(e.target.value)}
                  className="border-slate-200"
                />
                {!bgPrompt && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Quick ideas — click to use
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_PROMPT_IDEAS.map((idea) => (
                        <button
                          key={idea.label}
                          onClick={() => setBgPrompt(idea.prompt)}
                          className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
                        >
                          {idea.emoji} {idea.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {brandColors.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>Using brand colors:</span>
                  <div className="flex gap-1">
                    {brandColors.slice(0, 5).map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-md border border-white shadow-sm"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={() => generateAIAsset('background')}
                disabled={generatingBg}
                className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg shadow-purple-200 transition-all hover:scale-[1.02]"
              >
                {generatingBg ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating Background...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Background with AI
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Banner Gallery */}
          {banners.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                Your Backgrounds
                <Badge className="bg-purple-100 text-purple-700">{banners.length}</Badge>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {banners.map((banner) => (
                  <div key={banner.id} className="group relative">
                    <div
                      className="aspect-video border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-100 hover:border-purple-300 transition-colors cursor-pointer"
                      onClick={() => setPreviewImage(banner.url)}
                    >
                      <img
                        src={banner.url}
                        alt={banner.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-2 font-medium">{banner.name}</p>
                    <button
                      onClick={() => removeBanner(banner.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 hover:scale-110"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Summary + Actions */}
      <Card className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-cyan-600" />
              </div>
              <span className="text-slate-600">
                <strong className="text-slate-800">{logos.length}</strong> logos
              </span>
            </div>
            <div className="w-px h-6 bg-slate-300" />
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-slate-600">
                <strong className="text-slate-800">{banners.length}</strong> backgrounds
              </span>
            </div>
          </div>

          {onSkip && logos.length === 0 && banners.length === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-slate-500 hover:text-slate-700"
            >
              Skip for now
              <SkipForward className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>

      {/* Image Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-8"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[80vh] w-full">
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-full object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-white text-slate-700 rounded-full shadow-lg hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <a
              href={previewImage}
              download
              onClick={(e) => e.stopPropagation()}
              className="absolute -bottom-3 right-0 p-2 bg-white text-slate-700 rounded-full shadow-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
