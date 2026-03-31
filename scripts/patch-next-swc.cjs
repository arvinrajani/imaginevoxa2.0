/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Patch Next.js 16.x build bugs for Windows and Vercel compatibility.
 *
 * 1. Windows SWC binary rejects undefined values in serverComponents/serverActions.
 * 2. generate-build-id.js calls config.generateBuildId without checking if it exists,
 *    causing "generate is not a function" on build.
 *
 * Run via the "postinstall" npm script.
 */

const fs = require("fs");
const path = require("path");

// ── Patch 1: SWC options (Windows) ──────────────────────────────────────────

const OPTIONS_FILE = path.join(
  __dirname,
  "..",
  "node_modules",
  "next",
  "dist",
  "build",
  "swc",
  "options.js"
);

if (fs.existsSync(OPTIONS_FILE)) {
  let src = fs.readFileSync(OPTIONS_FILE, "utf8");
  let patched = false;

  const scOld =
    `serverComponents: serverComponents && !jest ? {
            isReactServerLayer,
            cacheComponentsEnabled: isCacheComponents,
            useCacheEnabled,
            taintEnabled,
            pageExtensions: pageExtensions || []
        } : undefined,`;

  const scNew =
    `serverComponents: serverComponents && !jest ? {
            isReactServerLayer: isReactServerLayer ?? false,
            cacheComponentsEnabled: isCacheComponents ?? false,
            useCacheEnabled: useCacheEnabled ?? false,
            taintEnabled: taintEnabled ?? false,
            pageExtensions: pageExtensions || []
        } : false,`;

  if (src.includes(scOld)) {
    src = src.replace(scOld, scNew);
    patched = true;
  }

  const saOld = `            useCacheEnabled,
            hashSalt: serverReferenceHashSalt,`;

  const saNew = `            useCacheEnabled: useCacheEnabled ?? false,
            hashSalt: serverReferenceHashSalt || '',`;

  if (src.includes(saOld)) {
    src = src.replace(saOld, saNew);
    patched = true;
  }

  const saOld2 = `        serverActions: isAppRouterPagesLayer && !jest ? {
            isReactServerLayer,
            isDevelopment: development,`;

  const saNew2 = `        serverActions: isAppRouterPagesLayer && !jest ? {
            isReactServerLayer: isReactServerLayer ?? false,
            isDevelopment: development ?? false,`;

  if (src.includes(saOld2)) {
    src = src.replace(saOld2, saNew2);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(OPTIONS_FILE, src, "utf8");
    console.log("[patch-next-swc] Patched SWC options for Windows compatibility");
  } else {
    console.log("[patch-next-swc] SWC options already patched or source changed – skipping");
  }
}

// ── Patch 2: generate-build-id.js (crashes when config.generateBuildId is undefined) ─

const BUILD_ID_FILES = [
  path.join(__dirname, "..", "node_modules", "next", "dist", "build", "generate-build-id.js"),
  path.join(__dirname, "..", "node_modules", "next", "dist", "esm", "build", "generate-build-id.js"),
];

const BAD_LINE = "let buildId = await generate();";
const FIXED_LINE = "let buildId = typeof generate === 'function' ? await generate() : null;";

for (const file of BUILD_ID_FILES) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(BAD_LINE)) {
    src = src.replace(BAD_LINE, FIXED_LINE);
    fs.writeFileSync(file, src, "utf8");
    console.log(`[patch-next-swc] Patched generate-build-id in ${path.basename(path.dirname(file))}`);
  }
}
