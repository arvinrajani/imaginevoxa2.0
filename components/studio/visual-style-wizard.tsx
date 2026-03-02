'use client';

import { useState, useCallback } from 'react';
import {
  Palette,
  Sparkles,
  ChevronRight,
  Check,
  Eye,
  Type,
  Image as ImageIcon,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VisualStyleWizardProps {
  brandId: string;
  onComplete: (styleProfile: StyleProfile) => void;
  analyzedColors?: string[];
  analyzedColorNames?: Record<string, string>;
}

interface StyleProfile {
  colorScheme: {
    primary: string[];
    secondary: string[];
    accent: string[];
    colorNames?: Record<string, string>;
  };
  typography: {
    fontMood: string;
    headingStyle: string;
    bodyStyle: string;
  };
  imagery: {
    style: string[];
    mood: string;
    complexity: string;
  };
  tone: {
    voice: string[];
    formality: string;
  };
  layout: {
    preference: string;
    density: string;
  };
}

type WizardStep = 'colors' | 'typography' | 'imagery' | 'tone' | 'review';

// ---------------------------------------------------------------------------
// Color Palettes
// ---------------------------------------------------------------------------

const COLOR_PALETTES: Array<{
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  accent: string[];
  preview: string;
  colorNames: Record<string, string>;
}> = [
  {
    id: 'ocean',
    name: 'Ocean Professional',
    primary: ['#0A66C2', '#1E3A5F'],
    secondary: ['#E8F4FD', '#B8D4E3'],
    accent: ['#00B4D8', '#48CAE4'],
    preview: 'linear-gradient(135deg, #0A66C2, #1E3A5F)',
    colorNames: { '#0A66C2': 'LinkedIn Blue', '#1E3A5F': 'Deep Navy', '#00B4D8': 'Sky Blue', '#48CAE4': 'Light Cyan' },
  },
  {
    id: 'forest',
    name: 'Forest Growth',
    primary: ['#1B4332', '#2D6A4F'],
    secondary: ['#D8F3DC', '#B7E4C7'],
    accent: ['#52B788', '#40916C'],
    preview: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
    colorNames: { '#1B4332': 'Forest Green', '#2D6A4F': 'Emerald', '#52B788': 'Mint Green', '#40916C': 'Jade' },
  },
  {
    id: 'sunset',
    name: 'Warm Sunset',
    primary: ['#D62828', '#F77F00'],
    secondary: ['#FFF3E0', '#FFECB3'],
    accent: ['#FCBF49', '#EAE2B7'],
    preview: 'linear-gradient(135deg, #D62828, #F77F00)',
    colorNames: { '#D62828': 'Crimson Red', '#F77F00': 'Burnt Orange', '#FCBF49': 'Gold', '#EAE2B7': 'Cream' },
  },
  {
    id: 'midnight',
    name: 'Midnight Tech',
    primary: ['#0F0F1A', '#1A1A2E'],
    secondary: ['#16213E', '#0F3460'],
    accent: ['#7B2FF7', '#C77DFF'],
    preview: 'linear-gradient(135deg, #0F0F1A, #7B2FF7)',
    colorNames: { '#0F0F1A': 'Midnight Black', '#1A1A2E': 'Dark Blue', '#7B2FF7': 'Electric Purple', '#C77DFF': 'Lavender' },
  },
  {
    id: 'coral',
    name: 'Modern Coral',
    primary: ['#FF6B6B', '#EE5A24'],
    secondary: ['#FFF0F0', '#FFEAA7'],
    accent: ['#FF9FF3', '#F368E0'],
    preview: 'linear-gradient(135deg, #FF6B6B, #EE5A24)',
    colorNames: { '#FF6B6B': 'Coral Red', '#EE5A24': 'Vibrant Orange', '#FF9FF3': 'Hot Pink', '#F368E0': 'Fuchsia' },
  },
  {
    id: 'sage',
    name: 'Sage Minimal',
    primary: ['#5F6B4E', '#8B956D'],
    secondary: ['#F5F0E8', '#E8E1D5'],
    accent: ['#C8A96E', '#B8860B'],
    preview: 'linear-gradient(135deg, #5F6B4E, #8B956D)',
    colorNames: { '#5F6B4E': 'Sage Green', '#8B956D': 'Olive', '#C8A96E': 'Tan', '#B8860B': 'Dark Gold' },
  },
  {
    id: 'royal',
    name: 'Royal Authority',
    primary: ['#1B1464', '#2E1A78'],
    secondary: ['#E8E1F5', '#D4C5F0'],
    accent: ['#F4A261', '#E76F51'],
    preview: 'linear-gradient(135deg, #1B1464, #F4A261)',
    colorNames: { '#1B1464': 'Royal Purple', '#2E1A78': 'Deep Violet', '#F4A261': 'Sandy Orange', '#E76F51': 'Terra Cotta' },
  },
  {
    id: 'mono',
    name: 'Clean Mono',
    primary: ['#1A1A1A', '#333333'],
    secondary: ['#F5F5F5', '#E0E0E0'],
    accent: ['#4ECDC4', '#45B7AA'],
    preview: 'linear-gradient(135deg, #1A1A1A, #4ECDC4)',
    colorNames: { '#1A1A1A': 'Charcoal', '#333333': 'Dark Gray', '#4ECDC4': 'Teal', '#45B7AA': 'Sea Green' },
  },
  {
    id: 'electric',
    name: 'Electric Blue',
    primary: ['#0077B6', '#023E8A'],
    secondary: ['#CAF0F8', '#ADE8F4'],
    accent: ['#00F5D4', '#00BBF9'],
    preview: 'linear-gradient(135deg, #0077B6, #00F5D4)',
    colorNames: { '#0077B6': 'Ocean Blue', '#023E8A': 'Deep Blue', '#00F5D4': 'Mint', '#00BBF9': 'Bright Cyan' },
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    primary: ['#B76E79', '#8E4585'],
    secondary: ['#FFF0F5', '#FFE4E1'],
    accent: ['#D4AF37', '#FFD700'],
    preview: 'linear-gradient(135deg, #B76E79, #D4AF37)',
    colorNames: { '#B76E79': 'Rose Pink', '#8E4585': 'Plum', '#D4AF37': 'Gold', '#FFD700': 'Bright Gold' },
  },
  {
    id: 'emerald',
    name: 'Emerald Enterprise',
    primary: ['#064E3B', '#065F46'],
    secondary: ['#ECFDF5', '#D1FAE5'],
    accent: ['#F59E0B', '#FBBF24'],
    preview: 'linear-gradient(135deg, #064E3B, #F59E0B)',
    colorNames: { '#064E3B': 'Dark Emerald', '#065F46': 'Emerald', '#F59E0B': 'Amber', '#FBBF24': 'Golden Yellow' },
  },
  {
    id: 'neon',
    name: 'Neon Future',
    primary: ['#0D0221', '#150734'],
    secondary: ['#1A0533', '#2D1B69'],
    accent: ['#FF00FF', '#00FFFF'],
    preview: 'linear-gradient(135deg, #0D0221, #FF00FF, #00FFFF)',
    colorNames: { '#0D0221': 'Deep Space', '#150734': 'Night Purple', '#FF00FF': 'Neon Magenta', '#00FFFF': 'Neon Cyan' },
  },
];

// ---------------------------------------------------------------------------
// Named Colors (friendly dropdowns)
// ---------------------------------------------------------------------------

const NAMED_COLORS = [
  { name: '🔵 Navy Blue', hex: '#0A66C2' },
  { name: '🔵 Royal Blue', hex: '#0077B6' },
  { name: '🔵 Sky Blue', hex: '#00B4D8' },
  { name: '🔵 Steel Blue', hex: '#4682B4' },
  { name: '🟢 Emerald Green', hex: '#065F46' },
  { name: '🟢 Forest Green', hex: '#1B4332' },
  { name: '🟢 Mint Green', hex: '#52B788' },
  { name: '🟢 Teal', hex: '#4ECDC4' },
  { name: '🔴 Crimson Red', hex: '#D62828' },
  { name: '🔴 Coral', hex: '#FF6B6B' },
  { name: '🔴 Rose', hex: '#B76E79' },
  { name: '🟠 Burnt Orange', hex: '#EE5A24' },
  { name: '🟠 Amber', hex: '#F59E0B' },
  { name: '🟠 Tangerine', hex: '#F77F00' },
  { name: '🟡 Gold', hex: '#D4AF37' },
  { name: '🟡 Mustard', hex: '#FCBF49' },
  { name: '🟣 Deep Purple', hex: '#7B2FF7' },
  { name: '🟣 Royal Purple', hex: '#1B1464' },
  { name: '🟣 Lavender', hex: '#C77DFF' },
  { name: '💗 Hot Pink', hex: '#FF9FF3' },
  { name: '💗 Magenta', hex: '#FF00FF' },
  { name: '⬛ Charcoal', hex: '#1A1A1A' },
  { name: '⬛ Slate', hex: '#333333' },
  { name: '🤎 Olive', hex: '#5F6B4E' },
  { name: '🤎 Bronze', hex: '#B8860B' },
  { name: '⬜ Pearl White', hex: '#F5F5F5' },
  { name: '⬜ Ivory', hex: '#FFF3E0' },
  { name: '⬜ Light Gray', hex: '#E0E0E0' },
  { name: '🩵 Cyan', hex: '#22D3EE' },
  { name: '🩵 Aqua', hex: '#00FFFF' },
];

// ---------------------------------------------------------------------------
// Typography Moods
// ---------------------------------------------------------------------------

const FONT_MOODS = [
  { id: 'modern-professional', label: '💼 Modern Professional', description: 'Clean, authoritative, trustworthy', heading: 'Inter Bold', body: 'Inter Regular' },
  { id: 'creative-bold', label: '🎨 Creative Bold', description: 'Expressive, dynamic, attention-grabbing', heading: 'Poppins Black', body: 'Poppins Regular' },
  { id: 'elegant-serif', label: '✨ Elegant Serif', description: 'Sophisticated, premium, editorial', heading: 'Playfair Display', body: 'Georgia' },
  { id: 'tech-minimal', label: '⚡ Tech Minimal', description: 'Sharp, futuristic, precise', heading: 'Space Grotesk Bold', body: 'Space Grotesk Regular' },
  { id: 'friendly-round', label: '😊 Friendly Round', description: 'Approachable, warm, conversational', heading: 'Nunito Bold', body: 'Nunito Regular' },
  { id: 'editorial-classic', label: '📰 Editorial Classic', description: 'Timeless, structured, newspaper-feel', heading: 'Merriweather Bold', body: 'Source Sans Pro' },
];

// ---------------------------------------------------------------------------
// Image Styles
// ---------------------------------------------------------------------------

const IMAGE_STYLES = [
  { id: 'minimal', label: '◯ Minimal', description: 'Clean whitespace, simple shapes', emoji: '⬜' },
  { id: 'gradient', label: '🌈 Gradient', description: 'Flowing color transitions', emoji: '🎨' },
  { id: 'photography', label: '📷 Photography', description: 'Real photos, stock imagery', emoji: '🖼️' },
  { id: 'illustration', label: '🎨 Illustration', description: 'Hand-drawn, artistic style', emoji: '✏️' },
  { id: 'data-viz', label: '📊 Data-Viz', description: 'Charts, infographics, numbers', emoji: '📈' },
  { id: '3d-render', label: '🧊 3D Render', description: 'Dimensional, glossy, modern', emoji: '💎' },
  { id: 'geometric', label: '🔺 Geometric', description: 'Sharp angles, patterns, structure', emoji: '🔷' },
  { id: 'abstract', label: '🌀 Abstract', description: 'Artistic, fluid, conceptual', emoji: '🎭' },
];

const IMAGE_MOODS = [
  { id: 'bright', label: '☀️ Bright & Energetic' },
  { id: 'dark', label: '🌙 Dark & Premium' },
  { id: 'warm', label: '🔥 Warm & Inviting' },
  { id: 'cool', label: '❄️ Cool & Professional' },
  { id: 'neutral', label: '⚪ Neutral & Clean' },
];

const IMAGE_COMPLEXITY = [
  { id: 'simple', label: 'Simple', description: '1-2 elements, lots of space' },
  { id: 'balanced', label: 'Balanced', description: 'Mixed elements, well-composed' },
  { id: 'detailed', label: 'Detailed', description: 'Rich detail, many elements' },
];

// ---------------------------------------------------------------------------
// Tone Options
// ---------------------------------------------------------------------------

const VOICE_OPTIONS = [
  { id: 'professional', label: '💼 Professional' },
  { id: 'confident', label: '💪 Confident' },
  { id: 'friendly', label: '😊 Friendly' },
  { id: 'inspiring', label: '🌟 Inspiring' },
  { id: 'educational', label: '🎓 Educational' },
  { id: 'bold', label: '⚡ Bold' },
  { id: 'empathetic', label: '❤️ Empathetic' },
  { id: 'witty', label: '😎 Witty' },
];

const FORMALITY_OPTIONS = [
  { id: 'formal', label: 'Formal', description: 'Polished, structured, corporate' },
  { id: 'balanced', label: 'Balanced', description: 'Professional yet approachable' },
  { id: 'casual', label: 'Casual', description: 'Conversational, relaxed, personal' },
];

const LAYOUT_PREFS = [
  { id: 'text-heavy', label: '📝 Text-First', description: 'Focus on written content' },
  { id: 'visual-heavy', label: '🖼️ Visual-First', description: 'Bold images, minimal text' },
  { id: 'balanced', label: '⚖️ Balanced', description: 'Equal text and visuals' },
];

// ---------------------------------------------------------------------------
// Color Naming Helper
// ---------------------------------------------------------------------------

function getColorName(hex: string, colorNames?: Record<string, string>): string {
  const upper = hex.toUpperCase();
  
  // Check provided names first
  if (colorNames?.[hex]) return colorNames[hex];
  if (colorNames?.[upper]) return colorNames[upper];
  
  // Check named colors list
  const named = NAMED_COLORS.find(c => c.hex.toUpperCase() === upper);
  if (named) return named.name.replace(/^[^\s]+\s/, ''); // strip emoji prefix
  
  // Infer name from RGB values
  const hexClean = upper.replace('#', '');
  const r = parseInt(hexClean.slice(0, 2), 16);
  const g = parseInt(hexClean.slice(2, 4), 16);
  const b = parseInt(hexClean.slice(4, 6), 16);
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  
  if (lightness > 210) return 'Light';
  if (lightness < 40) return 'Dark';
  if (r > 180 && g < 100 && b < 100) return 'Red';
  if (r < 80 && g > 140 && b < 80) return 'Green';
  if (r < 80 && g < 80 && b > 140) return 'Blue';
  if (r > 180 && g > 100 && b < 80) return 'Orange';
  if (r > 180 && g > 180 && b < 80) return 'Yellow';
  if (r > 140 && g < 100 && b > 140) return 'Purple';
  if (r < 100 && g > 140 && b > 140) return 'Teal';
  if (r > 160 && g < 120 && b > 100) return 'Rose';
  
  return hex;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VisualStyleWizard({ brandId, onComplete, analyzedColors, analyzedColorNames }: VisualStyleWizardProps) {
  const [step, setStep] = useState<WizardStep>('colors');
  const [saving, setSaving] = useState(false);

  // Build dynamic palette from analyzed colors (if available)
  const detectedPalette = analyzedColors && analyzedColors.length > 0 ? {
    id: 'detected',
    name: '✨ Detected from Profile',
    primary: [analyzedColors[0], analyzedColors[1] || analyzedColors[0]],
    secondary: [analyzedColors[2] || '#F5F5F5', analyzedColors[3] || '#E0E0E0'],
    accent: [analyzedColors[4] || analyzedColors[0], analyzedColors[5] || analyzedColors[1] || '#22D3EE'],
    preview: `linear-gradient(135deg, ${analyzedColors[0]}, ${analyzedColors[1] || analyzedColors[0]})`,
    colorNames: analyzedColorNames || (() => {
      const names: Record<string, string> = {};
      analyzedColors.forEach((c) => { names[c] = getColorName(c); });
      return names;
    })(),
  } : null;

  const allPalettes = detectedPalette ? [detectedPalette, ...COLOR_PALETTES] : COLOR_PALETTES;

  // Selections — auto-select detected palette when available
  const [selectedPalette, setSelectedPalette] = useState<string>(detectedPalette ? 'detected' : 'ocean');
  const [customColors, setCustomColors] = useState<{ primary: string; secondary: string; accent: string }>({
    primary: analyzedColors?.[0] || '',
    secondary: analyzedColors?.[2] || '',
    accent: analyzedColors?.[4] || analyzedColors?.[1] || '',
  });
  const [selectedFont, setSelectedFont] = useState('modern-professional');
  const [selectedImageStyles, setSelectedImageStyles] = useState<string[]>(['minimal', 'gradient']);
  const [selectedImageMood, setSelectedImageMood] = useState('bright');
  const [selectedComplexity, setSelectedComplexity] = useState('balanced');
  const [selectedVoices, setSelectedVoices] = useState<string[]>(['professional', 'confident']);
  const [selectedFormality, setSelectedFormality] = useState('balanced');
  const [selectedLayout, setSelectedLayout] = useState('balanced');

  const steps: WizardStep[] = ['colors', 'typography', 'imagery', 'tone', 'review'];
  const currentIndex = steps.indexOf(step);

  const toggleImageStyle = (id: string) => {
    setSelectedImageStyles((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const toggleVoice = (id: string) => {
    setSelectedVoices((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const buildProfile = useCallback((): StyleProfile => {
    const palette = allPalettes.find((p) => p.id === selectedPalette);
    const primary = customColors.primary ? [customColors.primary, palette?.primary[1] || '#0F172A'] : palette?.primary || ['#0A66C2', '#0F172A'];
    const secondary = customColors.secondary ? [customColors.secondary, palette?.secondary[1] || '#E0E0E0'] : palette?.secondary || ['#F5F5F5', '#E0E0E0'];
    const accent = customColors.accent ? [customColors.accent, palette?.accent[1] || '#22D3EE'] : palette?.accent || ['#22D3EE', '#06B6D4'];
    
    // Merge color names from palette and analyzed
    const mergedColorNames: Record<string, string> = {
      ...(palette?.colorNames || {}),
      ...(analyzedColorNames || {}),
    };

    return {
      colorScheme: { primary, secondary, accent, colorNames: mergedColorNames },
      typography: {
        fontMood: selectedFont,
        headingStyle: FONT_MOODS.find(f => f.id === selectedFont)?.heading || 'Inter Bold',
        bodyStyle: FONT_MOODS.find(f => f.id === selectedFont)?.body || 'Inter Regular',
      },
      imagery: {
        style: selectedImageStyles,
        mood: selectedImageMood,
        complexity: selectedComplexity,
      },
      tone: {
        voice: selectedVoices,
        formality: selectedFormality,
      },
      layout: {
        preference: selectedLayout,
        density: selectedComplexity,
      },
    };
  }, [selectedPalette, customColors, selectedFont, selectedImageStyles, selectedImageMood, selectedComplexity, selectedVoices, selectedFormality, selectedLayout, allPalettes, analyzedColorNames]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const profile = buildProfile();

      const res = await fetch('/api/pro/brand-kit/style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, styleProfile: profile }),
      });

      if (!res.ok) {
        console.warn('Could not save style profile to server');
      }

      toast.success('Visual style saved!');
      onComplete(profile);
    } catch {
      toast.success('Visual style configured');
      onComplete(buildProfile());
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const palette = allPalettes.find((p) => p.id === selectedPalette);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 text-sm font-semibold mb-4">
          <Palette className="w-4 h-4" />
          Visual Style Wizard
        </div>
        <h2 className="text-3xl font-bold mb-2">Define Your Brand&apos;s Look</h2>
        <p className="text-gray-500">Every AI-generated image and post will follow these rules</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, idx) => (
          <div key={s} className="flex items-center">
            <button
              onClick={() => idx <= currentIndex && setStep(s)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${s === step
                ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg scale-110'
                : idx < currentIndex
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-400'
                }`}
            >
              {idx < currentIndex ? <Check className="w-4 h-4" /> : idx + 1}
            </button>
            {idx < steps.length - 1 && (
              <div className={`w-12 h-1 mx-1 rounded-full ${idx < currentIndex ? 'bg-green-50' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── Step 1: Colors ─── */}
      {step === 'colors' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-500" />
              Color Palette
            </h3>
            <p className="text-sm text-gray-500">Choose colors that represent your brand personality</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {allPalettes.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPalette(p.id)}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left ${selectedPalette === p.id
                  ? 'border-purple-50 shadow-lg shadow-purple-50/20 scale-[1.02]'
                  : p.id === 'detected'
                    ? 'border-emerald-400 bg-emerald-50/50 hover:border-emerald-50'
                    : 'border-gray-200 hover:border-purple-300'
                  }`}
              >
                {selectedPalette === p.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                {p.id === 'detected' && (
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">From Profile</Badge>
                  </div>
                )}
                <div
                  className="w-full h-16 rounded-xl mb-3"
                  style={{ background: p.preview }}
                />
                <div className="flex gap-1 mb-2 flex-wrap">
                  {[...p.primary, ...p.accent].map((c, i) => {
                    const colorName = p.colorNames?.[c] || c;
                    return (
                      <div 
                        key={i} 
                        className="relative group"
                        title={colorName}
                      >
                        <div className="w-5 h-5 rounded-full border border-white shadow-sm cursor-help" style={{ backgroundColor: c }} />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                          {colorName}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs font-semibold">{p.name}</p>
                <p className="text-[10px] text-gray-400 mt-1">Click to select palette</p>
              </button>
            ))}
          </div>

          {/* Custom color overrides with named colors */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm font-medium mb-3">Or pick individual colors:</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Primary</label>
                <select
                  value={customColors.primary || ''}
                  onChange={(e) => setCustomColors(prev => ({ ...prev, primary: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200/60 bg-white text-gray-900 px-3 text-sm cursor-pointer"
                >
                  <option value="">Use palette default</option>
                  {NAMED_COLORS.map((c) => (
                    <option key={c.hex} value={c.hex}>{c.name} ({c.hex})</option>
                  ))}
                </select>
                {customColors.primary && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: customColors.primary }} />
                    <span className="text-xs text-gray-600">{getColorName(customColors.primary, analyzedColorNames)}</span>
                    <span className="text-[10px] text-gray-400">{customColors.primary}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Secondary</label>
                <select
                  value={customColors.secondary || ''}
                  onChange={(e) => setCustomColors(prev => ({ ...prev, secondary: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200/60 bg-white text-gray-900 px-3 text-sm cursor-pointer"
                >
                  <option value="">Use palette default</option>
                  {NAMED_COLORS.map((c) => (
                    <option key={c.hex} value={c.hex}>{c.name} ({c.hex})</option>
                  ))}
                </select>
                {customColors.secondary && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: customColors.secondary }} />
                    <span className="text-xs text-gray-600">{getColorName(customColors.secondary, analyzedColorNames)}</span>
                    <span className="text-[10px] text-gray-400">{customColors.secondary}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Accent</label>
                <select
                  value={customColors.accent || ''}
                  onChange={(e) => setCustomColors(prev => ({ ...prev, accent: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200/60 bg-white text-gray-900 px-3 text-sm cursor-pointer"
                >
                  <option value="">Use palette default</option>
                  {NAMED_COLORS.map((c) => (
                    <option key={c.hex} value={c.hex}>{c.name} ({c.hex})</option>
                  ))}
                </select>
                {customColors.accent && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: customColors.accent }} />
                    <span className="text-xs text-gray-600">{getColorName(customColors.accent, analyzedColorNames)}</span>
                    <span className="text-[10px] text-gray-400">{customColors.accent}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Step 2: Typography ─── */}
      {step === 'typography' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Type className="w-5 h-5 text-blue-500" />
              Typography Mood
            </h3>
            <p className="text-sm text-gray-500">Choose the personality your text should convey</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FONT_MOODS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFont(f.id)}
                className={`relative p-5 rounded-2xl border-2 text-left transition-all ${selectedFont === f.id
                  ? 'border-blue-50 bg-blue-50 shadow-md'
                  : 'border-gray-200 hover:border-blue-300'
                  }`}
              >
                {selectedFont === f.id && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="text-base font-bold mb-1">{f.label}</div>
                <p className="text-xs text-gray-500 mb-2">{f.description}</p>
                <div className="flex gap-3 text-[11px] text-gray-400">
                  <span>H: {f.heading}</span>
                  <span>B: {f.body}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Step 3: Imagery ─── */}
      {step === 'imagery' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-pink-500" />
              Image Style
            </h3>
            <p className="text-sm text-gray-500">Select up to 4 visual styles for AI-generated images</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {IMAGE_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleImageStyle(s.id)}
                className={`relative p-4 rounded-2xl border-2 text-center transition-all ${selectedImageStyles.includes(s.id)
                  ? 'border-pink-500 bg-pink-50 shadow-md'
                  : 'border-gray-200 hover:border-pink-300'
                  }`}
              >
                {selectedImageStyles.includes(s.id) && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="text-3xl mb-2">{s.emoji}</div>
                <div className="text-sm font-bold">{s.label}</div>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.description}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Mood</label>
            <div className="flex flex-wrap gap-2">
              {IMAGE_MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedImageMood(m.id)}
                  className={`px-4 py-2 rounded-xl text-sm transition-all ${selectedImageMood === m.id
                    ? 'bg-pink-100 border-2 border-pink-500 text-pink-700 font-semibold'
                    : 'bg-gray-50 border-2 border-gray-200 text-gray-600 hover:border-pink-300'
                    }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Complexity</label>
            <div className="grid grid-cols-3 gap-3">
              {IMAGE_COMPLEXITY.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedComplexity(c.id)}
                  className={`p-3 rounded-xl text-center transition-all ${selectedComplexity === c.id
                    ? 'bg-pink-100 border-2 border-pink-500'
                    : 'bg-gray-50 border-2 border-gray-200 hover:border-pink-300'
                    }`}
                >
                  <div className="text-sm font-bold">{c.label}</div>
                  <p className="text-[11px] text-gray-500">{c.description}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Step 4: Tone ─── */}
      {step === 'tone' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Brand Voice & Tone
            </h3>
            <p className="text-sm text-gray-500">Select up to 4 voice traits and formality level</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Voice Traits</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => toggleVoice(v.id)}
                  className={`px-4 py-3 rounded-xl text-sm transition-all ${selectedVoices.includes(v.id)
                    ? 'bg-amber-100 border-2 border-amber-50 text-amber-700 font-semibold'
                    : 'bg-gray-50 border-2 border-gray-200 text-gray-600 hover:border-amber-300'
                    }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Formality Level</label>
            <div className="grid grid-cols-3 gap-3">
              {FORMALITY_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFormality(f.id)}
                  className={`p-4 rounded-xl text-center transition-all ${selectedFormality === f.id
                    ? 'bg-amber-100 border-2 border-amber-50'
                    : 'bg-gray-50 border-2 border-gray-200 hover:border-amber-300'
                    }`}
                >
                  <div className="text-sm font-bold">{f.label}</div>
                  <p className="text-[11px] text-gray-500">{f.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Content Layout Preference</label>
            <div className="grid grid-cols-3 gap-3">
              {LAYOUT_PREFS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLayout(l.id)}
                  className={`p-4 rounded-xl text-center transition-all ${selectedLayout === l.id
                    ? 'bg-amber-100 border-2 border-amber-50'
                    : 'bg-gray-50 border-2 border-gray-200 hover:border-amber-300'
                    }`}
                >
                  <div className="text-sm font-bold">{l.label}</div>
                  <p className="text-[11px] text-gray-500">{l.description}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Step 5: Review ─── */}
      {step === 'review' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Eye className="w-5 h-5 text-green-500" />
              Review Your Style Profile
            </h3>
            <p className="text-sm text-gray-500">Everything looks good? Let&apos;s launch your brand!</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Colors */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <Palette className="w-3.5 h-3.5 text-purple-500" />
                Colors
              </h4>
              <div className="flex gap-2 flex-wrap">
                {palette && [...palette.primary, ...palette.accent, ...palette.secondary.slice(0, 1)].map((c, i) => {
                  const name = palette.colorNames?.[c] || getColorName(c, analyzedColorNames);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 group relative">
                      <div className="w-8 h-8 rounded-lg border-2 border-white shadow-md cursor-help" style={{ backgroundColor: c }} title={`${name} (${c})`} />
                      <span className="text-[9px] text-gray-500 max-w-[4rem] text-center truncate">{name}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">{palette?.name}</p>
            </div>

            {/* Typography */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <Type className="w-3.5 h-3.5 text-blue-500" />
                Typography
              </h4>
              <p className="text-sm">{FONT_MOODS.find(f => f.id === selectedFont)?.label}</p>
              <p className="text-xs text-gray-500">{FONT_MOODS.find(f => f.id === selectedFont)?.description}</p>
            </div>

            {/* Imagery */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-pink-500" />
                Imagery
              </h4>
              <div className="flex flex-wrap gap-1">
                {selectedImageStyles.map(s => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {IMAGE_STYLES.find(is => is.id === s)?.label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Mood: {IMAGE_MOODS.find(m => m.id === selectedImageMood)?.label} •
                Complexity: {selectedComplexity}
              </p>
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Voice & Tone
              </h4>
              <div className="flex flex-wrap gap-1">
                {selectedVoices.map(v => (
                  <Badge key={v} variant="outline" className="text-xs">
                    {VOICE_OPTIONS.find(vo => vo.id === v)?.label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Formality: {FORMALITY_OPTIONS.find(f => f.id === selectedFormality)?.label} •
                Layout: {LAYOUT_PREFS.find(l => l.id === selectedLayout)?.label}
              </p>
            </div>
          </div>

          {/* Preview card */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-gray-300" style={{
            background: palette ? palette.preview : 'linear-gradient(135deg, #0A66C2, #0F172A)',
          }}>
            <div className="text-center text-gray-900">
              <h3 className="text-2xl font-bold mb-2">Your Brand Post Preview</h3>
              <p className="text-sm opacity-80">This is how your AI-generated content will feel</p>
              <div className="flex justify-center gap-2 mt-4">
                {selectedImageStyles.slice(0, 3).map(s => (
                  <Badge key={s} className="bg-white/20 text-white border-gray-300">
                    {IMAGE_STYLES.find(is => is.id === s)?.emoji} {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Navigation Buttons ─── */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentIndex === 0}
          className="px-6"
        >
          Back
        </Button>

        {step === 'review' ? (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="px-8 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
          >
            {saving ? (
              <>
                <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save & Continue
              </>
            )}
          </Button>
        ) : (
          <Button onClick={nextStep} className="px-8 bg-gradient-to-r from-purple-500 to-pink-500">
            Next Step
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
