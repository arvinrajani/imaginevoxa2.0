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
  const { bgStart, bgEnd, accent, support, text, footer, headerPanel, surface, muted } =
    deriveStudioPalette(input.palette);
  const width = input.width;
  const height = input.height;

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
  const taglineLines = wrapText(safeTagline, 34).slice(0, 1);
  const bullets = getSafeFeatureBullets(input.featureBullets, 4);
  const footerLine = [
    sanitizeDisplayText(input.footerWebsite, 48),
    sanitizeDisplayText(input.footerEmail, 48),
  ]
    .filter(Boolean)
    .join('  |  ');

  const primaryLogoNode = input.primaryLogo
    ? `<image href="${escapeXml(input.primaryLogo.dataUri)}" x="${Math.round(width * 0.03)}" y="${Math.round(height * 0.032)}" width="${Math.round(width * 0.19)}" height="${Math.round(height * 0.09)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${Math.round(width * 0.045)}" y="${Math.round(height * 0.09)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.03)}" font-weight="800">${escapeXml(safeBrandName)}</text>`;

  const secondaryLogoCards = input.secondaryLogos
    .slice(0, 3)
    .map((logo, index) => {
      const logoCount = input.secondaryLogos.slice(0, 3).length || 1;
      const areaWidth = Math.round(width * 0.19);
      const gap = Math.round(width * 0.008);
      const cardWidth = Math.min(
        Math.round(width * 0.08),
        Math.floor((areaWidth - Math.max(0, logoCount - 1) * gap) / logoCount)
      );
      const cardHeight = Math.round(height * 0.07);
      const totalWidth = logoCount * cardWidth + Math.max(0, logoCount - 1) * gap;
      const startX = Math.round(width * 0.97) - totalWidth;
      const x = startX + index * (cardWidth + gap);
      const y = Math.round(height * 0.036);

      return `<g>
        <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="${surface}" opacity="0.94" />
        <image href="${escapeXml(logo.dataUri)}" x="${x + 8}" y="${y + 6}" width="${cardWidth - 16}" height="${cardHeight - 12}" preserveAspectRatio="xMidYMid meet" />
      </g>`;
    })
    .join('');

  const rightHeaderText = !secondaryLogoCards && safePartnerName
    ? `<text x="${Math.round(width * 0.82)}" y="${Math.round(height * 0.082)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.021)}" font-weight="800" text-anchor="middle">${escapeXml(safePartnerName)}</text>`
    : '';

  const partnerTaglineNode = safePartnerTagline
    ? `<text x="${Math.round(width * 0.835)}" y="${Math.round(height * 0.13)}" fill="${text}" opacity="0.95" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.015)}" font-weight="600" text-anchor="middle">${escapeXml(safePartnerTagline)}</text>`
    : '';
  const partnerHeaderNode =
    secondaryLogoCards || rightHeaderText || partnerTaglineNode
      ? `<rect x="${Math.round(width * 0.76)}" y="${Math.round(height * 0.03)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.11)}" rx="14" fill="${headerPanel}" opacity="0.72" />
  ${secondaryLogoCards}
  ${rightHeaderText}
  ${partnerTaglineNode}`
      : '';

  const headlineNodes = headlineLines
    .map((line, index) => {
      const x = Math.round(width * 0.40);
      const y = Math.round(height * 0.13) + index * Math.round(height * 0.065);
      return `<text x="${x}" y="${y}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.037)}" font-weight="800">${escapeXml(line)}</text>`;
    })
    .join('');

  const taglineNodes = taglineLines
    .map((line, index) => {
      const x = Math.round(width * 0.40);
      const baseY = headlineLines.length > 1 ? Math.round(height * 0.245) : Math.round(height * 0.19);
      const y = baseY + index * Math.round(height * 0.04);
      return `<text x="${x}" y="${y}" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.021)}" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join('');

  const dividerNode = taglineLines.length
    ? `<rect x="${Math.round(width * 0.40)}" y="${Math.round(height * 0.265)}" width="${Math.round(width * 0.12)}" height="4" rx="2" fill="${accent}" fill-opacity="0.8" />`
    : `<rect x="${Math.round(width * 0.40)}" y="${Math.round(height * 0.215)}" width="${Math.round(width * 0.12)}" height="4" rx="2" fill="${accent}" fill-opacity="0.8" />`;

  const bulletStartX = Math.round(width * 0.40);
  const bulletWidth = Math.round(width * 0.55);
  const bulletY = Math.round(height * 0.33);
  const bulletHeight = Math.round(height * 0.105);
  const bulletGap = Math.round(height * 0.022);
  const bulletFontSize = Math.max(16, Math.round(width * 0.017));

  const bulletNodes = bullets
    .map((line, index) => {
      const y = bulletY + index * (bulletHeight + bulletGap);
      const wrapped = wrapText(line, 42).slice(0, 2);
      const textBaseY =
        y +
        Math.round(bulletHeight * 0.48) -
        (wrapped.length > 1 ? Math.round(bulletFontSize * 0.48) : 0);
      const textNodes = wrapped
        .map((chunk, chunkIndex) => {
          const lineY = textBaseY + chunkIndex * Math.round(bulletFontSize * 1.28);
          return `<text x="${bulletStartX + 62}" y="${lineY}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${bulletFontSize}" font-weight="700">${escapeXml(chunk)}</text>`;
        })
        .join('');

      const iconX = bulletStartX + 18;
      const iconY = y + Math.round(bulletHeight * 0.5);
      const checkPath = [
        `M ${iconX - 6} ${iconY}`,
        `L ${iconX - 1} ${iconY + 6}`,
        `L ${iconX + 8} ${iconY - 8}`,
      ].join(' ');

      return `<g>
        <rect x="${bulletStartX}" y="${y}" width="${bulletWidth}" height="${bulletHeight}" rx="${Math.round(bulletHeight * 0.34)}" fill="${bgStart}" fill-opacity="0.22" stroke="${muted}" stroke-opacity="0.14" />
        <circle cx="${iconX}" cy="${iconY}" r="16" fill="${support}" />
        <path d="${checkPath}" fill="none" stroke="${bgStart}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${textNodes}
      </g>`;
    })
    .join('');

  const heroNode = input.heroImage
    ? `<g>
      <defs>
        <clipPath id="allianceHeroClip">
          <rect x="${Math.round(width * 0.055)}" y="${Math.round(height * 0.22)}" width="${Math.round(width * 0.29)}" height="${Math.round(height * 0.56)}" rx="28" />
        </clipPath>
      </defs>
      <ellipse cx="${Math.round(width * 0.20)}" cy="${Math.round(height * 0.81)}" rx="${Math.round(width * 0.15)}" ry="${Math.round(height * 0.05)}" fill="${muted}" opacity="0.18" />
      <path d="M${Math.round(width * 0.045)} ${Math.round(height * 0.83)} H${Math.round(width * 0.33)} L${Math.round(width * 0.28)} ${Math.round(height * 0.96)} H${Math.round(width * 0.03)} Z" fill="${surface}" fill-opacity="0.24" stroke="${muted}" stroke-opacity="0.18" />
      <rect x="${Math.round(width * 0.055)}" y="${Math.round(height * 0.22)}" width="${Math.round(width * 0.29)}" height="${Math.round(height * 0.56)}" rx="28" fill="${surface}" fill-opacity="0.12" stroke="${muted}" stroke-opacity="0.18" />
      <rect x="${Math.round(width * 0.067)}" y="${Math.round(height * 0.24)}" width="${Math.round(width * 0.266)}" height="${Math.round(height * 0.52)}" rx="24" fill="${surface}" fill-opacity="0.06" />
      <image href="${escapeXml(input.heroImage.dataUri)}" x="${Math.round(width * 0.055)}" y="${Math.round(height * 0.22)}" width="${Math.round(width * 0.29)}" height="${Math.round(height * 0.56)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#allianceHeroClip)" />
    </g>`
    : '';

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="posterTint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgStart}" stop-opacity="1" />
      <stop offset="100%" stop-color="${bgEnd}" stop-opacity="1" />
    </linearGradient>
    <linearGradient id="footerFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${footer}" stop-opacity="1" />
      <stop offset="100%" stop-color="${bgEnd}" stop-opacity="1" />
    </linearGradient>
    <radialGradient id="heroGlow" cx="28%" cy="48%" r="44%">
      <stop offset="0%" stop-color="${muted}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#posterTint)" />
  <rect width="${width}" height="${Math.round(height * 0.175)}" fill="${bgStart}" fill-opacity="0.35" />
  <rect y="${height - Math.round(height * 0.084)}" width="${width}" height="${Math.round(height * 0.084)}" fill="url(#footerFill)" />
  <rect y="${Math.round(height * 0.175)}" width="${width}" height="2" fill="${muted}" fill-opacity="0.34" />
  <circle cx="${Math.round(width * 0.24)}" cy="${Math.round(height * 0.50)}" r="${Math.round(width * 0.20)}" fill="url(#heroGlow)" />

  <g opacity="0.18">
    <path d="M${Math.round(width * 0.22)} ${Math.round(height * 0.18)} H${Math.round(width * 0.94)}" stroke="${muted}" stroke-width="2" fill="none" />
    <path d="M${Math.round(width * 0.39)} ${Math.round(height * 0.27)} H${Math.round(width * 0.93)}" stroke="${muted}" stroke-width="1.2" fill="none" />
    <path d="M${Math.round(width * 0.39)} ${Math.round(height * 0.76)} H${Math.round(width * 0.94)}" stroke="${muted}" stroke-width="1.2" fill="none" />
  </g>

  <rect x="${Math.round(width * 0.02)}" y="${Math.round(height * 0.03)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.11)}" rx="14" fill="${surface}" fill-opacity="0.95" />
  ${primaryLogoNode}
  ${partnerHeaderNode}

  ${headlineNodes}
  ${taglineNodes}
  ${dividerNode}
  ${heroNode}
  ${bulletNodes}

  <text x="${Math.round(width * 0.5)}" y="${height - Math.round(height * 0.035)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.018)}" font-weight="700" text-anchor="middle">${escapeXml(footerLine || 'Website  |  Email')}</text>
</svg>
  `.trim();
}

export async function composeAlliancePoster(input: AlliancePosterComposeInput) {
  const heroSourceBuffer = input.heroImageBuffer || input.baseImageBuffer;

  const [primaryLogo, heroImage, ...secondaryLogos] = await Promise.all([
    prepareLogo(input.primaryLogoBuffer, Math.round(input.width * 0.18), Math.round(input.height * 0.09)),
    prepareHeroImage(heroSourceBuffer, Math.round(input.width * 0.29), Math.round(input.height * 0.56), {
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

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}
