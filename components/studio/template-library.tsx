'use client';

import { useState } from 'react';
import { 
  LayoutTemplate, 
  Image as ImageIcon, 
  FileText, 
  TrendingUp,
  Briefcase,
  Award,
  Users,
  Sparkles,
  Download,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface PostTemplate {
  id: string;
  name: string;
  category: 'announcement' | 'thought-leadership' | 'product' | 'hiring' | 'milestone' | 'personal';
  thumbnail: string;
  layout: {
    imageStyle: 'split' | 'background' | 'top' | 'collage';
    textOverlay: boolean;
    logoPosition: 'corner' | 'center' | 'none';
    accentBar: boolean;
  };
  example: {
    headline: string;
    body: string;
    imagePrompt: string;
  };
  isPro: boolean;
}

interface TemplateLibraryProps {
  brandColors: string[];
  onTemplateSelect: (template: PostTemplate) => void;
}

const TEMPLATES: PostTemplate[] = [
  {
    id: 'announcement-modern',
    name: 'Modern Announcement',
    category: 'announcement',
    thumbnail: 'announcement',
    layout: {
      imageStyle: 'split',
      textOverlay: true,
      logoPosition: 'corner',
      accentBar: true,
    },
    example: {
      headline: 'Big News!',
      body: 'We are excited to announce...',
      imagePrompt: 'Modern gradient background with geometric shapes',
    },
    isPro: false,
  },
  {
    id: 'thought-leadership-editorial',
    name: 'Editorial Thought Leadership',
    category: 'thought-leadership',
    thumbnail: 'editorial',
    layout: {
      imageStyle: 'background',
      textOverlay: true,
      logoPosition: 'none',
      accentBar: false,
    },
    example: {
      headline: "The Future of...",
      body: "Here is what we have learned...",
      imagePrompt: "Professional editorial style with subtle imagery",
    },
    isPro: true,
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    category: 'product',
    thumbnail: 'product',
    layout: {
      imageStyle: 'top',
      textOverlay: false,
      logoPosition: 'corner',
      accentBar: true,
    },
    example: {
      headline: 'Introducing [Product]',
      body: 'Meet our latest innovation...',
      imagePrompt: 'Clean product mockup with professional lighting',
    },
    isPro: true,
  },
  {
    id: 'hiring-team',
    name: 'Team Hiring',
    category: 'hiring',
    thumbnail: 'hiring',
    layout: {
      imageStyle: 'collage',
      textOverlay: true,
      logoPosition: 'center',
      accentBar: true,
    },
    example: {
      headline: "We are Hiring!",
      body: "Join our growing team...",
      imagePrompt: "Diverse team collaboration in modern office",
    },
    isPro: false,
  },
  {
    id: 'milestone-celebration',
    name: 'Milestone Celebration',
    category: 'milestone',
    thumbnail: 'milestone',
    layout: {
      imageStyle: 'background',
      textOverlay: true,
      logoPosition: 'center',
      accentBar: false,
    },
    example: {
      headline: '🎉 We Did It!',
      body: 'Celebrating this incredible achievement...',
      imagePrompt: 'Celebration theme with confetti and energy',
    },
    isPro: true,
  },
  {
    id: 'personal-story',
    name: 'Personal Story',
    category: 'personal',
    thumbnail: 'personal',
    layout: {
      imageStyle: 'split',
      textOverlay: false,
      logoPosition: 'none',
      accentBar: false,
    },
    example: {
      headline: "My Journey",
      body: "Here is what I learned...",
      imagePrompt: "Authentic personal moment or candid photo",
    },
    isPro: false,
  },
  {
    id: 'data-insights',
    name: 'Data & Insights',
    category: 'thought-leadership',
    thumbnail: 'data',
    layout: {
      imageStyle: 'split',
      textOverlay: false,
      logoPosition: 'corner',
      accentBar: true,
    },
    example: {
      headline: 'By The Numbers',
      body: 'Our latest research shows...',
      imagePrompt: 'Data visualization with charts and graphs',
    },
    isPro: true,
  },
  {
    id: 'behind-scenes',
    name: 'Behind The Scenes',
    category: 'personal',
    thumbnail: 'bts',
    layout: {
      imageStyle: 'collage',
      textOverlay: false,
      logoPosition: 'corner',
      accentBar: false,
    },
    example: {
      headline: 'How We Built It',
      body: 'A peek into our process...',
      imagePrompt: 'Authentic workspace or process photos',
    },
    isPro: true,
  },
];

const CATEGORIES = [
  { value: 'all', label: 'All Templates', icon: LayoutTemplate },
  { value: 'announcement', label: 'Announcements', icon: FileText },
  { value: 'thought-leadership', label: 'Thought Leadership', icon: TrendingUp },
  { value: 'product', label: 'Product', icon: Briefcase },
  { value: 'hiring', label: 'Hiring', icon: Users },
  { value: 'milestone', label: 'Milestones', icon: Award },
  { value: 'personal', label: 'Personal', icon: ImageIcon },
];

export function TemplateLibrary({ brandColors, onTemplateSelect }: TemplateLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<PostTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<PostTemplate[]>([]);
  const [generatingCustom, setGeneratingCustom] = useState(false);
  const [customDescription, setCustomDescription] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const handleGenerateCustomTemplate = async () => {
    if (generatingCustom) return;
    setGeneratingCustom(true);
    setCustomError(null);
    try {
      const res = await fetch('/api/pro/template/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'post-template',
          description: customDescription || 'Professional LinkedIn post',
          brandColors,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      if (data.template) {
        setCustomTemplates((prev) => [data.template, ...prev]);
        setSelectedTemplate(data.template);
        onTemplateSelect(data.template);
        setCustomDescription('');
      }
    } catch (err) {
      console.error('Template generation failed:', err);
      setCustomError(err instanceof Error ? err.message : 'Failed to generate template. Please try again.');
    } finally {
      setGeneratingCustom(false);
    }
  };

  const allTemplates = [...customTemplates, ...TEMPLATES];
  const filteredTemplates = selectedCategory === 'all' 
    ? allTemplates 
    : allTemplates.filter(t => t.category === selectedCategory);

  const generateThumbnail = (template: PostTemplate) => {
    const primaryColor = brandColors[0] || '#0A66C2';
    const secondaryColor = brandColors[1] || '#0F172A';
    
    // SVG thumbnail based on template layout
    const svg = `
      <svg width="240" height="180" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-${template.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:0.8" />
          </linearGradient>
        </defs>
        <rect width="240" height="180" fill="url(#grad-${template.id})" rx="8"/>
        ${template.layout.textOverlay ? `
          <rect x="20" y="20" width="140" height="16" fill="rgba(255,255,255,0.9)" rx="4"/>
          <rect x="20" y="44" width="180" height="8" fill="rgba(255,255,255,0.7)" rx="4"/>
          <rect x="20" y="58" width="160" height="8" fill="rgba(255,255,255,0.7)" rx="4"/>
        ` : ''}
        ${template.layout.accentBar ? `
          <rect x="0" y="0" width="240" height="6" fill="${primaryColor}"/>
        ` : ''}
        ${template.layout.logoPosition === 'corner' ? `
          <circle cx="210" cy="150" r="20" fill="rgba(255,255,255,0.9)"/>
        ` : ''}
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const handleTemplateSelect = (template: PostTemplate) => {
    setSelectedTemplate(template);
    onTemplateSelect(template);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="flex items-center gap-2 mb-2">
          <LayoutTemplate className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-indigo-900">Professional Post Templates</h3>
          <Badge className="ml-auto bg-indigo-600">PRO</Badge>
        </div>
        <p className="text-sm text-indigo-800">
          Choose from {TEMPLATES.length} professionally designed templates for every occasion
        </p>
      </Card>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 whitespace-nowrap transition-all ${
                selectedCategory === cat.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card
            key={template.id}
            className={`overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
              selectedTemplate?.id === template.id ? 'ring-2 ring-indigo-500' : ''
            }`}
            onClick={() => handleTemplateSelect(template)}
          >
            {/* Thumbnail */}
            <div className="aspect-video bg-gray-100 relative overflow-hidden">
              <img
                src={generateThumbnail(template)}
                alt={template.name}
                className="w-full h-full object-cover"
              />
              {template.isPro && (
                <Badge className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500">
                  PRO
                </Badge>
              )}
              {selectedTemplate?.id === template.id && (
                <div className="absolute inset-0 bg-indigo-500 bg-opacity-20 flex items-center justify-center">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="p-4">
              <h4 className="font-semibold mb-1">{template.name}</h4>
              <p className="text-xs text-gray-600 mb-3">{template.example.headline}</p>
              
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  {template.layout.imageStyle}
                </Badge>
                {template.layout.textOverlay && (
                  <Badge variant="outline" className="text-xs">
                    Text Overlay
                  </Badge>
                )}
                {template.layout.accentBar && (
                  <Badge variant="outline" className="text-xs">
                    Accent Bar
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Selected Template Preview */}
      {selectedTemplate && (
        <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-green-900">Template Selected</h4>
              </div>
              <p className="text-sm text-green-800 mb-4">
                <strong>{selectedTemplate.name}</strong> - {selectedTemplate.example.headline}
              </p>
              <div className="space-y-2 text-sm text-green-700">
                <p><strong>Layout:</strong> {selectedTemplate.layout.imageStyle}</p>
                <p><strong>Features:</strong> 
                  {selectedTemplate.layout.textOverlay && ' Text Overlay •'}
                  {selectedTemplate.layout.accentBar && ' Accent Bar •'}
                  {selectedTemplate.layout.logoPosition !== 'none' && ` Logo (${selectedTemplate.layout.logoPosition})`}
                </p>
              </div>
            </div>
            <Button
              className="bg-gradient-to-r from-green-500 to-emerald-500"
              onClick={() => {
                onTemplateSelect(selectedTemplate);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Use Template
            </Button>
          </div>
        </Card>
      )}

      {/* AI Custom Template */}
      <Card className="p-6 bg-gradient-to-br from-violet-50 to-purple-50">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-600 mt-1" />
          <div className="flex-1">
            <h4 className="font-semibold text-violet-900 mb-2">AI Custom Template</h4>
            <p className="text-sm text-violet-800 mb-3">
              Don&apos;t see what you need? Let AI create a custom template based on your specific requirements
            </p>
            <div className="flex gap-2">
              <Input
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Describe your template... e.g. 'Tech startup product launch'"
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateCustomTemplate()}
              />
              <Button
                size="sm"
                variant="outline"
                className="border-violet-300"
                onClick={handleGenerateCustomTemplate}
                disabled={generatingCustom}
              >
                {generatingCustom ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" /> Generate Custom Template</>
                )}
              </Button>
            </div>
            {customError && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{customError}</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
