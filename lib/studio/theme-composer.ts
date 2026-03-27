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
    .modulate({ brightness: 0.88, saturation: 1.15 })
    .blur(2.5)
    .png()
    .toBuffer();

  const washSvg = svg(
    width,
    height,
    `
      <defs>
        <linearGradient id="themeWash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.55" />
          <stop offset="58%" stop-color="${c.bgEnd}" stop-opacity="0.40" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.18" />
        </linearGradient>
        <radialGradient id="themeGlow" cx="22%" cy="28%" r="56%">
          <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.16" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="themeSupport" cx="82%" cy="84%" r="36%">
          <stop offset="0%" stop-color="${c.support}" stop-opacity="0.10" />
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
      const targetOpacity = fullCanvasRectIndex === 1 ? '0.55' : '0.65';

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

// ── Shared header & bullet helpers ──────────────────────────────────────────

function buildStandardHeaderBand(
  w: number,
  h: number,
  logo: PreparedImage | null,
  brandName: string,
  c: ReturnType<typeof deriveColors>,
  gradientId: string
): string {
  const r = Math.round;
  const headerH = r(h * 0.14);
  const logoX = r(w * 0.04);
  const logoY = r(h * 0.025);
  const logoW = r(w * 0.16);
  const logoH = r(h * 0.09);
  const safeName = sanitizeDisplayText(brandName, 32) || 'Brand';

  const logoNode = logo
    ? `<rect x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" rx="10" fill="rgba(255,255,255,0.92)" />
       <image href="${escapeXml(logo.dataUri)}" x="${logoX + 6}" y="${logoY + 5}" width="${logoW - 12}" height="${logoH - 10}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${r(w * 0.06)}" y="${r(h * 0.08)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.026)}" font-weight="900">${escapeXml(safeName)}</text>`;

  return `<rect width="${w}" height="${headerH}" fill="url(#${gradientId})" />
    <rect y="${headerH}" width="${w}" height="3" fill="${c.accent}" />
    ${logoNode}`;
}

function buildStandardBulletCards(
  bullets: string[],
  startX: number,
  startY: number,
  cardWidth: number,
  w: number,
  h: number,
  accentColor: string
): string {
  const r = Math.round;
  const maxBullets = Math.min(bullets.length, 4);
  const cardSpacing = h * 0.072;
  const cardH = r(h * 0.058);
  const stripeW = r(w * 0.006);
  const fontSize = r(w * 0.015);
  const maxChars = 48;

  return bullets.slice(0, maxBullets).map((b, i) => {
    const cardY = r(startY + i * cardSpacing);
    const truncated = sanitizeDisplayText(b, maxChars);
    if (!truncated) return '';
    return `<rect x="${r(startX)}" y="${cardY}" width="${r(cardWidth)}" height="${cardH}" rx="10" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.10)" />
      <rect x="${r(startX)}" y="${cardY}" width="${stripeW}" height="${cardH}" rx="3" fill="${accentColor}" fill-opacity="0.88" />
      <text x="${r(startX + stripeW + w * 0.012)}" y="${cardY + r(cardH * 0.62)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(truncated)}</text>`;
  }).join('');
}

// ── SVG builders per theme ───────────────────────────────────────────────────

function buildCleanBrandSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = fitTextLines(input.headline || safeBrandName || 'Your Headline', [14, 16, 18, 20], 3);
  const tagline = fitTextLines(input.tagline || '', [26, 30, 34], 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const heroImg = images['hero'];
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);
  const headlineFont = headline.length > 2 ? r(w * 0.042) : r(w * 0.050);
  const headlineStep = headline.length > 2 ? h * 0.072 : h * 0.085;

  const heroNode = heroImg
    ? `<defs><clipPath id="cbHeroClip"><rect x="${r(w * 0.60)}" y="${r(h * 0.16)}" width="${r(w * 0.35)}" height="${r(h * 0.70)}" rx="20" /></clipPath></defs>
       <rect x="${r(w * 0.59)}" y="${r(h * 0.15)}" width="${r(w * 0.37)}" height="${r(h * 0.72)}" rx="20" fill="rgba(255,255,255,0.95)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.60)}" y="${r(h * 0.16)}" width="${r(w * 0.35)}" height="${r(h * 0.70)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cbHeroClip)" />`
    : '';

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.30 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" letter-spacing="-0.5" filter="url(#cbShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.56 + i * h * 0.042)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.020)}" font-weight="700" letter-spacing="1.2">${escapeXml(line.toUpperCase())}</text>`)
    .join('');

  const bulletStartY = h * 0.56 + tagline.length * h * 0.042 + h * 0.035;

  return svg(w, h, `
    <defs>
      <filter id="cbShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="cbHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.90" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.80" />
      </linearGradient>
      <linearGradient id="cbFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.88" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'cbHeader')}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#cbFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <!-- Left text panel (semi-transparent) -->
    <rect x="0" y="${r(h * 0.155)}" width="${r(w * 0.56)}" height="${r(h * 0.695)}" fill="rgba(0,0,0,0.18)" />
    ${heroNode}
    <!-- Accent line -->
    <rect x="${r(w * 0.06)}" y="${r(h * 0.24)}" width="${r(w * 0.08)}" height="4" rx="2" fill="${c.accent}" />
    ${headlineNodes}
    ${taglineNodes}
    ${buildStandardBulletCards(bullets, r(w * 0.05), r(bulletStartY), r(w * 0.46), w, h, c.accent)}
    <!-- Highlight chip -->
    <rect x="${r(w * 0.06)}" y="${r(h * 0.82)}" width="${r(w * 0.24)}" height="${r(h * 0.058)}" rx="${r(h * 0.029)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.18)}" y="${r(h * 0.856)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="800" letter-spacing="1.3" text-anchor="middle">BRAND FOCUS</text>
    <!-- Footer text -->
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.85" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildBrandStorySvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = fitTextLines(input.headline || safeBrandName || 'Our Story', [16, 18, 20, 22], 3);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 4);
  const heroImg = images['hero'];
  const headlineFont = headline.length > 2 ? r(w * 0.038) : r(w * 0.046);
  const headlineStep = headline.length > 2 ? h * 0.065 : h * 0.078;
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);

  const cx = r(w * 0.24);
  const cy = r(h * 0.52);
  const radius = r(Math.min(w * 0.18, h * 0.35));

  const heroNode = heroImg
    ? `<circle cx="${cx}" cy="${cy}" r="${radius + 5}" fill="${c.accent}" fill-opacity="0.30" />
       <circle cx="${cx}" cy="${cy}" r="${radius + 2}" fill="rgba(255,255,255,0.12)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" clip-path="url(#storyCircle)" preserveAspectRatio="xMidYMid slice" />`
    : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.30 + i * headlineStep)}" fill="#ffffff" font-family="Georgia,serif" font-size="${headlineFont}" font-weight="900" filter="url(#storyShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.56 + i * h * 0.038)}" fill="#ffffff" fill-opacity="0.70" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="500" filter="url(#storyShadow)">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="storyShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <clipPath id="storyCircle"><circle cx="${cx}" cy="${cy}" r="${radius}" /></clipPath>
      <linearGradient id="storyHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.88" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.70" />
      </linearGradient>
      <linearGradient id="storyFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'storyHeader')}
    <!-- Right text panel (semi-transparent) -->
    <rect x="${r(w * 0.50)}" y="${r(h * 0.155)}" width="${r(w * 0.47)}" height="${r(h * 0.695)}" rx="20" fill="rgba(0,0,0,0.18)" />
    <!-- Hero circle (left) -->
    ${heroNode}
    <!-- Category label -->
    <text x="${r(w * 0.52)}" y="${r(h * 0.22)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" letter-spacing="2">OUR STORY</text>
    <!-- Accent line -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.24)}" width="${r(w * 0.08)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.80" />
    ${headlineNodes}
    <!-- Accent divider -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.52)}" width="${r(w * 0.10)}" height="2" rx="1" fill="${c.accent}" fill-opacity="0.55" />
    ${taglineNodes}
    <!-- CTA button -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.74)}" width="${r(w * 0.20)}" height="${r(h * 0.055)}" rx="${r(h * 0.028)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.62)}" y="${r(h * 0.775)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="800" letter-spacing="1.1" text-anchor="middle">STORY HIGHLIGHT</text>
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#storyFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildIndustrialCampaignSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 36);
  const headline = fitTextLines(input.headline || safeBrandName || 'Campaign Headline', [14, 16, 18, 20], 3);
  const tagline = fitTextLines(input.tagline || '', [26, 30, 34], 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const footerWebsite = firstSafeLine(input.footerWebsite, safeBrandName, 46);
  const footerEmail = firstSafeLine(input.footerEmail, '', 34);
  const footerLeft = footerWebsite || safeBrandName;
  const footerRight = footerEmail || '';

  // Hero card — product showcase with subtle shadow
  const heroCardX = r(w * 0.035);
  const heroCardY = r(h * 0.19);
  const heroCardW = r(w * 0.31);
  const heroCardH = r(h * 0.62);
  const heroNode = heroImg
    ? `<ellipse cx="${heroCardX + r(heroCardW * 0.48)}" cy="${heroCardY + heroCardH - r(h * 0.015)}" rx="${r(heroCardW * 0.38)}" ry="${r(h * 0.035)}" fill="rgba(7,16,34,0.34)" />
       <rect x="${heroCardX + 6}" y="${heroCardY + 8}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(0,0,0,0.18)" />
       <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(245,249,255,0.94)" stroke="rgba(255,255,255,0.55)" stroke-width="2" />
       <rect x="${heroCardX + 12}" y="${heroCardY + 12}" width="${heroCardW - 24}" height="${heroCardH - 24}" rx="20" fill="url(#heroShellGlow)" />
       <clipPath id="indHeroClip"><rect x="${heroCardX + 18}" y="${heroCardY + 16}" width="${heroCardW - 36}" height="${heroCardH - 34}" rx="18" /></clipPath>
       <image href="${escapeXml(heroImg.dataUri)}" x="${heroCardX + 18}" y="${heroCardY + 16}" width="${heroCardW - 36}" height="${heroCardH - 34}" preserveAspectRatio="xMidYMid slice" clip-path="url(#indHeroClip)" />`
    : `<ellipse cx="${heroCardX + r(heroCardW * 0.48)}" cy="${heroCardY + heroCardH - r(h * 0.015)}" rx="${r(heroCardW * 0.34)}" ry="${r(h * 0.032)}" fill="rgba(7,16,34,0.28)" />
       <rect x="${heroCardX + 6}" y="${heroCardY + 8}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(0,0,0,0.14)" />
       <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(255,255,255,0.10)" stroke="${c.muted}" stroke-opacity="0.28" />
       <text x="${heroCardX + r(heroCardW / 2)}" y="${heroCardY + r(heroCardH * 0.52)}" fill="rgba(255,255,255,0.78)" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" text-anchor="middle">PRODUCT VISUAL</text>`;

  // Right side — headline and bullet region (no opaque panel, text directly on background)
  const textPanelX = r(w * 0.405);
  const textPanelY = r(h * 0.19);
  const textPanelW = r(w * 0.56);
  const textPanelH = r(h * 0.62);
  const textX = r(w * 0.455);
  const headlineFontSize = headline.length >= 3 ? r(w * 0.041) : r(w * 0.050);
  const headlineStep = headline.length >= 3 ? h * 0.072 : h * 0.086;
  const headlineY = h * 0.245;

  const headlineNodes = headline
    .map((line, i) => `<text x="${textX}" y="${r(headlineY + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFontSize}" font-weight="900" letter-spacing="-0.8" filter="url(#textShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineY = headlineY + headline.length * headlineStep + h * 0.005;
  const taglineNodes = tagline
    .map((line, i) => `<text x="${textX}" y="${r(taglineY + i * h * 0.042)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="700" letter-spacing="1.7">${escapeXml(line.toUpperCase())}</text>`)
    .join('');

  const accentRails = [0, 1, 2]
    .map((i) => {
      const y = r(h * (0.205 + i * 0.018));
      return `<line x1="${r(w * 0.45)}" y1="${y}" x2="${r(w * 0.935)}" y2="${y}" stroke="rgba(255,255,255,0.10)" stroke-width="1.5" />`;
    })
    .join('');

  const energyLines = [0, 1, 2, 3]
    .map((i) => {
      const y = r(h * (0.28 + i * 0.082));
      return `<path d="M ${r(w * 0.18)} ${y} C ${r(w * 0.33)} ${y - 12}, ${r(w * 0.56)} ${y + 10}, ${r(w * 0.90)} ${y - 4}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="${i === 0 ? 3 : 2}" stroke-linecap="round" />`;
    })
    .join('');

  const bulletStartY = taglineY + tagline.length * h * 0.042 + h * 0.065;

  return svg(w, h, `
    <defs>
      <filter id="textShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="indTopBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.80" />
      </linearGradient>
      <linearGradient id="indFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.95" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.90" />
      </linearGradient>
      <linearGradient id="indTextPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.48" />
        <stop offset="100%" stop-color="#061019" stop-opacity="0.78" />
      </linearGradient>
      <linearGradient id="heroShellGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.18)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.02)" />
      </linearGradient>
      <radialGradient id="indHeroGlow" cx="26%" cy="48%" r="34%">
        <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="${c.accent}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="indRightGlow" cx="78%" cy="24%" r="28%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="rgba(2,8,20,0.02)" />
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'indTopBar')}
    <rect x="${r(w * 0.24)}" y="${r(h * 0.050)}" width="${r(w * 0.012)}" height="${r(h * 0.072)}" transform="skewX(-18)" fill="rgba(255,255,255,0.22)" />
    <rect x="${r(w * 0.26)}" y="${r(h * 0.050)}" width="${r(w * 0.008)}" height="${r(h * 0.072)}" transform="skewX(-18)" fill="${c.accent}" fill-opacity="0.92" />
    <rect x="${r(w * 0.76)}" y="${r(h * 0.028)}" width="${r(w * 0.012)}" height="${r(h * 0.082)}" transform="skewX(-18)" fill="rgba(255,255,255,0.20)" />
    <rect x="${r(w * 0.78)}" y="${r(h * 0.028)}" width="${r(w * 0.008)}" height="${r(h * 0.082)}" transform="skewX(-18)" fill="${c.accent}" fill-opacity="0.95" />
    <rect x="${r(w * 0.91)}" y="${r(h * 0.028)}" width="${r(w * 0.012)}" height="${r(h * 0.082)}" transform="skewX(-18)" fill="rgba(255,255,255,0.20)" />
    <rect x="${r(w * 0.93)}" y="${r(h * 0.028)}" width="${r(w * 0.008)}" height="${r(h * 0.082)}" transform="skewX(-18)" fill="${c.accent}" fill-opacity="0.95" />
    <rect x="0" y="${r(h * 0.17)}" width="${w}" height="${r(h * 0.68)}" fill="url(#indHeroGlow)" />
    <rect x="0" y="${r(h * 0.17)}" width="${w}" height="${r(h * 0.68)}" fill="url(#indRightGlow)" />
    ${energyLines}
    ${accentRails}
    <rect y="${h - r(h * 0.085)}" width="${w}" height="${r(h * 0.085)}" fill="url(#indFooter)" />
    <rect y="${h - r(h * 0.085)}" width="${w}" height="2" fill="${c.accent}" />
    <text x="${r(w * 0.05)}" y="${h - r(h * 0.030)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" fill-opacity="0.88">${escapeXml(footerLeft)}</text>
    ${footerRight ? `<text x="${r(w * 0.95)}" y="${h - r(h * 0.030)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="end" fill-opacity="0.88">${escapeXml(footerRight)}</text>` : ''}
    <rect x="${textPanelX}" y="${textPanelY}" width="${textPanelW}" height="${textPanelH}" rx="24" fill="url(#indTextPanel)" stroke="rgba(255,255,255,0.10)" />
    <rect x="${textPanelX}" y="${textPanelY}" width="${r(w * 0.010)}" height="${textPanelH}" rx="5" fill="${c.accent}" fill-opacity="0.75" />
    ${heroNode}
    ${headlineNodes}
    <rect x="${textX}" y="${r(taglineY - h * 0.024)}" width="${r(w * 0.13)}" height="4" rx="2" fill="${c.accent}" />
    ${taglineNodes}
    ${buildStandardBulletCards(bullets, r(textX - w * 0.018), r(bulletStartY), r(w * 0.46), w, h, c.accent)}
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
    ? `<defs><clipPath id="phHeroClip"><rect x="${r(w * 0.585)}" y="${r(h * 0.145)}" width="${r(w * 0.31)}" height="${r(h * 0.69)}" rx="24" /></clipPath></defs>
       <rect x="${r(w * 0.575)}" y="${r(h * 0.13)}" width="${r(w * 0.33)}" height="${r(h * 0.72)}" rx="28" fill="rgba(255,255,255,0.94)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.585)}" y="${r(h * 0.145)}" width="${r(w * 0.31)}" height="${r(h * 0.69)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#phHeroClip)" />`
    : `<rect x="${r(w * 0.575)}" y="${r(h * 0.13)}" width="${r(w * 0.33)}" height="${r(h * 0.72)}" rx="28" fill="${c.accent}" fill-opacity="0.10" stroke="${c.accent}" stroke-opacity="0.25" stroke-width="2" />`;

  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const footerLine = firstSafeLine(input.footerWebsite || input.footerEmail, safeBrandName, 52);
  const bulletStartY = h * 0.62;

  return svg(w, h, `
    <defs>
      <filter id="phShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="phHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.82" />
      </linearGradient>
      <linearGradient id="phTextPanel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.58" />
        <stop offset="100%" stop-color="${c.bgStart}" stop-opacity="0.38" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'phHeader')}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.085)}" width="${w}" height="${r(h * 0.085)}" fill="url(#phHeader)" />
    <rect y="${h - r(h * 0.085)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <!-- Left text panel (semi-transparent) -->
    <rect x="0" y="${r(h * 0.155)}" width="${r(w * 0.56)}" height="${r(h * 0.695)}" fill="url(#phTextPanel)" />
    ${heroNode}
    <text x="${r(w * 0.06)}" y="${r(h * 0.245)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="700" letter-spacing="2.5">PRODUCT SPOTLIGHT</text>
    <rect x="${r(w * 0.06)}" y="${r(h * 0.26)}" width="${r(w * 0.08)}" height="3" rx="2" fill="${c.accent}" />
    ${headline.map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.325 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" letter-spacing="-0.5" filter="url(#phShadow)">${escapeXml(line)}</text>`).join('')}
    ${tagline.map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.548 + i * h * 0.042)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${taglineFont}" font-weight="700" letter-spacing="1.2">${escapeXml(line.toUpperCase())}</text>`).join('')}
    ${buildStandardBulletCards(bullets, r(w * 0.05), r(bulletStartY), r(w * 0.46), w, h, c.accent)}
    <rect x="${r(w * 0.06)}" y="${r(h * 0.836)}" width="${r(w * 0.225)}" height="${r(h * 0.063)}" rx="${r(h * 0.031)}" fill="${c.accent}" />
    <text x="${r(w * 0.173)}" y="${r(h * 0.877)}" fill="rgba(255,255,255,0.96)" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" text-anchor="middle">Learn More</text>
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.030)}" fill="#ffffff" fill-opacity="0.85" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
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
    ? `<defs><clipPath id="kvHeroClip"><rect x="${r(w * 0.05)}" y="${r(h * 0.10)}" width="${r(w * 0.42)}" height="${r(h * 0.78)}" rx="16" /></clipPath></defs>
       <rect x="${r(w * 0.04)}" y="${r(h * 0.08)}" width="${r(w * 0.44)}" height="${r(h * 0.82)}" rx="16" fill="rgba(255,255,255,0.88)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.05)}" y="${r(h * 0.10)}" width="${r(w * 0.42)}" height="${r(h * 0.78)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#kvHeroClip)" />`
    : '';

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.54)}" y="${r(h * 0.28 + i * h * 0.062)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(headlineFont * 1.15)}" font-weight="900" letter-spacing="-0.3" filter="url(#kvShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.54)}" y="${r(h * 0.50 + i * h * 0.038)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" letter-spacing="1.2">${escapeXml(line.toUpperCase())}</text>`)
    .join('');

  const bulletNodes = bullets
    .map((line, i) => {
      const wrapped = fitTextLines(line, [22, 24, 26], 2);
      const y = r(h * (0.62 + i * 0.095));
      const boxSize = r(w * 0.028);
      return `<g>
        <rect x="${r(w * 0.54)}" y="${r(y - h * 0.012)}" width="${r(w * 0.42)}" height="${r(h * 0.072)}" rx="12" fill="rgba(6,16,30,0.30)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${r(w * 0.54)}" y="${r(y - h * 0.012)}" width="${r(w * 0.006)}" height="${r(h * 0.072)}" rx="3" fill="${c.accent}" fill-opacity="0.88" />
        <rect x="${r(w * 0.555)}" y="${y}" width="${boxSize}" height="${boxSize}" rx="6" fill="${c.accent}" />
        <text x="${r(w * 0.555) + boxSize / 2}" y="${y + boxSize * 0.72}" fill="rgba(255,255,255,0.96)" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="900" text-anchor="middle">${i + 1}</text>
        ${wrapped.map((chunk, idx) => `<text x="${r(w * 0.595)}" y="${y + boxSize * 0.72 + idx * r(h * 0.032)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${bulletFont}" font-weight="700">${escapeXml(chunk)}</text>`).join('')}
      </g>`;
    })
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="kvShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="kvHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.75" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.62" />
      </linearGradient>
      <linearGradient id="kvRightPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.75" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.62" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'kvHeader')}
    <!-- Left image showcase -->
    ${heroNode}
    <!-- Right text panel (semi-transparent) -->
    <rect x="${r(w * 0.50)}" y="0" width="${r(w * 0.50)}" height="${h}" fill="url(#kvRightPanel)" />
    <!-- Header accent line on right panel -->
    <rect x="${r(w * 0.50)}" y="0" width="4" height="${h}" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.54)}" y="${r(h * 0.175)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="700" letter-spacing="2">KNOWLEDGE BRIEF</text>
    <rect x="${r(w * 0.54)}" y="${r(h * 0.19)}" width="${r(w * 0.08)}" height="3" rx="2" fill="${c.accent}" />
    ${headlineNodes}
    ${taglineNodes}
    ${bulletNodes}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.875)}" width="${r(w * 0.18)}" height="${r(h * 0.058)}" rx="10" fill="${c.accent}" />
    <text x="${r(w * 0.63)}" y="${r(h * 0.912)}" fill="rgba(255,255,255,0.96)" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">Read Brief</text>
    <text x="${r(w * 0.75)}" y="${r(h * 0.97)}" fill="#ffffff" fill-opacity="0.60" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="500" text-anchor="middle">${escapeXml(firstSafeLine(input.footerWebsite, safeBrandName, 40))}</text>
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
    ? `<defs><clipPath id="dsHeroClip"><rect x="${r(w * 0.06)}" y="${r(h * 0.10)}" width="${r(w * 0.30)}" height="${r(h * 0.76)}" rx="14" /></clipPath></defs>
       <rect x="${r(w * 0.05)}" y="${r(h * 0.09)}" width="${r(w * 0.32)}" height="${r(h * 0.78)}" rx="14" fill="rgba(255,255,255,0.92)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.06)}" y="${r(h * 0.10)}" width="${r(w * 0.30)}" height="${r(h * 0.76)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#dsHeroClip)" />`
    : '';

  const headlineFontDs = headline.length > 1 ? r(w * 0.032) : r(w * 0.038);
  return svg(w, h, `
    <defs>
      <filter id="dsShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="dsHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.94" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
      <linearGradient id="dsRightPanel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.70" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.60" />
      </linearGradient>
    </defs>
    <!-- Header bar spanning full width -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'dsHeader')}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.085)}" width="${w}" height="${r(h * 0.085)}" fill="url(#dsHeader)" />
    <rect y="${h - r(h * 0.085)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.55" />
    <!-- Left product showcase -->
    ${heroNode}
    <!-- Right text panel (semi-transparent) -->
    <rect x="${r(w * 0.41)}" y="${r(h * 0.095)}" width="${r(w * 0.59)}" height="${r(h * 0.820)}" fill="url(#dsRightPanel)" />
    <text x="${r(w * 0.78)}" y="${r(h * 0.062)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.012)}" font-weight="700" letter-spacing="2" text-anchor="middle">TECHNICAL SPECS</text>
    <!-- Headline and tagline -->
    ${headline.map((line, i) => `<text x="${r(w * 0.44)}" y="${r(h * 0.175 + i * h * 0.055)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFontDs}" font-weight="900" letter-spacing="-0.3" filter="url(#dsShadow)">${escapeXml(line)}</text>`).join('')}
    <rect x="${r(w * 0.44)}" y="${r(h * 0.165 + headline.length * h * 0.055)}" width="${r(w * 0.08)}" height="3" rx="2" fill="${c.accent}" />
    ${tagline.map((line, i) => `<text x="${r(w * 0.44)}" y="${r(h * 0.24 + headline.length * h * 0.055 + i * h * 0.035)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" letter-spacing="1.2">${escapeXml(line.toUpperCase())}</text>`).join('')}
    ${[0, 1, 2, 3].map((i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = r(w * (0.42 + col * 0.27));
      const by = r(h * (0.40 + row * 0.24));
      const cardText = fitTextLines(bullets[i] || `Key product detail ${i + 1}`, [18, 20, 22], 3);
      const boxSize = r(w * 0.030);
      const checkPath = [
        `M ${bx + Math.round(boxSize * 0.22)} ${by + Math.round(boxSize * 0.52)}`,
        `L ${bx + Math.round(boxSize * 0.42)} ${by + Math.round(boxSize * 0.72)}`,
        `L ${bx + Math.round(boxSize * 0.78)} ${by + Math.round(boxSize * 0.26)}`,
      ].join(' ');
      return `<g>
        <rect x="${bx}" y="${by}" width="${r(w * 0.245)}" height="${r(h * 0.200)}" rx="14" fill="rgba(255,255,255,0.08)" stroke="${c.accent}" stroke-opacity="0.30" stroke-width="1" />
        <rect x="${bx}" y="${by}" width="${r(w * 0.007)}" height="${r(h * 0.200)}" rx="4" fill="${c.accent}" />
        <rect x="${bx + 12}" y="${by + 12}" width="${boxSize}" height="${boxSize}" rx="6" fill="${c.accent}" />
        <path d="${checkPath}" fill="none" stroke="rgba(255,255,255,0.96)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${cardText.map((line, idx) => `<text x="${bx + 16}" y="${by + 56 + idx * r(h * 0.032)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700">${escapeXml(line)}</text>`).join('')}
      </g>`;
    }).join('')}
    <!-- Footer text -->
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.030)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="600" text-anchor="middle">${escapeXml(firstSafeLine(input.footerWebsite || input.footerEmail, input.brandName || '', 52))}</text>
  `);
}

function buildProofStackSvg(w: number, h: number, _images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = fitTextLines(input.headline || 'Proven Results', [18, 20, 22], 2);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 3);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const headlineFont = headline.length > 1 ? r(w * 0.042) : r(w * 0.050);
  const headlineStep = headline.length > 1 ? h * 0.075 : h * 0.088;
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);
  const proofStartY = h * 0.20;

  const headlineNodes = headline
    .map((line, idx) => `<text x="${r(w * 0.56)}" y="${r(h * 0.30 + idx * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" filter="url(#proofShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.50 + i * h * 0.040)}" fill="#ffffff" fill-opacity="0.70" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="500" filter="url(#proofShadow)">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="proofShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="proofHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.88" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.70" />
      </linearGradient>
      <linearGradient id="proofFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'proofHeader')}
    <!-- Right text zone -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.155)}" width="${r(w * 0.45)}" height="${r(h * 0.695)}" rx="18" fill="rgba(0,0,0,0.18)" />
    <!-- Category label -->
    <rect x="${r(w * 0.56)}" y="${r(h * 0.20)}" width="${r(w * 0.18)}" height="${r(h * 0.042)}" rx="${r(h * 0.021)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.65)}" y="${r(h * 0.228)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" text-anchor="middle" letter-spacing="1.5">PROVEN RESULTS</text>
    ${headlineNodes}
    <!-- Accent divider -->
    <rect x="${r(w * 0.56)}" y="${r(h * 0.46)}" width="${r(w * 0.10)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.70" />
    ${taglineNodes}
    <!-- CTA button -->
    <rect x="${r(w * 0.56)}" y="${r(h * 0.66)}" width="${r(w * 0.20)}" height="${r(h * 0.058)}" rx="${r(h * 0.029)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.66)}" y="${r(h * 0.696)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="middle">View Results</text>
    <!-- Left proof cards -->
    ${buildStandardBulletCards(bullets, r(w * 0.04), r(proofStartY), r(w * 0.44), w, h, c.accent)}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#proofFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildLaunchBannerSvg(w: number, h: number, _images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = fitTextLines(input.headline || 'Launching Soon', [20, 22, 24, 26], 3);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 2);
  const headlineFont = headline.length > 2 ? r(w * 0.044) : r(w * 0.054);
  const headlineStep = headline.length > 2 ? h * 0.082 : h * 0.10;
  const taglineFont = tagline.length > 1 ? r(w * 0.021) : r(w * 0.024);
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.36 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" letter-spacing="-0.5" filter="url(#launchShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.06)}" y="${r(h * 0.62 + i * h * 0.040)}" fill="#ffffff" fill-opacity="0.72" font-family="Arial,sans-serif" font-size="${taglineFont}" font-weight="500" filter="url(#launchShadow)">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="launchShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="launchHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.90" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.72" />
      </linearGradient>
      <linearGradient id="launchFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'launchHeader')}
    <!-- Launch mode badge -->
    <rect x="${r(w * 0.76)}" y="${r(h * 0.035)}" width="${r(w * 0.20)}" height="${r(h * 0.055)}" rx="${r(h * 0.028)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.86)}" y="${r(h * 0.072)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" text-anchor="middle" letter-spacing="1.5">LAUNCH MODE</text>
    <!-- Left text zone (semi-transparent) -->
    <rect x="0" y="${r(h * 0.155)}" width="${r(w * 0.58)}" height="${r(h * 0.695)}" fill="rgba(0,0,0,0.18)" />
    <!-- Accent line -->
    <rect x="${r(w * 0.06)}" y="${r(h * 0.26)}" width="${r(w * 0.10)}" height="4" rx="2" fill="${c.accent}" fill-opacity="0.85" />
    <!-- Category label -->
    <text x="${r(w * 0.06)}" y="${r(h * 0.30)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" letter-spacing="2">COMING SOON</text>
    ${headlineNodes}
    ${taglineNodes}
    <!-- CTA button -->
    <rect x="${r(w * 0.06)}" y="${r(h * 0.72)}" width="${r(w * 0.24)}" height="${r(h * 0.065)}" rx="${r(h * 0.033)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.18)}" y="${r(h * 0.760)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">Get Notified</text>
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#launchFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildSectorCollageSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = wrapText(input.headline || safeBrandName || 'Our Sectors', 24).slice(0, 2);
  const tagline = wrapText(input.tagline || '', 28).slice(0, 1);
  const bullets = getSafeFeatureBullets(input.featureBullets, 3);

  const panels = ['panel-1', 'panel-2', 'panel-3'];
  const panelNodes = panels.map((pid, i) => {
    const px = r(w * (0.03 + i * 0.32));
    const py = r(h * 0.20);
    const pw = r(w * 0.30);
    const ph = r(h * 0.48);
    const img = images[pid];
    const caption = wrapText(bullets[i] || ['Energy efficiency', 'Power quality', 'Smart control'][i], 16).slice(0, 2);
    const imgNode = img
      ? `<image href="${escapeXml(img.dataUri)}" x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" clip-path="url(#secPanel${i}Clip)" />`
      : '';
    const captionH = r(h * 0.13);
    const captionY = py + ph - captionH;
    return `<defs><clipPath id="secPanel${i}Clip"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14" /></clipPath></defs>
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14" fill="rgba(255,255,255,0.06)" />
      ${imgNode}
      <rect x="${px}" y="${captionY}" width="${pw}" height="${captionH}" fill="${c.bgStart}" fill-opacity="0.78" clip-path="url(#secPanel${i}Clip)" />
      ${caption.map((line, idx) => `<text x="${px + 18}" y="${captionY + r(h * 0.04) + idx * r(h * 0.035)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" filter="url(#secTextShadow)">${escapeXml(line)}</text>`).join('')}`;
  }).join('');

  const sectorLabels = (bullets.length > 0 ? bullets : ['Power factor improvement', 'Power quality support', 'Controller integration'])
    .slice(0, 3);
  const labelNodes = sectorLabels
    .map((label, i) => {
      const dotX = r(w * (0.09 + i * 0.32));
      const labelX = r(w * (0.09 + i * 0.32) + w * 0.018);
      const ly = r(h * 0.78);
      const lines = wrapText(label, 20).slice(0, 2);
      return `<circle cx="${dotX}" cy="${ly - r(h * 0.005)}" r="${r(w * 0.006)}" fill="${c.accent}" fill-opacity="0.92" />` +
        lines
          .map((line, idx) => `<text x="${labelX}" y="${ly + idx * r(h * 0.032)}" fill="#ffffff" fill-opacity="0.82" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(line)}</text>`)
          .join('');
    })
    .join('');

  const footerY = h - r(h * 0.10);
  return svg(w, h, `
    <defs>
      <filter id="secTextShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="secTopBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.82" />
      </linearGradient>
      <linearGradient id="secFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.95" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.90" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="rgba(2,8,20,0.02)" />
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'secTopBar')}
    ${headline.map((line, i) => `<text x="${r(w * 0.50)}" y="${r(h * 0.065 + i * h * 0.050)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.042)}" font-weight="900" text-anchor="middle" filter="url(#secTextShadow)">${escapeXml(line)}</text>`).join('')}
    ${tagline[0] ? `<text x="${r(w * 0.50)}" y="${r(h * 0.135)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="700" text-anchor="middle" fill-opacity="0.95">${escapeXml(tagline[0])}</text>` : ''}
    ${panelNodes}
    ${labelNodes}
    <rect y="${footerY}" width="${w}" height="${r(h * 0.10)}" fill="url(#secFooter)" />
    <rect y="${footerY}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.90" />
    <text x="${r(w * 0.05)}" y="${footerY + r(h * 0.062)}" fill="#ffffff" fill-opacity="0.85" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(safeBrandName)}</text>
  `);
}

function buildOfferCardSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const heroImg = images['hero'];
  const headline = wrapText(input.headline || 'Special Offer', 24).slice(0, 2);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 2);
  const ctaLabel = 'Learn More';

  /* ── Right-side hero image with frosted card effect ── */
  const heroCardX = r(w * 0.56);
  const heroCardY = r(h * 0.17);
  const heroCardW = r(w * 0.40);
  const heroCardH = r(h * 0.66);
  const heroNode = heroImg
    ? `<defs><clipPath id="ofrHeroClip"><rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" /></clipPath></defs>
       <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ofrHeroClip)" />
       <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" fill="rgba(255,255,255,0.06)" />`
    : `<rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />`;

  /* ── Left-side text zone ── */
  const textPanelX = r(w * 0.04);
  const textPanelY = r(h * 0.17);
  const textPanelW = r(w * 0.48);
  const textPanelH = r(h * 0.66);

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.40 + i * h * 0.075)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.048)}" font-weight="900" filter="url(#ofrTextShadow)"><tspan fill="#ffffff">${escapeXml(line)}</tspan></text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.08)}" y="${r(h * 0.58 + i * h * 0.038)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.020)}" font-weight="700" fill-opacity="0.95">${escapeXml(line)}</text>`)
    .join('');

  /* ── CTA button ── */
  const ctaBtnX = r(w * 0.08);
  const ctaBtnY = r(h * 0.67);
  const ctaBtnW = r(w * 0.22);
  const ctaBtnH = r(h * 0.065);
  const ctaNode = `
    <rect x="${ctaBtnX}" y="${ctaBtnY}" width="${ctaBtnW}" height="${ctaBtnH}" rx="${r(ctaBtnH / 2)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(ctaBtnX + ctaBtnW / 2)}" y="${r(ctaBtnY + ctaBtnH * 0.65)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle">${escapeXml(ctaLabel)}</text>`;

  const footerY = h - r(h * 0.10);
  return svg(w, h, `
    <defs>
      <filter id="ofrTextShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="ofrTopBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.82" />
      </linearGradient>
      <linearGradient id="ofrFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.95" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.90" />
      </linearGradient>
      <linearGradient id="ofrTextPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#061019" stop-opacity="0.72" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="rgba(2,8,20,0.02)" />
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'ofrTopBar')}
    <rect x="${textPanelX}" y="${textPanelY}" width="${textPanelW}" height="${textPanelH}" rx="20" fill="url(#ofrTextPanel)" stroke="rgba(255,255,255,0.08)" />
    <rect x="${textPanelX}" y="${textPanelY}" width="${r(w * 0.008)}" height="${textPanelH}" rx="4" fill="${c.accent}" fill-opacity="0.80" />
    <rect x="${r(w * 0.08)}" y="${r(h * 0.24)}" width="${r(w * 0.16)}" height="${r(h * 0.042)}" rx="${r(h * 0.021)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.16)}" y="${r(h * 0.268)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" text-anchor="middle" letter-spacing="1.5">SPECIAL OFFER</text>
    ${headlineNodes}
    ${taglineNodes}
    ${ctaNode}
    ${heroNode}
    <rect y="${footerY}" width="${w}" height="${r(h * 0.10)}" fill="url(#ofrFooter)" />
    <rect y="${footerY}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.90" />
    <text x="${r(w * 0.05)}" y="${footerY + r(h * 0.062)}" fill="#ffffff" fill-opacity="0.85" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(safeBrandName)}</text>
  `);
}

function buildComparisonBoardSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 28);
  const headline = wrapText(input.headline || 'Compare', 22).slice(0, 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const leftBullets = bullets.slice(0, 2).length ? bullets.slice(0, 2) : ['Improve power factor', 'Reduce wasted energy'];
  const rightBullets = bullets.slice(2, 4).length ? bullets.slice(2, 4) : ['Support automatic networking', 'Built-in protection features'];

  const panels: Array<{ id: string; x: number; label: string }> = [
    { id: 'panel-left', x: 0.04, label: 'Operational Value' },
    { id: 'panel-right', x: 0.52, label: 'Protection & Control' },
  ];

  const panelNodes = panels.map((p) => {
    const px = r(w * p.x);
    const py = r(h * 0.20);
    const pw = r(w * 0.44);
    const ph = r(h * 0.68);
    const img = images[p.id];
    const panelBullets = p.id === 'panel-left' ? leftBullets : rightBullets;
    const labelBarH = r(h * 0.055);
    const imgNode = img
      ? `<rect x="${px + 18}" y="${py + labelBarH + 16}" width="${pw - 36}" height="${r(h * 0.26)}" rx="14" fill="rgba(0,0,0,0.20)" />
         <image href="${escapeXml(img.dataUri)}" x="${px + 24}" y="${py + labelBarH + 22}" width="${pw - 48}" height="${r(h * 0.24)}" preserveAspectRatio="xMidYMid meet" />`
      : '';
    return `<g>
      <!-- Panel background -->
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="18" fill="rgba(6,16,30,0.30)" stroke="rgba(255,255,255,0.10)" />
      <!-- Accent left border -->
      <rect x="${px}" y="${py}" width="${r(w * 0.008)}" height="${ph}" rx="4" fill="${c.accent}" fill-opacity="0.85" />
      <!-- Label bar -->
      <rect x="${px}" y="${py}" width="${pw}" height="${labelBarH}" rx="18" fill="${c.accent}" fill-opacity="0.75" />
      <rect x="${px}" y="${py + labelBarH - 6}" width="${pw}" height="6" fill="${c.accent}" fill-opacity="0.75" />
      <text x="${px + r(w * 0.02)}" y="${py + r(labelBarH * 0.70)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="900">${escapeXml(p.label)}</text>
      ${imgNode}
      ${panelBullets.map((line, idx) => {
        const wrapped = wrapText(line, 22).slice(0, 2);
        const bulletY = py + r(h * (0.50 + idx * 0.13));
        const circR = r(w * 0.016);
        return `<circle cx="${px + r(w * 0.026)}" cy="${bulletY - 4}" r="${circR}" fill="${c.accent}" />
          <text x="${px + r(w * 0.026)}" y="${bulletY + 1}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="900" text-anchor="middle">${idx + 1}</text>
          ${wrapped.map((chunk, wrapIdx) => `<text x="${px + r(w * 0.052)}" y="${bulletY + wrapIdx * r(h * 0.032)}" fill="#ffffff" fill-opacity="0.90" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700" filter="url(#cmpShadow)">${escapeXml(chunk)}</text>`).join('')}`;
      }).join('')}
    </g>`;
  }).join('');

  const headlineFont = headline.length > 1 ? r(w * 0.042) : r(w * 0.052);

  return svg(w, h, `
    <defs>
      <filter id="cmpShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
      </filter>
      <linearGradient id="cmpHeaderBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
      <linearGradient id="cmpFooterBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.90" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'cmpHeaderBar')}
    ${headline.map((line, idx) => `<text x="${r(w * 0.16)}" y="${r(h * 0.058 + idx * h * 0.055)}" fill="#ffffff" fill-opacity="0.97" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" filter="url(#cmpShadow)">${escapeXml(line)}</text>`).join('')}
    <!-- Comparison panels -->
    ${panelNodes}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.075)}" width="${w}" height="${r(h * 0.075)}" fill="url(#cmpFooterBar)" />
    <rect y="${h - r(h * 0.075)}" width="${w}" height="2" fill="${c.accent}" />
    <text x="${r(w * 0.05)}" y="${h - r(h * 0.025)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700">${escapeXml(safeBrandName)}</text>
  `);
}

function buildPremiumEditorialSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = wrapText(input.headline || 'Editorial', 24).slice(0, 3);
  const tagline = wrapText(input.tagline || '', 36).slice(0, 4);
  const headlineFont = headline.length > 2 ? r(w * 0.042) : r(w * 0.050);
  const headlineStep = headline.length > 2 ? h * 0.065 : h * 0.075;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.40)}" y="${r(h * 0.30 + i * headlineStep)}" fill="#ffffff" fill-opacity="0.97" font-family="Georgia,serif" font-size="${headlineFont}" font-weight="900" filter="url(#editShadow)">${escapeXml(line)}</text>`)
    .join('');

  const goldLineY = h * 0.30 + headline.length * headlineStep + h * 0.015;
  const goldLine = `<rect x="${r(w * 0.40)}" y="${r(goldLineY)}" width="${r(w * 0.10)}" height="4" rx="2" fill="${c.accent}" fill-opacity="0.90" />`;

  const taglineY = goldLineY + h * 0.04;
  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.40)}" y="${r(taglineY + i * h * 0.042)}" fill="#ffffff" fill-opacity="0.65" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="700" filter="url(#editShadow)">${escapeXml(line)}</text>`)
    .join('');

  const btnY = taglineY + tagline.length * h * 0.042 + h * 0.04;

  return svg(w, h, `
    <defs>
      <filter id="editShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
      </filter>
      <linearGradient id="editHeaderBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.70" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.50" />
      </linearGradient>
      <linearGradient id="editFooterBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.65" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.50" />
      </linearGradient>
      ${heroImg ? `<clipPath id="editClip"><rect x="${r(w * 0.03)}" y="${r(h * 0.06)}" width="${r(w * 0.30)}" height="${r(h * 0.88)}" rx="18" /></clipPath>` : ''}
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'editHeaderBar')}
    <!-- Hero image (left) -->
    ${heroImg
      ? `<image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.03)}" y="${r(h * 0.06)}" width="${r(w * 0.30)}" height="${r(h * 0.88)}" clip-path="url(#editClip)" preserveAspectRatio="xMidYMid slice" />`
      : `<rect x="${r(w * 0.03)}" y="${r(h * 0.06)}" width="${r(w * 0.30)}" height="${r(h * 0.88)}" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" />`}
    <!-- Accent rule above headline -->
    <rect x="${r(w * 0.40)}" y="${r(h * 0.22)}" width="${r(w * 0.12)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.55" />
    <!-- Headline -->
    ${headlineNodes}
    <!-- Gold accent line -->
    ${goldLine}
    <!-- Tagline -->
    ${taglineNodes}
    <!-- Feature button -->
    <rect x="${r(w * 0.40)}" y="${r(btnY)}" width="${r(w * 0.18)}" height="${r(h * 0.058)}" rx="8" fill="${c.accent}" fill-opacity="0.90" />
    <text x="${r(w * 0.49)}" y="${r(btnY + h * 0.038)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="700" text-anchor="middle" filter="url(#editShadow)">Feature</text>
    <!-- Subtle footer -->
    <rect y="${h - r(h * 0.040)}" width="${w}" height="${r(h * 0.040)}" fill="url(#editFooterBar)" />
    <rect y="${h - r(h * 0.040)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.50" />
  `);
}

function buildGuidedAutoSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const heroImg = images['hero'];
  const safeBrandName = firstSafeLine(input.brandName, 'Brand', 32);
  const headline = wrapText(input.headline || 'Your Visual', 28).slice(0, 2);
  const tagline = wrapText(input.tagline || '', 36).slice(0, 3);

  const heroClipDef = heroImg
    ? `<clipPath id="autoClip"><rect x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.46)}" height="${r(h * 0.92)}" rx="18" /></clipPath>`
    : '';
  const heroNode = heroImg
    ? `<image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.04)}" y="${r(h * 0.04)}" width="${r(w * 0.46)}" height="${r(h * 0.92)}" clip-path="url(#autoClip)" preserveAspectRatio="xMidYMid slice" />`
    : '';

  const headlineFontSize = headline.length > 1 ? r(w * 0.042) : r(w * 0.052);
  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.32 + i * h * 0.08)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${headlineFontSize}" font-weight="900" filter="url(#autoTextShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.56)}" y="${r(h * 0.52 + i * h * 0.042)}" fill="#ffffff" fill-opacity="0.65" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="500" filter="url(#autoTextShadow)">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="autoTextShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="autoHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.75" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.55" />
      </linearGradient>
      ${heroClipDef}
    </defs>
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'autoHeader')}
    ${heroNode}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.04)}" width="${r(w * 0.42)}" height="${r(h * 0.92)}" rx="18" fill="rgba(0,0,0,0.22)" />
    <rect x="${r(w * 0.54)}" y="${r(h * 0.04)}" width="${r(w * 0.42)}" height="3" fill="${c.accent}" />
    ${headlineNodes}
    <rect x="${r(w * 0.56)}" y="${r(h * 0.485)}" width="${r(w * 0.12)}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    ${taglineNodes}
    <rect x="${r(w * 0.54)}" y="${r(h * 0.92)}" width="${r(w * 0.42)}" height="4" fill="${c.accent}" />
    <rect x="${r(w * 0.56)}" y="${r(h * 0.70)}" width="${r(w * 0.16)}" height="${r(h * 0.06)}" rx="8" fill="${c.accent}" />
    <text x="${r(w * 0.64)}" y="${r(h * 0.738)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700" text-anchor="middle">Preview</text>
  `);
}

// ── Hiring Themes ────────────────────────────────────────────────────────────

function buildJobPostingSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Company', 32);
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);
  const headline = fitTextLines(input.headline || 'Open Position', [18, 20, 22, 24], 2);
  const tagline = fitTextLines(input.tagline || '', [28, 32, 36], 3);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const heroImg = images['hero'];
  const headlineFont = headline.length > 1 ? r(w * 0.044) : r(w * 0.054);

  const heroClipDef = heroImg
    ? `<clipPath id="jpHeroClip"><rect x="${r(w * 0.58)}" y="${r(h * 0.18)}" width="${r(w * 0.38)}" height="${r(h * 0.60)}" rx="16" /></clipPath>`
    : '';
  const heroNode = heroImg
    ? `<image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.58)}" y="${r(h * 0.18)}" width="${r(w * 0.38)}" height="${r(h * 0.60)}" clip-path="url(#jpHeroClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="${r(w * 0.58)}" y="${r(h * 0.18)}" width="${r(w * 0.38)}" height="${r(h * 0.60)}" rx="16" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" />`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.05)}" y="${r(h * 0.28 + i * h * 0.08)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" filter="url(#jpTextShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.05)}" y="${r(h * 0.46 + i * h * 0.040)}" fill="#ffffff" fill-opacity="0.65" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="500" filter="url(#jpTextShadow)">${escapeXml(line)}</text>`)
    .join('');

  const bulletStartY = h * 0.58;

  return svg(w, h, `
    <defs>
      <filter id="jpTextShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="jpHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.80" />
      </linearGradient>
      <linearGradient id="jpFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
      ${heroClipDef}
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'jpHeader')}
    <!-- Left text zone -->
    <rect x="${r(w * 0.04)}" y="${r(h * 0.16)}" width="${r(w * 0.50)}" height="${r(h * 0.72)}" rx="18" fill="rgba(0,0,0,0.20)" />
    ${headlineNodes}
    ${taglineNodes}
    ${buildStandardBulletCards(bullets, r(w * 0.05), r(bulletStartY), r(w * 0.46), w, h, c.accent)}
    ${heroNode}
    <!-- CTA button -->
    <rect x="${r(w * 0.05)}" y="${r(h * 0.86)}" width="${r(w * 0.20)}" height="${r(h * 0.06)}" rx="8" fill="${c.accent}" />
    <text x="${r(w * 0.15)}" y="${r(h * 0.898)}" fill="#ffffff" fill-opacity="0.95" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700" text-anchor="middle">Apply Now</text>
    <!-- Footer bar -->
    <rect x="0" y="${r(h * 0.94)}" width="${w}" height="${r(h * 0.06)}" fill="url(#jpFooter)" />
    <rect x="0" y="${r(h * 0.94)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${r(h * 0.978)}" fill="#ffffff" fill-opacity="0.75" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildHiringBannerSvg(w: number, h: number, _images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Company', 32);
  const headline = fitTextLines(input.headline || 'Join Our Team', [16, 18, 20, 22], 2);
  const tagline = fitTextLines(input.tagline || '', [28, 32, 36], 2);
  const headlineFont = headline.length > 1 ? r(w * 0.050) : r(w * 0.060);
  const headlineStep = headline.length > 1 ? h * 0.095 : h * 0.11;
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.50)}" y="${r(h * 0.44 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" text-anchor="middle" letter-spacing="-0.5" filter="url(#hbShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.50)}" y="${r(h * 0.65 + i * h * 0.042)}" fill="#ffffff" fill-opacity="0.72" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="500" text-anchor="middle" filter="url(#hbShadow)">${escapeXml(line)}</text>`)
    .join('');

  return svg(w, h, `
    <defs>
      <filter id="hbShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <linearGradient id="hbHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.90" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.72" />
      </linearGradient>
      <linearGradient id="hbFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'hbHeader')}
    <!-- Center content zone -->
    <rect x="${r(w * 0.12)}" y="${r(h * 0.20)}" width="${r(w * 0.76)}" height="${r(h * 0.62)}" rx="22" fill="rgba(0,0,0,0.20)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <!-- Hiring badge -->
    <rect x="${r(w * 0.32)}" y="${r(h * 0.26)}" width="${r(w * 0.36)}" height="${r(h * 0.058)}" rx="${r(h * 0.029)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.50)}" y="${r(h * 0.298)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.018)}" font-weight="900" text-anchor="middle" letter-spacing="4">WE&apos;RE HIRING</text>
    <!-- Accent line -->
    <rect x="${r(w * 0.44)}" y="${r(h * 0.35)}" width="${r(w * 0.12)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.65" />
    ${headlineNodes}
    ${taglineNodes}
    <!-- CTA button -->
    <rect x="${r(w * 0.34)}" y="${r(h * 0.74)}" width="${r(w * 0.32)}" height="${r(h * 0.065)}" rx="${r(h * 0.033)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.50)}" y="${r(h * 0.780)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="700" text-anchor="middle">View Openings</text>
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#hbFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildTeamSpotlightSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Company', 32);
  const headline = fitTextLines(input.headline || 'Meet the Team', [18, 20, 22], 2);
  const tagline = fitTextLines(input.tagline || '', [22, 26, 30], 3);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const heroImg = images['hero'];
  const headlineFont = headline.length > 1 ? r(w * 0.042) : r(w * 0.050);
  const headlineStep = headline.length > 1 ? h * 0.078 : h * 0.090;
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);

  const cx = r(w * 0.24);
  const cy = r(h * 0.52);
  const radius = r(w * 0.18);

  const heroNode = heroImg
    ? `<circle cx="${cx}" cy="${cy}" r="${radius + 5}" fill="${c.accent}" fill-opacity="0.30" />
       <circle cx="${cx}" cy="${cy}" r="${radius + 2}" fill="rgba(255,255,255,0.10)" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" clip-path="url(#tsCircle)" preserveAspectRatio="xMidYMid slice" />`
    : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.30 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" filter="url(#tsShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.52)}" y="${r(h * 0.50 + i * h * 0.040)}" fill="#ffffff" fill-opacity="0.70" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="500" filter="url(#tsShadow)">${escapeXml(line)}</text>`)
    .join('');

  const bulletStartY = h * 0.60;

  return svg(w, h, `
    <defs>
      <filter id="tsShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <clipPath id="tsCircle"><circle cx="${cx}" cy="${cy}" r="${radius}" /></clipPath>
      <linearGradient id="tsHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.88" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.70" />
      </linearGradient>
      <linearGradient id="tsFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'tsHeader')}
    <!-- Right text zone -->
    <rect x="${r(w * 0.50)}" y="${r(h * 0.155)}" width="${r(w * 0.47)}" height="${r(h * 0.695)}" rx="20" fill="rgba(0,0,0,0.18)" />
    <!-- Hero circle (left) -->
    ${heroNode}
    <!-- Category label -->
    <text x="${r(w * 0.52)}" y="${r(h * 0.22)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" letter-spacing="2">JOIN OUR TEAM</text>
    <!-- Accent line -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.24)}" width="${r(w * 0.08)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.80" />
    ${headlineNodes}
    <!-- Accent divider -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.46)}" width="${r(w * 0.10)}" height="2" rx="1" fill="${c.accent}" fill-opacity="0.55" />
    ${taglineNodes}
    ${buildStandardBulletCards(bullets, r(w * 0.52), r(bulletStartY), r(w * 0.42), w, h, c.accent)}
    <!-- CTA button -->
    <rect x="${r(w * 0.52)}" y="${r(h * 0.86)}" width="${r(w * 0.20)}" height="${r(h * 0.055)}" rx="${r(h * 0.028)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.62)}" y="${r(h * 0.895)}" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="${r(w * 0.015)}" font-weight="700" text-anchor="middle">Join Us</text>
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#tsFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <text x="${r(w * 0.50)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.80" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine)}</text>
  `);
}

function buildCareerGrowthSvg(w: number, h: number, images: Record<string, PreparedImage>, logo: PreparedImage | null, input: ThemeComposeInput) {
  const c = deriveColors(input.palette);
  const safeBrandName = firstSafeLine(input.brandName, 'Company', 32);
  const headline = fitTextLines(input.headline || 'Grow With Us', [18, 20, 22, 24], 2);
  const tagline = fitTextLines(input.tagline || '', [24, 28, 32], 2);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const heroImg = images['hero'];
  const headlineFont = headline.length > 1 ? r(w * 0.042) : r(w * 0.050);
  const headlineStep = headline.length > 1 ? h * 0.078 : h * 0.090;
  const footerLine = firstSafeLine(input.footerWebsite, safeBrandName, 42);

  const heroNode = heroImg
    ? `<ellipse cx="${r(w * 0.76)}" cy="${r(h * 0.85)}" rx="${r(w * 0.16)}" ry="${r(h * 0.030)}" fill="rgba(7,16,34,0.30)" />
       <rect x="${r(w * 0.57)}" y="${r(h * 0.19)}" width="${r(w * 0.38)}" height="${r(h * 0.67)}" rx="20" fill="rgba(245,249,255,0.94)" stroke="rgba(255,255,255,0.50)" stroke-width="2" />
       <image href="${escapeXml(heroImg.dataUri)}" x="${r(w * 0.58)}" y="${r(h * 0.20)}" width="${r(w * 0.36)}" height="${r(h * 0.65)}" clip-path="url(#cgHeroClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="${r(w * 0.57)}" y="${r(h * 0.19)}" width="${r(w * 0.38)}" height="${r(h * 0.67)}" rx="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" />`;

  const headlineNodes = headline
    .map((line, i) => `<text x="${r(w * 0.05)}" y="${r(h * 0.30 + i * headlineStep)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFont}" font-weight="900" letter-spacing="-0.5" filter="url(#cgShadow)">${escapeXml(line)}</text>`)
    .join('');

  const taglineNodes = tagline
    .map((line, i) => `<text x="${r(w * 0.05)}" y="${r(h * 0.48 + i * h * 0.040)}" fill="#ffffff" fill-opacity="0.70" font-family="Arial,sans-serif" font-size="${r(w * 0.017)}" font-weight="500" filter="url(#cgShadow)">${escapeXml(line)}</text>`)
    .join('');

  const benefitDefaults = ['Competitive salary & equity', 'Remote-first flexibility', 'Learning & development budget', 'Health & wellness benefits'];
  const benefitItems = bullets.length > 0 ? bullets : benefitDefaults;
  const benefitStartY = h * 0.56;

  return svg(w, h, `
    <defs>
      <filter id="cgShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)" />
      </filter>
      <clipPath id="cgHeroClip"><rect x="${r(w * 0.58)}" y="${r(h * 0.20)}" width="${r(w * 0.36)}" height="${r(h * 0.65)}" rx="18" /></clipPath>
      <linearGradient id="cgHeader" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.88" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.70" />
      </linearGradient>
      <linearGradient id="cgFooter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.92" />
        <stop offset="100%" stop-color="${c.bgEnd}" stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <!-- Header bar -->
    ${buildStandardHeaderBand(w, h, logo, safeBrandName, c, 'cgHeader')}
    <!-- Left text zone -->
    <rect x="0" y="${r(h * 0.155)}" width="${r(w * 0.54)}" height="${r(h * 0.695)}" fill="rgba(0,0,0,0.15)" />
    <!-- Category label -->
    <text x="${r(w * 0.05)}" y="${r(h * 0.22)}" fill="${c.accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="800" letter-spacing="2">CAREER OPPORTUNITY</text>
    <!-- Accent line -->
    <rect x="${r(w * 0.05)}" y="${r(h * 0.24)}" width="${r(w * 0.08)}" height="3" rx="1.5" fill="${c.accent}" fill-opacity="0.80" />
    ${headlineNodes}
    <!-- Accent divider -->
    <rect x="${r(w * 0.05)}" y="${r(h * 0.44)}" width="${r(w * 0.10)}" height="2" rx="1" fill="${c.accent}" fill-opacity="0.55" />
    ${taglineNodes}
    ${buildStandardBulletCards(benefitItems, r(w * 0.04), r(benefitStartY), r(w * 0.48), w, h, c.accent)}
    <!-- Hero image (right) -->
    ${heroNode}
    <!-- Footer bar -->
    <rect y="${h - r(h * 0.08)}" width="${w}" height="${r(h * 0.08)}" fill="url(#cgFooter)" />
    <rect y="${h - r(h * 0.08)}" width="${w}" height="2" fill="${c.accent}" fill-opacity="0.60" />
    <!-- CTA button in footer -->
    <rect x="${r(w * 0.04)}" y="${h - r(h * 0.065)}" width="${r(w * 0.18)}" height="${r(h * 0.045)}" rx="${r(h * 0.023)}" fill="${c.accent}" fill-opacity="0.92" />
    <text x="${r(w * 0.13)}" y="${h - r(h * 0.036)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.014)}" font-weight="700" text-anchor="middle">Explore Roles</text>
    <text x="${r(w * 0.95)}" y="${h - r(h * 0.028)}" fill="#ffffff" fill-opacity="0.75" font-family="Arial,sans-serif" font-size="${r(w * 0.013)}" font-weight="600" text-anchor="end">${escapeXml(footerLine)}</text>
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
  'job-posting': buildJobPostingSvg,
  'hiring-banner': buildHiringBannerSvg,
  'team-spotlight': buildTeamSpotlightSvg,
  'career-growth': buildCareerGrowthSvg,
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
    // Always use cover so the hero fills the frame without padding/letterboxing.
    const prepared = await prepareImage(buf, slotW, slotH, {
      trim: !isFallbackHero,
      fit: 'cover',
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
