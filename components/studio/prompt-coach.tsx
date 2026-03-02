'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Wand2,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Sparkles,
  Target,
  Users,
  Lightbulb,
  TrendingUp,
  Megaphone,
  ImageIcon,
  FileText,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { PROMPT_TEMPLATES, renderPromptTemplate } from '@/lib/studio/prompt-copilot';

interface PromptCoachProps {
  onUsePrompt?: (prompt: string, type: 'text' | 'image' | 'edit') => void;
  defaultType?: 'text' | 'image' | 'edit';
}

interface WizardStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  field: string;
  placeholder: string;
  description: string;
  suggestions: string[];
}

const TEXT_STEPS: WizardStep[] = [
  {
    id: 'audience',
    label: 'Who are you writing for?',
    icon: <Users className="h-5 w-5" />,
    field: 'audience',
    placeholder: 'e.g. SaaS founders, marketing managers, startup CTOs',
    description: 'Define your target audience for maximum relevance',
    suggestions: ['SaaS Founders', 'Marketing Managers', 'Tech Leaders', 'HR Professionals', 'Sales Teams', 'Entrepreneurs'],
  },
  {
    id: 'pain',
    label: 'What problem are you addressing?',
    icon: <Target className="h-5 w-5" />,
    field: 'pain',
    placeholder: 'e.g. low conversion rates, team burnout, poor engagement',
    description: 'The pain point your audience relates to',
    suggestions: ['Low engagement rates', 'Team scaling challenges', 'Customer retention issues', 'Content creation struggles', 'Lead generation gaps', 'Time management'],
  },
  {
    id: 'solution',
    label: 'What\'s your solution or insight?',
    icon: <Lightbulb className="h-5 w-5" />,
    field: 'solution',
    placeholder: 'e.g. a 3-step framework, a mindset shift, a new approach',
    description: 'The value you\'re offering — your unique angle',
    suggestions: ['3-step framework', 'Mindset shift approach', 'Data-driven strategy', 'Counter-intuitive insight', 'Practical template', 'Real-world lesson'],
  },
  {
    id: 'proof',
    label: 'What\'s your proof or credibility?',
    icon: <TrendingUp className="h-5 w-5" />,
    field: 'proof',
    placeholder: 'e.g. grew revenue 3x, managed 50+ people, 10yr experience',
    description: 'Why should people listen? Results, experience, or data.',
    suggestions: ['Revenue growth metrics', 'Team size managed', 'Years of experience', 'Client testimonials', 'Industry awards', 'Published research'],
  },
  {
    id: 'cta_goal',
    label: 'What action should readers take?',
    icon: <Megaphone className="h-5 w-5" />,
    field: 'cta_goal',
    placeholder: 'e.g. comment with their biggest challenge, follow for more',
    description: 'Your call-to-action drives engagement',
    suggestions: ['Comment their experience', 'Follow for more tips', 'Share with their team', 'DM for details', 'Save for later', 'Tag someone who needs this'],
  },
  {
    id: 'tone',
    label: 'What tone fits your brand?',
    icon: <Sparkles className="h-5 w-5" />,
    field: 'tone',
    placeholder: 'e.g. professional but human, bold and direct, storytelling',
    description: 'Match your personal brand voice',
    suggestions: ['Professional but human', 'Bold and direct', 'Storytelling', 'Data-driven', 'Conversational', 'Authoritative'],
  },
];

const IMAGE_STEPS: WizardStep[] = [
  {
    id: 'topic',
    label: 'What\'s the image about?',
    icon: <ImageIcon className="h-5 w-5" />,
    field: 'topic',
    placeholder: 'e.g. remote work future, AI tools landscape, team collaboration',
    description: 'The core subject of your LinkedIn image',
    suggestions: ['Remote work', 'AI & technology', 'Team collaboration', 'Growth mindset', 'Data analytics', 'Innovation'],
  },
  {
    id: 'composition',
    label: 'What composition style?',
    icon: <Target className="h-5 w-5" />,
    field: 'composition',
    placeholder: 'e.g. centered subject, side-by-side comparison, abstract pattern',
    description: 'How the image should be laid out',
    suggestions: ['Centered subject', 'Side-by-side comparison', 'Isometric illustration', 'Flat lay', 'Abstract pattern', 'Minimalist scene'],
  },
  {
    id: 'brand_colors',
    label: 'What colors should dominate?',
    icon: <Sparkles className="h-5 w-5" />,
    field: 'brand_colors',
    placeholder: 'e.g. navy blue and gold, gradients of purple, monochrome',
    description: 'Colors that match your brand',
    suggestions: ['Navy & gold', 'Purple gradients', 'Teal & coral', 'Monochrome', 'Earth tones', 'Vibrant primary colors'],
  },
  {
    id: 'mood',
    label: 'What mood or feeling?',
    icon: <Lightbulb className="h-5 w-5" />,
    field: 'mood',
    placeholder: 'e.g. inspiring, professional, energetic, calm',
    description: 'The emotional impact of the image',
    suggestions: ['Inspiring', 'Professional', 'Energetic', 'Calm & focused', 'Bold & disruptive', 'Warm & approachable'],
  },
];

const TYPE_CONFIG = {
  text: { icon: <FileText className="h-4 w-4" />, label: 'Post', color: 'text-blue-600' },
  image: { icon: <ImageIcon className="h-4 w-4" />, label: 'Image', color: 'text-purple-600' },
  edit: { icon: <Pencil className="h-4 w-4" />, label: 'Edit', color: 'text-green-600' },
};

export default function PromptCoach({ onUsePrompt, defaultType = 'text' }: PromptCoachProps) {
  const [promptType, setPromptType] = useState<'text' | 'image' | 'edit'>(defaultType);
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [copied, setCopied] = useState(false);

  const steps = promptType === 'image' ? IMAGE_STEPS : TEXT_STEPS;
  const step = steps[currentStep];

  const template = useMemo(() => {
    const t = PROMPT_TEMPLATES.find((t) => {
      if (promptType === 'text') return t.id === 'solution-post';
      if (promptType === 'image') return t.id === 'hero-image';
      return t.id === 'brand-edit';
    });
    return t;
  }, [promptType]);

  const generatedPrompt = useMemo(() => {
    if (!template) return '';
    return renderPromptTemplate(template.template, values);
  }, [template, values]);

  const filledFieldCount = steps.filter((s) => values[s.field]?.trim()).length;
  const progress = (filledFieldCount / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowResult(true);
    }
  };

  const handleBack = () => {
    if (showResult) {
      setShowResult(false);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleUse = () => {
    if (onUsePrompt) {
      onUsePrompt(generatedPrompt, promptType);
      toast.success('Prompt loaded!');
    } else {
      navigator.clipboard.writeText(generatedPrompt);
      toast.success('Prompt copied to clipboard');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setValues({});
    setCurrentStep(0);
    setShowResult(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            Prompt Coach
          </CardTitle>
          <CardDescription>
            Step-by-step guided prompt builder for perfect LinkedIn content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type Selector */}
          <div className="flex gap-2">
            {(['text', 'image', 'edit'] as const).map((type) => (
              <Button
                key={type}
                variant={promptType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPromptType(type);
                  handleReset();
                }}
                className="flex items-center gap-1.5"
              >
                {TYPE_CONFIG[type].icon}
                {TYPE_CONFIG[type].label}
              </Button>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {showResult ? 'Review' : `Step ${currentStep + 1} of ${steps.length}`}
              </span>
              <span>{filledFieldCount}/{steps.length} fields</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${showResult ? 100 : progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {!showResult ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                {step.icon}
              </div>
              <div>
                <h3 className="font-semibold">{step.label}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>

            <Input
              value={values[step.field] || ''}
              onChange={(e) => setValues({ ...values, [step.field]: e.target.value })}
              placeholder={step.placeholder}
              className="text-base"
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />

            {/* Quick Suggestions */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick picks:</p>
              <div className="flex flex-wrap gap-1.5">
                {step.suggestions.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => setValues({ ...values, [step.field]: suggestion })}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleNext}>
                {currentStep === steps.length - 1 ? (
                  <>
                    Generate Prompt
                    <Check className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>

            {/* Step dots */}
            <div className="flex justify-center gap-1.5 pt-2">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStep
                      ? 'w-6 bg-purple-50'
                      : values[steps[idx].field]
                        ? 'w-2 bg-purple-300'
                        : 'w-2 bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Result View */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              Your Generated Prompt
            </CardTitle>
            <CardDescription>
              Using template: {template?.name} — {template?.notes}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{generatedPrompt}</p>
            </div>

            {/* Filled values summary */}
            <div className="flex flex-wrap gap-2">
              {steps.map(
                (s) =>
                  values[s.field] && (
                    <Badge key={s.id} variant="secondary" className="text-xs">
                      {s.id}: {values[s.field]}
                    </Badge>
                  )
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                Copy
              </Button>
              <Button onClick={handleUse} className="flex-1">
                <Sparkles className="h-4 w-4 mr-1" />
                Use This Prompt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
