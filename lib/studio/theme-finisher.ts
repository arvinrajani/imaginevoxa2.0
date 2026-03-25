import sharp from 'sharp';
import { deriveStudioPalette } from './theme-palette';

export type ThemeBrandFinisherInput = {
  width: number;
  height: number;
  baseImageBuffer: Buffer;
  themeId: string;
  primaryLogoBuffer?: Buffer | null;
  secondaryLogoBuffers?: Buffer[];
  brandName?: string;
  partnerName?: string;
  partnerTagline?: string;
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

function sanitizeDisplayText(value: string | null | undefined, maxLength = 96) {
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

function toDataUri(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function svg(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
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

function buildLogoNode(image: PreparedImage | null, x: number, y: number, width: number, height: number, fallbackText: string, fill: string) {
  if (image) {
    return `<image href="${escapeXml(image.dataUri)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
  }

  const safeFallback = sanitizeDisplayText(fallbackText, 36) || 'Brand';
  return `<text x="${x + width / 2}" y="${y + height / 2 + 7}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, Math.round(width * 0.14))}" font-weight="800" text-anchor="middle">${escapeXml(safeFallback)}</text>`;
}

function buildFooterText(website: string, email: string, brandName: string) {
  const left = sanitizeDisplayText(website, 42) || sanitizeDisplayText(brandName, 32) || '';
  const right = sanitizeDisplayText(email, 42);
  return { left, right };
}

function buildAllianceOverlay(input: {
  width: number;
  height: number;
  primaryLogo: PreparedImage | null;
  secondaryLogos: PreparedImage[];
  brandName: string;
  partnerName: string;
  partnerTagline: string;
  footerWebsite: string;
  footerEmail: string;
  palette?: string[];
}) {
  const { bgStart, bgEnd, accent, support, text, footer, headerPanel, surface, muted } =
    deriveStudioPalette(input.palette);

  const w = input.width;
  const h = input.height;
  const headerH = Math.round(h * 0.135);
  const footerH = Math.round(h * 0.075);
  const leftCardX = Math.round(w * 0.02);
  const leftCardY = Math.round(h * 0.024);
  const leftCardW = Math.round(w * 0.23);
  const leftCardH = Math.round(h * 0.092);
  const rightCardW = Math.round(w * 0.27);
  const rightCardX = w - rightCardW - Math.round(w * 0.02);
  const rightCardY = leftCardY;
  const rightCardH = leftCardH;
  const { left: footerLeft, right: footerRight } = buildFooterText(
    input.footerWebsite,
    input.footerEmail,
    input.brandName
  );
  const safePartnerName = sanitizeDisplayText(input.partnerName, 28);
  const safePartnerTagline = sanitizeDisplayText(input.partnerTagline, 42);
  const logos = input.secondaryLogos.slice(0, 3);
  const logoGap = Math.round(w * 0.008);
  const logoCardH = Math.round(h * 0.056);
  const logoCardY = rightCardY + Math.round(h * 0.012);
  const availableLogoArea = rightCardW - Math.round(w * 0.03);
  const logoCardW = logos.length > 0
    ? Math.min(Math.round(w * 0.09), Math.floor((availableLogoArea - logoGap * Math.max(0, logos.length - 1)) / logos.length))
    : 0;
  const totalLogoWidth = logos.length > 0
    ? logos.length * logoCardW + Math.max(0, logos.length - 1) * logoGap
    : 0;
  const logoStartX = rightCardX + Math.round((rightCardW - totalLogoWidth) / 2);

  const secondaryLogoNodes = logos.map((logo, index) => {
    const cardX = logoStartX + index * (logoCardW + logoGap);
    return `
      <rect x="${cardX}" y="${logoCardY}" width="${logoCardW}" height="${logoCardH}" rx="10" fill="${surface}" fill-opacity="0.98" />
      <image href="${escapeXml(logo.dataUri)}" x="${cardX + 8}" y="${logoCardY + 6}" width="${logoCardW - 16}" height="${logoCardH - 12}" preserveAspectRatio="xMidYMid meet" />
    `;
  }).join('');

  const partnerTextY = logos.length > 0
    ? logoCardY + logoCardH + Math.round(h * 0.02)
    : rightCardY + Math.round(h * 0.045);

  return svg(
    w,
    h,
    `
      <defs>
        <linearGradient id="headerFill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${bgStart}" stop-opacity="0.94" />
          <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0.78" />
        </linearGradient>
        <linearGradient id="footerFill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${footer}" stop-opacity="0.92" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.86" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${w}" height="${headerH}" fill="url(#headerFill)" />
      <rect x="0" y="${h - footerH}" width="${w}" height="${footerH}" fill="url(#footerFill)" />
      <rect x="0" y="${headerH}" width="${w}" height="2" fill="${support}" fill-opacity="0.34" />
      <rect x="${leftCardX}" y="${leftCardY}" width="${leftCardW}" height="${leftCardH}" rx="16" fill="${surface}" fill-opacity="0.98" />
      ${buildLogoNode(
        input.primaryLogo,
        leftCardX + 10,
        leftCardY + 10,
        leftCardW - 20,
        leftCardH - 20,
        input.brandName,
        bgStart
      )}
      <rect x="${rightCardX}" y="${rightCardY}" width="${rightCardW}" height="${rightCardH}" rx="16" fill="${headerPanel}" fill-opacity="0.74" stroke="${muted}" stroke-opacity="0.18" />
      ${secondaryLogoNodes}
      ${safePartnerName ? `<text x="${rightCardX + rightCardW / 2}" y="${partnerTextY}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.021)}" font-weight="800" text-anchor="middle">${escapeXml(safePartnerName)}</text>` : ''}
      ${safePartnerTagline ? `<text x="${rightCardX + rightCardW / 2}" y="${partnerTextY + Math.round(h * 0.034)}" fill="${text}" opacity="0.9" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.0135)}" font-weight="600" text-anchor="middle">${escapeXml(safePartnerTagline)}</text>` : ''}
      ${footerLeft ? `<text x="${Math.round(w * 0.03)}" y="${h - Math.round(footerH * 0.35)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.015)}" font-weight="700">${escapeXml(footerLeft)}</text>` : ''}
      ${footerRight ? `<text x="${w - Math.round(w * 0.03)}" y="${h - Math.round(footerH * 0.35)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.015)}" font-weight="700" text-anchor="end">${escapeXml(footerRight)}</text>` : ''}
    `
  );
}

function buildGenericOverlay(input: {
  width: number;
  height: number;
  primaryLogo: PreparedImage | null;
  secondaryLogos: PreparedImage[];
  brandName: string;
  partnerName: string;
  footerWebsite: string;
  footerEmail: string;
  palette?: string[];
}) {
  const { bgStart, bgEnd, accent, text, headerPanel, surface, muted } =
    deriveStudioPalette(input.palette);
  const w = input.width;
  const h = input.height;
  const logoCardX = Math.round(w * 0.026);
  const logoCardY = Math.round(h * 0.03);
  const logoCardW = Math.round(w * 0.17);
  const logoCardH = Math.round(h * 0.082);
  const badgeW = Math.round(w * 0.14);
  const badgeH = Math.round(h * 0.068);
  const badgeX = w - badgeW - Math.round(w * 0.026);
  const badgeY = logoCardY;
  const { left: footerLeft, right: footerRight } = buildFooterText(
    input.footerWebsite,
    input.footerEmail,
    input.brandName
  );
  const safePartnerName = sanitizeDisplayText(input.partnerName, 22);
  const secondaryLogo = input.secondaryLogos[0] || null;

  return svg(
    w,
    h,
    `
      <defs>
        <linearGradient id="genericFooter" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${bgStart}" stop-opacity="0.86" />
          <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0.72" />
        </linearGradient>
      </defs>
      <rect x="${logoCardX}" y="${logoCardY}" width="${logoCardW}" height="${logoCardH}" rx="16" fill="${surface}" fill-opacity="0.96" />
      ${buildLogoNode(
        input.primaryLogo,
        logoCardX + 8,
        logoCardY + 8,
        logoCardW - 16,
        logoCardH - 16,
        input.brandName,
        bgStart
      )}
      ${(secondaryLogo || safePartnerName) ? `
        <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="14" fill="${headerPanel}" fill-opacity="0.78" stroke="${muted}" stroke-opacity="0.16" />
        ${secondaryLogo
          ? `<image href="${escapeXml(secondaryLogo.dataUri)}" x="${badgeX + 8}" y="${badgeY + 8}" width="${badgeW - 16}" height="${badgeH - 16}" preserveAspectRatio="xMidYMid meet" />`
          : `<text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2 + 6}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.016)}" font-weight="800" text-anchor="middle">${escapeXml(safePartnerName)}</text>`
        }
      ` : ''}
      ${(footerLeft || footerRight) ? `
        <rect x="${Math.round(w * 0.018)}" y="${h - Math.round(h * 0.09)}" width="${Math.round(w * 0.964)}" height="${Math.round(h * 0.062)}" rx="14" fill="url(#genericFooter)" />
        ${footerLeft ? `<text x="${Math.round(w * 0.04)}" y="${h - Math.round(h * 0.048)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.0135)}" font-weight="700">${escapeXml(footerLeft)}</text>` : ''}
        ${footerRight ? `<text x="${w - Math.round(w * 0.04)}" y="${h - Math.round(h * 0.048)}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.0135)}" font-weight="700" text-anchor="end">${escapeXml(footerRight)}</text>` : ''}
      ` : ''}
      <rect x="${Math.round(w * 0.018)}" y="${h - Math.round(h * 0.094)}" width="${Math.round(w * 0.964)}" height="2" fill="${accent}" fill-opacity="0.55" />
    `
  );
}

export async function applyThemeBrandFinisher(input: ThemeBrandFinisherInput) {
  const [primaryLogo, ...secondaryLogos] = await Promise.all([
    prepareLogo(
      input.primaryLogoBuffer,
      Math.round(input.width * 0.18),
      Math.round(input.height * 0.09)
    ),
    ...((input.secondaryLogoBuffers || []).slice(0, 3).map((buffer) =>
      prepareLogo(buffer, Math.round(input.width * 0.1), Math.round(input.height * 0.08))
    )),
  ]);

  const overlay =
    input.themeId === 'alliance-poster'
      ? buildAllianceOverlay({
          width: input.width,
          height: input.height,
          primaryLogo,
          secondaryLogos: secondaryLogos.filter(Boolean) as PreparedImage[],
          brandName: input.brandName || '',
          partnerName: input.partnerName || '',
          partnerTagline: input.partnerTagline || '',
          footerWebsite: input.footerWebsite || '',
          footerEmail: input.footerEmail || '',
          palette: input.palette,
        })
      : buildGenericOverlay({
          width: input.width,
          height: input.height,
          primaryLogo,
          secondaryLogos: secondaryLogos.filter(Boolean) as PreparedImage[],
          brandName: input.brandName || '',
          partnerName: input.partnerName || '',
          footerWebsite: input.footerWebsite || '',
          footerEmail: input.footerEmail || '',
          palette: input.palette,
        });

  return sharp(input.baseImageBuffer)
    .composite([{ input: Buffer.from(overlay), blend: 'over' }])
    .png()
    .toBuffer();
}
