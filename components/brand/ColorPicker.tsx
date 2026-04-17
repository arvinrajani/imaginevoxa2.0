'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [textValue, setTextValue] = useState(value);

  function handleTextChange(raw: string) {
    let hex = raw.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    setTextValue(hex);
    if (HEX_REGEX.test(hex)) {
      onChange(hex.toLowerCase());
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_REGEX.test(value) ? value : '#000000'}
          onChange={(e) => {
            const hex = e.target.value.toLowerCase();
            setTextValue(hex);
            onChange(hex);
          }}
          className="h-9 w-9 cursor-pointer rounded border border-gray-200 p-0.5"
        />
        <Input
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-28 font-mono text-sm"
          maxLength={7}
          placeholder="#000000"
        />
        <div
          className="h-7 w-7 rounded border border-gray-200"
          style={{ backgroundColor: HEX_REGEX.test(value) ? value : '#000' }}
        />
      </div>
    </div>
  );
}
