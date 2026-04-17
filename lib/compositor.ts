import sharp, { OverlayOptions } from 'sharp';
import fs from 'fs';
import path from 'path';
import { fetchAndResizeBuffer, fetchImageBuffer } from './fetch-image-buffer';
import { generateImageBase } from './ai/openai';

export interface BannerInput {
  headline: string;
  tagline: string;
  bullets: string[];
  website: string;
  email: string;
  companyLogoUrl: string | null;
  brandLogoUrl: string | null;
  productImageUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  industryIcons: string[];
  mode: 'standard' | 'ai-guided';
  backgroundStorageUrl: string | null;
  aiGuidedPrompt: string;
  brandName: string;
  companyName: string;
  partnerTagline: string;
}

const CANVAS_W = 1536;
const CANVAS_H = 1024;
const FONT_FAMILY = 'Montserrat, Arial, sans-serif';

const FONT_EXTRABOLD_B64 = (() => {
  try {
    return fs
      .readFileSync(path.join(process.cwd(), 'public/fonts/Montserrat-ExtraBold.ttf'))
      .toString('base64');
  } catch {
    return null;
  }
})();

const FONT_BOLD_B64 = (() => {
  try {
    return fs
      .readFileSync(path.join(process.cwd(), 'public/fonts/Montserrat-Bold.ttf'))
      .toString('base64');
  } catch {
    return null;
  }
})();

function getFontDefs() {
  const defs: string[] = [];
  if (FONT_EXTRABOLD_B64) {
    defs.push(`@font-face {
      font-family: 'Montserrat';
      src: url('data:font/truetype;base64,${FONT_EXTRABOLD_B64}');
      font-weight: 900;
    }`);
  }
  if (FONT_BOLD_B64) {
    defs.push(`@font-face {
      font-family: 'Montserrat';
      src: url('data:font/truetype;base64,${FONT_BOLD_B64}');
      font-weight: 700;
    }`);
  }
  return defs.length ? `<defs><style>${defs.join('\n')}</style></defs>` : '';
}

function svgBuf(svg: string) {
  return Buffer.from(svg);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

function wrapLines(text: string, maxChars: number) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitTextToWidth(
  text: string,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
  widthFactor = 0.58
) {
  const normalized = (text || '').trim();
  if (!normalized) return preferredSize;
  const estimated = Math.floor(maxWidth / Math.max(1, normalized.length * widthFactor));
  return Math.max(minSize, Math.min(preferredSize, estimated));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const match = normalized.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbaFromHex(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(8,24,56,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function darkenColor(hex: string, factor = 0.7) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'rgba(10,30,72,0.96)';
  return `rgba(${Math.round(rgb.r * factor)},${Math.round(rgb.g * factor)},${Math.round(rgb.b * factor)},0.96)`;
}

function footerColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0b5b92';
  const r = Math.round(rgb.r * 0.74);
  const g = Math.round(rgb.g * 0.74);
  const b = Math.round(rgb.b * 0.74);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function splitHeadlineLockup(headline: string, tagline: string) {
  const cleanHeadline = (headline || 'Product Feature').trim();
  const cleanTagline = (tagline || '').trim();
  if (cleanTagline) {
    return {
      line1: truncate(cleanHeadline, 30),
      line2: truncate(cleanTagline, 18),
    };
  }

  const words = cleanHeadline.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return { line1: truncate(cleanHeadline, 30), line2: '' };
  }

  const pivot = Math.max(2, Math.min(words.length - 2, Math.round(words.length * 0.55)));
  const line1 = words.slice(0, pivot).join(' ');
  const line2 = words.slice(pivot).join(' ');
  return {
    line1: truncate(line1, 26),
    line2: truncate(line2, 18),
  };
}

async function removeWhiteBackground(buffer: Buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
    const width = info.width;
    const height = info.height;
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    const isNearWhite = (pixelIndex: number) =>
      pixels[pixelIndex] > 232 &&
      pixels[pixelIndex + 1] > 232 &&
      pixels[pixelIndex + 2] > 232;

    for (let x = 0; x < width; x += 1) {
      for (const y of [0, height - 1]) {
        const idx = y * width + x;
        if (!visited[idx] && isNearWhite(idx * 4)) {
          visited[idx] = 1;
          queue.push(idx);
        }
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (const x of [0, width - 1]) {
        const idx = y * width + x;
        if (!visited[idx] && isNearWhite(idx * 4)) {
          visited[idx] = 1;
          queue.push(idx);
        }
      }
    }

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const px = idx % width;
      const py = Math.floor(idx / width);
      const neighbors = [
        py > 0 ? idx - width : -1,
        py < height - 1 ? idx + width : -1,
        px > 0 ? idx - 1 : -1,
        px < width - 1 ? idx + 1 : -1,
      ];

      for (const neighbor of neighbors) {
        if (neighbor >= 0 && !visited[neighbor] && isNearWhite(neighbor * 4)) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    for (let idx = 0; idx < width * height; idx += 1) {
      if (!visited[idx]) continue;
      const i = idx * 4;
      const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      if (brightness > 245) {
        pixels[i + 3] = 0;
      } else if (brightness > 235) {
        pixels[i + 3] = Math.round(pixels[i + 3] * 0.08);
      } else {
        pixels[i + 3] = Math.round(pixels[i + 3] * 0.22);
      }
    }

    return sharp(Buffer.from(pixels), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function cropToVisibleBounds(buffer: Buffer, padding = 0) {
  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = pixels[(y * info.width + x) * 4 + 3];
        if (alpha < 16) continue;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }

    if (right < left || bottom < top) return buffer;

    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(info.width - 1, right + padding);
    bottom = Math.min(info.height - 1, bottom + padding);

    return sharp(buffer)
      .extract({
        left,
        top,
        width: right - left + 1,
        height: bottom - top + 1,
      })
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function buildFallbackBackground(primaryColor: string, secondaryColor: string) {
  const svg = `
    <svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${darkenColor(primaryColor, 0.46)}"/>
          <stop offset="48%" stop-color="${darkenColor(primaryColor, 0.68)}"/>
          <stop offset="100%" stop-color="rgba(255,136,48,0.32)"/>
        </linearGradient>
        <radialGradient id="heroGlow" cx="0.72" cy="0.38" r="0.52">
          <stop offset="0%" stop-color="${rgbaFromHex(secondaryColor, 0.28)}"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#heroGlow)"/>
      <g opacity="0.18" stroke="rgba(122,188,255,0.55)" stroke-width="2">
        <line x1="0" y1="400" x2="1536" y2="400"/>
        <line x1="0" y1="470" x2="1536" y2="470"/>
        <line x1="0" y1="810" x2="1536" y2="810"/>
      </g>
      <g opacity="0.15" stroke="rgba(255,255,255,0.3)" stroke-width="1">
        <path d="M80 640 C320 520 560 520 800 640"/>
        <path d="M960 220 C1140 180 1310 190 1510 260"/>
        <path d="M920 610 C1100 520 1280 520 1480 600"/>
      </g>
      <ellipse cx="385" cy="760" rx="320" ry="92" fill="url(#ground)"/>
      <rect x="0" y="860" width="1536" height="164" fill="rgba(7,22,54,0.28)"/>
    </svg>
  `;

  return sharp(svgBuf(svg)).png().toBuffer();
}

async function buildBackground(params: BannerInput) {
  if (params.mode === 'standard' && params.backgroundStorageUrl) {
    const background = await fetchImageBuffer(params.backgroundStorageUrl);
    if (background) {
      return sharp(background).resize(CANVAS_W, CANVAS_H, { fit: 'cover' }).png().toBuffer();
    }
  }

  if (params.mode === 'ai-guided' && params.aiGuidedPrompt.trim()) {
    try {
      const prompt = [
        'Create a premium industrial electrical infrastructure banner background.',
        params.aiGuidedPrompt.trim(),
        'Landscape 1536x1024 composition.',
        'Reserve the top 14% for a clean header band.',
        'Keep the right-middle area calm and readable for a bullet panel.',
        'Keep the bottom 18% suitable for icons and footer.',
        'Use cinematic blue power-grid lighting, polished reflections, and a premium LinkedIn poster feel.',
        'No text, no logos, no labels, no letters, no numbers, no watermark.',
      ].join(' ');

      const response = await generateImageBase({
        model: 'gpt-image-1.5',
        prompt,
        size: '1536x1024',
        quality: 'high',
        outputFormat: 'png',
      });

      return sharp(Buffer.from(response.base64, 'base64'))
        .resize(CANVAS_W, CANVAS_H, { fit: 'cover' })
        .png()
        .toBuffer();
    } catch (error) {
      console.warn(
        '[generateBanner] AI background generation failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return buildFallbackBackground(params.primaryColor, params.secondaryColor);
}

function normalizeIndustryKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function industryIconSvg(label: string, size: number) {
  const key = normalizeIndustryKey(label);
  const s = size;
  const stroke = 'white';

  switch (key) {
    case 'datacenters':
    case 'datacenter':
      return `<rect x="${s * 0.2}" y="${s * 0.08}" width="${s * 0.55}" height="${s * 0.82}" rx="${s * 0.06}" fill="white"/>
        <rect x="${s * 0.29}" y="${s * 0.2}" width="${s * 0.36}" height="${s * 0.08}" fill="#0b1634"/>
        <rect x="${s * 0.29}" y="${s * 0.42}" width="${s * 0.36}" height="${s * 0.08}" fill="#0b1634"/>
        <rect x="${s * 0.29}" y="${s * 0.64}" width="${s * 0.36}" height="${s * 0.08}" fill="#0b1634"/>`;
    case 'manufacturing':
      return `<path d="M${s * 0.1} ${s * 0.8}H${s * 0.9}V${s * 0.34}L${s * 0.68} ${s * 0.48}V${s * 0.26}L${s * 0.46} ${s * 0.4}V${s * 0.18}L${s * 0.1} ${s * 0.42}Z" fill="white"/>
        <rect x="${s * 0.2}" y="${s * 0.52}" width="${s * 0.1}" height="${s * 0.12}" fill="#0b1634"/>
        <rect x="${s * 0.37}" y="${s * 0.52}" width="${s * 0.1}" height="${s * 0.12}" fill="#0b1634"/>`;
    case 'hospitals':
    case 'hospital':
      return `<rect x="${s * 0.38}" y="${s * 0.1}" width="${s * 0.24}" height="${s * 0.8}" fill="white"/>
        <rect x="${s * 0.1}" y="${s * 0.38}" width="${s * 0.8}" height="${s * 0.24}" fill="white"/>`;
    case 'buildings':
    case 'building':
      return `<rect x="${s * 0.18}" y="${s * 0.16}" width="${s * 0.24}" height="${s * 0.72}" fill="white"/>
        <rect x="${s * 0.48}" y="${s * 0.06}" width="${s * 0.3}" height="${s * 0.82}" fill="white"/>
        <rect x="${s * 0.26}" y="${s * 0.28}" width="${s * 0.08}" height="${s * 0.08}" fill="#0b1634"/>
        <rect x="${s * 0.56}" y="${s * 0.2}" width="${s * 0.1}" height="${s * 0.08}" fill="#0b1634"/>
        <rect x="${s * 0.56}" y="${s * 0.38}" width="${s * 0.1}" height="${s * 0.08}" fill="#0b1634"/>`;
    case 'infrastructure':
      return `<circle cx="${s * 0.24}" cy="${s * 0.3}" r="${s * 0.1}" fill="white"/>
        <circle cx="${s * 0.74}" cy="${s * 0.3}" r="${s * 0.1}" fill="white"/>
        <circle cx="${s * 0.49}" cy="${s * 0.72}" r="${s * 0.1}" fill="white"/>
        <line x1="${s * 0.24}" y1="${s * 0.3}" x2="${s * 0.74}" y2="${s * 0.3}" stroke="${stroke}" stroke-width="${s * 0.08}"/>
        <line x1="${s * 0.24}" y1="${s * 0.3}" x2="${s * 0.49}" y2="${s * 0.72}" stroke="${stroke}" stroke-width="${s * 0.08}"/>
        <line x1="${s * 0.74}" y1="${s * 0.3}" x2="${s * 0.49}" y2="${s * 0.72}" stroke="${stroke}" stroke-width="${s * 0.08}"/>`;
    case 'solar':
      return `<rect x="${s * 0.2}" y="${s * 0.48}" width="${s * 0.46}" height="${s * 0.24}" rx="${s * 0.03}" fill="white"/>
        <line x1="${s * 0.2}" y1="${s * 0.6}" x2="${s * 0.66}" y2="${s * 0.6}" stroke="#0b1634" stroke-width="${s * 0.04}"/>
        <line x1="${s * 0.35}" y1="${s * 0.48}" x2="${s * 0.35}" y2="${s * 0.72}" stroke="#0b1634" stroke-width="${s * 0.04}"/>
        <circle cx="${s * 0.76}" cy="${s * 0.26}" r="${s * 0.12}" fill="white"/>`;
    case 'mining':
    case 'miningmetallurgy':
      return `<path d="M${s * 0.18} ${s * 0.78}L${s * 0.46} ${s * 0.28}L${s * 0.62} ${s * 0.36}L${s * 0.34} ${s * 0.86}Z" fill="white"/>
        <path d="M${s * 0.56} ${s * 0.2}L${s * 0.82} ${s * 0.46}L${s * 0.72} ${s * 0.58}L${s * 0.46} ${s * 0.32}Z" fill="white"/>`;
    default:
      return `<circle cx="${s * 0.5}" cy="${s * 0.5}" r="${s * 0.32}" fill="white"/>`;
  }
}

async function placeLogo(
  overlays: OverlayOptions[],
  logoUrl: string | null,
  box: { x: number; y: number; w: number; h: number },
  glowColor: { r: number; g: number; b: number }
) {
  if (!logoUrl) return;

  const raw = await fetchAndResizeBuffer(logoUrl, Math.round(box.w * 0.92), Math.round(box.h * 0.86), 'inside');
  if (!raw) return;

  const cleaned = await cropToVisibleBounds(await removeWhiteBackground(raw), 4);
  const polished = await sharp(cleaned)
    .ensureAlpha()
    .sharpen(1.45)
    .modulate({ brightness: 1.08, saturation: 1.08 })
    .png()
    .toBuffer();

  const meta = await sharp(polished).metadata();
  const imgW = meta.width || Math.round(box.w * 0.8);
  const imgH = meta.height || Math.round(box.h * 0.8);
  const left = Math.round(box.x + (box.w - imgW) / 2);
  const top = Math.round(box.y + (box.h - imgH) / 2);

  const shadow = await sharp(polished)
    .ensureAlpha()
    .tint({ r: 6, g: 16, b: 40 })
    .blur(10)
    .png()
    .toBuffer();
  const glow = await sharp(polished)
    .ensureAlpha()
    .tint(glowColor)
    .blur(7)
    .png()
    .toBuffer();

  overlays.push({ input: shadow, left: left + 5, top: top + 5, blend: 'multiply' });
  overlays.push({ input: glow, left: left - 2, top: top - 2, blend: 'screen' });
  overlays.push({ input: polished, left, top });
}

async function placeProduct(
  overlays: OverlayOptions[],
  productUrl: string | null,
  headerH: number,
  iconRowY: number
) {
  if (!productUrl) return;

  const maxW = Math.round(CANVAS_W * 0.33);
  const maxH = Math.round(CANVAS_H * 0.44);
  const raw = await fetchAndResizeBuffer(productUrl, maxW, maxH, 'inside');
  if (!raw) return;

  const cleaned = await cropToVisibleBounds(await removeWhiteBackground(raw), 10);
  const polished = await sharp(cleaned)
    .ensureAlpha()
    .sharpen(1.35)
    .modulate({ brightness: 1.06, saturation: 1.04 })
    .png()
    .toBuffer();

  const meta = await sharp(polished).metadata();
  const width = meta.width || maxW;
  const height = meta.height || maxH;
  const left = Math.round(CANVAS_W * 0.08);
  const top = Math.max(headerH + 80, iconRowY - height - 56);

  const shadow = await sharp(polished)
    .ensureAlpha()
    .tint({ r: 10, g: 18, b: 42 })
    .blur(16)
    .png()
    .toBuffer();
  const glow = await sharp(polished)
    .ensureAlpha()
    .tint({ r: 180, g: 220, b: 255 })
    .blur(10)
    .png()
    .toBuffer();

  const stageSvg = svgBuf(`
    <svg width="${Math.round(width * 1.25)}" height="${Math.round(height * 0.24)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="stage" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(120,196,255,0.32)"/>
          <stop offset="50%" stop-color="rgba(255,255,255,0.24)"/>
          <stop offset="100%" stop-color="rgba(120,196,255,0.18)"/>
        </linearGradient>
      </defs>
      <ellipse cx="${Math.round(width * 0.62)}" cy="${Math.round(height * 0.11)}" rx="${Math.round(width * 0.48)}" ry="${Math.round(height * 0.08)}" fill="url(#stage)"/>
    </svg>
  `);

  overlays.push({
    input: stageSvg,
    left: Math.round(left - width * 0.12),
    top: top + height - Math.round(height * 0.04),
  });
  overlays.push({ input: shadow, left: left + 12, top: top + 10, blend: 'multiply' });
  overlays.push({ input: glow, left: left - 4, top: top - 4, blend: 'screen' });
  overlays.push({ input: polished, left, top });
}

export async function generateBanner(params: BannerInput) {
  const primaryColor = params.primaryColor || '#0a3273';
  const secondaryColor = params.secondaryColor || '#f5c84c';

  let background = await buildBackground(params);
  background = await sharp(background)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover' })
    .modulate({ brightness: 0.96, saturation: 1.08 })
    .png()
    .toBuffer();

  const overlays: OverlayOptions[] = [];
  const headerH = Math.round(CANVAS_H * 0.14);
  const iconRowH = Math.round(CANVAS_H * 0.11);
  const footerH = Math.round(CANVAS_H * 0.075);
  const iconRowY = CANVAS_H - footerH - iconRowH;
  const footerY = CANVAS_H - footerH;

  const leftLogoBox = { x: 28, y: 22, w: 210, h: 70 };
  const rightLogoBox = { x: CANVAS_W - 28 - 170, y: 22, w: 170, h: 70 };
  const titlePlateX = leftLogoBox.x + leftLogoBox.w + 54;
  const titlePlateW = rightLogoBox.x - titlePlateX - 54;
  const titlePlateY = Math.round(headerH * 0.16);
  const titlePlateH = Math.round(headerH * 0.46);
  const titleCenterX = Math.round(titlePlateX + titlePlateW / 2);

  const { line1, line2 } = splitHeadlineLockup(params.headline, params.tagline);
  const line1Size = fitTextToWidth(
    line1,
    Math.max(180, titlePlateW - 56),
    Math.round(headerH * 0.13),
    Math.round(headerH * 0.085),
    0.56
  );
  const line2Size = line2
    ? fitTextToWidth(
        line2,
        Math.max(160, titlePlateW - 86),
        Math.round(headerH * 0.068),
        Math.round(headerH * 0.05),
        0.52
      )
    : 0;
  const line1Y = Math.round(titlePlateY + titlePlateH * (line2 ? 0.36 : 0.54));
  const line2Y = Math.round(titlePlateY + titlePlateH * 0.72);

  const headerSvg = svgBuf(`
    <svg width="${CANVAS_W}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
      ${getFontDefs()}
      <defs>
        <linearGradient id="headerBg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${darkenColor(primaryColor, 0.54)}"/>
          <stop offset="50%" stop-color="${darkenColor(primaryColor, 0.72)}"/>
          <stop offset="100%" stop-color="${darkenColor(primaryColor, 0.54)}"/>
        </linearGradient>
        <clipPath id="titleClip">
          <rect x="${titlePlateX + 14}" y="${titlePlateY + 8}" width="${Math.max(120, titlePlateW - 28)}" height="${Math.max(36, titlePlateH - 16)}" rx="${Math.round(headerH * 0.04)}"/>
        </clipPath>
      </defs>
      <rect width="${CANVAS_W}" height="${headerH}" fill="url(#headerBg)"/>
      <rect width="${CANVAS_W}" height="${Math.max(4, Math.round(headerH * 0.08))}" fill="rgba(255,255,255,0.08)"/>
      <line x1="0" y1="${headerH - 2}" x2="${CANVAS_W}" y2="${headerH - 2}" stroke="${primaryColor}" stroke-width="4"/>
      <line x1="0" y1="${headerH - 8}" x2="${CANVAS_W}" y2="${headerH - 8}" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
      <ellipse cx="${leftLogoBox.x + Math.round(leftLogoBox.w / 2)}" cy="${leftLogoBox.y + Math.round(leftLogoBox.h / 2)}" rx="${Math.round(leftLogoBox.w * 0.38)}" ry="${Math.round(leftLogoBox.h * 0.42)}" fill="rgba(120,196,255,0.12)"/>
      <ellipse cx="${rightLogoBox.x + Math.round(rightLogoBox.w / 2)}" cy="${rightLogoBox.y + Math.round(rightLogoBox.h / 2)}" rx="${Math.round(rightLogoBox.w * 0.38)}" ry="${Math.round(rightLogoBox.h * 0.42)}" fill="rgba(120,196,255,0.12)"/>
      <rect x="${titlePlateX}" y="${titlePlateY}" width="${titlePlateW}" height="${titlePlateH}" rx="${Math.round(headerH * 0.08)}"
        fill="rgba(8,28,72,0.35)" stroke="rgba(255,255,255,0.10)" stroke-width="1.5"/>
      <rect x="${titlePlateX + 16}" y="${titlePlateY + 10}" width="${Math.max(120, titlePlateW - 32)}" height="${Math.round(titlePlateH * 0.2)}" rx="${Math.round(headerH * 0.04)}"
        fill="rgba(255,255,255,0.10)"/>
      <polygon points="${titlePlateX - 18},${titlePlateY + 8} ${titlePlateX - 6},${titlePlateY + 8} ${titlePlateX - 28},${titlePlateY + titlePlateH - 8} ${titlePlateX - 40},${titlePlateY + titlePlateH - 8}" fill="rgba(126,211,255,0.4)"/>
      <polygon points="${titlePlateX + titlePlateW + 6},${titlePlateY + 8} ${titlePlateX + titlePlateW + 18},${titlePlateY + 8} ${titlePlateX + titlePlateW + 40},${titlePlateY + titlePlateH - 8} ${titlePlateX + titlePlateW + 28},${titlePlateY + titlePlateH - 8}" fill="rgba(126,211,255,0.4)"/>
      <g clip-path="url(#titleClip)">
        <text x="${titleCenterX}" y="${line1Y}" text-anchor="middle"
          font-family="${FONT_FAMILY}" font-weight="800" font-size="${line1Size}"
          fill="white" dominant-baseline="central"
          stroke="rgba(4,10,24,0.48)" stroke-width="2" paint-order="stroke fill">${escapeXml(line1)}</text>
        ${line2 ? `<text x="${titleCenterX}" y="${line2Y}" text-anchor="middle"
          font-family="${FONT_FAMILY}" font-weight="700" font-size="${line2Size}"
          fill="${secondaryColor}" dominant-baseline="central"
          stroke="rgba(4,10,24,0.52)" stroke-width="1.8" paint-order="stroke fill">${escapeXml(line2)}</text>` : ''}
      </g>
    </svg>
  `);
  overlays.push({ input: headerSvg, left: 0, top: 0 });

  await placeLogo(overlays, params.companyLogoUrl, leftLogoBox, { r: 170, g: 225, b: 255 });
  await placeLogo(overlays, params.brandLogoUrl, rightLogoBox, { r: 170, g: 225, b: 255 });
  await placeProduct(overlays, params.productImageUrl, headerH, iconRowY);

  const bulletTexts = (params.bullets || []).filter(Boolean).slice(0, 5);
  const bulletBoxX = Math.round(CANVAS_W * 0.56);
  const bulletBoxY = Math.round(headerH + CANVAS_H * 0.17);
  const bulletBoxW = Math.round(CANVAS_W * 0.37);
  const bulletFontSize = Math.round(CANVAS_H * 0.0215);
  const bulletLineHeight = Math.round(bulletFontSize * 1.22);
  const checkSize = Math.round(CANVAS_H * 0.035);
  const rowH = Math.round(CANVAS_H * 0.082);
  const rowGap = Math.round(CANVAS_H * 0.014);
  const panelPadX = 22;
  const panelPadY = 20;
  const rowW = bulletBoxW - panelPadX * 2;
  const bulletTextX = panelPadX + checkSize + 30;
  const bulletTextW = Math.max(140, rowW - (bulletTextX - panelPadX) - 22);
  const charsPerLine = Math.max(14, Math.floor(bulletTextW / Math.max(8, bulletFontSize * 0.54)));

  const bulletRows = bulletTexts
    .map((text, index) => {
      const rowY = panelPadY + index * (rowH + rowGap);
      const lines = wrapLines(text, charsPerLine);
      const visibleLines = lines.slice(0, 2);
      if (lines.length > 2 && visibleLines[1]) {
        visibleLines[1] = truncate(visibleLines[1], Math.max(10, charsPerLine - 1));
      }
      const centerY = rowY + Math.round(rowH / 2);
      const firstLineY =
        visibleLines.length === 1
          ? centerY
          : centerY - Math.round(bulletLineHeight / 2) + 4;
      const sF = checkSize / 24;

      const lineEls = visibleLines
        .map(
          (line, lineIndex) => `
          <text x="${bulletTextX}" y="${firstLineY + lineIndex * bulletLineHeight}" dominant-baseline="central"
            fill="white" font-family="${FONT_FAMILY}" font-size="${bulletFontSize}"
            font-weight="700" font-style="italic"
            stroke="rgba(0,0,0,0.55)" stroke-width="1.6" paint-order="stroke fill">${escapeXml(line)}</text>`
        )
        .join('');

      return `
        <rect x="${panelPadX}" y="${rowY}" width="${rowW}" height="${rowH}" rx="${Math.round(rowH * 0.34)}"
          fill="rgba(7,24,58,0.62)" stroke="rgba(255,255,255,0.12)" stroke-width="1.4"/>
        <rect x="${panelPadX + 14}" y="${rowY + Math.round((rowH - checkSize) / 2)}" width="${checkSize}" height="${checkSize}" rx="5" fill="#22c55e"/>
        <path d="M${panelPadX + 14 + Math.round(5 * sF)},${Math.round(rowY + (rowH - checkSize) / 2 + 13 * sF)}
          L${panelPadX + 14 + Math.round(10 * sF)},${Math.round(rowY + (rowH - checkSize) / 2 + 18 * sF)}
          L${panelPadX + 14 + Math.round(19 * sF)},${Math.round(rowY + (rowH - checkSize) / 2 + 7 * sF)}"
          stroke="white" stroke-width="${Math.max(2, Math.round(2.5 * sF))}"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        ${lineEls}
      `;
    })
    .join('');

  const bulletPanelH =
    panelPadY * 2 + bulletTexts.length * rowH + Math.max(0, bulletTexts.length - 1) * rowGap + 14;

  const bulletSvg = svgBuf(`
    <svg width="${bulletBoxW}" height="${bulletPanelH}" xmlns="http://www.w3.org/2000/svg">
      ${getFontDefs()}
      <defs>
        <linearGradient id="bulletPanelBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(4,17,46,0.78)"/>
          <stop offset="100%" stop-color="${rgbaFromHex(primaryColor, 0.4)}"/>
        </linearGradient>
        <linearGradient id="bulletSheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <path d="M18 14
               L${bulletBoxW - 74} 14
               L${bulletBoxW - 18} 56
               L${bulletBoxW - 18} ${bulletPanelH - 18}
               L56 ${bulletPanelH - 18}
               L18 ${bulletPanelH - 54} Z"
        fill="url(#bulletPanelBg)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
      <path d="M30 26 L${bulletBoxW - 118} 26 L${bulletBoxW - 82} 52 L62 52 Z"
        fill="url(#bulletSheen)" opacity="0.88"/>
      <line x1="56" y1="54" x2="${bulletBoxW - 96}" y2="54"
        stroke="${secondaryColor}" stroke-width="2.5" opacity="0.9"/>
      ${bulletRows}
    </svg>
  `);
  overlays.push({ input: bulletSvg, left: bulletBoxX, top: bulletBoxY });

  const iconLabels = (params.industryIcons || []).filter(Boolean).slice(0, 6);
  const iconItems = iconLabels.length
    ? iconLabels
    : ['Data Centers', 'Manufacturing', 'Hospitals', 'Buildings', 'Infrastructure', 'Solar'];
  const slotW = Math.round(CANVAS_W / iconItems.length);
  const iconSize = Math.round(iconRowH * 0.38);
  const iconSvg = svgBuf(`
    <svg width="${CANVAS_W}" height="${iconRowH}" xmlns="http://www.w3.org/2000/svg">
      ${getFontDefs()}
      <rect width="${CANVAS_W}" height="${iconRowH}" fill="rgba(4,23,52,0.82)"/>
      ${iconItems
        .map((label, index) => {
          const slotX = index * slotW;
          const iconX = Math.round(slotX + slotW / 2 - iconSize / 2);
          const labelX = Math.round(slotX + slotW / 2);
          return `
            <g transform="translate(${iconX},12)">
              ${industryIconSvg(label, iconSize)}
            </g>
            <text x="${labelX}" y="${Math.round(iconRowH * 0.76)}" text-anchor="middle"
              font-family="${FONT_FAMILY}" font-weight="700" font-size="${Math.round(iconRowH * 0.17)}"
              fill="white">${escapeXml(truncate(label, 16))}</text>
          `;
        })
        .join('')}
    </svg>
  `);
  overlays.push({ input: iconSvg, left: 0, top: iconRowY });

  const footerText = [params.website || '', params.email ? `Email: ${params.email}` : '']
    .filter(Boolean)
    .join(' | ');
  const footerSvg = svgBuf(`
    <svg width="${CANVAS_W}" height="${footerH}" xmlns="http://www.w3.org/2000/svg">
      ${getFontDefs()}
      <rect width="${CANVAS_W}" height="${footerH}" fill="${footerColor(primaryColor)}"/>
      <line x1="28" y1="${Math.round(footerH * 0.62)}" x2="${Math.round(CANVAS_W * 0.26)}" y2="${Math.round(footerH * 0.62)}"
        stroke="rgba(255,255,255,0.75)" stroke-width="2"/>
      <line x1="${Math.round(CANVAS_W * 0.74)}" y1="${Math.round(footerH * 0.62)}" x2="${CANVAS_W - 28}" y2="${Math.round(footerH * 0.62)}"
        stroke="rgba(255,255,255,0.75)" stroke-width="2"/>
      <text x="${Math.round(CANVAS_W / 2)}" y="${Math.round(footerH / 2)}" text-anchor="middle"
        dominant-baseline="central" font-family="${FONT_FAMILY}" font-weight="800"
        font-size="${Math.round(footerH * 0.36)}" fill="white">${escapeXml(truncate(footerText, 72))}</text>
    </svg>
  `);
  overlays.push({ input: footerSvg, left: 0, top: footerY });

  return sharp(background).composite(overlays).png().toBuffer();
}
