// Client-safe theme slot definitions (no sharp dependency)
// Server-side composition lives in theme-composer.ts

export type ImageSlot = {
  id: string;
  label: string;
  /** Position and size as percentages (0-100) of canvas dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rect' | 'circle' | 'rounded-rect';
  required: boolean;
};

export type ThemeSlotSchema = {
  themeId: string;
  imageSlots: ImageSlot[];
};

export const THEME_SCHEMAS: Record<string, ThemeSlotSchema> = {
  'clean-brand': {
    themeId: 'clean-brand',
    imageSlots: [
      { id: 'hero', label: 'Hero Image', x: 60, y: 16, width: 36, height: 72, shape: 'rounded-rect', required: false },
    ],
  },
  'brand-story': {
    themeId: 'brand-story',
    imageSlots: [
      { id: 'hero', label: 'Portrait / Story Image', x: 4, y: 8, width: 40, height: 84, shape: 'circle', required: false },
    ],
  },
  'industrial-campaign': {
    themeId: 'industrial-campaign',
    imageSlots: [
      { id: 'hero', label: 'Hero Image', x: 3, y: 18, width: 37, height: 70, shape: 'rounded-rect', required: false },
    ],
  },
  'product-hero': {
    themeId: 'product-hero',
    imageSlots: [
      { id: 'hero', label: 'Product Image', x: 31, y: 14, width: 38, height: 50, shape: 'circle', required: false },
    ],
  },
  'knowledge-visual': {
    themeId: 'knowledge-visual',
    imageSlots: [
      { id: 'hero', label: 'Reference / Data Image', x: 4, y: 4, width: 52, height: 92, shape: 'rounded-rect', required: false },
    ],
  },
  'datasheet-frame': {
    themeId: 'datasheet-frame',
    imageSlots: [
      { id: 'hero', label: 'Product Image', x: 4, y: 4, width: 42, height: 92, shape: 'rounded-rect', required: false },
    ],
  },
  'proof-stack': {
    themeId: 'proof-stack',
    imageSlots: [],
  },
  'launch-banner': {
    themeId: 'launch-banner',
    imageSlots: [],
  },
  'sector-collage': {
    themeId: 'sector-collage',
    imageSlots: [
      { id: 'panel-1', label: 'Sector Image 1', x: 3, y: 19, width: 30, height: 49, shape: 'rounded-rect', required: false },
      { id: 'panel-2', label: 'Sector Image 2', x: 35, y: 19, width: 30, height: 49, shape: 'rounded-rect', required: false },
      { id: 'panel-3', label: 'Sector Image 3', x: 67, y: 19, width: 30, height: 49, shape: 'rounded-rect', required: false },
    ],
  },
  'offer-card': {
    themeId: 'offer-card',
    imageSlots: [
      { id: 'hero', label: 'Product / Service Image', x: 58, y: 4, width: 38, height: 92, shape: 'rounded-rect', required: false },
    ],
  },
  'comparison-board': {
    themeId: 'comparison-board',
    imageSlots: [
      { id: 'panel-left', label: 'Option A Image', x: 4, y: 22, width: 44, height: 70, shape: 'rounded-rect', required: false },
      { id: 'panel-right', label: 'Option B Image', x: 52, y: 22, width: 44, height: 70, shape: 'rounded-rect', required: false },
    ],
  },
  'premium-editorial': {
    themeId: 'premium-editorial',
    imageSlots: [
      { id: 'hero', label: 'Editorial Image', x: 3, y: 3, width: 30, height: 94, shape: 'rounded-rect', required: false },
    ],
  },
  'guided-auto': {
    themeId: 'guided-auto',
    imageSlots: [
      { id: 'hero', label: 'Main Image', x: 4, y: 4, width: 46, height: 92, shape: 'rounded-rect', required: false },
    ],
  },
};

/** Get image slot definitions for a theme (empty array for alliance-poster which uses its own composer) */
export function getThemeSlots(themeId: string): ImageSlot[] {
  return THEME_SCHEMAS[themeId]?.imageSlots ?? [];
}
