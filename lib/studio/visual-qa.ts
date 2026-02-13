type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutZone = Rect & { id?: string };

export type VisualQaInput = {
  canvas?: { width?: number; height?: number };
  logoPlacement?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  logoScale?: number;
  logoRect?: Rect | null;
  textZones?: LayoutZone[];
  brandColors?: string[];
  dominantColors?: string[];
  overlayOpacity?: number | null;
};

export type VisualQaCheck = {
  key: string;
  status: "pass" | "warn" | "fail";
  score: number;
  detail: string;
};

export type VisualQaResult = {
  overallScore: number;
  checks: VisualQaCheck[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCanvas(input: VisualQaInput) {
  const width = clamp(Number(input.canvas?.width || 1200), 320, 4000);
  const height = clamp(Number(input.canvas?.height || 628), 200, 4000);
  return { width, height };
}

function getLogoRect(input: VisualQaInput): Rect {
  if (input.logoRect) {
    return input.logoRect;
  }
  const { width, height } = getCanvas(input);
  const placement = input.logoPlacement || "bottom-right";
  const scale = clamp(input.logoScale || 1, 0.4, 2);
  const baseW = width * 0.1;
  const baseH = height * 0.1;
  const w = baseW * scale;
  const h = baseH * scale;
  const marginX = width * 0.05;
  const marginY = height * 0.05;
  if (placement === "top-left") return { x: marginX, y: marginY, w, h };
  if (placement === "top-right") return { x: width - marginX - w, y: marginY, w, h };
  if (placement === "bottom-left") return { x: marginX, y: height - marginY - h, w, h };
  if (placement === "center") return { x: width / 2 - w / 2, y: height / 2 - h / 2, w, h };
  return { x: width - marginX - w, y: height - marginY - h, w, h };
}

function intersectionArea(a: Rect, b: Rect) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return w * h;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) return null;
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((v) => `${v}${v}`)
          .join("")
      : normalized;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function colorDistance(a: string, b: string) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return 1000;
  return Math.sqrt(
    Math.pow(rgbA.r - rgbB.r, 2) +
      Math.pow(rgbA.g - rgbB.g, 2) +
      Math.pow(rgbA.b - rgbB.b, 2)
  );
}

export function runVisualQaChecks(input: VisualQaInput): VisualQaResult {
  const { width, height } = getCanvas(input);
  const logo = getLogoRect(input);
  const checks: VisualQaCheck[] = [];
  const marginX = width * 0.04;
  const marginY = height * 0.04;

  const inSafeMargin =
    logo.x >= marginX &&
    logo.y >= marginY &&
    logo.x + logo.w <= width - marginX &&
    logo.y + logo.h <= height - marginY;
  checks.push({
    key: "safe_margin",
    status: inSafeMargin ? "pass" : "warn",
    score: inSafeMargin ? 1 : 0.6,
    detail: inSafeMargin
      ? "Logo is within safe margins."
      : "Logo is close to an edge. Use at least 4% margin.",
  });

  const idealMinW = width * 0.08;
  const idealMaxW = width * 0.12;
  const sizeStatus = logo.w >= idealMinW && logo.w <= idealMaxW;
  checks.push({
    key: "logo_size",
    status: sizeStatus ? "pass" : "warn",
    score: sizeStatus ? 1 : 0.65,
    detail: sizeStatus
      ? "Logo size is in recommended range."
      : "Logo should be about 8-12% of canvas width.",
  });

  const textZones = (input.textZones || []).filter((zone) => zone.w > 0 && zone.h > 0);
  let maxOverlapRatio = 0;
  for (const zone of textZones) {
    const overlap = intersectionArea(logo, zone);
    const ratio = overlap / Math.max(1, zone.w * zone.h);
    maxOverlapRatio = Math.max(maxOverlapRatio, ratio);
  }
  const collisionStatus =
    maxOverlapRatio > 0.12 ? "fail" : maxOverlapRatio > 0.02 ? "warn" : "pass";
  checks.push({
    key: "logo_text_collision",
    status: collisionStatus,
    score: collisionStatus === "pass" ? 1 : collisionStatus === "warn" ? 0.6 : 0.2,
    detail:
      collisionStatus === "pass"
        ? "No text overlap detected."
        : collisionStatus === "warn"
          ? "Minor overlap between logo and text zones."
          : "Severe overlap between logo and text zones.",
  });

  if (Array.isArray(input.brandColors) && input.brandColors.length > 0 && Array.isArray(input.dominantColors) && input.dominantColors.length > 0) {
    let bestDistance = Infinity;
    for (const dominant of input.dominantColors) {
      for (const brand of input.brandColors) {
        bestDistance = Math.min(bestDistance, colorDistance(dominant, brand));
      }
    }
    const colorStatus = bestDistance < 45 ? "pass" : bestDistance < 95 ? "warn" : "fail";
    checks.push({
      key: "brand_color_drift",
      status: colorStatus,
      score: colorStatus === "pass" ? 1 : colorStatus === "warn" ? 0.6 : 0.25,
      detail:
        colorStatus === "pass"
          ? "Image palette aligns with brand colors."
          : colorStatus === "warn"
            ? "Partial brand color alignment."
            : "Image colors drift too far from brand palette.",
    });
  }

  if (typeof input.overlayOpacity === "number") {
    const op = clamp(input.overlayOpacity, 0, 1);
    const readable = op >= 0.16 && op <= 0.7;
    checks.push({
      key: "readability_overlay",
      status: readable ? "pass" : "warn",
      score: readable ? 1 : 0.65,
      detail: readable
        ? "Overlay opacity supports text readability."
        : "Overlay opacity may hurt text readability.",
    });
  }

  const numericScores = checks.map((check) => check.score);
  const overallScore =
    numericScores.length > 0
      ? Math.round((numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length) * 100)
      : 0;

  return { overallScore, checks };
}
