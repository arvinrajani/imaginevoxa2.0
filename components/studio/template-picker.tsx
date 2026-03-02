'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';

type TemplateCategory =
  | 'quote'
  | 'announcement'
  | 'offer'
  | 'carousel-slide'
  | 'testimonial'
  | 'listicle'
  | 'feature-highlight';

export type DesignTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  styleId: string;
  safeAreaHint: string;
  logoPositions: Array<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>;
};

type TemplatePickerProps = {
  value: string;
  onChange: (template: DesignTemplate) => void;
};

const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'quote-clean',
    name: 'Quote Clean',
    category: 'quote',
    description: 'Large quote with subtle background and safe text block.',
    styleId: 'text-overlay',
    safeAreaHint: 'Center 80% safe text zone.',
    logoPositions: ['bottom-right', 'top-left'],
  },
  {
    id: 'announcement-split',
    name: 'Announcement Split',
    category: 'announcement',
    description: 'Split visual and message for launch or update posts.',
    styleId: 'split-layout',
    safeAreaHint: 'Keep headline in top-left 60%.',
    logoPositions: ['top-right', 'bottom-right'],
  },
  {
    id: 'offer-card',
    name: 'Offer Card',
    category: 'offer',
    description: 'Conversion card with CTA emphasis and offer details.',
    styleId: 'infographic',
    safeAreaHint: 'Preserve CTA block in lower third.',
    logoPositions: ['top-left', 'bottom-right'],
  },
  {
    id: 'carousel-title',
    name: 'Carousel Cover',
    category: 'carousel-slide',
    description: 'Single-slide cover style for carousel sequences.',
    styleId: 'abstract-brand',
    safeAreaHint: 'Title safe area in central 70%.',
    logoPositions: ['bottom-right', 'bottom-left'],
  },
  {
    id: 'testimonial-frame',
    name: 'Testimonial Frame',
    category: 'testimonial',
    description: 'Quote + attribution with credibility-focused composition.',
    styleId: 'photo-blend',
    safeAreaHint: 'Headshot zone + text panel spacing.',
    logoPositions: ['top-left', 'bottom-right'],
  },
  {
    id: 'listicle-blocks',
    name: 'Listicle Blocks',
    category: 'listicle',
    description: 'Numbered modular blocks for tactical posts.',
    styleId: 'infographic',
    safeAreaHint: 'Leave padding around numbered rows.',
    logoPositions: ['top-right', 'bottom-right'],
  },
  {
    id: 'feature-hero',
    name: 'Feature Hero',
    category: 'feature-highlight',
    description: 'Product/feature spotlight with clean hierarchy.',
    styleId: 'split-layout',
    safeAreaHint: 'Reserve hero zone for product visual.',
    logoPositions: ['top-left', 'bottom-right'],
  },
];

export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all');

  const filteredTemplates = useMemo(() => {
    if (categoryFilter === 'all') return DESIGN_TEMPLATES;
    return DESIGN_TEMPLATES.filter((item) => item.category === categoryFilter);
  }, [categoryFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'quote', 'announcement', 'offer', 'carousel-slide', 'testimonial', 'listicle', 'feature-highlight'] as const).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setCategoryFilter(category)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              categoryFilter === category
                ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                : 'border-slate-200 text-gray-400 hover:border-cyan-300'
            }`}
          >
            {category === 'all' ? 'All' : category.replace('-', ' ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filteredTemplates.map((template) => {
          const selected = template.id === value;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onChange(template)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-cyan-400 bg-cyan-50/80 ring-1 ring-cyan-200'
                  : 'border-slate-200 bg-white hover:border-cyan-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-sm font-semibold ${selected ? 'text-cyan-700' : 'text-slate-800'}`}>{template.name}</p>
                  <p className="mt-1 text-xs text-gray-400">{template.description}</p>
                </div>
                <Badge className="bg-slate-100 text-slate-600">{template.category}</Badge>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">{template.safeAreaHint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getTemplateById(templateId: string) {
  return DESIGN_TEMPLATES.find((template) => template.id === templateId) || null;
}
