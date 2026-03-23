'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ChangeEvent,
} from 'react';
import {
  Upload,
  Image as ImageIcon,
  Type,
  Palette,
  ZoomIn,
  ZoomOut,
  Download,
  Wand2,
  Layers,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Copy,
  Sparkles,
  RefreshCw,
  MousePointer2,
  Plus,
  Stamp,
  Undo2,
  Redo2,
  AlignCenter,
  AlignLeft,
  AlignRight,
  FolderOpen,
  CheckCircle2,
  Info,
  Square,
  Circle,
  Minus,
  RotateCw,
  Crop,
  SlidersHorizontal,
  Eraser,
  Maximize2,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Layer {
  id: string;
  type: 'image' | 'text' | 'logo' | 'shape';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  src?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  shapeType?: 'rect' | 'circle' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  _filterBrightness?: number;
  _filterContrast?: number;
  _filterSaturation?: number;
  _filterBlur?: number;
  _textShadow?: boolean;
  _textOutline?: boolean;
  _textBgHighlight?: boolean;
}

interface LogoAsset {
  url: string;
  name?: string;
}

interface ImageEditorProps {
  baseImageUrl?: string;
  logoUrl?: string;
  brandId?: string;
  brandName?: string;
  brandColors?: string[];
  /** All logos from the brand kit */
  logoAssets?: LogoAsset[];
  /** Brand tone/voice from the wizard e.g. ['professional','confident'] */
  toneGuidelines?: string[];
  /** Image styles from the wizard e.g. ['minimal','gradient','data-viz'] */
  allowedImageStyles?: string[];
  /** Font personality from the wizard e.g. 'modern-professional' */
  fontPersonality?: string;
  onExport: (imageData: string) => void;
  /** Called when the user confirms the image and wants to move to next step */
  onImageConfirmed?: (imageDataUrl: string) => void;
}

type ToolMode = 'select' | 'text' | 'shape' | 'crop';
type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr' | 'mt' | 'mb' | null;
type SnapGuideLine = { x1: number; y1: number; x2: number; y2: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_W = 1200;
const CANVAS_H = 628;
const MIN_CANVAS_SIZE = 320;
const MAX_CANVAS_SIZE = 4096;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.5;
const LAYER_SNAP_THRESHOLD = 8;

const PRESET_SIZES = [
  { label: 'LinkedIn Post', w: 1200, h: 628 },
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Carousel', w: 1080, h: 1080 },
  { label: 'Story', w: 1080, h: 1920 },
  { label: 'Banner', w: 1584, h: 396 },
  { label: 'Cover', w: 1128, h: 191 },
];

const FONT_OPTIONS = [
  'Inter, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  'Courier New, monospace',
  'Verdana, sans-serif',
  'Trebuchet MS, sans-serif',
  'Montserrat, sans-serif',
  'Playfair Display, serif',
  'Roboto, sans-serif',
  'Poppins, sans-serif',
  'Lato, sans-serif',
  'Open Sans, sans-serif',
  'Raleway, sans-serif',
  'Oswald, sans-serif',
  'Merriweather, serif',
  'Source Sans 3, sans-serif',
  'Nunito, sans-serif',
  'Bebas Neue, sans-serif',
  'DM Sans, sans-serif',
  'Space Grotesk, sans-serif',
];

const GOOGLE_FONT_NAMES = [
  'Montserrat', 'Playfair+Display', 'Roboto', 'Poppins', 'Lato',
  'Open+Sans', 'Raleway', 'Oswald', 'Merriweather', 'Source+Sans+3',
  'Nunito', 'Bebas+Neue', 'DM+Sans', 'Space+Grotesk',
];

const SHAPE_PRESETS = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
];

const CROP_PRESETS = [
  { label: 'Free', ratio: 0 },
  { label: '1:1', ratio: 1 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '9:16', ratio: 9 / 16 },
];

const AI_STYLE_PRESETS = [
  { id: 'brand', label: 'My Brand', prompt: '' }, // filled dynamically from brand kit
  { id: 'professional', label: 'Professional', prompt: 'Professional, corporate, clean, modern, business' },
  { id: 'creative', label: 'Creative', prompt: 'Creative, artistic, vibrant, expressive, bold colors' },
  { id: 'minimal', label: 'Minimal', prompt: 'Minimal, clean, lots of whitespace, simple geometric' },
  { id: 'tech', label: 'Tech', prompt: 'Technology, futuristic, digital, neon accents, dark mode' },
  { id: 'warm', label: 'Warm', prompt: 'Warm, inviting, sunset tones, amber, cozy atmosphere' },
  { id: 'nature', label: 'Nature', prompt: 'Nature, organic, green tones, fresh, environmental' },
];

// Quick prompt ideas the user can click instead of typing from scratch
const AI_PROMPT_IDEAS = [
  { emoji: '📊', label: 'Data Visualization', prompt: 'Abstract data visualization with flowing charts, graphs, and glowing data points' },
  { emoji: '🚀', label: 'Product Launch', prompt: 'Dynamic product launch visual with spotlight effect, celebration elements, and confetti' },
  { emoji: '🏆', label: 'Achievement', prompt: 'Professional achievement celebration with trophy, medals, golden light, and success elements' },
  { emoji: '💡', label: 'Innovation', prompt: 'Innovation and ideas concept with glowing lightbulbs, neural networks, and creative sparks' },
  { emoji: '🤝', label: 'Partnership', prompt: 'Business partnership and collaboration visual with connected hands, bridge, and unity elements' },
  { emoji: '📈', label: 'Growth Story', prompt: 'Business growth chart going upward with greenery growing from it, prosperity and success' },
  { emoji: '🎯', label: 'Strategy', prompt: 'Strategic planning visual with target, chess pieces, roadmap elements, and clear direction' },
  { emoji: '👥', label: 'Team Culture', prompt: 'Diverse team collaboration scene with modern office, teamwork energy, and positive atmosphere' },
  { emoji: '🌍', label: 'Global Reach', prompt: 'Global business expansion visual with world map, connected nodes, and international reach' },
  { emoji: '⚡', label: 'Tech Innovation', prompt: 'Cutting-edge technology visual with circuits, AI neural network, futuristic holographic display' },
  { emoji: '📱', label: 'Digital Transform', prompt: 'Digital transformation concept with devices morphing, cloud computing, and modern tech stack' },
  { emoji: '🎓', label: 'Knowledge Share', prompt: 'Knowledge sharing and education concept with open books, flowing wisdom, and learning pathways' },
  { emoji: '🔒', label: 'Security & Trust', prompt: 'Cybersecurity and trust visual with shield, lock, encrypted data streams, and protection' },
  { emoji: '♻️', label: 'Sustainability', prompt: 'Sustainability and green business visual with renewable energy, nature, and eco-friendly elements' },
  { emoji: '✨', label: 'Abstract Gradient', prompt: 'Beautiful abstract gradient mesh with flowing organic shapes and soft color transitions' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'objectFit'>
) {
  const fit = layer.objectFit || 'contain';
  if (fit === 'fill') {
    ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
    return;
  }

  const frameRatio = layer.width / Math.max(layer.height, 1);
  const imageRatio = img.width / Math.max(img.height, 1);

  let drawW = layer.width;
  let drawH = layer.height;

  if ((fit === 'contain' && imageRatio > frameRatio) || (fit === 'cover' && imageRatio < frameRatio)) {
    drawW = layer.width;
    drawH = drawW / imageRatio;
  } else {
    drawH = layer.height;
    drawW = drawH * imageRatio;
  }

  const drawX = layer.x + (layer.width - drawW) / 2;
  const drawY = layer.y + (layer.height - drawH) / 2;

  if (fit === 'cover') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(layer.x, layer.y, layer.width, layer.height);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
    return;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const lines: string[] = [];
  const safeWidth = Math.max(maxWidth, 16);
  const paragraphs = text.replace(/\r/g, '').split('\n');

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > safeWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length ? lines : [''];
}

// ---------------------------------------------------------------------------
// Build brand-context prompt
// ---------------------------------------------------------------------------

function buildBrandPromptContext(opts: {
  brandName?: string;
  brandColors?: string[];
  toneGuidelines?: string[];
  allowedImageStyles?: string[];
  fontPersonality?: string;
}) {
  const parts: string[] = [];

  if (opts.brandName) {
    parts.push(`This is for a brand called "${opts.brandName}".`);
  }

  if (opts.brandColors?.length) {
    parts.push(`Brand color palette: ${opts.brandColors.join(', ')}. Use these colors prominently in the image.`);
  }

  if (opts.allowedImageStyles?.length) {
    parts.push(`Visual style: ${opts.allowedImageStyles.join(', ')}.`);
  }

  if (opts.toneGuidelines?.length) {
    parts.push(`Brand tone: ${opts.toneGuidelines.join(', ')}. The visual should reflect this mood.`);
  }

  if (opts.fontPersonality) {
    parts.push(`Design aesthetic: ${opts.fontPersonality.replace(/-/g, ' ')}.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageEditor({
  baseImageUrl,
  logoUrl,
  brandId,
  brandName,
  brandColors = ['#0A66C2', '#0F172A', '#22D3EE'],
  logoAssets = [],
  toneGuidelines = [],
  allowedImageStyles = [],
  fontPersonality,
  onExport,
  onImageConfirmed,
}: ImageEditorProps) {
  // Canvas state
  const [canvasW, setCanvasW] = useState(CANVAS_W);
  const [canvasH, setCanvasH] = useState(CANVAS_H);
  const [zoom, setZoom] = useState(0.55);
  const [customCanvasW, setCustomCanvasW] = useState(CANVAS_W);
  const [customCanvasH, setCustomCanvasH] = useState(CANVAS_H);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bgGradient, setBgGradient] = useState(true);
  const [bgGradientA, setBgGradientA] = useState(brandColors[0] || '#0A66C2');
  const [bgGradientB, setBgGradientB] = useState(brandColors[1] || '#0F172A');

  // Layers
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tools
  const [tool, setTool] = useState<ToolMode>('select');
  const [sidePanel, setSidePanel] = useState<'layers' | 'ai' | 'text' | 'logos' | 'properties' | 'shapes' | 'filters' | 'crop' | 'canvas'>(baseImageUrl ? 'layers' : 'ai');

  // Shape creation
  const [newShapeType, setNewShapeType] = useState<'rect' | 'circle' | 'line'>('rect');
  const [newShapeFill, setNewShapeFill] = useState(brandColors[0] || '#0A66C2');
  const [newShapeStroke, setNewShapeStroke] = useState('#ffffff');
  const [newShapeStrokeWidth, setNewShapeStrokeWidth] = useState(0);

  // Text effects
  const [newTextShadow, setNewTextShadow] = useState(false);
  const [newTextOutline, setNewTextOutline] = useState(false);
  const [newTextBgHighlight, setNewTextBgHighlight] = useState(false);

  // Filters (per-layer)
  const [filterBrightness, setFilterBrightness] = useState(100);
  const [filterContrast, setFilterContrast] = useState(100);
  const [filterSaturation, setFilterSaturation] = useState(100);
  const [filterBlur, setFilterBlur] = useState(0);

  // Crop
  const [cropActive, setCropActive] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [cropRatio, setCropRatio] = useState(0);

  // Background removal
  const [removingBg, setRemovingBg] = useState(false);

  // Google Fonts loaded
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('brand');
  const [generating, setGenerating] = useState(false);
  const [lastExportUrl, setLastExportUrl] = useState<string | null>(null);
  const [aiAsBackground, setAiAsBackground] = useState(true);
  const autoLogoSeedKeyRef = useRef<string | null>(null);

  // Style reference
  const [styleRef, setStyleRef] = useState<{ style_summary: string; palette: string[] } | null>(null);
  const [styleRefUrl, setStyleRefUrl] = useState('');
  const [analyzingStyle, setAnalyzingStyle] = useState(false);

  // Text input
  const [newText, setNewText] = useState('');
  const [newFontSize, setNewFontSize] = useState(48);
  const [newTextColor, setNewTextColor] = useState('#ffffff');
  const [newFontFamily, setNewFontFamily] = useState(FONT_OPTIONS[0]);
  const [newFontWeight, setNewFontWeight] = useState<string>('bold');
  const [newTextAlign, setNewTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineTextDraft, setInlineTextDraft] = useState('');

  // Drag state
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<Handle>(null);
  const dragStart = useRef({ x: 0, y: 0, lx: 0, ly: 0, lw: 0, lh: 0 });

  // History
  const history = useRef<Layer[][]>([]);
  const historyIdx = useRef(-1);
  const pushHistory = useCallback((next: Layer[]) => {
    const h = history.current;
    h.length = historyIdx.current + 1;
    h.push(JSON.parse(JSON.stringify(next)));
    historyIdx.current = h.length - 1;
  }, []);
  const undo = useCallback(() => {
    if (historyIdx.current > 0) {
      historyIdx.current -= 1;
      setLayers(JSON.parse(JSON.stringify(history.current[historyIdx.current])));
    }
  }, []);
  const redo = useCallback(() => {
    if (historyIdx.current < history.current.length - 1) {
      historyIdx.current += 1;
      setLayers(JSON.parse(JSON.stringify(history.current[historyIdx.current])));
    }
  }, []);

  const updateLayers = useCallback(
    (fn: (prev: Layer[]) => Layer[]) => {
      setLayers((prev) => {
        const next = fn(prev);
        pushHistory(next);
        return next;
      });
    },
    [pushHistory]
  );

  // Load Google Fonts
  useEffect(() => {
    if (fontsLoaded) return;
    const families = GOOGLE_FONT_NAMES.map(f => `family=${f}:wght@400;600;700;900`).join('&');
    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    setFontsLoaded(true);
  }, [fontsLoaded]);

  // Set gradient colors when brand colors change
  useEffect(() => {
    if (brandColors[0]) setBgGradientA(brandColors[0]);
    if (brandColors[1]) setBgGradientB(brandColors[1]);
  }, [brandColors]);

  useEffect(() => {
    setCustomCanvasW(canvasW);
    setCustomCanvasH(canvasH);
  }, [canvasW, canvasH]);

  // Initial base image
  useEffect(() => {
    if (baseImageUrl) {
      addImageLayer(baseImageUrl, 'Background', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageUrl]);

  // -----------------------------------------------------------------------
  // Combined list of all available logos
  // -----------------------------------------------------------------------

  const allLogos: LogoAsset[] = (() => {
    const map = new Map<string, LogoAsset>();
    // Add logoUrl if present
    if (logoUrl) map.set(logoUrl, { url: logoUrl, name: 'Primary Logo' });
    // Add all brand-kit logos
    if (logoAssets?.length) {
      logoAssets.forEach((la) => {
        if (la.url && !map.has(la.url)) map.set(la.url, la);
      });
    }
    return Array.from(map.values());
  })();

  // -----------------------------------------------------------------------
  // Layer CRUD
  // -----------------------------------------------------------------------

  const addImageLayer = useCallback(
    (src: string, name = 'Image', isBackground = false) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let w: number;
        let h: number;
        const imageRatio = img.width / Math.max(img.height, 1);
        const canvasRatio = canvasW / Math.max(canvasH, 1);
        const ratioDelta = Math.abs(imageRatio - canvasRatio);
        const backgroundFit: Layer['objectFit'] =
          ratioDelta > 0.15 ? 'contain' : 'cover';
        if (isBackground) {
          w = canvasW;
          h = canvasH;
        } else {
          const scale = Math.min((canvasW * 0.4) / img.width, (canvasH * 0.4) / img.height, 1);
          w = Math.round(img.width * scale);
          h = Math.round(img.height * scale);
        }

        const layer: Layer = {
          id: uid('img'),
          type: 'image',
          name: isBackground ? 'Base Image' : name,
          x: isBackground ? 0 : Math.round((canvasW - w) / 2),
          y: isBackground ? 0 : Math.round((canvasH - h) / 2),
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          visible: true,
          // Keep base images editable so GPT-generated visuals can be refined in editor.
          locked: false,
          src,
          objectFit: isBackground ? backgroundFit : 'contain',
        };

        updateLayers((prev) => (isBackground ? [layer, ...prev] : [...prev, layer]));
        setSelectedId(layer.id);
        setSidePanel('properties');
      };
      img.src = src;
    },
    [canvasW, canvasH, updateLayers]
  );

  const addLogoLayer = useCallback(
    (src: string, name = 'Logo') => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxSize = Math.min(canvasW, canvasH) * 0.18;
        const scale = maxSize / Math.max(img.width, img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const layer: Layer = {
          id: uid('logo'),
          type: 'logo',
          name,
          x: canvasW - w - 40,
          y: canvasH - h - 40,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          src,
          objectFit: 'contain',
        };

        updateLayers((prev) => [...prev, layer]);
        setSelectedId(layer.id);
        setSidePanel('properties');
      };
      img.src = src;
    },
    [canvasW, canvasH, updateLayers]
  );

  useEffect(() => {
    if (!baseImageUrl || !logoUrl) return;
    const seedKey = `${baseImageUrl}|${logoUrl}`;
    if (autoLogoSeedKeyRef.current === seedKey) return;

    const hasAutoLogo = layers.some(
      (layer) => layer.type === 'logo' && layer.name === '[Auto Logo]' && layer.src === logoUrl
    );

    if (!hasAutoLogo) {
      addLogoLayer(logoUrl, '[Auto Logo]');
    }

    autoLogoSeedKeyRef.current = seedKey;
  }, [baseImageUrl, logoUrl, layers, addLogoLayer]);

  // -----------------------------------------------------------------------
  // Shape layer
  // -----------------------------------------------------------------------
  const addShapeLayer = useCallback(
    (shapeType: 'rect' | 'circle' | 'line') => {
      const layer: Layer = {
        id: uid('shape'),
        type: 'shape',
        name: `Shape (${shapeType})`,
        x: Math.round(canvasW * 0.25),
        y: Math.round(canvasH * 0.25),
        width: shapeType === 'line' ? Math.round(canvasW * 0.5) : Math.round(canvasW * 0.3),
        height: shapeType === 'line' ? 4 : Math.round(canvasH * 0.3),
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        shapeType,
        fill: newShapeFill,
        stroke: newShapeStrokeWidth > 0 ? newShapeStroke : undefined,
        strokeWidth: newShapeStrokeWidth,
      };
      updateLayers((prev) => [...prev, layer]);
      setSelectedId(layer.id);
      setSidePanel('properties');
    },
    [canvasW, canvasH, newShapeFill, newShapeStroke, newShapeStrokeWidth, updateLayers]
  );

  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      updateLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [updateLayers]
  );

  const nudgeLayer = useCallback(
    (layerId: string, dx: number, dy: number) => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer || layer.locked) return;
      patchLayer(layerId, { x: layer.x + dx, y: layer.y + dy });
    },
    [layers, patchLayer]
  );

  const alignLayerToCanvas = useCallback(
    (layerId: string, position: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer) return;

      if (position === 'left') patchLayer(layerId, { x: 0 });
      if (position === 'center') patchLayer(layerId, { x: Math.round((canvasW - layer.width) / 2) });
      if (position === 'right') patchLayer(layerId, { x: Math.round(canvasW - layer.width) });
      if (position === 'top') patchLayer(layerId, { y: 0 });
      if (position === 'middle') patchLayer(layerId, { y: Math.round((canvasH - layer.height) / 2) });
      if (position === 'bottom') patchLayer(layerId, { y: Math.round(canvasH - layer.height) });
    },
    [layers, patchLayer, canvasW, canvasH]
  );

  const centerLayerInCanvas = useCallback(
    (layerId: string) => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer) return;
      patchLayer(layerId, {
        x: Math.round((canvasW - layer.width) / 2),
        y: Math.round((canvasH - layer.height) / 2),
      });
    },
    [layers, patchLayer, canvasW, canvasH]
  );

  const moveLayerToExtreme = useCallback(
    (layerId: string, direction: 'front' | 'back') => {
      updateLayers((prev) => {
        const index = prev.findIndex((entry) => entry.id === layerId);
        if (index < 0) return prev;
        const next = [...prev];
        const [layer] = next.splice(index, 1);
        if (!layer) return prev;
        if (direction === 'front') {
          next.push(layer);
        } else {
          next.unshift(layer);
        }
        return next;
      });
    },
    [updateLayers]
  );

  // -----------------------------------------------------------------------
  // Background removal
  // -----------------------------------------------------------------------
  const removeBackground = useCallback(
    async (layerId: string) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'image' || !layer.src) return;
      setRemovingBg(true);
      try {
        const res = await fetch('/api/pro/image/remove-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: layer.src, brandId: brandId || 'default' }),
        });
        if (!res.ok) throw new Error('Background removal failed');
        const { url } = await res.json();
        patchLayer(layerId, { src: url });
        toast.success('Background removed!');
      } catch (err: any) {
        toast.error('Failed to remove background', { description: err.message });
      } finally {
        setRemovingBg(false);
      }
    },
    [layers, brandId, patchLayer]
  );

  // -----------------------------------------------------------------------
  // Apply filters to selected layer
  // -----------------------------------------------------------------------
  const applyFiltersToLayer = useCallback(
    (layerId: string) => {
      // Filters are stored as CSS on the rendered element; we keep them in a custom prop
      patchLayer(layerId, {
        _filterBrightness: filterBrightness,
        _filterContrast: filterContrast,
        _filterSaturation: filterSaturation,
        _filterBlur: filterBlur,
      });
      toast.success('Filters applied');
    },
    [filterBrightness, filterContrast, filterSaturation, filterBlur, patchLayer]
  );

  // -----------------------------------------------------------------------
  // Crop canvas
  // -----------------------------------------------------------------------
  const applyCrop = useCallback(() => {
    if (cropRect.w < 10 || cropRect.h < 10) {
      toast.error('Select a crop area first');
      return;
    }
    // Resize canvas and offset all layers
    const dx = cropRect.x;
    const dy = cropRect.y;
    updateLayers((prev) =>
      prev.map((l) => ({ ...l, x: l.x - dx, y: l.y - dy }))
    );
    const nextW = Math.round(cropRect.w);
    const nextH = Math.round(cropRect.h);
    setCanvasW(nextW);
    setCanvasH(nextH);
    setCustomCanvasW(nextW);
    setCustomCanvasH(nextH);
    setCropActive(false);
    setCropRect({ x: 0, y: 0, w: 0, h: 0 });
    setTool('select');
    toast.success('Canvas cropped');
  }, [cropRect, updateLayers]);

  // -----------------------------------------------------------------------
  // Smart resize — re-layout layers for a target aspect ratio
  // -----------------------------------------------------------------------
  const analyzeStyleReference = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setAnalyzingStyle(true);
    try {
      const res = await fetch('/api/pro/image/style-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url }),
      });
      if (!res.ok) throw new Error('Style analysis failed');
      const data = await res.json();
      setStyleRef({ style_summary: data.style_summary, palette: data.palette || [] });
      toast.success('Style reference analyzed!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to analyze style');
    } finally {
      setAnalyzingStyle(false);
    }
  }, []);

  const smartResize = useCallback(
    (targetW: number, targetH: number) => {
      const scaleX = targetW / canvasW;
      const scaleY = targetH / canvasH;
      updateLayers((prev) =>
        prev.map((l) => ({
          ...l,
          x: Math.round(l.x * scaleX),
          y: Math.round(l.y * scaleY),
          width: Math.round(l.width * scaleX),
          height: Math.round(l.height * scaleY),
          fontSize: l.fontSize ? Math.round(l.fontSize * Math.min(scaleX, scaleY)) : l.fontSize,
        }))
      );
      setCanvasW(targetW);
      setCanvasH(targetH);
      setCustomCanvasW(targetW);
      setCustomCanvasH(targetH);
      toast.success(`Resized to ${targetW}×${targetH}`);
    },
    [canvasW, canvasH, updateLayers]
  );

  const fitCanvasToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const availableW = viewport.clientWidth - 64;
    const availableH = viewport.clientHeight - 64;
    if (availableW <= 0 || availableH <= 0) return;

    const nextZoom = clamp(Math.min(availableW / canvasW, availableH / canvasH), MIN_ZOOM, MAX_ZOOM);
    setZoom(Number(nextZoom.toFixed(2)));
  }, [canvasW, canvasH]);

  const snapLayerPositionToCanvas = useCallback(
    (layer: Layer) => {
      let nextX = layer.x;
      let nextY = layer.y;

      const layerLeft = layer.x;
      const layerCenterX = layer.x + layer.width / 2;
      const layerRight = layer.x + layer.width;
      const layerTop = layer.y;
      const layerCenterY = layer.y + layer.height / 2;
      const layerBottom = layer.y + layer.height;

      if (Math.abs(layerLeft) <= LAYER_SNAP_THRESHOLD) {
        nextX = 0;
      } else if (Math.abs(layerCenterX - canvasW / 2) <= LAYER_SNAP_THRESHOLD) {
        nextX = Math.round(canvasW / 2 - layer.width / 2);
      } else if (Math.abs(canvasW - layerRight) <= LAYER_SNAP_THRESHOLD) {
        nextX = Math.round(canvasW - layer.width);
      }

      if (Math.abs(layerTop) <= LAYER_SNAP_THRESHOLD) {
        nextY = 0;
      } else if (Math.abs(layerCenterY - canvasH / 2) <= LAYER_SNAP_THRESHOLD) {
        nextY = Math.round(canvasH / 2 - layer.height / 2);
      } else if (Math.abs(canvasH - layerBottom) <= LAYER_SNAP_THRESHOLD) {
        nextY = Math.round(canvasH - layer.height);
      }

      return { ...layer, x: Math.round(nextX), y: Math.round(nextY) };
    },
    [canvasW, canvasH]
  );

  const applyCustomCanvasSize = useCallback(() => {
    const nextW = Math.round(Number(customCanvasW));
    const nextH = Math.round(Number(customCanvasH));
    if (!Number.isFinite(nextW) || !Number.isFinite(nextH)) {
      toast.error('Enter valid width and height');
      return;
    }

    const safeW = clamp(nextW, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const safeH = clamp(nextH, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    if (safeW !== nextW || safeH !== nextH) {
      toast.message(`Canvas size adjusted to ${safeW}x${safeH} for safety`);
    }

    smartResize(safeW, safeH);
  }, [customCanvasW, customCanvasH, smartResize]);

  const fitLayerToCanvas = useCallback(
    (layerId: string, mode: 'contain' | 'cover' | 'fill' = 'contain') => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || (layer.type !== 'image' && layer.type !== 'logo')) return;

      if (mode === 'fill') {
        patchLayer(layer.id, {
          x: 0,
          y: 0,
          width: canvasW,
          height: canvasH,
          objectFit: 'fill',
        });
        return;
      }

      const ratio = layer.width > 0 && layer.height > 0 ? layer.width / layer.height : 1;
      if (!Number.isFinite(ratio) || ratio <= 0) return;

      let drawW = canvasW;
      let drawH = drawW / ratio;

      if (mode === 'contain' && drawH > canvasH) {
        drawH = canvasH;
        drawW = drawH * ratio;
      }

      if (mode === 'cover' && drawH < canvasH) {
        drawH = canvasH;
        drawW = drawH * ratio;
      }

      patchLayer(layer.id, {
        x: Math.round((canvasW - drawW) / 2),
        y: Math.round((canvasH - drawH) / 2),
        width: Math.round(drawW),
        height: Math.round(drawH),
        objectFit: mode,
      });
    },
    [layers, canvasW, canvasH, patchLayer]
  );

  const primaryImageLayer = useMemo(
    () =>
      layers.find((layer) => layer.type === 'image' && layer.name === 'Base Image') ||
      layers.find((layer) => layer.type === 'image') ||
      null,
    [layers]
  );

  const textLayerIds = useMemo(
    () => layers.filter((layer) => layer.type === 'text').map((layer) => layer.id),
    [layers]
  );

  const removeAllTextLayers = useCallback(() => {
    if (!textLayerIds.length) {
      toast.message('No text layers to remove');
      return;
    }

    updateLayers((prev) => prev.filter((layer) => layer.type !== 'text'));
    if (selectedId && textLayerIds.includes(selectedId)) {
      setSelectedId(null);
    }
    toast.success('All text layers removed');
  }, [textLayerIds, updateLayers, selectedId]);

  const reduceBlueTint = useCallback(() => {
    if (!primaryImageLayer) {
      toast.error('No image layer found');
      return;
    }

    patchLayer(primaryImageLayer.id, {
      _filterBrightness: 106,
      _filterContrast: 106,
      _filterSaturation: 70,
      _filterBlur: 0,
    });
    setSelectedId(primaryImageLayer.id);
    setSidePanel('filters');
    toast.success('Blue tint reduced on base image');
  }, [primaryImageLayer, patchLayer]);

  const resetBaseImageColor = useCallback(() => {
    if (!primaryImageLayer) {
      toast.error('No image layer found');
      return;
    }

    patchLayer(primaryImageLayer.id, {
      _filterBrightness: 100,
      _filterContrast: 100,
      _filterSaturation: 100,
      _filterBlur: 0,
    });
    setSelectedId(primaryImageLayer.id);
    setSidePanel('filters');
    toast.success('Base image color reset');
  }, [primaryImageLayer, patchLayer]);

  const startInlineTextEdit = useCallback(
    (layerId: string) => {
      const layer = layers.find((entry) => entry.id === layerId);
      if (!layer || layer.type !== 'text') return;
      setSelectedId(layer.id);
      setTool('select');
      setSidePanel('text');
      setInlineEditingId(layer.id);
      setInlineTextDraft(layer.text || '');
    },
    [layers]
  );

  const addTextPreset = useCallback(
    (preset: 'headline' | 'subheadline' | 'cta') => {
      const defaultText =
        preset === 'headline'
          ? brandName ? `${brandName} headline` : 'Add headline'
          : preset === 'subheadline'
            ? 'Add supporting line'
            : 'Add CTA';

      const layer: Layer =
        preset === 'headline'
          ? {
              id: uid('txt'),
              type: 'text',
              name: 'Headline',
              x: Math.round(canvasW * 0.08),
              y: Math.round(canvasH * 0.12),
              width: Math.round(canvasW * 0.52),
              height: Math.round(canvasH * 0.24),
              rotation: 0,
              opacity: 1,
              visible: true,
              locked: false,
              text: defaultText,
              fontSize: Math.round(canvasH * 0.12),
              fontFamily: newFontFamily,
              fontWeight: '900',
              textAlign: 'left',
              color: '#ffffff',
              _textShadow: true,
            }
          : preset === 'subheadline'
            ? {
                id: uid('txt'),
                type: 'text',
                name: 'Subheadline',
                x: Math.round(canvasW * 0.08),
                y: Math.round(canvasH * 0.72),
                width: Math.round(canvasW * 0.48),
                height: Math.round(canvasH * 0.12),
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: false,
                text: defaultText,
                fontSize: Math.round(canvasH * 0.05),
                fontFamily: newFontFamily,
                fontWeight: '600',
                textAlign: 'left',
                color: '#ffffff',
                _textBgHighlight: true,
              }
            : {
                id: uid('txt'),
                type: 'text',
                name: 'CTA',
                x: Math.round(canvasW * 0.08),
                y: Math.round(canvasH * 0.84),
                width: Math.round(canvasW * 0.22),
                height: Math.round(canvasH * 0.08),
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: false,
                text: defaultText,
                fontSize: Math.round(canvasH * 0.042),
                fontFamily: newFontFamily,
                fontWeight: '700',
                textAlign: 'center',
                color: brandColors[0] || '#0A66C2',
                _textBgHighlight: true,
              };

      updateLayers((prev) => [...prev, layer]);
      setSelectedId(layer.id);
      setTool('select');
      setSidePanel('text');
      setInlineEditingId(layer.id);
      setInlineTextDraft(layer.text || '');
    },
    [brandColors, brandName, canvasH, canvasW, newFontFamily, updateLayers]
  );

  const addTextLayer = useCallback(() => {
    if (!newText.trim()) return;
    const layer: Layer = {
      id: uid('txt'),
      type: 'text',
      name: newText.slice(0, 20) || 'Text',
      x: Math.round(canvasW * 0.1),
      y: Math.round(canvasH / 2 - newFontSize),
      width: Math.round(canvasW * 0.8),
      height: Math.round(newFontSize * 2),
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: newText,
      fontSize: newFontSize,
      fontFamily: newFontFamily,
      fontWeight: newFontWeight,
      textAlign: newTextAlign,
      color: newTextColor,
      ...(newTextShadow ? { _textShadow: true } : {}),
      ...(newTextOutline ? { _textOutline: true } : {}),
      ...(newTextBgHighlight ? { _textBgHighlight: true } : {}),
    };
    updateLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
    setNewText('');
    setSidePanel('properties');
  }, [newText, newFontSize, newFontFamily, newFontWeight, newTextAlign, newTextColor, newTextShadow, newTextOutline, newTextBgHighlight, canvasW, canvasH, updateLayers]);

  // No auto-text layers -- the AI image already has text baked in.
  // Users can manually add text via the Text panel if needed.

  const deleteLayer = useCallback(
    (id: string) => {
      updateLayers((prev) => prev.filter((l) => l.id !== id));
      if (selectedId === id) setSelectedId(null);
      if (inlineEditingId === id) {
        setInlineEditingId(null);
        setInlineTextDraft('');
      }
    },
    [inlineEditingId, selectedId, updateLayers]
  );

  const commitInlineTextEdit = useCallback(() => {
    if (!inlineEditingId) return;
    const nextText = inlineTextDraft.trim();
    if (!nextText) {
      deleteLayer(inlineEditingId);
      toast.message('Empty text layer removed');
      return;
    }

    patchLayer(inlineEditingId, {
      text: inlineTextDraft,
      name: inlineTextDraft.slice(0, 20) || 'Text',
    });
    setInlineEditingId(null);
  }, [deleteLayer, inlineEditingId, inlineTextDraft, patchLayer]);

  const cancelInlineTextEdit = useCallback(() => {
    setInlineEditingId(null);
    setInlineTextDraft('');
  }, []);

  const handleInlineTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitInlineTextEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineTextEdit();
      }
    },
    [cancelInlineTextEdit, commitInlineTextEdit]
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      updateLayers((prev) => {
        const src = prev.find((l) => l.id === id);
        if (!src) return prev;
        const dup: Layer = { ...JSON.parse(JSON.stringify(src)), id: uid(src.type), x: src.x + 20, y: src.y + 20 };
        return [...prev, dup];
      });
    },
    [updateLayers]
  );

  const moveLayerOrder = useCallback(
    (id: string, dir: 'up' | 'down') => {
      updateLayers((prev) => {
        const idx = prev.findIndex((l) => l.id === id);
        if (idx < 0) return prev;
        const target = dir === 'up' ? idx + 1 : idx - 1;
        if (target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[target]] = [next[target], next[idx]];
        return next;
      });
    },
    [updateLayers]
  );

  // -----------------------------------------------------------------------
  // AI Image Generation — brand-aware
  // -----------------------------------------------------------------------

  const generateAIImage = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      // Build full brand context for the prompt
      const brandContext = buildBrandPromptContext({
        brandName,
        brandColors,
        toneGuidelines,
        allowedImageStyles,
        fontPersonality,
      });

      // Get style-specific additions
      const stylePreset = AI_STYLE_PRESETS.find((s) => s.id === aiStyle);
      const styleAddition =
        aiStyle === 'brand'
          ? '' // brand style comes entirely from the brand context above
          : stylePreset?.prompt || '';

      // Inject style reference if available
      const styleRefContext = styleRef
        ? `Match this visual style: ${styleRef.style_summary}. Use these colors as reference: ${styleRef.palette.join(', ')}.`
        : '';

      const fullPrompt = [
        `Create a stunning, professional image for a LinkedIn post about: "${aiPrompt.trim()}"`,
        brandContext,
        styleAddition,
        styleRefContext,
        'VISUAL DIRECTION: Create a compelling, thematic visual that tells a story. Think like a Fortune 500 brand designer.',
        'Use professional photography style or high-end 3D illustration — NOT abstract shapes, NOT clip art.',
        'Do NOT render any written text, letters, numbers, logos, watermarks, or typographic glyphs inside the generated image.',
        'Include conceptual elements that represent the topic meaningfully.',
        'The image should be immediately eye-catching in a LinkedIn feed.',
        'Ultra high quality, modern composition, premium feel, suitable for social media at 1200x628.',
      ]
        .filter(Boolean)
        .join('. ');

      const res = await fetch('/api/pro/image/asset/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: brandId || 'default',
          type: 'background',
          brandName: brandName || '',
          brandColors,
          prompt: fullPrompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      const url = data.url || data.file_url;
      if (!url) throw new Error('No image URL returned');
      addImageLayer(url, 'AI Generated', aiAsBackground);
    } catch (err: any) {
      console.error('AI generation error:', err);
      toast.error('Generation failed', { description: err.message || 'Please try again.' });
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, aiStyle, aiAsBackground, brandId, brandName, brandColors, toneGuidelines, allowedImageStyles, fontPersonality, addImageLayer]);

  // -----------------------------------------------------------------------
  // Pointer / drag / resize
  // -----------------------------------------------------------------------

  const canvasToLocal = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom]
  );

  const onCanvasDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const { x: lx, y: ly } = canvasToLocal(e.clientX, e.clientY);

      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const layer = layers[i];
        if (!layer.visible || layer.locked || layer.type !== 'text') continue;
        if (lx >= layer.x && lx <= layer.x + layer.width && ly >= layer.y && ly <= layer.y + layer.height) {
          startInlineTextEdit(layer.id);
          e.preventDefault();
          return;
        }
      }
    },
    [canvasToLocal, layers, startInlineTextEdit]
  );

  const hitHandle = useCallback(
    (lx: number, ly: number, layer: Layer): Handle => {
      const hs = 10 / zoom;
      const { x, y, width: w, height: h } = layer;
      const corners: { key: Handle; cx: number; cy: number }[] = [
        { key: 'tl', cx: x, cy: y },
        { key: 'tr', cx: x + w, cy: y },
        { key: 'bl', cx: x, cy: y + h },
        { key: 'br', cx: x + w, cy: y + h },
        { key: 'mt', cx: x + w / 2, cy: y },
        { key: 'mb', cx: x + w / 2, cy: y + h },
        { key: 'ml', cx: x, cy: y + h / 2 },
        { key: 'mr', cx: x + w, cy: y + h / 2 },
      ];
      for (const c of corners) {
        if (Math.abs(lx - c.cx) < hs && Math.abs(ly - c.cy) < hs) return c.key;
      }
      return null;
    },
    [zoom]
  );

  const onPointerDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (tool !== 'select') return;
      const { x: lx, y: ly } = canvasToLocal(e.clientX, e.clientY);

      if (selectedId) {
        const sel = layers.find((l) => l.id === selectedId);
        if (sel && sel.visible && !sel.locked) {
          const handle = hitHandle(lx, ly, sel);
          if (handle) {
            setResizing(handle);
            dragStart.current = { x: lx, y: ly, lx: sel.x, ly: sel.y, lw: sel.width, lh: sel.height };
            e.preventDefault();
            return;
          }
        }
      }

      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (!l.visible || l.locked) continue;
        if (lx >= l.x && lx <= l.x + l.width && ly >= l.y && ly <= l.y + l.height) {
          setSelectedId(l.id);
          setDragging(true);
          dragStart.current = { x: lx, y: ly, lx: l.x, ly: l.y, lw: l.width, lh: l.height };
          setSidePanel('properties');
          e.preventDefault();
          return;
        }
      }

      setSelectedId(null);
    },
    [tool, layers, selectedId, canvasToLocal, hitHandle]
  );

  const onPointerMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!dragging && !resizing) return;
      const { x: lx, y: ly } = canvasToLocal(e.clientX, e.clientY);
      const dx = lx - dragStart.current.x;
      const dy = ly - dragStart.current.y;

      if (dragging && selectedId) {
        setLayers((prev) =>
          prev.map((l) =>
            l.id === selectedId
              ? snapLayerPositionToCanvas({
                  ...l,
                  x: Math.round(dragStart.current.lx + dx),
                  y: Math.round(dragStart.current.ly + dy),
                })
              : l
          )
        );
      }

      if (resizing && selectedId) {
        setLayers((prev) =>
          prev.map((l) => {
            if (l.id !== selectedId) return l;
            const s = dragStart.current;
            let nx = s.lx, ny = s.ly, nw = s.lw, nh = s.lh;

            if (resizing === 'br') { nw = Math.max(20, s.lw + dx); nh = Math.max(20, s.lh + dy); }
            else if (resizing === 'bl') { nx = s.lx + dx; nw = Math.max(20, s.lw - dx); nh = Math.max(20, s.lh + dy); }
            else if (resizing === 'tr') { ny = s.ly + dy; nw = Math.max(20, s.lw + dx); nh = Math.max(20, s.lh - dy); }
            else if (resizing === 'tl') { nx = s.lx + dx; ny = s.ly + dy; nw = Math.max(20, s.lw - dx); nh = Math.max(20, s.lh - dy); }
            else if (resizing === 'mr') { nw = Math.max(20, s.lw + dx); }
            else if (resizing === 'ml') { nx = s.lx + dx; nw = Math.max(20, s.lw - dx); }
            else if (resizing === 'mb') { nh = Math.max(20, s.lh + dy); }
            else if (resizing === 'mt') { ny = s.ly + dy; nh = Math.max(20, s.lh - dy); }

            return { ...l, x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) };
          })
        );
      }
    },
    [dragging, resizing, selectedId, canvasToLocal, snapLayerPositionToCanvas]
  );

  const onPointerUp = useCallback(() => {
    if (dragging || resizing) pushHistory(layers);
    setDragging(false);
    setResizing(null);
  }, [dragging, resizing, layers, pushHistory]);

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  const exportImage = useCallback(async () => {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    const ctx = offscreen.getContext('2d')!;

    // Background
    if (bgGradient) {
      const g = ctx.createLinearGradient(0, 0, canvasW, canvasH);
      g.addColorStop(0, bgGradientA);
      g.addColorStop(1, bgGradientB);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (const layer of layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity;

      if ((layer.type === 'image' || layer.type === 'logo') && layer.src) {
        const imgSrc = layer.src;
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            drawImageLayer(ctx, img, layer);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = imgSrc;
        });
      }

      if (layer.type === 'shape') {
        ctx.save();
        if (layer.rotation) {
          const cx = layer.x + layer.width / 2;
          const cy = layer.y + layer.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        if (layer.shapeType === 'rect') {
          if (layer.fill) {
            ctx.fillStyle = layer.fill;
            ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
          }
          if (layer.stroke && layer.strokeWidth) {
            ctx.strokeStyle = layer.stroke;
            ctx.lineWidth = layer.strokeWidth;
            ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
          }
        } else if (layer.shapeType === 'circle') {
          ctx.beginPath();
          ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
          if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(); }
          if (layer.stroke && layer.strokeWidth) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth; ctx.stroke(); }
        } else if (layer.shapeType === 'line') {
          ctx.beginPath();
          ctx.moveTo(layer.x, layer.y + layer.height / 2);
          ctx.lineTo(layer.x + layer.width, layer.y + layer.height / 2);
          ctx.strokeStyle = layer.fill || layer.stroke || '#fff';
          ctx.lineWidth = layer.strokeWidth || 2;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (layer.type === 'text' && layer.text) {
        // Apply text effects in export
        const layerAny = layer as any;
        if (layerAny._textShadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
        }
        if (layerAny._textBgHighlight) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(layer.x - 8, layer.y - 4, layer.width + 16, layer.height + 8);
        }
        ctx.fillStyle = layer.color || '#fff';
        ctx.font = `${layer.fontWeight || 'bold'} ${layer.fontSize || 48}px ${layer.fontFamily || 'Arial, sans-serif'}`;
        ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
        const tx =
          layer.textAlign === 'left' ? layer.x
            : layer.textAlign === 'right' ? layer.x + layer.width
              : layer.x + layer.width / 2;
        const ty = layer.y + layer.height / 2;
        const maxW = layer.width;
        const lineHeight = (layer.fontSize || 48) * 1.25;
        const lines = wrapCanvasText(ctx, layer.text, maxW);

        const totalH = lines.length * lineHeight;
        const startY = ty - totalH / 2 + lineHeight / 2;
        const layerAnyText = layer as any;
        if (layerAnyText._textOutline) {
          ctx.strokeStyle = layer.color === '#000000' ? '#ffffff' : '#000000';
          ctx.lineWidth = 2;
          lines.forEach((line, i) => {
            ctx.strokeText(line, tx, startY + i * lineHeight);
          });
        }
        lines.forEach((line, i) => {
          ctx.fillText(line, tx, startY + i * lineHeight);
        });
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.globalAlpha = 1;
    }

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setLastExportUrl(url);
      onExport(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linkedin-post-${Date.now()}.png`;
      a.click();
    }, 'image/png');
  }, [canvasW, canvasH, bgColor, bgGradient, bgGradientA, bgGradientB, layers, onExport]);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // Delete / Backspace — delete selected layer
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const sel = layers.find((l) => l.id === selectedId);
        if (sel && !sel.locked) {
          e.preventDefault();
          deleteLayer(selectedId);
        }
      }

      // Ctrl+Z / Cmd+Z — Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y — Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }

      // Ctrl+D — Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateLayer(selectedId);
      }

      // Ctrl+E — Export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportImage();
      }

      // Arrow keys — nudge selected layer
      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const sel = layers.find((l) => l.id === selectedId);
        if (sel && !sel.locked) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp') nudgeLayer(sel.id, 0, -step);
          if (e.key === 'ArrowDown') nudgeLayer(sel.id, 0, step);
          if (e.key === 'ArrowLeft') nudgeLayer(sel.id, -step, 0);
          if (e.key === 'ArrowRight') nudgeLayer(sel.id, step, 0);
        }
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, layers, deleteLayer, undo, redo, duplicateLayer, exportImage, nudgeLayer]);

  useEffect(() => {
    fitCanvasToViewport();
  }, [fitCanvasToViewport]);

  // -----------------------------------------------------------------------
  // Snap guides — show center/edge alignment
  // -----------------------------------------------------------------------

  const snapGuides = useMemo(() => {
    if (!selectedId || (!dragging && !resizing)) return { lines: [] as SnapGuideLine[], snapped: false };

    const sel = layers.find((l) => l.id === selectedId);
    if (!sel) return { lines: [], snapped: false };

    const lines: SnapGuideLine[] = [];
    const cx = sel.x + sel.width / 2;
    const cy = sel.y + sel.height / 2;
    const canvasCx = canvasW / 2;
    const canvasCy = canvasH / 2;

    if (Math.abs(sel.x) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: 0, y1: 0, x2: 0, y2: canvasH });
    }
    if (Math.abs(sel.x + sel.width - canvasW) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: canvasW, y1: 0, x2: canvasW, y2: canvasH });
    }
    if (Math.abs(sel.y) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: 0, y1: 0, x2: canvasW, y2: 0 });
    }
    if (Math.abs(sel.y + sel.height - canvasH) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: 0, y1: canvasH, x2: canvasW, y2: canvasH });
    }
    if (Math.abs(cx - canvasCx) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: canvasCx, y1: 0, x2: canvasCx, y2: canvasH });
    }
    if (Math.abs(cy - canvasCy) <= LAYER_SNAP_THRESHOLD) {
      lines.push({ x1: 0, y1: canvasCy, x2: canvasW, y2: canvasCy });
    }

    return { lines, snapped: lines.length > 0 };
  }, [selectedId, layers, dragging, resizing, canvasW, canvasH]);

  useEffect(() => {
    if (!inlineEditingId) return;
    const layerStillExists = layers.some((layer) => layer.id === inlineEditingId && layer.type === 'text');
    if (!layerStillExists) {
      setInlineEditingId(null);
      setInlineTextDraft('');
    }
  }, [inlineEditingId, layers]);

  // -----------------------------------------------------------------------
  // File upload
  // -----------------------------------------------------------------------

  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>, isLogo = false) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (isLogo) addLogoLayer(url, file.name.slice(0, 20));
        else addImageLayer(url, file.name.slice(0, 20));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [addImageLayer, addLogoLayer]
  );

  const selected = layers.find((l) => l.id === selectedId) || null;
  const activeCanvasPreset = useMemo(
    () => PRESET_SIZES.find((ps) => ps.w === canvasW && ps.h === canvasH)?.label ?? 'Custom',
    [canvasW, canvasH]
  );
  const canvasAspectLabel = useMemo(() => {
    const ratio = canvasW / canvasH;
    if (!Number.isFinite(ratio)) return 'Custom';
    return `${ratio.toFixed(2)}:1`;
  }, [canvasW, canvasH]);

  // Brand context summary for showing in the UI
  const hasBrandContext = !!(brandName || toneGuidelines.length || allowedImageStyles.length || fontPersonality);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full min-h-[700px]">
      {/* ─── Top Toolbar ─── */}
      <div className="flex items-center gap-2 p-3 bg-white rounded-t-2xl border-b border-gray-200">
        <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
          <button
            onClick={() => setTool('select')}
            className={`p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="Select & Move"
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setTool('text'); setSidePanel('text'); }}
            className={`p-2 rounded-lg transition-colors ${tool === 'text' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="Text"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setTool('shape'); setSidePanel('shapes'); }}
            className={`p-2 rounded-lg transition-colors ${tool === 'shape' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="Shapes"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setTool('crop'); setSidePanel('crop'); setCropActive(true); setCropRect({ x: 0, y: 0, w: canvasW, h: canvasH }); }}
            className={`p-2 rounded-lg transition-colors ${tool === 'crop' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="Crop"
          >
            <Crop className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <button onClick={undo} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Undo">
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={redo} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Redo">
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200" />

        <button onClick={() => setZoom((z) => clamp(z - 0.1, MIN_ZOOM, MAX_ZOOM))} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clamp(z + 0.1, MIN_ZOOM, MAX_ZOOM))} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={fitCanvasToViewport}
          className="px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200"
          title="Fit canvas to viewport"
        >
          <span className="inline-flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5" />
            Fit
          </span>
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200"
          title="Set zoom to 100%"
        >
          100%
        </button>

        {selected && (
          <>
            <div className="w-px h-6 bg-gray-200" />
            <div className="hidden xl:flex items-center gap-1 rounded-xl border border-cyan-200 bg-cyan-50 px-1 py-1">
              {selected.type === 'text' && (
                <button
                  onClick={() => startInlineTextEdit(selected.id)}
                  className="px-2 py-1 text-xs rounded-lg text-cyan-700 hover:bg-white"
                >
                  Edit text
                </button>
              )}
              <button
                onClick={() => centerLayerInCanvas(selected.id)}
                className="px-2 py-1 text-xs rounded-lg text-cyan-700 hover:bg-white"
              >
                Center
              </button>
              <button
                onClick={() => moveLayerToExtreme(selected.id, 'front')}
                className="px-2 py-1 text-xs rounded-lg text-cyan-700 hover:bg-white"
              >
                Bring front
              </button>
            </div>
          </>
        )}

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50/70">
          <span className="text-[11px] text-gray-500">Canvas</span>
          <span className="text-xs text-gray-700 font-medium">{canvasW} x {canvasH}</span>
          <span className="text-[11px] text-gray-400">({activeCanvasPreset})</span>
        </div>

        {/* Brand indicator */}
        {hasBrandContext && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50/10 border border-emerald-50/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Brand Kit Active</span>
          </div>
        )}

        <select
          value={activeCanvasPreset}
          onChange={(e) => {
            const preset = PRESET_SIZES.find((ps) => ps.label === e.target.value);
            if (preset) smartResize(preset.w, preset.h);
          }}
          className="h-8 min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700"
          title="Canvas size presets"
        >
          {activeCanvasPreset === 'Custom' && (
            <option value="Custom">Custom ({canvasW}x{canvasH})</option>
          )}
          {PRESET_SIZES.map((ps) => (
            <option key={ps.label} value={ps.label}>
              {ps.label} ({ps.w}x{ps.h})
            </option>
          ))}
        </select>

        <div className="w-px h-6 bg-gray-200" />

        <Button size="sm" onClick={exportImage} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-5000 hover:to-emerald-500 text-white">
          <Download className="w-4 h-4 mr-1" />
          Export PNG
        </Button>

        {onImageConfirmed && (
          <Button
            size="sm"
            onClick={async () => {
              // Export to get URL, then confirm
              const offscreen = document.createElement('canvas');
              offscreen.width = canvasW;
              offscreen.height = canvasH;
              const ctx = offscreen.getContext('2d')!;
              if (bgGradient) {
                const g = ctx.createLinearGradient(0, 0, canvasW, canvasH);
                g.addColorStop(0, bgGradientA);
                g.addColorStop(1, bgGradientB);
                ctx.fillStyle = g;
              } else {
                ctx.fillStyle = bgColor;
              }
              ctx.fillRect(0, 0, canvasW, canvasH);
              for (const layer of layers) {
                if (!layer.visible) continue;
                ctx.globalAlpha = layer.opacity;
                if ((layer.type === 'image' || layer.type === 'logo') && layer.src) {
                  const img = new window.Image();
                  img.crossOrigin = 'anonymous';
                  await new Promise<void>((resolve) => {
                    img.onload = () => { drawImageLayer(ctx, img, layer); resolve(); };
                    img.onerror = () => resolve();
                    img.src = layer.src!;
                  });
                }
                if (layer.type === 'text' && layer.text) {
                  ctx.fillStyle = layer.color || '#fff';
                  ctx.font = `${layer.fontWeight || 'bold'} ${layer.fontSize || 48}px ${layer.fontFamily || 'Arial, sans-serif'}`;
                  ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'center';
                  ctx.textBaseline = 'middle';
                  const tx = layer.textAlign === 'left' ? layer.x : layer.textAlign === 'right' ? layer.x + layer.width : layer.x + layer.width / 2;
                  ctx.fillText(layer.text, tx, layer.y + layer.height / 2);
                }
                ctx.globalAlpha = 1;
              }
              const dataUrl = offscreen.toDataURL('image/png');
              onImageConfirmed(dataUrl);
            }}
            className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold"
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Confirm & Continue →
          </Button>
        )}

        {/* Keyboard shortcut hints */}
        <div className="hidden xl:flex items-center gap-1.5 text-[10px] text-gray-400">
          <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-500">Del</kbd>
          <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-500">⌘Z</kbd>
          <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-500">⌘D</kbd>
          <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-500">↑↓←→</kbd>
        </div>
      </div>

      {/* ─── Main Area ─── */}
      <div className="flex flex-1 overflow-hidden bg-gray-50">
        {/* ─── Left icon bar ─── */}
        <div className="w-12 flex flex-col items-center py-3 gap-1 bg-white border-r border-gray-200">
          {([
            { key: 'layers' as const, icon: Layers, label: 'Layers' },
            { key: 'properties' as const, icon: Palette, label: 'Properties' },
            { key: 'text' as const, icon: Type, label: 'Add Text' },
            { key: 'logos' as const, icon: Stamp, label: 'Logos' },
            { key: 'shapes' as const, icon: Square, label: 'Shapes' },
            { key: 'filters' as const, icon: SlidersHorizontal, label: 'Filters' },
            { key: 'canvas' as const, icon: Maximize2, label: 'Canvas Size' },
            { key: 'crop' as const, icon: Crop, label: 'Crop' },
            { key: 'ai' as const, icon: Wand2, label: 'AI Generate (Advanced)' },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSidePanel(key)}
              title={label}
              className={`p-2.5 rounded-xl transition-colors ${sidePanel === key ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}

          <div className="flex-1" />

          <label title="Upload image" className="p-2.5 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e)} />
          </label>
        </div>

        {/* ─── Side Panel ─── */}
        <div className="w-80 border-r border-gray-200 overflow-y-auto bg-white/50 backdrop-blur-sm">
          {/* ═══════════════════════════════════════ AI GENERATE ═══════════════════════════════════════ */}
          {sidePanel === 'ai' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-cyan-600" />
                AI Image Generator
              </div>

              {/* Brand context info */}
              {hasBrandContext && (
                <div className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-50/10 to-cyan-50/10 border border-emerald-50/20">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-emerald-300 font-medium mb-1">
                        Brand Kit Connected
                      </p>
                      <div className="space-y-0.5">
                        {brandName && (
                          <p className="text-[11px] text-gray-500">Brand: <span className="text-gray-600">{brandName}</span></p>
                        )}
                        {brandColors.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-500">Colors:</span>
                            {brandColors.slice(0, 5).map((c, i) => (
                              <div key={i} className="w-3 h-3 rounded-sm border border-gray-200" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        )}
                        {toneGuidelines.length > 0 && (
                          <p className="text-[11px] text-gray-500">Tone: <span className="text-gray-600">{toneGuidelines.slice(0, 3).join(', ')}</span></p>
                        )}
                        {allowedImageStyles.length > 0 && (
                          <p className="text-[11px] text-gray-500">Style: <span className="text-gray-600">{allowedImageStyles.slice(0, 3).join(', ')}</span></p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Textarea
                placeholder={`Describe the image you want...${brandName ? `\ne.g., Background for ${brandName} product launch announcement` : '\ne.g., Abstract tech background with flowing data streams'}`}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 resize-none text-sm"
              />

              {/* Quick prompt ideas — click to fill */}
              {!aiPrompt.trim() && (
                <div>
                  <label className="mb-2 block text-xs text-gray-500">Quick Ideas - click to use</label>
                  <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {AI_PROMPT_IDEAS.map((idea) => (
                      <button
                        key={idea.label}
                        onClick={() => setAiPrompt(idea.prompt)}
                        className="px-2 py-1.5 rounded-lg text-[11px] bg-gray-50 border border-gray-200 text-gray-600 hover:border-cyan-300 hover:bg-cyan-600/10 hover:text-cyan-600 transition-all whitespace-nowrap"
                      >
                        {idea.emoji} {idea.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Style presets */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Style</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {AI_STYLE_PRESETS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setAiStyle(s.id)}
                      className={`px-2 py-2 rounded-lg text-xs text-left transition-all ${aiStyle === s.id
                          ? 'bg-cyan-600/30 border border-cyan-300 text-cyan-600'
                          : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-slate-50'
                        }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Place as background or layer */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAiAsBackground(true)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${aiAsBackground ? 'bg-cyan-600/30 border-cyan-300 text-cyan-600' : 'border-gray-300 text-gray-500'}`}
                >
                  As Background
                </button>
                <button
                  onClick={() => setAiAsBackground(false)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${!aiAsBackground ? 'bg-cyan-600/30 border-cyan-300 text-cyan-600' : 'border-gray-300 text-gray-500'}`}
                >
                  As Layer
                </button>
              </div>

              {/* Style Reference */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Style Reference (optional)</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Paste image URL..."
                    value={styleRefUrl}
                    onChange={(e) => setStyleRefUrl(e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
                  />
                  <button
                    onClick={() => analyzeStyleReference(styleRefUrl)}
                    disabled={analyzingStyle || !styleRefUrl.trim()}
                    className="px-2 py-1.5 rounded-lg text-xs bg-gray-50 border border-gray-200 text-gray-500 hover:border-cyan-300 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                  >
                    {analyzingStyle ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Analyze'}
                  </button>
                </div>
                {styleRef && (
                  <div className="mt-2 p-2 bg-gray-50/50 rounded-lg border border-gray-200">
                    <p className="text-[11px] text-cyan-600 mb-1.5">{styleRef.style_summary}</p>
                    <div className="flex gap-1">
                      {styleRef.palette.map((c, i) => (
                        <div
                          key={i}
                          className="h-4 w-4 rounded border border-gray-300"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                      <button
                        onClick={() => { setStyleRef(null); setStyleRefUrl(''); }}
                        className="ml-auto text-[10px] text-gray-400 hover:text-red-400"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={generateAIImage}
                disabled={generating || !aiPrompt.trim()}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-100 hover:to-purple-100 text-gray-700"
              >
                {generating ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating with {aiStyle === 'brand' ? 'Brand Style' : 'AI'}...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />{aiStyle === 'brand' ? 'Generate with Brand Kit' : 'Generate Image'}</>
                )}
              </Button>

              {/* Quick upload & add logo */}
              <div className="pt-3 border-t border-gray-200 space-y-3">
                <div className="text-xs text-gray-500 font-semibold flex items-center gap-1.5">
                  <Stamp className="w-3.5 h-3.5 text-amber-400" />
                  Logo & Images
                </div>

                {/* Upload Logo */}
                <label className="block">
                  <Button size="sm" variant="outline" className="w-full justify-start border-amber-50/30 bg-amber-50/5 text-amber-300 hover:bg-amber-50/15 hover:border-amber-50/50" asChild>
                    <span><Upload className="w-4 h-4 mr-2" />Upload My Logo</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, true)} />
                </label>

                {/* Show existing logos as small clickable thumbnails */}
                {allLogos.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1.5">Your logos — click to add to canvas:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allLogos.map((logo, idx) => (
                        <button
                          key={`ai-logo-${idx}`}
                          onClick={() => addLogoLayer(logo.url, logo.name || `Logo ${idx + 1}`)}
                          className="w-12 h-12 rounded-lg border-2 border-gray-200 hover:border-cyan-300 bg-gray-50 p-1.5 transition-all hover:scale-105 group relative"
                          title={`Add ${logo.name || 'logo'} to canvas`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logo.url} alt={logo.name || 'Logo'} className="w-full h-full object-contain" />
                          <Plus className="w-3 h-3 text-cyan-600 opacity-0 group-hover:opacity-100 absolute bottom-0.5 right-0.5 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload plain image */}
                <label className="block">
                  <Button size="sm" variant="outline" className="w-full justify-start border-gray-300 text-gray-600 hover:bg-gray-100" asChild>
                    <span><Upload className="w-4 h-4 mr-2" />Upload Base Image</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e)} />
                </label>

                {/* Generate + Add Logo combo */}
                {allLogos.length > 0 && aiPrompt.trim() && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await generateAIImage();
                      // Auto-add logo after generation
                      setTimeout(() => {
                        addLogoLayer(allLogos[0].url, allLogos[0].name || 'Logo');
                        toast.success('Image generated & logo added!', { description: 'Drag the logo to reposition it.' });
                      }, 500);
                    }}
                    disabled={generating}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Generate Image + Add Logo
                  </Button>
                )}
              </div>

              {/* Background */}
              <div className="pt-2 border-t border-gray-200 space-y-3">
                <div className="text-xs text-gray-400 font-medium">Canvas Background</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setBgGradient(true)} className={`flex-1 py-1.5 text-xs rounded-lg border ${bgGradient ? 'bg-cyan-600/30 border-cyan-300 text-cyan-600' : 'border-gray-300 text-gray-500'}`}>Gradient</button>
                  <button onClick={() => setBgGradient(false)} className={`flex-1 py-1.5 text-xs rounded-lg border ${!bgGradient ? 'bg-cyan-600/30 border-cyan-300 text-cyan-600' : 'border-gray-300 text-gray-500'}`}>Solid</button>
                </div>
                {bgGradient ? (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-gray-400">Start</label>
                      <input type="color" value={bgGradientA} onChange={(e) => setBgGradientA(e.target.value)} className="w-full h-8 rounded bg-transparent cursor-pointer" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-gray-400">End</label>
                      <input type="color" value={bgGradientB} onChange={(e) => setBgGradientB(e.target.value)} className="w-full h-8 rounded bg-transparent cursor-pointer" />
                    </div>
                  </div>
                ) : (
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-8 rounded bg-transparent cursor-pointer" />
                )}
                <div className="flex gap-1.5 flex-wrap">
                  {brandColors.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => bgGradient ? setBgGradientA(c) : setBgColor(c)}
                      className="w-7 h-7 rounded-lg border-2 border-gray-300 hover:border-white transition-colors"
                      style={{ backgroundColor: c }}
                      title={`Brand: ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════ LOGOS PANEL ═══════════════════════════════════════ */}
          {sidePanel === 'logos' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Stamp className="w-4 h-4 text-amber-400" />
                Brand Logos
              </div>

              {allLogos.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto">
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-sm text-gray-400">No logos in your brand kit yet</p>
                  <p className="text-xs text-slate-600">Upload a logo or generate one in the Assets tab</p>
                  <label className="block">
                    <Button size="sm" variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-100" asChild>
                      <span><Upload className="w-4 h-4 mr-2" />Upload Logo</span>
                    </Button>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, true)} />
                  </label>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400">Click a logo to add it to your canvas. Drag to position it anywhere.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {allLogos.map((logo, idx) => (
                      <button
                        key={`logo-${idx}`}
                        onClick={() => addLogoLayer(logo.url, logo.name || `Logo ${idx + 1}`)}
                        className="group relative aspect-square bg-gray-50 rounded-xl border-2 border-gray-200 hover:border-cyan-300 transition-all overflow-hidden p-3 flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logo.url}
                          alt={logo.name || 'Logo'}
                          className="max-w-full max-h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-cyan-50/0 group-hover:bg-cyan-50 transition-colors flex items-center justify-center">
                          <Plus className="w-6 h-6 text-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {logo.name && (
                          <span className="absolute bottom-1 left-1 right-1 text-[10px] text-gray-500 truncate text-center">{logo.name}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <label className="block">
                      <Button size="sm" variant="outline" className="w-full justify-start border-gray-300 text-gray-600 hover:bg-gray-100" asChild>
                        <span><Upload className="w-4 h-4 mr-2" />Upload Another Logo</span>
                      </Button>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, true)} />
                    </label>
                  </div>

                  <div className="px-3 py-2 rounded-lg bg-gray-50/50 border border-gray-200">
                    <div className="flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-gray-400">
                        Logos are placed in the bottom-right corner by default. Drag to reposition or resize using the handles.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════ TEXT PANEL ═══════════════════════════════════════ */}
          {sidePanel === 'text' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Type className="w-4 h-4 text-cyan-600" />
                Add Text
              </div>

              {selected?.type === 'text' && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-cyan-700">Selected text layer</p>
                      <p className="text-[11px] text-cyan-700/80">Double-click text on the canvas to edit it in place.</p>
                    </div>
                    <button
                      onClick={() => startInlineTextEdit(selected.id)}
                      className="shrink-0 rounded-lg border border-cyan-200 bg-white px-2 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50"
                    >
                      Edit on canvas
                    </button>
                  </div>

                  <Textarea
                    value={inlineEditingId === selected.id ? inlineTextDraft : selected.text || ''}
                    onChange={(e) => {
                      if (inlineEditingId === selected.id) {
                        setInlineTextDraft(e.target.value);
                        return;
                      }

                      patchLayer(selected.id, {
                        text: e.target.value,
                        name: e.target.value.slice(0, 20) || 'Text',
                      });
                    }}
                    rows={3}
                    className="bg-white border-cyan-200 text-gray-900 text-sm resize-none"
                  />

                  {inlineEditingId === selected.id && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={commitInlineTextEdit} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white">
                        Apply text
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelInlineTextEdit} className="border-gray-300 text-gray-600 hover:bg-gray-100">
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Quick text overlays</p>
                  <p className="text-[11px] text-gray-500">Use these to replace baked-in image text, then drag them into place.</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'headline', label: 'Headline' },
                    { id: 'subheadline', label: 'Subheadline' },
                    { id: 'cta', label: 'CTA' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => addTextPreset(preset.id as 'headline' | 'subheadline' | 'cta')}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                placeholder="Type your text here..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={3}
                className="bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 resize-none text-sm"
              />

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Font</label>
                <select value={newFontFamily} onChange={(e) => setNewFontFamily(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Size</label>
                  <Input type="number" value={newFontSize} onChange={(e) => setNewFontSize(Number(e.target.value))} min={12} max={200} className="bg-gray-50 border-gray-300 text-gray-900" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Weight</label>
                  <select value={newFontWeight} onChange={(e) => setNewFontWeight(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                    <option value="normal">Regular</option>
                    <option value="bold">Bold</option>
                    <option value="900">Black</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Align</label>
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setNewTextAlign(a)}
                      className={`flex-1 p-2 rounded-lg transition-colors ${newTextAlign === a ? 'bg-cyan-600 text-white' : 'bg-gray-50 text-gray-500 hover:text-gray-900'}`}
                    >
                      {a === 'left' ? <AlignLeft className="w-4 h-4 mx-auto" /> : a === 'center' ? <AlignCenter className="w-4 h-4 mx-auto" /> : <AlignRight className="w-4 h-4 mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Color</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <input type="color" value={newTextColor} onChange={(e) => setNewTextColor(e.target.value)} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                  {['#ffffff', '#000000', ...brandColors].map((c, i) => (
                    <button
                      key={`${c}-${i}`}
                      onClick={() => setNewTextColor(c)}
                      className={`w-7 h-7 rounded-lg border-2 transition-colors ${newTextColor === c ? 'border-cyan-400' : 'border-gray-300 hover:border-white'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Text Effects */}
              <div className="pt-2 border-t border-gray-200 space-y-2">
                <label className="text-xs text-gray-500 block">Text Effects</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => setNewTextShadow(!newTextShadow)}
                    className={`p-2 rounded-lg text-xs text-center transition-colors ${newTextShadow ? 'bg-cyan-600/30 border border-cyan-300 text-cyan-600' : 'bg-gray-50 border border-gray-200 text-gray-500'
                      }`}
                  >
                    Shadow
                  </button>
                  <button
                    onClick={() => setNewTextOutline(!newTextOutline)}
                    className={`p-2 rounded-lg text-xs text-center transition-colors ${newTextOutline ? 'bg-cyan-600/30 border border-cyan-300 text-cyan-600' : 'bg-gray-50 border border-gray-200 text-gray-500'
                      }`}
                  >
                    Outline
                  </button>
                  <button
                    onClick={() => setNewTextBgHighlight(!newTextBgHighlight)}
                    className={`p-2 rounded-lg text-xs text-center transition-colors ${newTextBgHighlight ? 'bg-cyan-600/30 border border-cyan-300 text-cyan-600' : 'bg-gray-50 border border-gray-200 text-gray-500'
                      }`}
                  >
                    Highlight
                  </button>
                </div>
              </div>

              <Button onClick={addTextLayer} disabled={!newText.trim()} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Text to Canvas
              </Button>
            </div>
          )}

          {/* ═══════════════════════════════════════ SHAPES PANEL ═══════════════════════════════════════ */}
          {sidePanel === 'shapes' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Square className="w-4 h-4 text-cyan-600" />
                Shapes
              </div>

              <div className="grid grid-cols-3 gap-2">
                {SHAPE_PRESETS.map(({ id, label, icon: ShapeIcon }) => (
                  <button
                    key={id}
                    onClick={() => setNewShapeType(id as 'rect' | 'circle' | 'line')}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${newShapeType === id
                        ? 'border-cyan-300 bg-cyan-600/20 text-cyan-600'
                        : 'border-gray-200 text-gray-500 hover:border-slate-50'
                      }`}
                  >
                    <ShapeIcon className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fill Color</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <input type="color" value={newShapeFill} onChange={(e) => setNewShapeFill(e.target.value)} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                  {brandColors.map((c, i) => (
                    <button key={i} onClick={() => setNewShapeFill(c)} className={`w-6 h-6 rounded border-2 ${newShapeFill === c ? 'border-cyan-400' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
                  ))}
                  {['#ffffff', '#000000', 'transparent'].map((c, i) => (
                    <button key={`s-${i}`} onClick={() => setNewShapeFill(c)} className={`w-6 h-6 rounded border-2 ${newShapeFill === c ? 'border-cyan-400' : 'border-gray-300'} ${c === 'transparent' ? 'bg-[repeating-conic-gradient(#808080_0%_25%,transparent_0%_50%)_50%/16px_16px]' : ''}`} style={c !== 'transparent' ? { backgroundColor: c } : {}} title={c} />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Stroke Color</label>
                <input type="color" value={newShapeStroke} onChange={(e) => setNewShapeStroke(e.target.value)} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Stroke Width: {newShapeStrokeWidth}px</label>
                <input type="range" min={0} max={20} value={newShapeStrokeWidth} onChange={(e) => setNewShapeStrokeWidth(Number(e.target.value))} className="w-full accent-cyan-500" />
              </div>

              <Button onClick={() => addShapeLayer(newShapeType)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add {newShapeType === 'rect' ? 'Rectangle' : newShapeType === 'circle' ? 'Circle' : 'Line'}
              </Button>
            </div>
          )}

          {/* ═══════════════════════════════════════ FILTERS PANEL ═══════════════════════════════════════ */}
          {sidePanel === 'canvas' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Maximize2 className="w-4 h-4 text-cyan-600" />
                Canvas & Sizing
              </div>

              <div className="rounded-xl border border-gray-200 bg-white/50 p-3 space-y-2">
                <p className="text-xs text-gray-500">Current canvas</p>
                <div className="flex items-end justify-between">
                  <p className="text-lg font-semibold text-gray-900">{canvasW} x {canvasH}</p>
                  <Badge className="bg-gray-100 text-gray-700 text-[10px]">{canvasAspectLabel}</Badge>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_SIZES.map((ps) => (
                    <button
                      key={`canvas-${ps.label}`}
                      onClick={() => smartResize(ps.w, ps.h)}
                      className={`px-2 py-2 rounded-lg border text-xs transition-colors ${canvasW === ps.w && canvasH === ps.h
                          ? 'border-cyan-300 bg-cyan-600/20 text-cyan-600'
                          : 'border-gray-200 text-gray-600 hover:border-slate-50'
                        }`}
                    >
                      <span className="block font-medium">{ps.label}</span>
                      <span className="text-[10px] text-gray-400">{ps.w}x{ps.h}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">Custom size</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 block">Width</label>
                    <Input
                      type="number"
                      min={MIN_CANVAS_SIZE}
                      max={MAX_CANVAS_SIZE}
                      value={customCanvasW}
                      onChange={(e) => setCustomCanvasW(Number(e.target.value))}
                      className="bg-gray-50 border-gray-300 text-gray-900 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 block">Height</label>
                    <Input
                      type="number"
                      min={MIN_CANVAS_SIZE}
                      max={MAX_CANVAS_SIZE}
                      value={customCanvasH}
                      onChange={(e) => setCustomCanvasH(Number(e.target.value))}
                      className="bg-gray-50 border-gray-300 text-gray-900 text-sm"
                    />
                  </div>
                </div>
                <Button
                  onClick={applyCustomCanvasSize}
                  className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 text-white"
                  size="sm"
                >
                  Apply Custom Size
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-600 hover:bg-gray-100"
                  size="sm"
                  onClick={fitCanvasToViewport}
                >
                  Fit to Screen
                </Button>
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-600 hover:bg-gray-100"
                  size="sm"
                  onClick={() => setZoom(1)}
                >
                  Zoom 100%
                </Button>
              </div>
            </div>
          )}
          {sidePanel === 'filters' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <SlidersHorizontal className="w-4 h-4 text-cyan-600" />
                Image Filters
              </div>

              {!selected || (selected.type !== 'image' && selected.type !== 'logo') ? (
                <p className="text-xs text-gray-400 text-center py-8">Select an image layer to apply filters</p>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Brightness: {filterBrightness}%</label>
                    <input type="range" min={0} max={200} value={filterBrightness} onChange={(e) => setFilterBrightness(Number(e.target.value))} className="w-full accent-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Contrast: {filterContrast}%</label>
                    <input type="range" min={0} max={200} value={filterContrast} onChange={(e) => setFilterContrast(Number(e.target.value))} className="w-full accent-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Saturation: {filterSaturation}%</label>
                    <input type="range" min={0} max={200} value={filterSaturation} onChange={(e) => setFilterSaturation(Number(e.target.value))} className="w-full accent-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Blur: {filterBlur}px</label>
                    <input type="range" min={0} max={20} value={filterBlur} onChange={(e) => setFilterBlur(Number(e.target.value))} className="w-full accent-cyan-500" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => applyFiltersToLayer(selected.id)} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" size="sm">
                      Apply Filters
                    </Button>
                    <Button onClick={() => { setFilterBrightness(100); setFilterContrast(100); setFilterSaturation(100); setFilterBlur(0); }} variant="outline" className="border-gray-300 text-gray-600" size="sm">
                      Reset
                    </Button>
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <Button
                      onClick={() => removeBackground(selected.id)}
                      disabled={removingBg}
                      variant="outline"
                      className="w-full border-gray-300 text-gray-600 hover:bg-gray-100"
                      size="sm"
                    >
                      {removingBg ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing Background...</>
                      ) : (
                        <><Eraser className="w-4 h-4 mr-2" />Remove Background</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════ CROP PANEL ═══════════════════════════════════════ */}
          {sidePanel === 'crop' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Crop className="w-4 h-4 text-cyan-600" />
                Crop Canvas
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-2 block">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {CROP_PRESETS.map((cp) => (
                    <button
                      key={cp.label}
                      onClick={() => {
                        setCropRatio(cp.ratio);
                        if (cp.ratio > 0) {
                          const w = Math.min(canvasW, canvasH * cp.ratio);
                          const h = w / cp.ratio;
                          setCropRect({ x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h });
                        } else {
                          setCropRect({ x: 0, y: 0, w: canvasW, h: canvasH });
                        }
                      }}
                      className={`p-2 rounded-lg text-xs text-center transition-colors ${cropRatio === cp.ratio ? 'bg-cyan-600/30 border border-cyan-300 text-cyan-600' : 'bg-gray-50 border border-gray-200 text-gray-500'
                        }`}
                    >
                      {cp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500 mb-1 block">X</label><Input type="number" value={Math.round(cropRect.x)} onChange={(e) => setCropRect(r => ({ ...r, x: Number(e.target.value) }))} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Y</label><Input type="number" value={Math.round(cropRect.y)} onChange={(e) => setCropRect(r => ({ ...r, y: Number(e.target.value) }))} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Width</label><Input type="number" value={Math.round(cropRect.w)} onChange={(e) => setCropRect(r => ({ ...r, w: Number(e.target.value) }))} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Height</label><Input type="number" value={Math.round(cropRect.h)} onChange={(e) => setCropRect(r => ({ ...r, h: Number(e.target.value) }))} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" /></div>
              </div>

              <div className="flex gap-2">
                <Button onClick={applyCrop} className="flex-1 bg-green-600 hover:bg-green-500 text-white" size="sm">
                  <Crop className="w-4 h-4 mr-2" />Apply Crop
                </Button>
                <Button onClick={() => { setCropActive(false); setTool('select'); }} variant="outline" className="border-gray-300 text-gray-600" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════ LAYERS ═══════════════════════════════════════ */}
          {sidePanel === 'layers' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Layers className="w-4 h-4 text-cyan-600" />
                Layers
                <Badge className="bg-gray-100 text-gray-600 text-xs ml-auto">{layers.length}</Badge>
              </div>

              {baseImageUrl && layers.length > 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-50/10 to-blue-50/10 border border-cyan-50/20">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                    <div className="text-[11px] text-gray-600 space-y-1">
                      <p className="font-medium text-cyan-600">Editing your generated image</p>
                      <p>Add text, logos, shapes or adjust filters. Select any layer to edit its properties.</p>
                    </div>
                  </div>
                </div>
              )}

              {baseImageUrl && layers.length > 0 && (
                <div className="px-3 py-3 rounded-xl bg-gray-50/70 border border-gray-200 space-y-2.5">
                  <p className="text-[11px] text-gray-600 font-medium flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3 text-cyan-600" />
                    Quick Actions
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => primaryImageLayer && fitLayerToCanvas(primaryImageLayer.id, 'cover')}
                      disabled={!primaryImageLayer}
                      className="h-8 border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] justify-start"
                    >
                      <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
                      Fill Canvas
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => primaryImageLayer && fitLayerToCanvas(primaryImageLayer.id, 'contain')}
                      disabled={!primaryImageLayer}
                      className="h-8 border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] justify-start"
                    >
                      <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                      Fit in Canvas
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={reduceBlueTint}
                      disabled={!primaryImageLayer}
                      className="h-8 border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] justify-start"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                      Reduce Blue Tint
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetBaseImageColor}
                      disabled={!primaryImageLayer}
                      className="h-8 border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] justify-start"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Reset Colors
                    </Button>
                  </div>

                  {textLayerIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={removeAllTextLayers}
                      className="w-full h-8 border-gray-300 text-gray-700 hover:bg-gray-100 text-[11px] justify-start"
                    >
                      <ImageOff className="w-3.5 h-3.5 mr-1.5" />
                      Remove All Text Layers
                    </Button>
                  )}
                </div>
              )}

              {layers.length === 0 && (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto">
                    <Layers className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-400">No layers yet</p>
                  <p className="text-[11px] text-slate-600">Generate an AI image or upload to get started</p>
                </div>
              )}

              <div className="space-y-1">
                {[...layers].reverse().map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => { setSelectedId(layer.id); setSidePanel('properties'); }}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${selectedId === layer.id ? 'bg-cyan-600/20 border border-cyan-50/50' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${
                      layer.type === 'text' ? 'bg-purple-50/20' : layer.type === 'logo' ? 'bg-amber-50/20' : layer.type === 'shape' ? 'bg-blue-50/20' : 'bg-gray-200'
                    }`}>
                      {layer.type === 'text' ? <Type className="w-3 h-3 text-purple-400" /> : layer.type === 'logo' ? <Stamp className="w-3 h-3 text-amber-400" /> : layer.type === 'shape' ? <Square className="w-3 h-3 text-blue-400" /> : <ImageIcon className="w-3 h-3 text-gray-600" />}
                    </div>
                    <span className="text-xs text-gray-600 truncate flex-1">{layer.name}</span>
                    {!layer.visible && <EyeOff className="w-3 h-3 text-slate-600 flex-shrink-0" />}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); patchLayer(layer.id, { visible: !layer.visible }); }} className={`p-1 rounded hover:bg-gray-100 ${layer.visible ? 'text-gray-500' : 'text-slate-600'}`} title={layer.visible ? 'Hide' : 'Show'}>
                        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); patchLayer(layer.id, { locked: !layer.locked }); }} className={`p-1 rounded hover:bg-gray-100 ${layer.locked ? 'text-amber-400' : 'text-gray-400'}`} title={layer.locked ? 'Unlock' : 'Lock'}>
                        {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayerOrder(layer.id, 'up'); }} className="p-1 rounded hover:bg-gray-100 text-gray-400"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayerOrder(layer.id, 'down'); }} className="p-1 rounded hover:bg-gray-100 text-gray-400"><ChevronDown className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="p-1 rounded hover:bg-red-600/50 text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════ PROPERTIES ═══════════════════════════════════════ */}
          {sidePanel === 'properties' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Palette className="w-4 h-4 text-cyan-600" />
                Properties
              </div>

              {!selected ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto">
                    <MousePointer2 className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-400">Select a layer to edit its properties</p>
                  <p className="text-[11px] text-slate-600">Click on the canvas or layers panel</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Name</label>
                    <Input value={selected.name} onChange={(e) => patchLayer(selected.id, { name: e.target.value })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block">Quick Arrange</label>
                        <p className="text-[11px] text-gray-400">Align, center, nudge, and stack the selected layer.</p>
                      </div>
                      <button
                        onClick={() => centerLayerInCanvas(selected.id)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        Center layer
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'Left', action: 'left' },
                        { label: 'Center', action: 'center' },
                        { label: 'Right', action: 'right' },
                        { label: 'Top', action: 'top' },
                        { label: 'Middle', action: 'middle' },
                        { label: 'Bottom', action: 'bottom' },
                      ].map((action) => (
                        <button
                          key={action.action}
                          onClick={() => alignLayerToCanvas(selected.id, action.action as 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom')}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: 'Left', dx: -10, dy: 0 },
                        { label: 'Up', dx: 0, dy: -10 },
                        { label: 'Down', dx: 0, dy: 10 },
                        { label: 'Right', dx: 10, dy: 0 },
                      ].map((step) => (
                        <button
                          key={`${step.label}-${step.dx}-${step.dy}`}
                          onClick={() => nudgeLayer(selected.id, step.dx, step.dy)}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                        >
                          {step.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => moveLayerToExtreme(selected.id, 'back')}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        Send back
                      </button>
                      <button
                        onClick={() => moveLayerOrder(selected.id, 'down')}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        Backward
                      </button>
                      <button
                        onClick={() => moveLayerOrder(selected.id, 'up')}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        Forward
                      </button>
                      <button
                        onClick={() => moveLayerToExtreme(selected.id, 'front')}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        Bring front
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">X</label>
                      <Input type="number" value={selected.x} onChange={(e) => patchLayer(selected.id, { x: Number(e.target.value) })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Y</label>
                      <Input type="number" value={selected.y} onChange={(e) => patchLayer(selected.id, { y: Number(e.target.value) })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Width</label>
                      <Input type="number" value={selected.width} onChange={(e) => patchLayer(selected.id, { width: Number(e.target.value) })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Height</label>
                      <Input type="number" value={selected.height} onChange={(e) => patchLayer(selected.id, { height: Number(e.target.value) })} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Opacity: {Math.round(selected.opacity * 100)}%</label>
                    <input type="range" min={0} max={100} value={Math.round(selected.opacity * 100)} onChange={(e) => patchLayer(selected.id, { opacity: Number(e.target.value) / 100 })} className="w-full accent-cyan-500" />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Rotation: {selected.rotation}°</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={-180} max={180} value={selected.rotation} onChange={(e) => patchLayer(selected.id, { rotation: Number(e.target.value) })} className="flex-1 accent-cyan-500" />
                      <button onClick={() => patchLayer(selected.id, { rotation: 0 })} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:text-gray-900" title="Reset rotation">
                        <RotateCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Shape-specific */}
                  {selected.type === 'shape' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Fill</label>
                        <div className="flex gap-2 items-center flex-wrap">
                          <input type="color" value={selected.fill || '#0A66C2'} onChange={(e) => patchLayer(selected.id, { fill: e.target.value })} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                          {brandColors.map((c, i) => (
                            <button key={`sf-${i}`} onClick={() => patchLayer(selected.id, { fill: c })} className={`w-6 h-6 rounded border-2 ${selected.fill === c ? 'border-cyan-400' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Stroke</label>
                        <input type="color" value={selected.stroke || '#ffffff'} onChange={(e) => patchLayer(selected.id, { stroke: e.target.value })} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Stroke Width: {selected.strokeWidth || 0}px</label>
                        <input type="range" min={0} max={20} value={selected.strokeWidth || 0} onChange={(e) => patchLayer(selected.id, { strokeWidth: Number(e.target.value) })} className="w-full accent-cyan-500" />
                      </div>
                    </>
                  )}

                  {(selected.type === 'image' || selected.type === 'logo') && (
                    <div className="pt-2 border-t border-gray-200 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Image Fit</label>
                        <div className="grid grid-cols-3 gap-1">
                          {(['contain', 'cover', 'fill'] as const).map((fit) => (
                            <button
                              key={fit}
                              onClick={() => patchLayer(selected.id, { objectFit: fit })}
                              className={`p-2 rounded-lg text-xs capitalize transition-colors ${(selected.objectFit || 'contain') === fit
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                }`}
                            >
                              {fit}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => fitLayerToCanvas(selected.id, 'contain')}
                          variant="outline"
                          className="border-gray-300 text-gray-600 hover:bg-gray-100"
                          size="sm"
                        >
                          Fit in Canvas
                        </Button>
                        <Button
                          onClick={() => fitLayerToCanvas(selected.id, 'cover')}
                          variant="outline"
                          className="border-gray-300 text-gray-600 hover:bg-gray-100"
                          size="sm"
                        >
                          Fill Canvas
                        </Button>
                      </div>

                      <Button
                        onClick={() => removeBackground(selected.id)}
                        disabled={removingBg}
                        variant="outline"
                        className="w-full border-gray-300 text-gray-600 hover:bg-gray-100"
                        size="sm"
                      >
                        {removingBg ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing...</>
                        ) : (
                          <><Eraser className="w-4 h-4 mr-2" />Remove Background</>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Text-specific */}
                  {selected.type === 'text' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Text</label>
                        <Textarea value={selected.text || ''} onChange={(e) => patchLayer(selected.id, { text: e.target.value, name: e.target.value.slice(0, 20) || 'Text' })} rows={3} className="bg-gray-50 border-gray-300 text-gray-900 text-sm resize-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Font Size</label>
                          <Input type="number" value={selected.fontSize || 48} onChange={(e) => patchLayer(selected.id, { fontSize: Number(e.target.value) })} min={12} max={200} className="bg-gray-50 border-gray-300 text-gray-900 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Weight</label>
                          <select value={selected.fontWeight || 'bold'} onChange={(e) => patchLayer(selected.id, { fontWeight: e.target.value })} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                            <option value="normal">Regular</option>
                            <option value="bold">Bold</option>
                            <option value="900">Black</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Color</label>
                        <div className="flex gap-2 items-center flex-wrap">
                          <input type="color" value={selected.color || '#fff'} onChange={(e) => patchLayer(selected.id, { color: e.target.value })} className="w-8 h-8 rounded bg-transparent cursor-pointer" />
                          {['#ffffff', '#000000', ...brandColors].map((c, i) => (
                            <button key={`prop-${c}-${i}`} onClick={() => patchLayer(selected.id, { color: c })} className={`w-6 h-6 rounded border-2 ${selected.color === c ? 'border-cyan-400' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Font</label>
                        <select value={selected.fontFamily || FONT_OPTIONS[0]} onChange={(e) => patchLayer(selected.id, { fontFamily: e.target.value })} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                          {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Align</label>
                        <div className="flex gap-1">
                          {(['left', 'center', 'right'] as const).map((a) => (
                            <button key={a} onClick={() => patchLayer(selected.id, { textAlign: a })} className={`flex-1 p-2 rounded-lg ${selected.textAlign === a ? 'bg-cyan-600 text-white' : 'bg-gray-50 text-gray-500'}`}>
                              {a === 'left' ? <AlignLeft className="w-3 h-3 mx-auto" /> : a === 'center' ? <AlignCenter className="w-3 h-3 mx-auto" /> : <AlignRight className="w-3 h-3 mx-auto" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    <Button size="sm" variant="outline" className="flex-1 border-gray-300 text-gray-600 hover:bg-gray-100" onClick={() => duplicateLayer(selected.id)}>
                      <Copy className="w-3 h-3 mr-1" />Duplicate
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-800 text-red-400 hover:bg-red-900/50" onClick={() => deleteLayer(selected.id)}>
                      <Trash2 className="w-3 h-3 mr-1" />Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Canvas Viewport ─── */}
        <div ref={viewportRef} className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[#1e1e22]" style={{ backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
          <div
            ref={containerRef}
            className="relative bg-white shadow-lg ring-1 ring-black/20"
            style={{
              width: canvasW * zoom,
              height: canvasH * zoom,
              cursor: tool === 'select' ? (dragging ? 'grabbing' : 'default') : 'crosshair',
              borderRadius: '2px',
            }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onDoubleClick={onCanvasDoubleClick}
          >
            {/* Background */}
            <div
              className="absolute inset-0"
              style={bgGradient ? { background: `linear-gradient(135deg, ${bgGradientA}, ${bgGradientB})` } : { backgroundColor: bgColor }}
            />

            {/* Render layers */}
            {layers.map((layer) => {
              if (!layer.visible) return null;

              const style: React.CSSProperties = {
                position: 'absolute',
                left: layer.x * zoom,
                top: layer.y * zoom,
                width: layer.width * zoom,
                height: layer.height * zoom,
                opacity: layer.opacity,
                pointerEvents: layer.locked ? 'none' : 'auto',
                outline: selectedId === layer.id ? '2px solid #22d3ee' : 'none',
                outlineOffset: '0px',
              };

              const layerAny = layer as any;
              const rotateStyle = layer.rotation ? `rotate(${layer.rotation}deg)` : undefined;
              const filterStyle = layerAny._filterBrightness || layerAny._filterContrast || layerAny._filterSaturation || layerAny._filterBlur
                ? `brightness(${(layerAny._filterBrightness ?? 100) / 100}) contrast(${(layerAny._filterContrast ?? 100) / 100}) saturate(${(layerAny._filterSaturation ?? 100) / 100}) blur(${layerAny._filterBlur ?? 0}px)`
                : undefined;

              if (layer.type === 'image' || layer.type === 'logo') {
                return (
                  <div key={layer.id} style={{ ...style, transform: rotateStyle }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={layer.src}
                      alt={layer.name}
                      className="w-full h-full pointer-events-none select-none"
                      style={{ objectFit: layer.objectFit || 'contain', filter: filterStyle }}
                      draggable={false}
                    />
                  </div>
                );
              }

              if (layer.type === 'shape') {
                return (
                  <div key={layer.id} style={{ ...style, transform: rotateStyle }}>
                    {layer.shapeType === 'rect' && (
                      <div className="w-full h-full" style={{ backgroundColor: layer.fill || '#0A66C2', border: layer.strokeWidth ? `${layer.strokeWidth * zoom}px solid ${layer.stroke || '#fff'}` : 'none', borderRadius: 0 }} />
                    )}
                    {layer.shapeType === 'circle' && (
                      <div className="w-full h-full rounded-full" style={{ backgroundColor: layer.fill || '#0A66C2', border: layer.strokeWidth ? `${layer.strokeWidth * zoom}px solid ${layer.stroke || '#fff'}` : 'none' }} />
                    )}
                    {layer.shapeType === 'line' && (
                      <div className="w-full" style={{ height: `${Math.max(2, (layer.strokeWidth || 2)) * zoom}px`, backgroundColor: layer.fill || layer.stroke || '#fff', position: 'absolute', top: '50%', transform: 'translateY(-50%)' }} />
                    )}
                  </div>
                );
              }

              if (layer.type === 'text') {
                const textShadowStyle = layerAny._textShadow ? '2px 2px 8px rgba(0,0,0,0.5)' : undefined;
                const textStrokeStyle = layerAny._textOutline ? `-1px -1px 0 ${layer.color === '#000000' ? '#fff' : '#000'}, 1px -1px 0 ${layer.color === '#000000' ? '#fff' : '#000'}, -1px 1px 0 ${layer.color === '#000000' ? '#fff' : '#000'}, 1px 1px 0 ${layer.color === '#000000' ? '#fff' : '#000'}` : undefined;
                const combinedTextShadow = [textStrokeStyle, textShadowStyle].filter(Boolean).join(', ') || undefined;
                const textJustify = layer.textAlign === 'left' ? 'flex-start' : layer.textAlign === 'right' ? 'flex-end' : 'center';
                const sharedTextStyle: React.CSSProperties = {
                  fontFamily: layer.fontFamily,
                  fontSize: (layer.fontSize || 48) * zoom,
                  fontWeight: layer.fontWeight || 'bold',
                  color: layer.color || '#fff',
                  textAlign: layer.textAlign || 'center',
                  lineHeight: 1.25,
                  padding: `${4 * zoom}px`,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  textShadow: combinedTextShadow,
                  ...(layerAny._textBgHighlight ? { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: `${4 * zoom}px` } : {}),
                };
                return (
                  <div
                    key={layer.id}
                    style={{
                      ...style,
                      transform: rotateStyle,
                      userSelect: inlineEditingId === layer.id ? 'text' : 'none',
                    }}
                  >
                    {inlineEditingId === layer.id ? (
                      <textarea
                        value={inlineTextDraft}
                        onChange={(e) => setInlineTextDraft(e.target.value)}
                        onBlur={commitInlineTextEdit}
                        onKeyDown={handleInlineTextKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        autoFocus
                        spellCheck={false}
                        className="h-full w-full resize-none border-2 border-cyan-300 bg-white/95 shadow-lg outline-none"
                        style={sharedTextStyle}
                      />
                    ) : (
                      <div style={{ ...sharedTextStyle, display: 'flex', alignItems: 'center', justifyContent: textJustify }}>{layer.text}</div>
                    )}
                  </div>
                );
              }

              return null;
            })}

            {/* Selection handles */}
            {selected && !selected.locked && (
              <>
                {([
                  { key: 'tl' as Handle, x: selected.x, y: selected.y, cursor: 'nwse-resize' },
                  { key: 'tr' as Handle, x: selected.x + selected.width, y: selected.y, cursor: 'nesw-resize' },
                  { key: 'bl' as Handle, x: selected.x, y: selected.y + selected.height, cursor: 'nesw-resize' },
                  { key: 'br' as Handle, x: selected.x + selected.width, y: selected.y + selected.height, cursor: 'nwse-resize' },
                  { key: 'mt' as Handle, x: selected.x + selected.width / 2, y: selected.y, cursor: 'ns-resize' },
                  { key: 'mb' as Handle, x: selected.x + selected.width / 2, y: selected.y + selected.height, cursor: 'ns-resize' },
                  { key: 'ml' as Handle, x: selected.x, y: selected.y + selected.height / 2, cursor: 'ew-resize' },
                  { key: 'mr' as Handle, x: selected.x + selected.width, y: selected.y + selected.height / 2, cursor: 'ew-resize' },
                ] as const).map((h) => (
                  <div
                    key={h.key}
                    className="absolute w-3 h-3 bg-white border-2 border-cyan-300 rounded-sm shadow-md"
                    style={{ left: h.x * zoom - 6, top: h.y * zoom - 6, cursor: h.cursor, zIndex: 999 }}
                  />
                ))}
              </>
            )}

            {/* Crop overlay */}
            {cropActive && cropRect.w > 0 && (
              <>
                {/* Darkened area outside crop */}
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 997 }}>
                  <div className="absolute" style={{ left: 0, top: 0, width: cropRect.x * zoom, height: canvasH * zoom, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                  <div className="absolute" style={{ left: (cropRect.x + cropRect.w) * zoom, top: 0, right: 0, height: canvasH * zoom, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                  <div className="absolute" style={{ left: cropRect.x * zoom, top: 0, width: cropRect.w * zoom, height: cropRect.y * zoom, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                  <div className="absolute" style={{ left: cropRect.x * zoom, top: (cropRect.y + cropRect.h) * zoom, width: cropRect.w * zoom, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                </div>
                {/* Crop border */}
                <div className="absolute border-2 border-dashed border-white pointer-events-none" style={{ left: cropRect.x * zoom, top: cropRect.y * zoom, width: cropRect.w * zoom, height: cropRect.h * zoom, zIndex: 998 }} />
              </>
            )}

            {/* Snap alignment guides */}
            {snapGuides.lines.map((line, idx) => {
              const isVertical = line.x1 === line.x2;
              return (
                <div
                  key={`guide-${idx}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: line.x1 * zoom,
                    top: line.y1 * zoom,
                    width: isVertical ? 1 : (line.x2 - line.x1) * zoom,
                    height: isVertical ? (line.y2 - line.y1) * zoom : 1,
                    backgroundColor: '#f43f5e',
                    opacity: 0.7,
                    zIndex: 998,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* -- Bottom Status Bar -- */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-t border-gray-200 rounded-b-2xl">
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>{layers.length} layer{layers.length !== 1 ? 's' : ''}</span>
          {selected && (
            <>
              <span className="w-px h-3 bg-gray-200" />
              <span className="text-gray-500">{selected.name}</span>
              <span className="text-slate-600">{selected.width} × {selected.height}</span>
              {selected.type === 'text' && <span>Double-click to edit</span>}
              <span>Arrow keys move 1px</span>
              <span>Shift + arrows move 10px</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>{canvasW} × {canvasH}</span>
          <span className="w-px h-3 bg-gray-200" />
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

