'use client';

import { useState } from 'react';
import { Stamp, Download, Plus, Trash2, Copy, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface BrandStamp {
  id: string;
  name: string;
  type: 'corner' | 'watermark' | 'badge' | 'seal';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  elements: {
    logo?: string;
    text?: string;
    shape?: 'circle' | 'square' | 'rounded' | 'hexagon';
    backgroundColor?: string;
    textColor?: string;
    size?: 'small' | 'medium' | 'large';
  };
  preview: string;
}

interface BrandStampDesignerProps {
  brandColors: string[];
  logoUrl?: string;
  onStampCreated: (stamp: BrandStamp) => void;
}

export function BrandStampDesigner({ brandColors, logoUrl, onStampCreated }: BrandStampDesignerProps) {
  const [stamps, setStamps] = useState<BrandStamp[]>([]);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [currentStamp, setCurrentStamp] = useState<Partial<BrandStamp>>({
    type: 'corner',
    position: 'bottom-right',
    elements: {
      shape: 'circle',
      backgroundColor: brandColors[0],
      textColor: '#FFFFFF',
      size: 'medium',
    },
  });
  const [stampText, setStampText] = useState('Your Brand');

  const handleGenerateSuggestions = async () => {
    if (generatingSuggestions) return;
    setGeneratingSuggestions(true);
    try {
      const res = await fetch('/api/pro/template/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'stamp-suggestions',
          brandColors,
          description: stampText,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate suggestions');
      const data = await res.json();
      if (data.suggestions) {
        const newStamps: BrandStamp[] = data.suggestions.map((s: {
          name: string;
          type: 'corner' | 'watermark' | 'badge' | 'seal';
          position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
          shape: 'circle' | 'square' | 'rounded' | 'hexagon';
          backgroundColor: string;
          textColor: string;
          size: 'small' | 'medium' | 'large';
          text: string;
        }, i: number) => ({
          id: `ai-stamp-${Date.now()}-${i}`,
          name: s.name,
          type: s.type,
          position: s.position,
          elements: {
            shape: s.shape,
            backgroundColor: s.backgroundColor,
            textColor: s.textColor,
            size: s.size,
            text: s.text,
            logo: logoUrl,
          },
          preview: '',
        }));
        setStamps((prev) => [...newStamps, ...prev]);
        newStamps.forEach((stamp) => onStampCreated(stamp));
      }
    } catch (err) {
      console.error('Stamp suggestions failed:', err);
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  const stampTypes = [
    { value: 'corner', label: 'Corner Logo', icon: '📍' },
    { value: 'watermark', label: 'Watermark', icon: '💧' },
    { value: 'badge', label: 'Badge', icon: '🏅' },
    { value: 'seal', label: 'Seal', icon: '⭕' },
  ];

  const positions = [
    { value: 'top-left', label: 'Top Left', icon: '↖️' },
    { value: 'top-right', label: 'Top Right', icon: '↗️' },
    { value: 'bottom-left', label: 'Bottom Left', icon: '↙️' },
    { value: 'bottom-right', label: 'Bottom Right', icon: '↘️' },
    { value: 'center', label: 'Center', icon: '⊙' },
  ];

  const shapes = [
    { value: 'circle', label: 'Circle', preview: '⚫' },
    { value: 'square', label: 'Square', preview: '⬛' },
    { value: 'rounded', label: 'Rounded', preview: '▢' },
    { value: 'hexagon', label: 'Hexagon', preview: '⬡' },
  ];

  const generateStampPreview = (): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw based on stamp type and settings
    const { elements } = currentStamp;
    const bg = elements?.backgroundColor || brandColors[0];
    const size = elements?.size === 'small' ? 80 : elements?.size === 'large' ? 150 : 120;

    ctx.fillStyle = bg;
    
    if (elements?.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(100, 100, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (elements?.shape === 'square') {
      ctx.fillRect(100 - size / 2, 100 - size / 2, size, size);
    } else if (elements?.shape === 'rounded') {
      ctx.beginPath();
      ctx.roundRect(100 - size / 2, 100 - size / 2, size, size, 20);
      ctx.fill();
    }

    // Add text
    if (stampText) {
      ctx.fillStyle = elements?.textColor || '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stampText, 100, 100);
    }

    return canvas.toDataURL();
  };

  const createStamp = () => {
    const preview = generateStampPreview();
    const newStamp: BrandStamp = {
      id: `stamp-${Date.now()}`,
      name: stampText || 'Custom Stamp',
      type: currentStamp.type as any,
      position: currentStamp.position as any,
      elements: {
        ...currentStamp.elements,
        text: stampText,
        logo: logoUrl,
      },
      preview,
    };

    setStamps([...stamps, newStamp]);
    onStampCreated(newStamp);
  };

  const deleteStamp = (id: string) => {
    setStamps(stamps.filter(s => s.id !== id));
  };

  const duplicateStamp = (stamp: BrandStamp) => {
    const newStamp = {
      ...stamp,
      id: `stamp-${Date.now()}`,
      name: `${stamp.name} (Copy)`,
    };
    setStamps([...stamps, newStamp]);
    onStampCreated(newStamp);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="flex items-center gap-2 mb-4">
          <Stamp className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-purple-900">Brand Stamp Designer</h3>
          <Badge className="ml-auto bg-purple-600">PRO</Badge>
        </div>
        <p className="text-sm text-purple-800 mb-4">
          Create custom brand stamps, watermarks, and badges to automatically apply to all your posts
        </p>
      </Card>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        {/* Design Panel */}
        <div className="space-y-6">
          {/* Type Selection */}
          <Card className="p-6">
            <h4 className="font-semibold mb-4">Stamp Type</h4>
            <div className="grid grid-cols-4 gap-3">
              {stampTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setCurrentStamp({ ...currentStamp, type: type.value as any })}
                  className={`p-4 rounded-lg border-2 transition-all text-center ${
                    currentStamp.type === type.value
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{type.icon}</div>
                  <div className="text-sm font-medium">{type.label}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Position */}
          <Card className="p-6">
            <h4 className="font-semibold mb-4">Position</h4>
            <div className="grid grid-cols-5 gap-3">
              {positions.map((pos) => (
                <button
                  key={pos.value}
                  onClick={() => setCurrentStamp({ ...currentStamp, position: pos.value as any })}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    currentStamp.position === pos.value
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{pos.icon}</div>
                  <div className="text-xs">{pos.label}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Design Elements */}
          <Card className="p-6">
            <h4 className="font-semibold mb-4">Design Elements</h4>
            <div className="space-y-4">
              {/* Text */}
              <div>
                <label className="text-sm font-medium mb-2 block">Text</label>
                <Input
                  value={stampText}
                  onChange={(e) => setStampText(e.target.value)}
                  placeholder="Your Brand Name"
                />
              </div>

              {/* Shape */}
              <div>
                <label className="text-sm font-medium mb-2 block">Shape</label>
                <div className="grid grid-cols-4 gap-2">
                  {shapes.map((shape) => (
                    <button
                      key={shape.value}
                      onClick={() => setCurrentStamp({
                        ...currentStamp,
                        elements: { ...currentStamp.elements, shape: shape.value as any }
                      })}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        currentStamp.elements?.shape === shape.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="text-2xl">{shape.preview}</div>
                      <div className="text-xs mt-1">{shape.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Background</label>
                  <div className="flex gap-2">
                    {brandColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setCurrentStamp({
                          ...currentStamp,
                          elements: { ...currentStamp.elements, backgroundColor: color }
                        })}
                        className={`w-10 h-10 rounded border-2 ${
                          currentStamp.elements?.backgroundColor === color
                            ? 'border-purple-500 ring-2 ring-purple-200'
                            : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Text Color</label>
                  <div className="flex gap-2">
                    {['#FFFFFF', '#000000', brandColors[0]].map((color) => (
                      <button
                        key={color}
                        onClick={() => setCurrentStamp({
                          ...currentStamp,
                          elements: { ...currentStamp.elements, textColor: color }
                        })}
                        className={`w-10 h-10 rounded border-2 ${
                          currentStamp.elements?.textColor === color
                            ? 'border-purple-500 ring-2 ring-purple-200'
                            : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Size */}
              <div>
                <label className="text-sm font-medium mb-2 block">Size</label>
                <div className="flex gap-2">
                  {['small', 'medium', 'large'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setCurrentStamp({
                        ...currentStamp,
                        elements: { ...currentStamp.elements, size: size as any }
                      })}
                      className={`px-4 py-2 rounded-lg border-2 capitalize ${
                        currentStamp.elements?.size === size
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={createStamp} className="w-full bg-gradient-to-r from-purple-500 to-pink-500">
                <Plus className="w-4 h-4 mr-2" />
                Create Stamp
              </Button>
            </div>
          </Card>
        </div>

        {/* Preview & Saved Stamps */}
        <div className="space-y-6">
          {/* Live Preview */}
          <Card className="p-6">
            <h4 className="font-semibold mb-4">Preview</h4>
            <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center relative">
              <div
                className="w-24 h-24 flex items-center justify-center text-white font-bold rounded-lg shadow-lg"
                style={{
                  backgroundColor: currentStamp.elements?.backgroundColor,
                  borderRadius: currentStamp.elements?.shape === 'circle' ? '50%' : '12px',
                }}
              >
                {stampText || 'Text'}
              </div>
            </div>
          </Card>

          {/* Saved Stamps */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">Saved Stamps</h4>
              <Badge variant="outline">{stamps.length}</Badge>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {stamps.map((stamp) => (
                <div
                  key={stamp.id}
                  className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded flex-shrink-0"
                      style={{
                        backgroundColor: stamp.elements.backgroundColor,
                        backgroundImage: stamp.preview ? `url(${stamp.preview})` : undefined,
                        backgroundSize: 'cover',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{stamp.name}</p>
                      <p className="text-xs text-gray-500">{stamp.type} · {stamp.position}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => duplicateStamp(stamp)}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Duplicate"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteStamp(stamp.id)}
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {stamps.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Stamp className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No stamps created yet</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* AI Suggestions */}
      <Card className="p-6 bg-gradient-to-br from-cyan-50 to-blue-50">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-cyan-600 mt-1" />
          <div>
            <h4 className="font-semibold text-cyan-900 mb-2">AI Stamp Suggestions</h4>
            <p className="text-sm text-cyan-800 mb-3">
              Let AI create professional brand stamps based on your industry and style
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-300"
              onClick={handleGenerateSuggestions}
              disabled={generatingSuggestions}
            >
              {generatingSuggestions ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-3 h-3 mr-1" /> Generate Suggestions</>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
