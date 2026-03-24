import sharp from 'sharp';
import { THEME_SCHEMAS } from './theme-slots';
import { deriveStudioPalette } from './theme-palette';

// Re-export for backward compat with server-side consumers
export { THEME_SCHEMAS, getThemeSlots, type ImageSlot, type ThemeSlotSchema } from './theme-slots';

// ── Types ────────────────────────────────────────────────────────────────────

export type ThemeComposeInput = {
  width: number;
  height: number;
  baseImageBuffer: Buffer;
  themeId: string;
  /** Maps slot id → image buffer (already resolved from URL) */
  slotImageBuffers: Record<string, Buffer>;
  primaryLogoBuffer?: Buffer | null;
  headline?: string;
  tagline?: string;
  brandName?: string;
  footerWebsite?: string;
  footerEmail?: string;
  palette?: string[];
  featureBullets?: string[];
  partnerName?: string;
};

type PreparedImage = {
  dataUri: string;
  width: number;
  height: number;
};

// ── Shared helpers ───────────────────────────────────────────────────────────

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeDisplayText(value: string | null | undefined, maxLength = 160) {
  if (!value) return '';

  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2022\u00B7•]/g, ' ')
    .replace(/[✓✔✅☑]/g, ' ')
    .replace(/[👉➜➤➡]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function wrapText(text: string, maxChars: number) {
  const normalized = sanitizeDisplayText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/);
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

function fitTextLines(text: string | null | undefined, widths: number[], maxLines = 2) {
  if (!Array.isArray(widths) || widths.length === 0) return [];

  const normalized = sanitizeDisplayText(
    text,
    Math.max(...widths, 16) * Math.max(2, maxLines) * 4
  );
  if (!normalized) return [];

  let fallback: string[] = [];
  for (const width of widths) {
    const lines = wrapText(normalized, width).slice(0, maxLines);
    fallback = lines;
    if (lines.join(' ').trim().length >= normalized.length) {
      return lines;
    }
  }

  return fallback;
}

function firstSafeLine(value: string | null | undefined, fallback = '', maxLength = 72) {
  const normalized = sanitizeDisplayText(value, maxLength);
  return normalized || fallback;
}

function getSafeFeatureBullets(values: string[] | null | undefined, max = 4) {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const picked: string[] = [];

  for (const raw of values) {
    const normalized = sanitizeDisplayText(raw, 96)
      .replace(/^[-*+]+/, '')
      .trim();

    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(normalized);

    if (picked.length >= max) break;
  }

  return picked;
}

function toDataUri(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function deriveColors(colors?: string[]) {
  return deriveStudioPalette(colors);
}

async function prepareBackgroundPlate(
  buffer: Buffer,
  width: number,
  height: number,
  palette?: string[]
) {
  const c = deriveColors(palette);
  const base = await sharp(buffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.82, saturation: 1.06 })
    .blur(3)
    .png()
    .toBuffer();

  const washSvg = svg(
    width,
    height,
    `
      <defs>
        <linearGradient id="themeWash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.74" />
          <stop offset="58%" stop-color="${c.bgEnd}" stop-opacity="0.54" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.20" />
        </linearGradient>
        <radialGradient id="themeGlow" cx="22%" cy="28%" r="56%">
          <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.26" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="themeSupport" cx="82%" cy="84%" r="36%">
          <stop offset="0%" stop-color="${c.support}" stop-opacity="0.18" />
          <stop offset="100%" stop-color="${c.support}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="themeVignette" cx="50%" cy="50%" r="72%">
          <stop offset="55%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.22" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#themeWash)" />
      <rect width="${width}" height="${height}" fill="url(#themeGlow)" />
      <rect width="${width}" height="${height}" fill="url(#themeSupport)" />
      <rect width="${width}" height="${height}" fill="url(#themeVignette)" />
    `
  );

  return sharp(base)
    .composite([{ input: Buffer.from(washSvg), blend: 'over' }])
    .png()
    .toBuffer();
}

function softenThemeCanvas(svgMarkup: string, width: number, height: number) {
  let fullCanvasRectIndex = 0;

  return svgMarkup.replace(
    /<rect width="(\d+)" height="(\d+)" fill="([^"]+)"([^>]*)\/>/g,
    (match, rectWidth, rectHeight, fill, rest) => {
      if (Number(rectWidth) !== width || Number(rectHeight) !== height) {
        return match;
      }

      fullCanvasRectIndex += 1;
      const targetOpacity = fullCanvasRectIndex === 1 ? '0.52' : '0.74';

      if (/fill-opacity="/.test(rest)) {
        return match.replace(/fill-opacity="([^"]+)"/, (_existingMatch, existingOpacity) => {
          const normalized = Number.parseFloat(existingOpacity);
          if (!Number.isFinite(normalized)) {
            return `fill-opacity="${targetOpacity}"`;
          }
          return `fill-opacity="${Math.min(normalized, Number.parseFloat(targetOpacity)).toFixed(2)}"`;
        });
      }

      return `<rect width="${rectWidth}" height="${rectHeight}" fill="${fill}" fill-opacity="${targetOpacity}"${rest} />`;
    }
  );
}

async function prepareImage(
  buffer: Buffer,
  width: number,
  height: number,
  options?: { trim?: boolean; fit?: 'contain' | 'cover' }
): Promise<PreparedImage> {
  let pipeline = sharp(buffer);
  if (options?.trim) pipeline = pipeline.trim();

  const output = await pipeline
    .resize({
      width,
      height,
      fit: options?.fit || 'contain',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const metadata = await sharp(output).metadata();
  return {
    dataUri: toDataUri(output),
    width: metadata.width || width,
    height: metadata.height || height,
  };
}

async function prepareLogo(
  buffer: Buffer | null | undefined,
  width: number,
  height: number
): Promise<PreparedImage | null> {
  if (!buffer) return null;

  const output = await sharp(buffer)
    .resize({
      width,
      height,
      fit: 'contain',
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const metadata = await sharp(output).metadata();
  return {
    dataUri: toDataUri(output),
    width: metadata.width || width,
    height: metadata.height || height,
  };
}

// ── SVG builders per theme ───────────────────────────────────────────────────

function buildCleanBrandSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = wrapText(input.headline || safeBrandName || 'Your Headline', 22).slice(0, 3);
  const tagline = wrapText(input.tagline || '', 32).slice(0, 2);
  const heroImg = images['hero'];
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);
  const headlineFont = headline.length > 2 ? r(w * 0.04) : r(w * 0.046);

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.05)}" y="${r(h * 0.04)}" width="${r(w * 0.13)}" height="${r(h * 0.09)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.06)}" y="${r(h * 0.09)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.028)}" font-weight="800">${escapeXml(safeBrandName)}</text>`;

  const heroNode = heroImg
    ? `<rect x="${r(w * 0.61)}" y="${r(h * 0.15)}" width="${r(w * 0.31)}" height="${r(h * 0.70)}" rx="24" fill="rgba(255,255,255,0.92)" stroke="${c.muted}" stroke-opacity="0.18" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.62)}" y="${r(h * 0.17)}" width="${r(w * 0.29)}" height="${r(h * 0.66)}" preserveAspectRatio="xMidYMid meet" />`
    : '';

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.33 + i * h * 0.07)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.57 + i * h * 0.04)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.021)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  const ctaY = h * 0.71;
  const ctaNode = `<rect x="${r(w * 0.06)}" y="${r(ctaY)}" width="${r(w * 0.19)}" height="${r(h * 0.062)}" rx="${r(h * 0.031)}" fill="${c.accent}" />
    <text x="${r(w * 0.155)}" y="${r(ctaY + h * 0.041)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" text-anchor="middle">Brand Focus</text>`;

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.surface}" />
    <rect width="${w}" height="${r(h * 0.14)}" fill="${c.headerPanel}" />
    <rect y="${h - r(h * 0.10)}" width="${w}" height="${r(h * 0.10)}" fill="${c.footer}" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.14)}" width="${r(w * 0.92)}" height="2" rx="1" fill="${c.accent}" fill-opacity="0.45" />
    ${logoNode}
    ${heroNode}
    ${headlineNodes}
    ${taglineNodes}
    ${ctaNode}
    <text x="${r(w * 0.06)}" y="${h - r(h * 0.036)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="600">${escapeXml(footerLine)}</text>
  `);
}

function buildBrandStorySvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = wrapText(input.headline || safeBrandName || 'Our Story', 20).slice(0, 3);
  const tagline = wrapText(input.tagline || '', 32).slice(0, 4);
  const heroImg = images['hero'];
  const headlineFont = headline.length > 2 ? r(w * 0.034) : r(w * 0.04);

  const cx = r(w * 0.24);
  const cy = r(h * 0.50);
  const radius = r(Math.min(w * 0.18, h * 0.35));

  const heroNode = heroImg
    ? `<defs><clipPath id="storyCircle"><circle cx="${cx}" cy="${cy}" r="${radius}" /></clipPath></defs>
       <circle cx="${cx}" cy="${cy}" r="${radius + 4}" fill="${c.accent}" opacity="0.3" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" clip-path="url(#storyCircle)" preserveAspectRatio="xMidYMid slice" />`
    : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${c.accent}" opacity="0.15" />`;

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.52)}" y="${r(h * 0.16)}" width="${r(w * 0.08)}" height="${r(h * 0.08)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.52)}" y="${r(h * 0.21)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.02)}" font-weight="700">${escapeXml(safeBrandName)}</text>`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.33 + i * h * 0.065)}" fill="${c.text}" font-family="Georgia,serif" font-size="${headlineFont}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.57 + i * h * 0.035)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs><linearGradient id="storyGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.surface}" /><stop offset="100%" stop-color="${c.bgEnd}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#storyGrad)" />
    ${heroNode}
    ${logoNode}
    ${headlineNodes}
    ${taglineNodes}
    <rect x="${r(w * 0.52)}" y="${r(h * 0.72)}" width="${r(w * 0.14)}" height="${r(h * 0.055)}" rx="${r(h * 0.028)}" fill="${c.accent}" />
    <text x="${r(w * 0.59)}" y="${r(h * 0.755)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="middle">Story Highlight</text>
  `);
}

function buildIndustrialCampaignSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 36);
  const headline = wrapText(input.headline || safeBrandName || 'Campaign Headline', 20).slice(0, 3);
  const tagline = wrapText(input.tagline || '', 32).slice(0, 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 3);
  const footerWebsite = firstSafeLine(input.footerWebsite, safeBrandName, 46);
  const footerEmail = firstSafeLine(input.footerEmail, '', 34);

  // Logo box — white card top-left
  const logoBoxX = r(w * 0.03);
  const logoBoxY = r(h * 0.025);
  const logoBoxW = r(w * 0.155);
  const logoBoxH = r(h * 0.095);
  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${logoBoxX + 4}" y="${logoBoxY + 4}" width="${logoBoxW - 8}" height="${logoBoxH - 8}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${logoBoxX + r(logoBoxW / 2)}" y="${logoBoxY + r(logoBoxH * 0.62)}" fill="#1e293b" font-family="Arial,sans-serif" font-size="${r(w * 0.022)}" font-weight="800" text-anchor="middle">${escapeXml(safeBrandName)}</text>`;

  // Hero card — white background with product image inside
  const heroCardX = r(w * 0.03);
  const heroCardY = r(h * 0.155);
  const heroCardW = r(w * 0.325);
  const heroCardH = r(h * 0.720);
  const heroNode = heroImg
    ? `<rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" fill="rgba(255,255,255,0.96)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${heroCardX + 6}" y="${heroCardY + 6}" width="${heroCardW - 12}" height="${heroCardH - 12}" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" fill="${c.surface}" fill-opacity="0.10" stroke="${c.muted}" stroke-opacity="0.25" />`;

  // Right info panel — semi-opaque for text readability over background
  const infoX = r(w * 0.395);
  const infoY = r(h * 0.155);
  const infoW = r(w * 0.575);
  const infoH = r(h * 0.720);

  const headlineFontSize = headline.length >= 3 ? r(w * 0.037) : r(w * 0.042);
  const headlineNodes = headline
    .map((line, i) => `<text x="${r(infoX + infoW * 0.06)}" y="${r(infoY + infoH * 0.14 + i * h * 0.072)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFontSize}" font-weight="900" letter-spacing="-0.5">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(infoX + infoW * 0.06)}" y="${r(infoY + infoH * 0.40 + i * h * 0.042)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="700" letter-spacing="1">${escapeXml(line.toUpperCase())}</text>`)
    .join('');

  const bulletNodesMarkup = bullets
    .map((b, i) => {
      const boxSize = r(w * 0.038);
      const boxX = r(infoX + infoW * 0.06);
      const baseY = r(infoY + infoH * 0.54 + i * h * 0.115);
      const wrapped = wrapText(b, 26).slice(0, 2);
      const checkStroke = Math.max(3, Math.round(boxSize * 0.14));
      const checkPath = [
        `M ${boxX + Math.round(boxSize * 0.24)} ${baseY + Math.round(boxSize * 0.54)}`,
        `L ${boxX + Math.round(boxSize * 0.42)} ${baseY + Math.round(boxSize * 0.72)}`,
        `L ${boxX + Math.round(boxSize * 0.78)} ${baseY + Math.round(boxSize * 0.28)}`,
      ].join(' ');

      const textX = r(infoX + infoW * 0.06 + boxSize + r(w * 0.014));
      const textNodes = wrapped
        .map((line, lineIndex) => {
          const lineY = baseY + Math.round(boxSize * 0.70) + lineIndex * Math.round(h * 0.038);
          return `<text x="${textX}" y="${lineY}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="600">${escapeXml(line)}</text>`;
        })
        .join('');

      return `
        <rect x="${boxX}" y="${baseY}" width="${boxSize}" height="${boxSize}" rx="${Math.max(8, Math.round(boxSize * 0.24))}" fill="${c.support}" />
        <path d="${checkPath}" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="${checkStroke}" stroke-linecap="round" stroke-linejoin="round" />
        ${textNodes}
      `;
    })
    .join('');

  return svg(w, h, `
    <defs>
      <linearGradient id="indGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" />
        <stop offset="55%" stop-color="${c.bgEnd}" />
        <stop offset="100%" stop-color="${c.bgStart}" />
      </linearGradient>
      <linearGradient id="indInfoGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${c.bgStart}" stop-opacity="0.40" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#indGrad)" />
    <rect width="${w}" height="${r(h * 0.135)}" fill="${c.bgStart}" fill-opacity="0.68" />
    <rect y="${h - r(h * 0.10)}" width="${w}" height="${r(h * 0.10)}" fill="${c.footer}" />
    <rect x="${logoBoxX}" y="${logoBoxY}" width="${logoBoxW}" height="${logoBoxH}" rx="10" fill="rgba(255,255,255,0.96)" />
    ${logoNode}
    ${heroNode}
    <rect x="${infoX}" y="${infoY}" width="${infoW}" height="${infoH}" rx="20" fill="url(#indInfoGrad)" stroke="${c.muted}" stroke-opacity="0.22" stroke-width="1" />
    ${headlineNodes}
    ${taglineNodes}
    <rect x="${r(infoX + infoW * 0.06)}" y="${r(infoY + infoH * 0.50)}" width="${r(infoW * 0.32)}" height="3" rx="2" fill="${c.accent}" />
    ${bulletNodesMarkup}
    <text x="${r(w * 0.05)}" y="${h - r(h * 0.038)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="600" fill-opacity="0.85">${escapeXml(footerWebsite)}</text>
    ${footerEmail ? `<text x="${w - r(w * 0.05)}" y="${h - r(h * 0.038)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="600" text-anchor="end" fill-opacity="0.75">${escapeXml(footerEmail)}</text>` : ''}
  `);
}

function buildProductHeroSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = fitTextLines(input.headline || safeBrandName || 'Product Name', [18, 20, 22, 24], 3);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 3);
  const headlineFont = headline.length > 2 ? r(w * 0.038) : r(w * 0.046);
  const headlineStep = headline.length > 2 ? h * 0.062 : h * 0.07;
  const taglineFont = tagline.length > 2 ? r(w * 0.019) : r(w * 0.021);

  const heroNode = heroImg
    ? `<rect x="${r(w * 0.575)}" y="${r(h * 0.13)}" width="${r(w * 0.33)}" height="${r(h * 0.72)}" rx="28" fill="rgba(255,255,255,0.94)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.585)}" y="${r(h * 0.145)}" width="${r(w * 0.31)}" height="${r(h * 0.69)}" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="${r(w * 0.575)}" y="${r(h * 0.13)}" width="${r(w * 0.33)}" height="${r(h * 0.72)}" rx="28" fill="${c.accent}" fill-opacity="0.10" stroke="${c.accent}" stroke-opacity="0.25" stroke-width="2" />`;

  const logoNode = logo
    ? `<rect x="${r(w * 0.04)}" y="${r(h * 0.035)}" width="${r(w * 0.13)}" height="${r(h * 0.105)}" rx="12" fill="rgba(255,255,255,0.96)" />
       <image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.044)}" y="${r(h * 0.040)}" width="${r(w * 0.122)}" height="${r(h * 0.095)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.06)}" y="${r(h * 0.098)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.024)}" font-weight="800">${escapeXml(safeBrandName)}</text>`;

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.surface}" />
    <rect width="${w}" height="${r(h * 0.14)}" fill="${c.headerPanel}" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.14)}" width="${r(w * 0.92)}" height="2" rx="1" fill="${c.accent}" fill-opacity="0.55" />
    ${logoNode}
    ${heroNode}
    <text x="${r(w * 0.06)}" y="${r(h * 0.245)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" letter-spacing="2">PRODUCT SPOTLIGHT</text>
    ${headline.map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.315 + i * headlineStep)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" letter-spacing="-0.5">${escapeXml(line)}</text>`).join('')}
    ${tagline.map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.55 + i * h * 0.040)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${taglineFont}" font-weight="500">${escapeXml(line)}</text>`).join('')}
    <rect x="${r(w * 0.06)}" y="${r(h * 0.726)}" width="${r(w * 0.225)}" height="${r(h * 0.067)}" rx="${r(h * 0.034)}" fill="${c.accent}" />
    <text x="${r(w * 0.173)}" y="${r(h * 0.770)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" text-anchor="middle">Product Focus</text>
  `);
}

function buildKnowledgeVisualSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = fitTextLines(input.headline || 'Knowledge Brief', [18, 20, 22], 3);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 3);
  const bullets = getSafeFeatureBullets(input.featureBullets, 3);
  const headlineFont = headline.length > 2 ? r(w * 0.027) : r(w * 0.03);
  const bulletFont = r(w * 0.0155);

  const heroNode = heroImg
    ? `<rect x="${r(w * 0.04)}" y="${r(h * 0.08)}" width="${r(w * 0.44)}" height="${r(h * 0.82)}" rx="16" fill="rgba(255,255,255,0.88)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.05)}" y="${r(h * 0.10)}" width="${r(w * 0.42)}" height="${r(h * 0.78)}" preserveAspectRatio="xMidYMid meet" />`
    : '';

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.54)}" y="${r(h * 0.25 + i * h * 0.055)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="800">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.54)}" y="${r(h * 0.46 + i * h * 0.033)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.0175)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  const bulletNodes = bullets
    .map((line, i) => {
      const wrapped = fitTextLines(line, [24, 26, 28], 2);
      const y = r(h * (0.58 + i * 0.11));
      return `<g>
        <circle cx="${r(w * 0.565)}" cy="${y - 6}" r="12" fill="${c.support}" />
        <text x="${r(w * 0.565)}" y="${y - 1}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="800" text-anchor="middle">${i + 1}</text>
        ${wrapped.map((chunk, idx) => `<text x="${r(w * 0.59)}" y="${y + idx * r(h * 0.03)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${bulletFont}" font-weight="700">${escapeXml(chunk)}</text>`).join('')}
      </g>`;
    })
    .join('');

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.54)}" y="${r(h * 0.08)}" width="${r(w * 0.07)}" height="${r(h * 0.06)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.54)}" y="${r(h * 0.11)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700">${escapeXml(safeBrandName)}</text>`;

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.bgStart}" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.08)}" width="${r(w * 0.44)}" height="${r(h * 0.84)}" rx="18" fill="${c.surface}" fill-opacity="0.05" stroke="${c.muted}" stroke-opacity="0.10" />
    ${heroNode}
    <rect x="${r(w * 0.52)}" y="${r(h * 0.08)}" width="${r(w * 0.42)}" height="${r(h * 0.84)}" rx="18" fill="${c.accent}" fill-opacity="0.35" stroke="${c.accent}" stroke-opacity="0.40" />
    ${logoNode}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.16)}" width="${r(w * 0.10)}" height="4" rx="2" fill="${c.accent}" fill-opacity="0.70" />
    ${headlineNodes}
    ${taglineNodes}
    ${bulletNodes}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.82)}" width="${r(w * 0.16)}" height="${r(h * 0.055)}" rx="8" fill="${c.support}" />
    <text x="${r(w * 0.62)}" y="${r(h * 0.855)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">Brief</text>
  `);
}

function buildDatasheetFrameSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = fitTextLines(input.headline || safeBrandName || 'Product Series', [18, 20, 22], 2);
  const tagline = fitTextLines(input.tagline || '', [22, 26, 30], 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const headlineFont = headline.length > 1 ? r(w * 0.025) : r(w * 0.028);

  const heroNode = heroImg
    ? `<rect x="${r(w * 0.05)}" y="${r(h * 0.09)}" width="${r(w * 0.32)}" height="${r(h * 0.78)}" rx="14" fill="rgba(255,255,255,0.92)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.06)}" y="${r(h * 0.10)}" width="${r(w * 0.30)}" height="${r(h * 0.76)}" preserveAspectRatio="xMidYMid meet" />`
    : '';

  const logoNode = logo
    ? `<rect x="${r(w * 0.455)}" y="${r(h * 0.075)}" width="${r(w * 0.092)}" height="${r(h * 0.072)}" rx="6" fill="rgba(255,255,255,0.90)" />
       <image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.46)}" y="${r(h * 0.08)}" width="${r(w * 0.08)}" height="${r(h * 0.06)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.46)}" y="${r(h * 0.12)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700">${escapeXml(safeBrandName)}</text>`;

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.surface}" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.08)}" width="${r(w * 0.34)}" height="${r(h * 0.84)}" rx="18" fill="${c.bgStart}" />
    ${heroNode}
    <rect x="${r(w * 0.42)}" y="${r(h * 0.08)}" width="${r(w * 0.52)}" height="${r(h * 0.22)}" rx="18" fill="${c.headerPanel}" stroke="${c.muted}" stroke-opacity="0.3" />
    ${logoNode}
    <text x="${r(w * 0.58)}" y="${r(h * 0.125)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="700" text-anchor="middle" letter-spacing="${r(w * 0.0015)}">DATASHEET FRAME</text>
    ${headline.map((line, i) => `<text x="${r(w * 0.46)}" y="${r(h * 0.18 + i * h * 0.048)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900">${escapeXml(line)}</text>`).join('')}
    ${tagline.map((line, i) => `<text x="${r(w * 0.46)}" y="${r(h * 0.255 + i * h * 0.028)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.0165)}" font-weight="500">${escapeXml(line)}</text>`).join('')}
    ${[0, 1, 2, 3].map((i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = r(w * (0.42 + col * 0.27));
      const by = r(h * (0.36 + row * 0.27));
      const cardText = fitTextLines(bullets[i] || `Key product detail ${i + 1}`, [16, 18, 20], 3);
      return `<g>
        <rect x="${bx}" y="${by}" width="${r(w * 0.24)}" height="${r(h * 0.22)}" rx="14" fill="${c.headerPanel}" stroke="${c.muted}" stroke-opacity="0.3" />
        <circle cx="${bx + 22}" cy="${by + 22}" r="12" fill="${c.support}" />
        <text x="${bx + 22}" y="${by + 27}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" text-anchor="middle">${i + 1}</text>
        ${cardText.map((line, idx) => `<text x="${bx + 18}" y="${by + 54 + idx * r(h * 0.033)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(line)}</text>`).join('')}
      </g>`;
    }).join('')}
  `);
}

function buildProofStackSvg(w: number, h: number, _images: Record<string, PreparedImage>, _logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = fitTextLines(input.headline || 'Proven Results', [18, 20, 22], 2);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 3);
  const bullets = getSafeFeatureBullets(input.featureBullets, 3);
  const proofCardColors = [
    { bg: c.support, accent: c.accent },
    { bg: c.bgEnd, accent: c.support },
    { bg: c.surface, accent: c.accent },
  ];
  const headlineFont = headline.length > 1 ? r(w * 0.028) : r(w * 0.03);

  const proofCards = proofCardColors
    .map((pc, i) => {
      const cy = r(h * (0.08 + i * 0.30));
      const text = fitTextLines(bullets[i] || `Proof point ${i + 1}`, [20, 22, 24], 3);
      return `<g>
        <rect x="${r(w * 0.04)}" y="${cy}" width="${r(w * 0.46)}" height="${r(h * 0.24)}" rx="14" fill="${pc.bg}" fill-opacity="0.20" stroke="${c.muted}" stroke-opacity="0.3" />
        <rect x="${r(w * 0.07)}" y="${r(h * (0.08 + i * 0.30) + h * 0.05)}" width="${r(w * 0.06)}" height="${r(w * 0.06)}" rx="8" fill="${pc.accent}" />
        ${text.map((line, idx) => `<text x="${r(w * 0.16)}" y="${r(cy + h * 0.09 + idx * h * 0.04)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700">${escapeXml(line)}</text>`).join('')}
      </g>`;
    })
    .join('');

  const brandNode = `<text x="${r(w * 0.56)}" y="${r(h * 0.16)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700">${escapeXml(safeBrandName)}</text>`;
  const headlineNode = headline
    .map((line, idx) => `<text x="${r(w * 0.56)}" y="${r(h * 0.26 + idx * h * 0.055)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.38 + i * h * 0.038)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.0175)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.surface}" />
    ${proofCards}
    <rect x="${r(w * 0.52)}" y="${r(h * 0.08)}" width="${r(w * 0.44)}" height="${r(h * 0.84)}" rx="14" fill="${c.bgStart}" />
    ${brandNode}
    ${headlineNode}
    ${taglineNodes}
    <rect x="${r(w * 0.56)}" y="${r(h * 0.58)}" width="${r(w * 0.14)}" height="${r(h * 0.055)}" rx="8" fill="${c.support}" />
    <text x="${r(w * 0.63)}" y="${r(h * 0.615)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">Proof</text>
  `);
}

function buildLaunchBannerSvg(w: number, h: number, _images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const headline = fitTextLines(input.headline || 'Launching Soon', [20, 22, 24, 26], 3);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 2);
  const headlineFont = headline.length > 2 ? r(w * 0.042) : r(w * 0.05);
  const headlineStep = headline.length > 2 ? h * 0.082 : h * 0.10;
  const taglineFont = tagline.length > 1 ? r(w * 0.021) : r(w * 0.024);

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.05)}" y="${r(h * 0.05)}" width="${r(w * 0.12)}" height="${r(h * 0.07)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.075)}" y="${r(h * 0.095)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="800" text-anchor="middle">${escapeXml(input.brandName || 'Brand')}</text>`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.35 + i * headlineStep)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs><linearGradient id="launchGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bgStart}" /><stop offset="50%" stop-color="${c.accent}" /><stop offset="100%" stop-color="${c.support}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#launchGrad)" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.14)}" height="${r(h * 0.08)}" rx="${r(h * 0.04)}" fill="${c.surface}" fill-opacity="0.95" />
    ${logoNode}
    <rect x="${r(w * 0.76)}" y="${r(h * 0.04)}" width="${r(w * 0.18)}" height="${r(h * 0.055)}" rx="${r(h * 0.028)}" fill="${c.support}" />
    <text x="${r(w * 0.85)}" y="${r(h * 0.078)}" fill="${c.bgStart}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" text-anchor="middle">Launch Mode</text>
    ${headlineNodes}
    ${tagline.map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.60 + i * h * 0.035)}" fill="${c.text}" fill-opacity="0.72" font-family="Arial,sans-serif" font-size="${taglineFont}" font-weight="500">${escapeXml(line)}</text>`).join('')}
    <rect x="${r(w * 0.70)}" y="${r(h * 0.84)}" width="${r(w * 0.24)}" height="${r(h * 0.07)}" rx="12" fill="${c.surface}" fill-opacity="0.95" />
    <text x="${r(w * 0.82)}" y="${r(h * 0.885)}" fill="${c.bgStart}" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700" text-anchor="middle">Launch Update</text>
  `);
}

function buildSectorCollageSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = wrapText(input.headline || safeBrandName || 'Our Sectors', 24).slice(0, 2);
  const tagline = wrapText(input.tagline || '', 28).slice(0, 1);
  const bullets = getSafeFeatureBullets(input.featureBullets, 3);

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.04)}" y="${r(h * 0.03)}" width="${r(w * 0.11)}" height="${r(h * 0.10)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.06)}" y="${r(h * 0.085)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.022)}" font-weight="800">${escapeXml(safeBrandName)}</text>`;

  const panels = ['panel-1', 'panel-2', 'panel-3'];
  const panelNodes = panels.map((pid, i) => {
    const px = r(w * (0.03 + i * 0.32));
    const py = r(h * 0.19);
    const pw = r(w * 0.30);
    const ph = r(h * 0.46);
    const img = images[pid];
    const caption = wrapText(bullets[i] || ['Energy efficiency', 'Power quality', 'Smart control'][i], 16).slice(0, 2);
    const imgNode = img
      ? `<image href="${escapeXml(img.dataUri)}" x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" clip-path="url(#panel${i}Clip)" />`
      : '';
    return `<defs><clipPath id="panel${i}Clip"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" /></clipPath></defs>
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${c.surface}" fill-opacity="0.12" />
      ${imgNode}
      <rect x="${px}" y="${py + ph - r(h * 0.11)}" width="${pw}" height="${r(h * 0.11)}" fill="${c.bgStart}" fill-opacity="0.72" clip-path="url(#panel${i}Clip)" />
      ${caption.map((line, idx) => `<text x="${px + 18}" y="${py + ph - r(h * 0.06) + idx * r(h * 0.03)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(line)}</text>`).join('')}`;
  }).join('');

  const iconNodes = (bullets.length > 0 ? bullets : ['Power factor improvement', 'Power quality support', 'Controller integration'])
    .slice(0, 3)
    .map((label, i) => {
      const ix = r(w * (0.18 + i * 0.32));
      const iy = r(h * 0.80);
      const lines = wrapText(label, 20).slice(0, 2);
      return lines
        .map((line, idx) => `<text x="${ix}" y="${iy + idx * r(h * 0.03)}" fill="${c.text}" fill-opacity="0.72" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="600" text-anchor="middle">${escapeXml(line)}</text>`)
        .join('');
    })
    .join('');

  return svg(w, h, `
    <defs><linearGradient id="sectorGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bgStart}" /><stop offset="100%" stop-color="${c.bgEnd}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#sectorGrad)" />
    <rect width="${w}" height="${r(h * 0.16)}" fill="${c.bgStart}" fill-opacity="0.40" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.03)}" width="${r(w * 0.12)}" height="${r(h * 0.10)}" rx="6" fill="${c.surface}" fill-opacity="0.95" />
    ${logoNode}
    ${headline.map((line, i) => `<text x="${r(w * 0.50)}" y="${r(h * 0.085 + i * h * 0.045)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.03)}" font-weight="900" text-anchor="middle">${escapeXml(line)}</text>`).join('')}
    ${tagline[0] ? `<text x="${r(w * 0.50)}" y="${r(h * 0.155)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="600" text-anchor="middle">${escapeXml(tagline[0])}</text>` : ''}
    ${panelNodes}
    ${iconNodes}
  `);
}

function buildOfferCardSvg(w: number, h: number, images: Record<string, PreparedImage>, _logo: PreparedImage | null, input: ThemeComposeInput) {
  const heroImg = images['hero'];
  const headline = wrapText(input.headline || 'Special Offer', 24).slice(0, 2);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 2);

  const heroNode = heroImg
    ? `<rect x="${r(w * 0.575)}" y="${r(h * 0.035)}" width="${r(w * 0.39)}" height="${r(h * 0.93)}" rx="14" fill="rgba(255,255,255,0.92)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.58)}" y="${r(h * 0.04)}" width="${r(w * 0.38)}" height="${r(h * 0.92)}" preserveAspectRatio="xMidYMid meet" />`
    : '';

  const c = deriveColors(input.palette);
  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.38 + i * h * 0.08)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.04)}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');
  return svg(w, h, `
    <defs><linearGradient id="offerGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bgStart}" /><stop offset="50%" stop-color="${c.accent}" /><stop offset="100%" stop-color="${c.support}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#offerGrad)" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.50)}" height="${r(h * 0.92)}" rx="14" fill="${c.surface}" fill-opacity="0.06" />
    <rect x="${r(w * 0.08)}" y="${r(h * 0.22)}" width="${r(w * 0.12)}" height="${r(h * 0.04)}" rx="${r(h * 0.02)}" fill="${c.support}" />
    <text x="${r(w * 0.14)}" y="${r(h * 0.246)}" fill="${c.bgStart}" font-family="Arial,sans-serif" font-size="${r(w * 0.0115)}" font-weight="800" text-anchor="middle">SPECIAL OFFER</text>
    ${headlineNodes}
    ${tagline.map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.60 + i * h * 0.035)}" fill="${c.support}" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="700">${escapeXml(line)}</text>`).join('')}
    <rect x="${r(w * 0.08)}" y="${r(h * 0.68)}" width="${r(w * 0.20)}" height="${r(h * 0.06)}" rx="12" fill="${c.surface}" fill-opacity="0.95" />
    <text x="${r(w * 0.18)}" y="${r(h * 0.72)}" fill="${c.bgStart}" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="middle">Offer Focus</text>
    <rect x="${r(w * 0.58)}" y="${r(h * 0.04)}" width="${r(w * 0.38)}" height="${r(h * 0.92)}" rx="14" fill="${c.surface}" fill-opacity="0.15" />
    ${heroNode}
  `);
}

function buildComparisonBoardSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = wrapText(input.headline || 'Compare', 22).slice(0, 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const leftBullets = bullets.slice(0, 2).length ? bullets.slice(0, 2) : ['Improve power factor', 'Reduce wasted energy'];
  const rightBullets = bullets.slice(2, 4).length ? bullets.slice(2, 4) : ['Support automatic networking', 'Built-in protection features'];

  const logoNode = logo
    ? `<image href="${escapeXml(logo.dataUri)}" x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.06)}" height="${r(h * 0.06)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.05)}" y="${r(h * 0.085)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700">${escapeXml(safeBrandName)}</text>`;

  const panels: Array<{ id: string; x: number; fill: string; stroke: string; label: string }> = [
    { id: 'panel-left', x: 0.04, fill: c.surface, stroke: c.muted, label: 'Operational Value' },
    { id: 'panel-right', x: 0.52, fill: c.headerPanel, stroke: c.accent, label: 'Protection & Control' },
  ];

  const panelNodes = panels.map((p) => {
    const px = r(w * p.x);
    const py = r(h * 0.18);
    const pw = r(w * 0.44);
    const ph = r(h * 0.74);
    const img = images[p.id];
    const panelBullets = p.id === 'panel-left' ? leftBullets : rightBullets;
    const imgNode = img
      ? `<rect x="${px + 18}" y="${py + 48}" width="${pw - 36}" height="${r(h * 0.30)}" rx="18" fill="${c.surface}" fill-opacity="0.12" />
         <image href="${escapeXml(img.dataUri)}" x="${px + 24}" y="${py + r(h * 0.08)}" width="${pw - 48}" height="${r(h * 0.28)}" preserveAspectRatio="xMidYMid meet" />`
      : '';
    return `<g>
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="18" fill="${p.fill}" stroke="${p.stroke}" stroke-opacity="0.5" />
      <text x="${px + 16}" y="${py + r(h * 0.05)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.02)}" font-weight="800">${escapeXml(p.label)}</text>
      ${imgNode}
      ${panelBullets.map((line, idx) => {
        const wrapped = wrapText(line, 22).slice(0, 2);
        const bulletY = py + r(h * (0.54 + idx * 0.12));
        return `<circle cx="${px + 22}" cy="${bulletY - 6}" r="10" fill="${c.support}" />
          <text x="${px + 22}" y="${bulletY - 1}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.012)}" font-weight="800" text-anchor="middle">${idx + 1}</text>
          ${wrapped.map((chunk, wrapIdx) => `<text x="${px + 40}" y="${bulletY + wrapIdx * r(h * 0.03)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(chunk)}</text>`).join('')}`;
      }).join('')}
    </g>`;
  }).join('');

  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="${c.surface}" />
    ${logoNode}
    ${headline.map((line, idx) => `<text x="${r(w * 0.12)}" y="${r(h * 0.09 + idx * h * 0.05)}" fill="${c.text}" font-family="Arial,sans-serif" font-size="${r(w * 0.028)}" font-weight="900">${escapeXml(line)}</text>`).join('')}
    ${panelNodes}
  `);
}

function buildPremiumEditorialSvg(w: number, h: number, images: Record<string, PreparedImage>, _logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const headline = wrapText(input.headline || 'Editorial', 24).slice(0, 3);
  const tagline = wrapText(input.tagline || '', 36).slice(0, 4);

  const heroNode = heroImg
    ? `<defs><clipPath id="editClip"><rect x="${r(w * 0.03)}" y="${r(h * 0.03)}" width="${r(w * 0.30)}" height="${r(h * 0.94)}" rx="18" /></clipPath></defs>
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.03)}" y="${r(h * 0.03)}" width="${r(w * 0.30)}" height="${r(h * 0.94)}" clip-path="url(#editClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="${r(w * 0.03)}" y="${r(h * 0.03)}" width="${r(w * 0.30)}" height="${r(h * 0.94)}" rx="18" fill="${c.surface}" fill-opacity="0.08" />`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.40)}" y="${r(h * 0.30 + i * h * 0.07)}" fill="${c.text}" fill-opacity="0.95" font-family="Georgia,serif" font-size="${r(w * 0.036)}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  const goldLine = `<rect x="${r(w * 0.40)}" y="${r(h * 0.30 + headline.length * h * 0.07 + h * 0.02)}" width="${r(w * 0.08)}" height="3" rx="1.5" fill="${c.accent}" />`;

  const taglineY = h * 0.30 + headline.length * h * 0.07 + h * 0.06;
  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.40)}" y="${r(taglineY + i * h * 0.04)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs><linearGradient id="editGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bgStart}" /><stop offset="50%" stop-color="${c.bgEnd}" /><stop offset="100%" stop-color="${c.accent}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#editGrad)" />
    ${heroNode}
    <rect x="${r(w * 0.40)}" y="${r(h * 0.20)}" width="${r(w * 0.10)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.50" />
    ${headlineNodes}
    ${goldLine}
    ${taglineNodes}
    <rect x="${r(w * 0.74)}" y="${r(h * 0.88)}" width="${r(w * 0.18)}" height="${r(h * 0.06)}" rx="8" fill="${c.accent}" />
    <text x="${r(w * 0.83)}" y="${r(h * 0.92)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="middle">Feature</text>
  `);
}

function buildGuidedAutoSvg(w: number, h: number, images: Record<string, PreparedImage>, _logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const headline = wrapText(input.headline || 'Your Visual', 28).slice(0, 2);
  const tagline = wrapText(input.tagline || '', 36).slice(0, 3);

  const heroNode = heroImg
    ? `<defs><clipPath id="autoClip"><rect x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.46)}" height="${r(h * 0.92)}" rx="18" /></clipPath></defs>
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.46)}" height="${r(h * 0.92)}" clip-path="url(#autoClip)" preserveAspectRatio="xMidYMid slice" />`
    : '';

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.30 + i * h * 0.07)}" fill="${c.text}" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.035)}" font-weight="900">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.50 + i * h * 0.04)}" fill="${c.muted}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="500">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs><linearGradient id="autoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bgStart}" /><stop offset="50%" stop-color="${c.bgEnd}" /><stop offset="100%" stop-color="${c.accent}" /></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#autoGrad)" />
    <rect x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.46)}" height="${r(h * 0.92)}" rx="18" fill="${c.accent}" fill-opacity="0.25" />
    ${heroNode}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.04)}" width="${r(w * 0.42)}" height="${r(h * 0.92)}" rx="18" fill="${c.surface}" fill-opacity="0.08" stroke="${c.muted}" stroke-opacity="0.12" />
    ${headlineNodes}
    ${taglineNodes}
    <rect x="${r(w * 0.56)}" y="${r(h * 0.68)}" width="${r(w * 0.14)}" height="${r(h * 0.055)}" rx="8" fill="${c.accent}" />
    <text x="${r(w * 0.63)}" y="${r(h * 0.715)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">Preview</text>
  `);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function r(n: number) {
  return Math.round(n);
}

function svg(w: number, h: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

// ── Theme → builder map ─────────────────────────────────────────────────────

type SvgBuilder = (
  w: number,
  h: number,
  images: Record<string, PreparedImage>,
  logo: PreparedImage | null,
  input: ThemeComposeInput
) => string;

const THEME_BUILDERS: Record<string, SvgBuilder> = {
  'clean-brand': buildCleanBrandSvg,
  'brand-story': buildBrandStorySvg,
  'industrial-campaign': buildIndustrialCampaignSvg,
  'product-hero': buildProductHeroSvg,
  'knowledge-visual': buildKnowledgeVisualSvg,
  'datasheet-frame': buildDatasheetFrameSvg,
  'proof-stack': buildProofStackSvg,
  'launch-banner': buildLaunchBannerSvg,
  'sector-collage': buildSectorCollageSvg,
  'offer-card': buildOfferCardSvg,
  'comparison-board': buildComparisonBoardSvg,
  'premium-editorial': buildPremiumEditorialSvg,
  'guided-auto': buildGuidedAutoSvg,
};

// ── Main composer ────────────────────────────────────────────────────────────

export async function composeThemeImage(input: ThemeComposeInput): Promise<Buffer> {
  const { width, height, themeId } = input;

  const resizedBaseBuffer = await sharp(input.baseImageBuffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const backgroundPlate = await prepareBackgroundPlate(
    input.baseImageBuffer,
    width,
    height,
    input.palette
  );

  const builder = THEME_BUILDERS[themeId];
  if (!builder) {
    return resizedBaseBuffer;
  }

  const schema = THEME_SCHEMAS[themeId];
  const slots = schema?.imageSlots ?? [];
  const effectiveSlotImageBuffers = { ...input.slotImageBuffers };
  // If no explicit hero image was provided, use the AI-generated base image as the
  // hero content. This lets AI + theme work together: AI creates the visual subject,
  // the theme overlay provides structure, text, logo, and layout around it.
  if (slots.some((slot) => slot.id === 'hero') && !effectiveSlotImageBuffers.hero) {
    effectiveSlotImageBuffers.hero = resizedBaseBuffer;
  }

  const preparedImages: Record<string, PreparedImage> = {};
  const logoPromise = prepareLogo(input.primaryLogoBuffer, r(width * 0.14), r(height * 0.09));

  const imagePromises = slots.map(async (slot) => {
    const buf = effectiveSlotImageBuffers[slot.id];
    if (!buf) return;
    const slotW = r(width * slot.width / 100);
    const slotH = r(height * slot.height / 100);
    const isFallbackHero = slot.id === 'hero' && !input.slotImageBuffers[slot.id];
    // For AI-generated fallback hero images use cover (fills frame). For real user-selected
    // product/PDF images use contain so the full product is visible without cropping.
    const prepared = await prepareImage(buf, slotW, slotH, {
      trim: !isFallbackHero,
      fit: isFallbackHero ? 'cover' : 'contain',
    });
    preparedImages[slot.id] = prepared;
  });

  const [logo] = await Promise.all([logoPromise, ...imagePromises]);

  const overlaySvg = softenThemeCanvas(
    builder(width, height, preparedImages, logo, input),
    width,
    height
  );

  return sharp(backgroundPlate)
    .composite([{ input: Buffer.from(overlaySvg), blend: 'over' }])
    .png()
    .toBuffer();
}
