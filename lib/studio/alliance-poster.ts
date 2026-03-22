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

function wrapText(text: string, maxChars: number) {
  if (!text) return [];

  const words = text.split(/\s+/);
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

  const headlineLines = wrapText(input.headline || input.brandName || 'Alliance campaign headline', 34).slice(0, 2);
  const taglineLines = wrapText(input.tagline || input.partnerName || '', 26).slice(0, 2);
  const bullets = input.featureBullets.slice(0, 6);

  const heroNode = input.heroImage
    ? `<g>
      <defs>
        <clipPath id="allianceHeroClip">
          <rect x="${Math.round(width * 0.078)}" y="${Math.round(height * 0.28)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.46)}" rx="24" />
        </clipPath>
      </defs>
      <ellipse cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.82)}" rx="${Math.round(width * 0.13)}" ry="${Math.round(height * 0.045)}" fill="${muted}" opacity="0.18" />
      <path d="M${Math.round(width * 0.06)} ${Math.round(height * 0.81)} H${Math.round(width * 0.29)} L${Math.round(width * 0.25)} ${Math.round(height * 0.92)} H${Math.round(width * 0.04)} Z" fill="${surface}" fill-opacity="0.32" stroke="${muted}" stroke-opacity="0.18" />
      <rect x="${Math.round(width * 0.078)}" y="${Math.round(height * 0.28)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.46)}" rx="24" fill="${surface}" fill-opacity="0.34" stroke="${muted}" stroke-opacity="0.14" />
      <image href="${escapeXml(input.heroImage.dataUri)}" x="${Math.round(width * 0.078)}" y="${Math.round(height * 0.28)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.46)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#allianceHeroClip)" />
    </g>`
    : '';

  const primaryLogoNode = input.primaryLogo
    ? `<image href="${escapeXml(input.primaryLogo.dataUri)}" x="${Math.round(width * 0.03)}" y="${Math.round(height * 0.032)}" width="${Math.round(width * 0.19)}" height="${Math.round(height * 0.09)}" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${Math.round(width * 0.045)}" y="${Math.round(height * 0.09)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.034)}" font-weight="800">${escapeXml(input.brandName || 'Brand')}</text>`;

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

  const rightHeaderText = !secondaryLogoCards && input.partnerName
    ? `<text x="${Math.round(width * 0.82)}" y="${Math.round(height * 0.082)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.024)}" font-weight="800" text-anchor="middle">${escapeXml(input.partnerName)}</text>`
    : '';

  const partnerTaglineNode = input.partnerTagline
    ? `<text x="${Math.round(width * 0.835)}" y="${Math.round(height * 0.13)}" fill="${text}" opacity="0.95" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.018)}" font-weight="600" text-anchor="middle">${escapeXml(input.partnerTagline)}</text>`
    : '';

  const headlineNodes = headlineLines
    .map((line, index) => {
      const y = Math.round(height * 0.074) + index * Math.round(height * 0.048);
      return `<text x="${Math.round(width * 0.515)}" y="${y}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.032)}" font-style="italic" font-weight="700" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join('');

  const taglineNodes = taglineLines
    .map((line, index) => {
      const baseY = headlineLines.length > 1 ? Math.round(height * 0.148) : Math.round(height * 0.118);
      const y = baseY + index * Math.round(height * 0.06);
      return `<text x="${Math.round(width * 0.515)}" y="${y}" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.043)}" font-style="italic" font-weight="900" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join('');

  const bulletStartX = Math.round(width * 0.54);
  const bulletWidth = Math.round(width * 0.41);
  const bulletY = Math.round(height * 0.28);
  const bulletHeight = Math.round(height * 0.067);
  const bulletGap = Math.round(height * 0.016);
  const bulletFontSize = Math.max(18, Math.round(width * 0.022));

  const bulletNodes = bullets
    .map((line, index) => {
      const y = bulletY + index * (bulletHeight + bulletGap);
      const wrapped = wrapText(line, 34).slice(0, 2);
      const textBaseY = y + Math.round(bulletHeight * 0.62) - (wrapped.length > 1 ? Math.round(bulletFontSize * 0.35) : 0);
      const textNodes = wrapped
        .map((chunk, chunkIndex) => {
          const lineY = textBaseY + chunkIndex * Math.round(bulletFontSize * 1.08);
          return `<text x="${bulletStartX + 54}" y="${lineY}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${bulletFontSize}" font-style="italic" font-weight="800">${escapeXml(chunk)}</text>`;
        })
        .join('');

      return `<g>
        <rect x="${bulletStartX}" y="${y}" width="${bulletWidth}" height="${bulletHeight}" rx="${Math.round(bulletHeight * 0.42)}" fill="${bgStart}" fill-opacity="0.36" stroke="${muted}" stroke-opacity="0.08" />
        <rect x="${bulletStartX + 12}" y="${y + 8}" width="30" height="30" rx="7" fill="${support}" />
        <text x="${bulletStartX + 27}" y="${y + 30}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" text-anchor="middle">✓</text>
        ${textNodes}
      </g>`;
    })
    .join('');

  const footerLine = [input.footerWebsite, input.footerEmail].filter(Boolean).join('  |  ');

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
  <circle cx="${Math.round(width * 0.26)}" cy="${Math.round(height * 0.46)}" r="${Math.round(width * 0.18)}" fill="url(#heroGlow)" />

  <g opacity="0.24">
    <path d="M${Math.round(width * 0.24)} ${Math.round(height * 0.22)} L${Math.round(width * 0.33)} ${Math.round(height * 0.22)} L${Math.round(width * 0.39)} ${Math.round(height * 0.16)} L${Math.round(width * 0.48)} ${Math.round(height * 0.16)} L${Math.round(width * 0.55)} ${Math.round(height * 0.24)} L${Math.round(width * 0.72)} ${Math.round(height * 0.24)}" stroke="${muted}" stroke-width="2" fill="none" />
    <path d="M${Math.round(width * 0.60)} ${Math.round(height * 0.18)} H${Math.round(width * 0.95)}" stroke="${muted}" stroke-width="2" fill="none" />
    <path d="M${Math.round(width * 0.56)} ${Math.round(height * 0.25)} H${Math.round(width * 0.93)}" stroke="${muted}" stroke-width="1.4" fill="none" />
    <path d="M${Math.round(width * 0.53)} ${Math.round(height * 0.32)} H${Math.round(width * 0.90)}" stroke="${muted}" stroke-width="1.1" fill="none" />
  </g>

  <g opacity="0.18" stroke="${muted}" fill="none">
    <line x1="${Math.round(width * 0.45)}" y1="${Math.round(height * 0.20)}" x2="${Math.round(width * 0.43)}" y2="${Math.round(height * 0.70)}" stroke-width="2" />
    <line x1="${Math.round(width * 0.45)}" y1="${Math.round(height * 0.20)}" x2="${Math.round(width * 0.48)}" y2="${Math.round(height * 0.70)}" stroke-width="2" />
    <line x1="${Math.round(width * 0.80)}" y1="${Math.round(height * 0.22)}" x2="${Math.round(width * 0.78)}" y2="${Math.round(height * 0.72)}" stroke-width="2" />
    <line x1="${Math.round(width * 0.80)}" y1="${Math.round(height * 0.22)}" x2="${Math.round(width * 0.82)}" y2="${Math.round(height * 0.72)}" stroke-width="2" />
  </g>

  <rect x="${Math.round(width * 0.02)}" y="${Math.round(height * 0.03)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.11)}" rx="14" fill="${surface}" fill-opacity="0.95" />
  <rect x="${Math.round(width * 0.76)}" y="${Math.round(height * 0.03)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.11)}" rx="14" fill="${headerPanel}" opacity="0.72" />
  ${primaryLogoNode}
  ${secondaryLogoCards}
  ${rightHeaderText}
  ${partnerTaglineNode}

  ${headlineNodes}
  ${taglineNodes}
  ${heroNode}
  ${bulletNodes}

  <text x="${Math.round(width * 0.5)}" y="${height - Math.round(height * 0.035)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.022)}" font-weight="800" text-anchor="middle">${escapeXml(footerLine || 'Website  |  Email')}</text>
</svg>
  `.trim();
}

export async function composeAlliancePoster(input: AlliancePosterComposeInput) {
  const heroSourceBuffer = input.heroImageBuffer || input.baseImageBuffer;

  const [primaryLogo, heroImage, ...secondaryLogos] = await Promise.all([
    prepareLogo(input.primaryLogoBuffer, Math.round(input.width * 0.18), Math.round(input.height * 0.09)),
    prepareHeroImage(heroSourceBuffer, Math.round(input.width * 0.24), Math.round(input.height * 0.46), {
      trim: Boolean(input.heroImageBuffer),
      fit: input.heroImageBuffer ? 'contain' : 'cover',
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
