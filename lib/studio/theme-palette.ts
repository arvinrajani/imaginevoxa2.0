export type StudioPalette = {
  bgStart: string;
  bgEnd: string;
  accent: string;
  support: string;
  text: string;
  footer: string;
  surface: string;
  headerPanel: string;
  muted: string;
};

type Rgb = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(color: string | null | undefined): string | null {
  if (typeof color !== 'string') return null;
  const raw = color.trim();
  if (!raw) return null;

  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3,8}$/.test(hex)) return null;

  if (hex.length === 3 || hex.length === 4) {
    const expanded = hex
      .slice(0, 3)
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }

  return `#${hex.slice(0, 6).toLowerCase()}`;
}

function hexToRgb(color: string): Rgb | null {
  const normalized = normalizeHex(color);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(a: string, b: string, ratio: number) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return a;

  const t = clamp(ratio, 0, 1);
  return rgbToHex({
    r: rgbA.r + (rgbB.r - rgbA.r) * t,
    g: rgbA.g + (rgbB.g - rgbA.g) * t,
    b: rgbA.b + (rgbB.b - rgbA.b) * t,
  });
}

function relativeLuminance(color: string) {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorMetrics(color: string) {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return { luminance: 0, saturation: 0, hue: null as number | null };
  }

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue: number | null = null;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round((hue * 60 + 360) % 360);
  }

  return {
    luminance: relativeLuminance(color),
    saturation: max === 0 ? 0 : delta / max,
    hue,
  };
}

function areColorsClose(a: string, b: string) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return false;

  const distance = Math.sqrt(
    (rgbA.r - rgbB.r) ** 2 +
      (rgbA.g - rgbB.g) ** 2 +
      (rgbA.b - rgbB.b) ** 2
  );

  return distance < 52;
}

export function deriveStudioPalette(colors?: string[]): StudioPalette {
  const normalized = Array.from(
    new Set(
      (Array.isArray(colors) ? colors : [])
        .map((color) => normalizeHex(color))
        .filter((color): color is string => Boolean(color))
    )
  );

  const metrics = normalized.map((color) => ({
    color,
    ...colorMetrics(color),
  }));

  const darkColors = metrics.filter((entry) => entry.luminance < 0.22).map((entry) => entry.color);
  const chromaticColors = metrics
    .filter(
      (entry) =>
        entry.saturation > 0.18 &&
        entry.luminance > 0.08 &&
        entry.luminance < 0.9
    )
    .map((entry) => entry.color);
  const warmColors = metrics
    .filter((entry) => entry.hue !== null && (entry.hue < 55 || entry.hue > 320))
    .map((entry) => entry.color);
  const coolColors = metrics
    .filter((entry) => entry.hue !== null && entry.hue >= 180 && entry.hue <= 280)
    .map((entry) => entry.color);
  const greenColors = metrics
    .filter((entry) => entry.hue !== null && entry.hue >= 90 && entry.hue <= 170)
    .map((entry) => entry.color);

  const baseSeed = normalized[0] || '#0b2a56';
  const bgStart =
    darkColors[0] ||
    (coolColors[0] ? mixHex(coolColors[0], '#08172e', 0.72) : mixHex(baseSeed, '#08172e', 0.68));
  const companionDark = darkColors.find((color) => !areColorsClose(color, bgStart));
  const companionCool = coolColors.find((color) => !areColorsClose(color, bgStart));
  const bgEnd =
    companionDark
      ? mixHex(companionDark, bgStart, 0.42)
      : companionCool
        ? mixHex(companionCool, bgStart, 0.58)
        : mixHex(
            bgStart,
            relativeLuminance(bgStart) < 0.18 ? '#1a3f76' : '#08172e',
            0.24
          );

  const accentCandidates = chromaticColors.filter(
    (color) => !areColorsClose(color, bgStart) && !areColorsClose(color, bgEnd)
  );

  const rawAccent =
    warmColors.find((color) => accentCandidates.includes(color)) ||
    accentCandidates.find((color) => !greenColors.includes(color)) ||
    accentCandidates[0] ||
    warmColors[0] ||
    coolColors[0] ||
    '#ffd34d';

  const accentLuminance = relativeLuminance(rawAccent);
  const accent =
    accentLuminance < 0.26
      ? mixHex(rawAccent, '#ffd34d', 0.38)
      : accentLuminance > 0.82
        ? mixHex(rawAccent, '#f59e0b', 0.45)
        : rawAccent;

  const support =
    greenColors.find((color) => !areColorsClose(color, accent) && !areColorsClose(color, bgStart)) ||
    accentCandidates.find((color) => !areColorsClose(color, accent)) ||
    '#37d45b';

  return {
    bgStart,
    bgEnd,
    accent,
    support,
    text: relativeLuminance(bgStart) < 0.42 ? '#ffffff' : '#0f172a',
    footer: mixHex(bgEnd, bgStart, 0.35),
    surface: mixHex(bgStart, '#ffffff', 0.12),
    headerPanel: mixHex(bgEnd, '#ffffff', 0.16),
    muted: mixHex('#ffffff', bgStart, 0.38),
  };
}
