'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Layers,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Sparkles,
  Download,
  Image as ImageIcon,
  Type,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';

interface CarouselSlide {
  slide_number: number;
  headline: string;
  body: string;
  visual_suggestion: string;
  layout: 'title' | 'content' | 'quote' | 'list' | 'cta';
  background_image: string | null;
}

interface CarouselResult {
  title: string;
  slides: CarouselSlide[];
  caption: string;
  hashtags: string[];
  slide_count: number;
  brand_colors: string[];
}

interface CarouselGeneratorProps {
  brandId?: string;
  onUseCaption?: (caption: string) => void;
}

const LAYOUT_STYLES: Record<string, { bg: string; textAlign: string; accent: string }> = {
  title: { bg: 'from-blue-600 to-purple-700', textAlign: 'text-center', accent: 'border-b-4 border-yellow-400' },
  content: { bg: 'from-slate-800 to-slate-900', textAlign: 'text-left', accent: '' },
  quote: { bg: 'from-indigo-700 to-blue-800', textAlign: 'text-center italic', accent: '' },
  list: { bg: 'from-gray-800 to-gray-900', textAlign: 'text-left', accent: '' },
  cta: { bg: 'from-emerald-600 to-teal-700', textAlign: 'text-center', accent: 'border-t-4 border-yellow-400' },
};

const STYLE_OPTIONS = [
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'creative', label: 'Creative' },
];

export default function CarouselGenerator({ brandId, onUseCaption }: CarouselGeneratorProps) {
  const [content, setContent] = useState('');
  const [slideCount, setSlideCount] = useState(5);
  const [style, setStyle] = useState('modern');
  const [includeImages, setIncludeImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CarouselResult | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [captionCopied, setCaptionCopied] = useState(false);

  const handleGenerate = async () => {
    if (!content.trim()) {
      toast.error('Please enter content to turn into a carousel');
      return;
    }

    setLoading(true);
    setResult(null);
    setCurrentSlide(0);

    try {
      const res = await fetch('/api/pro/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, brandId, slideCount, style, includeImages }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate carousel');
      }

      const data: CarouselResult = await res.json();
      setResult(data);
      toast.success(`${data.slide_count}-slide carousel generated!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate carousel');
    } finally {
      setLoading(false);
    }
  };

  const copyCaption = () => {
    if (!result) return;
    const text = `${result.caption}\n\n${result.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCaptionCopied(true);
    toast.success('Caption copied!');
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  const goToSlide = (dir: -1 | 1) => {
    if (!result) return;
    setCurrentSlide((prev) => {
      const next = prev + dir;
      if (next < 0) return result.slides.length - 1;
      if (next >= result.slides.length) return 0;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-500" />
            Carousel Generator
          </CardTitle>
          <CardDescription>
            Turn a post, article, or idea into a multi-slide LinkedIn carousel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste your post content, article summary, or key points..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px]"
            disabled={loading}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Slides
              </label>
              <Input
                type="number"
                min={3}
                max={10}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Style
              </label>
              <div className="flex flex-wrap gap-1">
                {STYLE_OPTIONS.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant={style === opt.value ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setStyle(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  disabled={loading}
                  className="rounded"
                />
                <ImageIcon className="h-4 w-4" />
                AI backgrounds
              </label>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !content.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating carousel{includeImages ? ' with images' : ''}...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Carousel
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Carousel Preview */}
      {result && (
        <div className="space-y-4">
          {/* Slide Navigator */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{result.title}</h3>
                <Badge variant="outline">{result.slide_count} slides</Badge>
              </div>

              {/* Slide Preview */}
              <div className="relative">
                <div className="aspect-square max-w-[400px] mx-auto rounded-lg overflow-hidden shadow-lg relative">
                  {/* Slide Content */}
                  {(() => {
                    const slide = result.slides[currentSlide];
                    const layoutStyle = LAYOUT_STYLES[slide.layout] || LAYOUT_STYLES.content;
                    const brandPrimary = result.brand_colors[0] || '#1a365d';
                    const brandAccent = result.brand_colors[1] || '#3182ce';

                    return (
                      <div
                        className={`w-full h-full bg-gradient-to-br ${layoutStyle.bg} flex flex-col justify-center p-8 relative`}
                        style={
                          slide.background_image
                            ? {
                                backgroundImage: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url(${slide.background_image})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : undefined
                        }
                      >
                        {/* Slide number badge */}
                        <div className="absolute top-4 right-4 text-white/50 text-sm font-mono">
                          {slide.slide_number}/{result.slide_count}
                        </div>

                        {/* Decorative accent */}
                        {slide.layout === 'title' && (
                          <div
                            className="absolute bottom-0 left-0 right-0 h-1"
                            style={{ backgroundColor: brandAccent }}
                          />
                        )}

                        {/* Quote marks */}
                        {slide.layout === 'quote' && (
                          <div className="text-6xl text-white/20 absolute top-4 left-6">&ldquo;</div>
                        )}

                        <div className={`${layoutStyle.textAlign} space-y-4 relative z-10`}>
                          <h2
                            className={`text-white font-bold ${
                              slide.layout === 'title' ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                            } leading-tight`}
                          >
                            {slide.headline}
                          </h2>
                          <p
                            className={`text-white/80 ${
                              slide.layout === 'title' ? 'text-base' : 'text-sm'
                            } leading-relaxed`}
                          >
                            {slide.body}
                          </p>

                          {slide.layout === 'cta' && (
                            <div
                              className="inline-block mt-4 px-6 py-2 rounded-full text-sm font-semibold"
                              style={{ backgroundColor: brandAccent, color: '#fff' }}
                            >
                              Follow for more →
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Navigation Arrows */}
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full"
                  onClick={() => goToSlide(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-8 w-8 rounded-full"
                  onClick={() => goToSlide(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Slide Dots */}
              <div className="flex justify-center gap-1.5 mt-4">
                {result.slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentSlide ? 'w-6 bg-indigo-500' : 'w-2 bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              {/* Slide Info */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <Badge variant="secondary" className="text-xs capitalize">
                  <LayoutGrid className="h-3 w-3 mr-1" />
                  {result.slides[currentSlide].layout}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {result.slides[currentSlide].visual_suggestion}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* All Slides Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">All Slides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {result.slides.map((slide, idx) => {
                  const layoutStyle = LAYOUT_STYLES[slide.layout] || LAYOUT_STYLES.content;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={`aspect-square rounded-md overflow-hidden border-2 transition-all ${
                        idx === currentSlide ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent'
                      }`}
                    >
                      <div
                        className={`w-full h-full bg-gradient-to-br ${layoutStyle.bg} p-2 flex flex-col justify-center`}
                        style={
                          slide.background_image
                            ? {
                                backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.7)), url(${slide.background_image})`,
                                backgroundSize: 'cover',
                              }
                            : undefined
                        }
                      >
                        <p className="text-white text-[8px] font-bold leading-tight truncate">
                          {slide.headline}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Caption */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Post Caption
                </CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={copyCaption} className="h-7">
                    {captionCopied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {onUseCaption && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        onUseCaption(
                          `${result.caption}\n\n${result.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
                        );
                        toast.success('Caption loaded into composer');
                      }}
                      className="h-7"
                    >
                      Use Caption
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{result.caption}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {result.hashtags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
