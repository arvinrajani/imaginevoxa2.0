export type BlendMode =
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "luminosity"
  | "color-dodge"
  | "normal";

export type LogoBlendSpec = {
  logoUrl: string;
  blendMode?: BlendMode;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  padding?: number;
  placement?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
};

export type BlendOptions = {
  canvasWidth?: number;
  canvasHeight?: number;
  baseImageUrl: string;
  logo: LogoBlendSpec;
  overlayColor?: string;
  overlayOpacity?: number;
};

const PLACEMENT_DEFAULTS: Record<
  NonNullable<LogoBlendSpec["placement"]>,
  { xPct: number; yPct: number }
> = {
  "top-left": { xPct: 0.04, yPct: 0.04 },
  "top-right": { xPct: 0.78, yPct: 0.04 },
  "bottom-left": { xPct: 0.04, yPct: 0.78 },
  "bottom-right": { xPct: 0.78, yPct: 0.78 },
  center: { xPct: 0.4, yPct: 0.4 },
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildBlendedSvg(options: BlendOptions): string {
  const W = options.canvasWidth ?? 1200;
  const H = options.canvasHeight ?? 628;

  const logoSpec = options.logo;
  const blendMode: BlendMode = logoSpec.blendMode ?? "normal";
  const logoOpacity = logoSpec.opacity ?? 1;
  const logoScale = logoSpec.scale ?? 1;
  const logoPadding = logoSpec.padding ?? 0;

  const logoW = Math.round((logoSpec.width ?? Math.round(W * 0.18)) * logoScale);
  const logoH = Math.round((logoSpec.height ?? Math.round(H * 0.18)) * logoScale);

  let logoX: number;
  let logoY: number;

  if (logoSpec.placement) {
    const pos = PLACEMENT_DEFAULTS[logoSpec.placement];
    logoX = Math.round(W * pos.xPct + logoPadding);
    logoY = Math.round(H * pos.yPct + logoPadding);
  } else {
    logoX = logoSpec.x ?? Math.round(W * 0.78);
    logoY = logoSpec.y ?? Math.round(H * 0.04);
  }

  const overlayColor = options.overlayColor ?? "rgba(5,8,33,0.55)";
  const overlayOpacity = options.overlayOpacity ?? 0;

  const overlayNode =
    overlayOpacity > 0
      ? `<rect width="100%" height="100%" fill="${overlayColor}" opacity="${overlayOpacity}" />`
      : "";

  const blendFilterId = `blendFilter_${blendMode.replace("-", "_")}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="${blendFilterId}">
      <feBlend in="SourceGraphic" in2="BackgroundImage" mode="${blendMode}" />
    </filter>
  </defs>
  <image
    href="${escapeXml(options.baseImageUrl)}"
    x="0" y="0" width="${W}" height="${H}"
    preserveAspectRatio="xMidYMid slice"
  />
  ${overlayNode}
  <image
    href="${escapeXml(logoSpec.logoUrl)}"
    x="${logoX}" y="${logoY}"
    width="${logoW}" height="${logoH}"
    preserveAspectRatio="xMidYMid meet"
    opacity="${logoOpacity}"
    style="mix-blend-mode: ${blendMode};"
  />
</svg>`.trim();

  return svg;
}

export function getBlendPresets(): Array<{
  id: BlendMode;
  label: string;
  description: string;
}> {
  return [
    { id: "normal", label: "Standard", description: "Logo overlaid at full opacity" },
    { id: "multiply", label: "Multiply", description: "Darkens where logo is dark — great on light backgrounds" },
    { id: "screen", label: "Screen", description: "Lightens where logo is light — great on dark backgrounds" },
    { id: "overlay", label: "Overlay", description: "Combines multiply and screen for natural contrast" },
    { id: "soft-light", label: "Soft Light", description: "Subtle, diffused blending — premium look" },
    { id: "luminosity", label: "Luminosity", description: "Preserves image hue, uses logo brightness" },
    { id: "color-dodge", label: "Color Dodge", description: "Brightens image under logo for a glowing effect" },
  ];
}
