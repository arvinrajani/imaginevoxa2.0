import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

type SmokeCase = {
  file: string;
  size: '1536x1024' | '1024x1536' | '1024x1024';
  prompt: string;
  includeHeroReference?: boolean;
};

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  return readFile(filePath, 'utf8').then((raw) => {
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex <= 0) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function ensureEnv() {
  if (process.env.OPENAI_API_KEY?.trim()) return;
  await loadEnvFile(join(process.cwd(), '.env.local'));
}

async function main() {
  await ensureEnv();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('Missing OPENAI_API_KEY. Set it in the environment or .env.local.');
  }

  const openaiModule = await import('../lib/ai/openai');
  const generateImageEdit =
    openaiModule.generateImageEdit ??
    (openaiModule as any).default?.generateImageEdit;

  if (typeof generateImageEdit !== 'function') {
    throw new Error('Could not load generateImageEdit from lib/ai/openai.ts.');
  }

  const outputDir = join(process.cwd(), 'generated-samples', 'live-ai-theme-smoke');
  await mkdir(outputDir, { recursive: true });

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300"><rect width="900" height="300" rx="36" fill="#ffffff"/><circle cx="130" cy="150" r="68" fill="#1a73e8"/><path d="M108 150l22 24 48-54" fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><text x="250" y="182" fill="#10233f" font-family="Arial" font-size="104" font-weight="700">VOXA Labs</text></svg>`;
  const logoBuffer = await sharp(Buffer.from(logoSvg)).png().toBuffer();
  const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1400" viewBox="0 0 1200 1400"><defs><linearGradient id="hero" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#eef7ff"/><stop offset="100%" stop-color="#d3e8fb"/></linearGradient></defs><rect width="1200" height="1400" rx="80" fill="url(#hero)"/><rect x="180" y="110" width="840" height="1180" rx="56" fill="#c2d9ef"/><circle cx="600" cy="420" r="175" fill="#82add7"/><rect x="355" y="650" width="490" height="345" rx="46" fill="#5d89b4"/></svg>`;
  const heroBuffer = await sharp(Buffer.from(heroSvg)).png().toBuffer();

  const cases: SmokeCase[] = [
    {
      file: 'clean-brand-landscape.png',
      size: '1536x1024',
      prompt: `Create a finished landscape LinkedIn poster in a clean-brand / industrial-campaign style.
- Final poster, fully AI-rendered.
- Put the exact supplied logo in a crisp top-left header lane with 4-6% margin and strong contrast.
- Use one headline block only.
- Headline max 3 lines, tagline max 1 short line, proof bullets max 3 short lines, footer optional.
- If space is tight, drop the footer before shrinking text.
- Keep the left text lane calm and readable. Keep the right side as a premium hero product bay.
- If a product reference is present, preserve its identity but re-stage it with believable depth, shadow, and integration so it feels photographed into the poster rather than pasted.
- Use one consistent left alignment for the text block.
- Stack proof bullets with even vertical rhythm and a shared left edge.
- No duplicate headlines. No cramped bullet stack. No collisions.
Headline: Smarter Power Quality, Faster Rollout
Tagline: Built for modern industrial teams
Bullets: Faster commissioning | Cleaner retrofit path | Better reporting clarity`,
      includeHeroReference: true,
    },
    {
      file: 'knowledge-visual-portrait.png',
      size: '1024x1536',
      prompt: `Create a finished portrait LinkedIn poster in a knowledge-visual style.
- Final poster, fully AI-rendered.
- Put the exact supplied logo in a crisp top-left header lane with clear breathing room.
- Use one headline block only.
- Portrait rules: headline max 2-3 lines, tagline max 2 short lines, proof bullets max 3, footer max 1 short line.
- Keep the text in one strong column and avoid crowding the lower third.
- Use a calm dark text-safe panel and a separate reference/insight visual lane.
- If proof bullets would wrap awkwardly, rewrite them as very short proof tags or compact chips.
- If a reference visual is present, integrate it as a believable designed panel or knowledge visual rather than a loose pasted illustration.
- Prefer fewer larger lines over more smaller lines.
- Stack proof bullets with even vertical rhythm and a shared left edge.
- No duplicate text, no footer collisions, no random alignment.
Headline: Technical Insight, Made Readable
Tagline: A clearer way to explain complex systems
Bullets: Practical expertise | Credible framing | Stronger recall`,
      includeHeroReference: true,
    },
    {
      file: 'job-posting-portrait.png',
      size: '1024x1536',
      prompt: `Create a finished portrait LinkedIn hiring poster in a premium job-posting style.
- Final poster, fully AI-rendered.
- Put the exact supplied logo in a crisp top-left header lane with clear contrast.
- Use one headline block only.
- Portrait rules: headline max 2-3 lines, supporting line max 2 short lines, proof bullets max 3, footer max 1 short line.
- If space is tight, drop lower-priority text before shrinking the headline.
- Keep one strong left text column and a separate workplace/team image zone.
- Use one consistent alignment, generous padding, and a calm footer.
- If proof bullets would wrap awkwardly, rewrite them as very short proof tags or compact chips.
- If the footer is included, anchor it near the lower edge instead of letting it float mid-layout.
- Stack proof bullets with even vertical rhythm and a shared left edge.
- No duplicate headlines. No tiny text. No cramped footer.
Headline: Hiring Project Engineers
Tagline: Build smarter energy systems with us
Bullets: Karachi role | Industrial systems | Growth path
Footer: careers.voxa.example`,
    },
    {
      file: 'comparison-board-square.png',
      size: '1024x1024',
      prompt: `Create a finished square LinkedIn poster in a premium comparison-board style.
- Final poster, fully AI-rendered.
- Put the exact supplied logo in a crisp top-left header strip with clean contrast and believable integration into the surface.
- Render a visible top title/header strip and two clearly separated comparison panels below it.
- If a product/reference visual is present, integrate it naturally into one or both comparison lanes rather than pasting it loosely.
- Square rules: headline max 2-3 lines, support line max 1 short line, panel bullets max 2 very short lines per side, footer optional.
- Keep the two panels balanced, readable, and cleanly aligned.
- Avoid awkward wrapped mini-sentences; use short labels or chips if needed.
- No duplicate headlines, no floating footer, no visual clutter between the two lanes.
Headline: Upgrade Path Comparison
Support line: Legacy setup vs modern rollout
Left panel labels: Manual workflow | Slow reporting
Right panel labels: Guided setup | Clear visibility`,
      includeHeroReference: true,
    },
    {
      file: 'premium-editorial-landscape.png',
      size: '1536x1024',
      prompt: `Create a finished landscape LinkedIn poster in a premium-editorial style.
- Final poster, fully AI-rendered.
- Put the exact supplied logo in a crisp top-left header lane integrated into a subtle dark editorial fascia.
- If a reference visual is present, preserve its identity but re-stage it as a premium editorial image area with believable light, shadow, and material richness.
- Render one strong editorial image area and one refined text column. Make both feel physically supported by the composition, not floating.
- Headline max 3 lines, support line max 2 short lines, proof bullets max 2 short lines, footer optional.
- Keep the text lane calm, luxurious, and high-contrast. Prefer large confident typography over extra copy.
- No duplicate text, no pasted-card look, no awkward bullet wrapping, no cheap CTA energy.
Headline: Technical Design, Elevated
Support line: Premium positioning for engineered systems
Proof lines: Editorial clarity | Luxury-grade finish`,
      includeHeroReference: true,
    },
  ];

  const caseFilter = process.argv[2]?.trim().toLowerCase() || '';
  const selectedCases = caseFilter
    ? cases.filter((testCase) => testCase.file.toLowerCase().includes(caseFilter))
    : cases;

  if (selectedCases.length === 0) {
    throw new Error(`No smoke cases matched filter "${caseFilter}".`);
  }

  for (const testCase of selectedCases) {
    const images = [{ buffer: logoBuffer, filename: 'logo.png' }];
    if (testCase.includeHeroReference) {
      images.push({ buffer: heroBuffer, filename: 'hero.png' });
    }

    const result = await generateImageEdit({
      model: 'gpt-image-1',
      prompt: testCase.prompt,
      images,
      size: testCase.size,
      quality: 'high',
    });

    const outputBuffer = Buffer.from(result.base64, 'base64');
    const outputPath = join(outputDir, testCase.file);
    await sharp(outputBuffer).png().toFile(outputPath);
    console.log(outputPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
