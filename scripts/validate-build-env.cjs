const fs = require("fs");
const path = require("path");

const envFiles = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    const value = rawValue
      .trim()
      .replace(/^['"]/, "")
      .replace(/['"]$/, "");

    process.env[key] = value;
  }
}

for (const envFile of envFiles) {
  loadEnvFile(envFile);
}

const requiredForBuild = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const missing = requiredForBuild.filter((name) => {
  const value = process.env[name];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error("[build-env] Missing required environment variables:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error(
    "[build-env] Add them in Vercel Project Settings -> Environment Variables for the target environment, then redeploy."
  );
  process.exit(1);
}
