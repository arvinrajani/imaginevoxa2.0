type LayoutZone = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  align?: "left" | "center" | "right";
  padding?: number;
};

type LayoutSpec = {
  width: number;
  height: number;
  backgroundColor?: string;
  zones: LayoutZone[];
  logoZoneId?: string;
};

type TextBlock = {
  id: string;
  type: "label" | "title" | "meta" | "cta";
  text: string;
  zoneId?: string;
};

type BannerSpec = {
  style: "none" | "top" | "bottom" | "full";
  color?: string;
  opacity?: number;
  heightPct?: number;
};

type BaseTransform = {
  scale?: number;
  x?: number;
  y?: number;
};

type FilterSettings = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
};

type TextStyleOverride = {
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  color?: string;
};

type TextStyleMap = Record<string, TextStyleOverride | undefined>;

const DEFAULT_LAYOUT: LayoutSpec = {
  width: 1200,
  height: 628,
  zones: [
    { id: "label", x: 0.06, y: 0.08, w: 0.4, h: 0.12, align: "left", padding: 12 },
    { id: "title", x: 0.06, y: 0.24, w: 0.7, h: 0.36, align: "left", padding: 12 },
    { id: "meta", x: 0.06, y: 0.62, w: 0.5, h: 0.1, align: "left", padding: 10 },
    { id: "cta", x: 0.06, y: 0.74, w: 0.5, h: 0.1, align: "left", padding: 10 },
    { id: "logo", x: 0.78, y: 0.06, w: 0.16, h: 0.16, align: "right", padding: 6 },
  ],
  logoZoneId: "logo",
};

const TYPE_STYLES: Record<string, { fontSize: number; fontWeight: number; letterSpacing: number }> = {
  label: { fontSize: 28, fontWeight: 600, letterSpacing: 1 },
  title: { fontSize: 58, fontWeight: 700, letterSpacing: 0.4 },
  meta: { fontSize: 30, fontWeight: 500, letterSpacing: 0.2 },
  cta: { fontSize: 28, fontWeight: 600, letterSpacing: 0.6 },
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const wrapText = (text: string, maxChars: number) => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
};

const resolveZone = (layout: LayoutSpec, block: TextBlock, index: number) => {
  if (block.zoneId) {
    return layout.zones.find((zone) => zone.id === block.zoneId);
  }
  const fallbackIds = ["label", "title", "meta", "cta"];
  const fallback = fallbackIds[index] || "title";
  return layout.zones.find((zone) => zone.id === fallback) || layout.zones[0];
};

export function composeSvg(params: {
  baseImageUrl: string;
  textBlocks: TextBlock[];
  layoutSpec?: LayoutSpec | null;
  logoUrl?: string | null;
  palette?: string[];
  fontFamily?: string;
  logoScale?: number;
  logoPadding?: number;
  banner?: BannerSpec;
  overlayColor?: string;
  overlayOpacity?: number;
  baseTransform?: BaseTransform;
  filters?: FilterSettings;
  textStyles?: TextStyleMap;
}) {
  const layout = params.layoutSpec || DEFAULT_LAYOUT;
  const palette = params.palette && params.palette.length > 0 ? params.palette : ["#ffffff", "#0A66C2"];
  const primary = palette[0];
  const accent = palette[1] || "#0A66C2";
  const fontFamily = params.fontFamily || "Inter, system-ui, sans-serif";

  const overlayColor = params.overlayColor || layout.backgroundColor || "rgba(5, 8, 33, 0.55)";
  const overlayOpacity = typeof params.overlayOpacity === "number" ? params.overlayOpacity : 0.12;
  const overlay = `<rect width="100%" height="100%" fill="${overlayColor}" opacity="${overlayOpacity}" />`;
  const baseScale = params.baseTransform?.scale ?? 1;
  const baseOffsetX = params.baseTransform?.x ?? 0;
  const baseOffsetY = params.baseTransform?.y ?? 0;
  const baseWidth = Math.round(layout.width * baseScale);
  const baseHeight = Math.round(layout.height * baseScale);
  const baseX = Math.round((layout.width - baseWidth) / 2 + baseOffsetX * layout.width);
  const baseY = Math.round((layout.height - baseHeight) / 2 + baseOffsetY * layout.height);
  const brightness = params.filters?.brightness ?? 1;
  const contrast = params.filters?.contrast ?? 1;
  const saturation = params.filters?.saturation ?? 1;
  const blur = params.filters?.blur ?? 0;
  const baseStyle = `filter: brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px);`;

  const textNodes = params.textBlocks.map((block, index) => {
    const zone = resolveZone(layout, block, index);
    if (!zone) return "";
    const baseStyle = TYPE_STYLES[block.type] || TYPE_STYLES.title;
    const override = params.textStyles?.[block.type] || {};
    const style = {
      fontSize: override.fontSize ?? baseStyle.fontSize,
      fontWeight: override.fontWeight ?? baseStyle.fontWeight,
      letterSpacing: override.letterSpacing ?? baseStyle.letterSpacing,
    };
    const maxChars = block.type === "title" ? 26 : 32;
    const lines = wrapText(block.text, maxChars);
    const fontSize = style.fontSize;
    const lineHeight = Math.round(fontSize * 1.2);
    const x = Math.round(layout.width * zone.x + (zone.padding || 0));
    const yStart = Math.round(layout.height * zone.y + (zone.padding || 0) + fontSize);

    const fill =
      override.color ||
      (block.type === "label" ? accent : primary);
    const anchor = zone.align === "center" ? "middle" : zone.align === "right" ? "end" : "start";
    const xAnchor = anchor === "middle"
      ? Math.round(layout.width * (zone.x + zone.w / 2))
      : anchor === "end"
        ? Math.round(layout.width * (zone.x + zone.w) - (zone.padding || 0))
        : x;

    const tspans = lines
      .map((line, lineIndex) => {
        const y = yStart + lineIndex * lineHeight;
        return `<tspan x="${xAnchor}" y="${y}">${escapeXml(line)}</tspan>`;
      })
      .join("");

    return `<text fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${style.fontWeight}" letter-spacing="${style.letterSpacing}" text-anchor="${anchor}">${tspans}</text>`;
  });

  const logoZone = layout.logoZoneId
    ? layout.zones.find((zone) => zone.id === layout.logoZoneId)
    : layout.zones.find((zone) => zone.id === "logo");
  const logoScale = typeof params.logoScale === "number" ? params.logoScale : 1;
  const logoPadding = typeof params.logoPadding === "number" ? params.logoPadding : logoZone?.padding || 0;
  let logoNode = "";
  if (logoZone && params.logoUrl) {
    const zoneWidth = layout.width * logoZone.w;
    const zoneHeight = layout.height * logoZone.h;
    const logoWidth = Math.round(zoneWidth * logoScale);
    const logoHeight = Math.round(zoneHeight * logoScale);
    const zoneX = layout.width * logoZone.x;
    const zoneY = layout.height * logoZone.y;
    const align = logoZone.align || "right";
    const x =
      align === "center"
        ? Math.round(zoneX + zoneWidth / 2 - logoWidth / 2)
        : align === "right"
          ? Math.round(zoneX + zoneWidth - logoWidth - logoPadding)
          : Math.round(zoneX + logoPadding);
    const y = Math.round(zoneY + logoPadding);
    logoNode = `<image href="${escapeXml(params.logoUrl)}" x="${x}" y="${y}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet" />`;
  }

  const banner = params.banner;
  let bannerNode = "";
  if (banner && banner.style !== "none") {
    const heightPct = typeof banner.heightPct === "number" ? banner.heightPct : 0.22;
    const bannerHeight = Math.round(layout.height * heightPct);
    const bannerColor = banner.color || "rgba(8, 15, 40, 0.8)";
    const bannerOpacity = typeof banner.opacity === "number" ? banner.opacity : 0.5;
    if (banner.style === "full") {
      bannerNode = `<rect width="100%" height="100%" fill="${bannerColor}" opacity="${bannerOpacity}" />`;
    } else if (banner.style === "top") {
      bannerNode = `<rect x="0" y="0" width="100%" height="${bannerHeight}" fill="${bannerColor}" opacity="${bannerOpacity}" />`;
    } else if (banner.style === "bottom") {
      bannerNode = `<rect x="0" y="${layout.height - bannerHeight}" width="100%" height="${bannerHeight}" fill="${bannerColor}" opacity="${bannerOpacity}" />`;
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <defs>
    <linearGradient id="overlayGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A66C2" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#111827" stop-opacity="0.08" />
    </linearGradient>
  </defs>
  <image href="${escapeXml(params.baseImageUrl)}" x="${baseX}" y="${baseY}" width="${baseWidth}" height="${baseHeight}" style="${baseStyle}" preserveAspectRatio="xMidYMid slice" />
  ${overlay}
  ${bannerNode}
  <rect width="100%" height="100%" fill="url(#overlayGradient)" />
  ${logoNode}
  ${textNodes.join("\n")}
</svg>
  `.trim();

  return svg;
}

export function getDefaultLayoutSpec() {
  return DEFAULT_LAYOUT;
}
