import sharp from 'sharp';
import { deriveStudioPalette } from './theme-palette';

export type AlliancePosterComposeInput = {
  width: number;
  height: number;
  baseImageBuffer: Buffer;
  primaryLogoBuffer?: Buffer | null;
  secondaryLogoBuffers?: Buffer[];
  heroImageBuffer?: Buffer | null;
  headline?: string;
  tagline?: string;
  brandName?: string;
  partnerName?: string;
  partnerTagline?: string;
  featureBullets?: string[];
  footerWebsite?: string;
  footerEmail?: string;
  palette?: string[];
};

type PreparedImage = {
  dataUri: string;
  width: number;
  height: number;
};

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
    .replace(/[\u2022\u00B7â€¢]/g, ' ')
    .replace(/[âœ“âœ”âœ…â˜‘]/g, ' ')
    .replace(/[ðŸ‘‰âžœâž¤âž¡]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function wrapText(text: string, maxChars: number) {
  const normalized = sanitizeDisplayText(text, maxChars * 6);
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

  if (current) {
    lines.push(current);
  }

  return lines;
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

function svg(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

async function prepareBackgroundPlate(
  buffer: Buffer,
  width: number,
  height: number,
  palette?: string[]
) {
  const c = deriveStudioPalette(palette);
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
        <linearGradient id="posterWash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c.bgStart}" stop-opacity="0.50" />
          <stop offset="54%" stop-color="${c.bgEnd}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.14" />
        </linearGradient>
        <radialGradient id="posterGlow" cx="24%" cy="46%" r="52%">
          <stop offset="0%" stop-color="${c.support}" stop-opacity="0.14" />
          <stop offset="100%" stop-color="${c.support}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="posterVignette" cx="50%" cy="50%" r="74%">
          <stop offset="54%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.18" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#posterWash)" />
      <rect width="${width}" height="${height}" fill="url(#posterGlow)" />
      <rect width="${width}" height="${height}" fill="url(#posterVignette)" />
    `
  );

  return sharp(base)
    .composite([{ input: Buffer.from(washSvg), blend: 'over' }])
    .png()
    .toBuffer();
}

async function prepareLogo(buffer: Buffer | null | undefined, width: number, height: number) {
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
  } satisfies PreparedImage;
}

async function prepareHeroImage(
  buffer: Buffer | null | undefined,
  width: number,
  height: number,
  options?: { trim?: boolean; fit?: 'contain' | 'cover' }
) {
  if (!buffer) return null;

  let pipeline = sharp(buffer);
  if (options?.trim) {
    pipeline = pipeline.trim();
  }

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
  } satisfies PreparedImage;
}

function buildAlliancePosterSvg(input: {
  width: number;
  height: number;
  primaryLogo: PreparedImage | null;
  secondaryLogos: PreparedImage[];
  heroImage: PreparedImage | null;
  headline: string;
  tagline: string;
  brandName: string;
  partnerName: string;
  partnerTagline: string;
  featureBullets: string[];
  footerWebsite: string;
  footerEmail: string;
  palette?: string[];
}) {
  const { bgStart, bgEnd, accent, muted } =
    deriveStudioPalette(input.palette);
  const w = input.width;
  const h = input.height;
  const r = Math.round;

  const HEADER_HEIGHT = 0.14;
  const FOOTER_HEIGHT = 0.12;
  const FOOTER_TOP = 1 - FOOTER_HEIGHT;

  const CONTENT_TOP = HEADER_HEIGHT;
  const CONTENT_BOTTOM = FOOTER_TOP;
  const CONTENT_HEIGHT = CONTENT_BOTTOM - CONTENT_TOP;

  const HERO_LEFT = 0.035;
  const HERO_WIDTH = 0.30;
  const HERO_TOP = CONTENT_TOP + 0.04;
  const HERO_BOTTOM = CONTENT_BOTTOM - 0.02;

  const TEXT_LEFT = 0.40;
  const TEXT_WIDTH = 0.56;
  const TEXT_TOP = CONTENT_TOP + 0.03;
  const TEXT_BOTTOM = CONTENT_BOTTOM - 0.02;

  const safeBrandName = sanitizeDisplayText(input.brandName, 32) || 'Brand';
  const safePartnerName = sanitizeDisplayText(input.partnerName, 32);
  const safePartnerTagline = sanitizeDisplayText(input.partnerTagline, 48);
  const safeHeadline = sanitizeDisplayText(
    input.headline || input.brandName || 'Alliance campaign headline',
    84
  );
  const safeTaglineRaw = sanitizeDisplayText(input.tagline || input.partnerName || '', 84);
  const safeTagline =
    safeTaglineRaw &&
    !safeHeadline.toLowerCase().includes(safeTaglineRaw.toLowerCase()) &&
    !safeTaglineRaw.toLowerCase().includes(safeHeadline.toLowerCase())
      ? safeTaglineRaw
      : '';
  const headlineLines = wrapText(safeHeadline, 26).slice(0, 2);
  const taglineLines = wrapText(safeTagline, 30).slice(0, 1);
  const footerLine = [
    sanitizeDisplayText(input.footerWebsite, 48),
    sanitizeDisplayText(input.footerEmail, 48),
  ]
    .filter(Boolean)
    .join('  |  ');

  // ── Header zone: top 15% ──
  const headerH = r(h * HEADER_HEIGHT);

  // Primary logo — frosted glass card top-left
  const logoBoxX = r(w * 0.025);
  const logoBoxY = r(h * 0.025);
  const logoBoxW = r(w * 0.20);
  const logoBoxH = r(h * 0.10);
  const logoAccentW = Math.max(8, r(logoBoxW * 0.055));
  const logoInsetX = logoBoxX + logoAccentW + r(w * 0.010);
  const logoInsetY = logoBoxY + r(h * 0.010);
  const logoInsetW = Math.max(logoBoxW - logoAccentW - r(w * 0.020), r(w * 0.08));
  const logoInsetH = Math.max(logoBoxH - r(h * 0.020), r(h * 0.040));
  const primaryLogoNode = input.primaryLogo
    ? `<g>
        <rect x="${logoBoxX}" y="${logoBoxY}" width="${logoBoxW}" height="${logoBoxH}" rx="16" fill="rgba(4,12,24,0.24)" stroke="rgba(255,255,255,0.12)" />
        <rect x="${logoBoxX}" y="${logoBoxY}" width="${logoAccentW}" height="${logoBoxH}" rx="16" fill="${accent}" fill-opacity="0.92" />
        <rect x="${logoInsetX}" y="${logoInsetY}" width="${logoInsetW}" height="${logoInsetH}" rx="12" fill="rgba(249,251,255,0.97)" />
        <image href="${escapeXml(input.primaryLogo.dataUri)}" x="${logoInsetX + 8}" y="${logoInsetY + 4}" width="${Math.max(logoInsetW - 16, 12)}" height="${Math.max(logoInsetH - 8, 12)}" preserveAspectRatio="xMidYMid meet" />
      </g>`
    : `<g>
        <rect x="${logoBoxX}" y="${logoBoxY}" width="${logoBoxW}" height="${logoBoxH}" rx="16" fill="rgba(4,12,24,0.24)" stroke="rgba(255,255,255,0.12)" />
        <rect x="${logoBoxX}" y="${logoBoxY}" width="${logoAccentW}" height="${logoBoxH}" rx="16" fill="${accent}" fill-opacity="0.92" />
        <rect x="${logoInsetX}" y="${logoInsetY}" width="${logoInsetW}" height="${logoInsetH}" rx="12" fill="rgba(249,251,255,0.97)" />
        <text x="${logoInsetX + r(logoInsetW / 2)}" y="${logoInsetY + r(logoInsetH * 0.62)}" fill="${bgStart}" font-family="Arial,sans-serif" font-size="${r(w * 0.022)}" font-weight="900" text-anchor="middle">${escapeXml(safeBrandName)}</text>
      </g>`;

  // Partner logos — frosted cards top-right
  const secondaryLogoCards = input.secondaryLogos
    .slice(0, 3)
    .map((logo, index) => {
      const logoCount = Math.min(input.secondaryLogos.length, 3);
      const gap = r(w * 0.010);
      const cardW = r(w * 0.085);
      const cardH = r(h * 0.08);
      const accentW = Math.max(6, r(cardW * 0.10));
      const totalW = logoCount * cardW + Math.max(0, logoCount - 1) * gap;
      const startX = r(w * 0.97) - totalW;
      const x = startX + index * (cardW + gap);
      const y = r(h * 0.035);
      return `<g>
        <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="rgba(4,12,24,0.24)" stroke="rgba(255,255,255,0.10)" />
        <rect x="${x}" y="${y}" width="${accentW}" height="${cardH}" rx="12" fill="${accent}" fill-opacity="0.82" />
        <rect x="${x + accentW + 6}" y="${y + 6}" width="${Math.max(cardW - accentW - 12, 10)}" height="${cardH - 12}" rx="8" fill="rgba(249,251,255,0.94)" />
        <image href="${escapeXml(logo.dataUri)}" x="${x + accentW + 10}" y="${y + 8}" width="${Math.max(cardW - accentW - 20, 10)}" height="${cardH - 16}" preserveAspectRatio="xMidYMid meet" />
      </g>`;
    })
    .join('');

  // Partner name as text fallback (only when no partner logos)
  const partnerTextNode = !secondaryLogoCards && safePartnerName
    ? `<g>
        <rect x="${r(w * 0.74)}" y="${r(h * 0.03)}" width="${r(w * 0.23)}" height="${r(h * 0.09)}" rx="14" fill="rgba(4,12,24,0.24)" stroke="rgba(255,255,255,0.10)" />
        <rect x="${r(w * 0.74)}" y="${r(h * 0.03)}" width="${r(w * 0.015)}" height="${r(h * 0.09)}" rx="14" fill="${accent}" fill-opacity="0.82" />
        <text x="${r(w * 0.865)}" y="${r(h * 0.066)}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${r(w * 0.019)}" font-weight="800" text-anchor="middle">${escapeXml(safePartnerName)}</text>
        ${safePartnerTagline ? `<text x="${r(w * 0.865)}" y="${r(h * 0.094)}" fill="rgba(255,255,255,0.66)" font-family="Arial,sans-serif" font-size="${r(w * 0.012)}" font-weight="600" text-anchor="middle">${escapeXml(safePartnerTagline)}</text>` : ''}
      </g>`
    : '';

  // ── Headline — right zone, large white text with drop shadow ──
  const textX = r(w * TEXT_LEFT);
  const headlineFontSize = headlineLines.length >= 2 ? r(w * 0.044) : r(w * 0.050);
  const headlineStep = headlineLines.length >= 2 ? h * 0.074 : h * 0.086;
  const headlineStartY = h * (TEXT_TOP + 0.055);

  const headlineNodes = headlineLines
    .map((line, i) => {
      const y = r(headlineStartY + i * headlineStep);
      return `<text x="${textX}" y="${y}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${headlineFontSize}" font-weight="900" filter="url(#textShadow)" letter-spacing="-0.5">${escapeXml(line)}</text>`;
    })
    .join('');

  // Tagline — accent color, uppercase
  const taglineY = r(headlineStartY + headlineLines.length * headlineStep + h * 0.010);
  const taglineNodes = taglineLines
    .map((line, i) => {
      const y = taglineY + i * r(h * 0.042);
      return `<text x="${textX}" y="${y}" fill="${accent}" font-family="Arial,sans-serif" font-size="${r(w * 0.020)}" font-weight="700" letter-spacing="1.5">${escapeXml(line.toUpperCase())}</text>`;
    })
    .join('');

  // Accent divider line
  const dividerY = taglineLines.length
    ? taglineY + r(h * 0.038)
    : r(headlineStartY + headlineLines.length * headlineStep + h * 0.010);
  const dividerNode = `<rect x="${textX}" y="${dividerY}" width="${r(w * 0.10)}" height="3" rx="1.5" fill="${accent}" fill-opacity="0.75" />`;

  // ── Bullet points with accent checkmark boxes ──
  const headlineHeight = headlineLines.length * 0.065;
  const taglineHeight = taglineLines.length > 0 ? 0.04 : 0;
  const dividerHeight = 0.025;
  const textContentUsed = headlineHeight + taglineHeight + dividerHeight;
  const availableBulletSpace = CONTENT_HEIGHT - textContentUsed - 0.06;
  const BULLET_HEIGHT = 0.085;
  const BULLET_GAP = 0.015;
  const bulletStartY = dividerY + r(h * 0.04);
  const bulletCardH = r(h * BULLET_HEIGHT);
  const bulletGap = r(h * BULLET_GAP);
  const bulletMaxY = r(h * FOOTER_TOP) - r(h * 0.02);
  const maxBulletsFromContent = Math.min(
    4,
    Math.max(0, Math.floor(availableBulletSpace / (BULLET_HEIGHT + BULLET_GAP)))
  );
  const maxBulletsFromRenderedZone = Math.min(
    4,
    Math.max(0, Math.floor((bulletMaxY - bulletStartY + bulletGap) / (bulletCardH + bulletGap)))
  );
  const maxBullets = Math.min(maxBulletsFromContent, maxBulletsFromRenderedZone);
  const bullets = getSafeFeatureBullets(input.featureBullets, maxBullets);
  const bulletFontSize = Math.max(16, r(w * 0.018));
  const boxSize = r(w * 0.028);

  const bulletNodes = bullets
    .map((line, index) => {
      const cardY = bulletStartY + index * (bulletCardH + bulletGap);
      if (cardY + bulletCardH > bulletMaxY) return '';
      const wrapped = wrapText(line, 38).slice(0, 2);
      const cardX = textX - r(w * 0.015);
      const cardW = r(w * 0.50);

      // Checkmark box
      const bx = textX;
      const by = cardY + r(bulletCardH * 0.28);
      const checkPath = [
        `M ${bx + r(boxSize * 0.22)} ${by + r(boxSize * 0.52)}`,
        `L ${bx + r(boxSize * 0.42)} ${by + r(boxSize * 0.72)}`,
        `L ${bx + r(boxSize * 0.78)} ${by + r(boxSize * 0.26)}`,
      ].join(' ');

      const labelX = textX + boxSize + r(w * 0.016);
      const textNodes = wrapped
        .map((chunk, ci) => {
          const lineY = by + r(boxSize * 0.56) + ci * r(bulletFontSize * 1.32);
          return `<text x="${labelX}" y="${lineY}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${bulletFontSize}" font-weight="700">${escapeXml(chunk)}</text>`;
        })
        .join('');

      return `<g>
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${bulletCardH}" rx="14" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
        <rect x="${cardX}" y="${cardY}" width="${r(w * 0.006)}" height="${bulletCardH}" rx="3" fill="${accent}" />
        <rect x="${bx}" y="${by}" width="${boxSize}" height="${boxSize}" rx="6" fill="${accent}" />
        <path d="${checkPath}" fill="none" stroke="rgba(255,255,255,0.96)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${textNodes}
      </g>`;
    })
    .filter(Boolean)
    .join('');

  // ── Hero product card — left side with shadow ──
  const heroCardX = r(w * HERO_LEFT);
  const heroCardY = r(h * HERO_TOP);
  const heroCardW = r(w * HERO_WIDTH);
  const heroCardH = r(h * (HERO_BOTTOM - HERO_TOP));
  const heroNode = input.heroImage
    ? `<g>
      <defs>
        <clipPath id="allianceHeroClip">
          <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="24" />
        </clipPath>
      </defs>
      <ellipse cx="${heroCardX + r(heroCardW * 0.5)}" cy="${heroCardY + heroCardH - r(h * 0.01)}" rx="${r(heroCardW * 0.38)}" ry="${r(h * 0.035)}" fill="rgba(0,0,0,0.28)" />
      <rect x="${heroCardX + 6}" y="${heroCardY + 8}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(0,0,0,0.16)" />
      <rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(245,249,255,0.94)" stroke="rgba(255,255,255,0.50)" stroke-width="2" />
      <image href="${escapeXml(input.heroImage.dataUri)}" x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#allianceHeroClip)" />
    </g>`
    : `<rect x="${heroCardX}" y="${heroCardY}" width="${heroCardW}" height="${heroCardH}" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" stroke-width="1" />`;

  // ── Footer bar ──
  const footerBarY = r(h * FOOTER_TOP);
  const footerBarH = r(h * FOOTER_HEIGHT);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="textShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.50)" /></filter>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgStart}" stop-opacity="0.88" />
      <stop offset="100%" stop-color="${bgStart}" stop-opacity="0.60" />
    </linearGradient>
    <linearGradient id="footerGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${bgStart}" stop-opacity="0.92" />
      <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0.80" />
    </linearGradient>
  </defs>

  <!-- Header band -->
  <rect width="${w}" height="${headerH}" fill="url(#headerGrad)" />
  <rect y="${headerH}" width="${w}" height="3" fill="${accent}" fill-opacity="0.85" />

  <!-- Right text zone — subtle semi-transparent panel -->
  <rect x="${r(w * (TEXT_LEFT - 0.015))}" y="${r(h * TEXT_TOP)}" width="${r(w * (TEXT_WIDTH + 0.015))}" height="${r(h * (TEXT_BOTTOM - TEXT_TOP))}" rx="22" fill="rgba(0,0,0,0.18)" />

  <!-- Logos -->
  ${primaryLogoNode}
  ${secondaryLogoCards}
  ${partnerTextNode}

  <!-- Hero product card -->
  ${heroNode}

  <!-- Headline and tagline -->
  ${headlineNodes}
  ${taglineNodes}
  ${dividerNode}

  <!-- Bullet points -->
  ${bulletNodes}

  <!-- Footer bar -->
  <rect x="0" y="${footerBarY}" width="${w}" height="${footerBarH}" fill="url(#footerGrad)" />
  <rect x="0" y="${footerBarY}" width="${w}" height="2" fill="${accent}" fill-opacity="0.70" />
  <text x="${r(w * 0.50)}" y="${footerBarY + r(footerBarH * 0.62)}" fill="#ffffff" fill-opacity="0.85" font-family="Arial,sans-serif" font-size="${r(w * 0.016)}" font-weight="600" text-anchor="middle">${escapeXml(footerLine || safeBrandName)}</text>
</svg>
  `.trim();
}

export async function composeAlliancePoster(input: AlliancePosterComposeInput) {
  const heroSourceBuffer = input.heroImageBuffer || input.baseImageBuffer;
  const backgroundPlate = await prepareBackgroundPlate(
    input.baseImageBuffer,
    input.width,
    input.height,
    input.palette
  );

  const [primaryLogo, heroImage, ...secondaryLogos] = await Promise.all([
    prepareLogo(input.primaryLogoBuffer, Math.round(input.width * 0.18), Math.round(input.height * 0.09)),
    prepareHeroImage(heroSourceBuffer, Math.round(input.width * 0.30), Math.round(input.height * 0.68), {
      trim: Boolean(input.heroImageBuffer),
      fit: 'cover',
    }),
    ...((input.secondaryLogoBuffers || []).slice(0, 3).map((buffer) =>
      prepareLogo(buffer, Math.round(input.width * 0.075), Math.round(input.height * 0.065))
    )),
  ]);

  const svg = buildAlliancePosterSvg({
    width: input.width,
    height: input.height,
    primaryLogo,
    secondaryLogos: secondaryLogos.filter(Boolean) as PreparedImage[],
    heroImage,
    headline: input.headline || '',
    tagline: input.tagline || '',
    brandName: input.brandName || '',
    partnerName: input.partnerName || '',
    partnerTagline: input.partnerTagline || '',
    featureBullets: (input.featureBullets || []).filter(Boolean),
    footerWebsite: input.footerWebsite || '',
    footerEmail: input.footerEmail || '',
    palette: input.palette,
  });

  return sharp(backgroundPlate)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toBuffer();
}
