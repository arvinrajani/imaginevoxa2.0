'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LogoUpload } from '@/components/shared/LogoUpload';
import { Loader2, Save } from 'lucide-react';

interface BrandData {
  name?: string;
  industry?: string;
  logo_url?: string | null;
  industry_icons?: string[];
}

interface BrandOnboardingFormProps {
  brandId: string;
  initialData?: Partial<BrandData>;
  onSaved?: () => void;
}

const INDUSTRIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'construction', label: 'Construction' },
  { value: 'technology', label: 'Technology' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'general', label: 'General' },
];

const ICON_OPTIONS = [
  { value: 'datacenter', label: 'Data Centers' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'hospital', label: 'Hospitals' },
  { value: 'mining', label: 'Mining' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'building', label: 'Buildings' },
  { value: 'energy', label: 'Energy' },
  { value: 'agriculture', label: 'Agriculture' },
];

export function BrandOnboardingForm({
  brandId,
  initialData,
  onSaved,
}: BrandOnboardingFormProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialData?.name || '');
  const [industry, setIndustry] = useState(initialData?.industry || 'electrical');
  const [logoUrl, setLogoUrl] = useState<string | null>(
    initialData?.logo_url || null
  );
  const [industryIcons, setIndustryIcons] = useState<string[]>(
    initialData?.industry_icons || []
  );

  const toggleIcon = useCallback((icon: string) => {
    setIndustryIcons((prev) =>
      prev.includes(icon)
        ? prev.filter((i) => i !== icon)
        : [...prev, icon]
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Brand name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          name: name.trim(),
          industry,
          logo_url: logoUrl,
          industry_icons: industryIcons,
        })
        .eq('id', brandId);

      if (error) throw error;
      toast.success('Brand settings saved');
      onSaved?.();
    } catch (err) {
      toast.error(
        'Failed to save',
        { description: err instanceof Error ? err.message : 'Unknown error' }
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Brand name */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Brand Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CHNT, ABB, Schneider"
            required
          />
        </div>

        {/* Industry */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Industry</label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind.value} value={ind.value}>
                  {ind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand / Partner Logo */}
        <LogoUpload
          label="Brand / Partner Logo"
          description="The manufacturer or partner brand logo (e.g. CHNT, ABB, Schneider). This appears on the right side of marketing banners."
          currentUrl={logoUrl}
          bucket="brand-logos"
          storagePath={`${brandId}/logo`}
          onUploaded={setLogoUrl}
        />

        {/* Industry icons */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Industry Sectors Served
          </label>
          <p className="text-xs text-gray-500">
            These icons appear at the bottom of marketing banners
          </p>
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map((opt) => {
              const active = industryIcons.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleIcon(opt.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {active ? '✓ ' : ''}{opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Brand Settings
        </Button>
      </form>

      {/* Live Preview Header */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Live Preview — Banner Header
        </label>
        <div
          className="flex h-16 items-center justify-between overflow-hidden rounded-lg border bg-gray-900"
          style={{
            borderBottomWidth: 2,
            borderBottomColor: '#f5a623',
          }}
        >
          <div className="ml-4">
            <span className="text-sm font-bold text-white">
              Your Company
            </span>
          </div>
          <div className="mr-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Brand logo"
                className="max-h-8 object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400">{name || 'Brand'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
