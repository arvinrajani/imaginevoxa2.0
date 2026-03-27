// ── Industry-to-Scene Map ────────────────────────────────────────────────────
// Shared between client (image-creator.tsx) and server (route.ts) so both
// resolve the same industry → scene direction from a single source of truth.

export type IndustrySceneEntry = {
  /** Regex patterns to match against the brand's industry field and business descriptions */
  patterns: RegExp;
  /** Human-readable scene description for the "Your Vision" textarea (client-side) */
  clientScene: string;
  /** Detailed scene brief injected into the AI image prompt (server-side) */
  serverScene: string;
};

export const INDUSTRY_SCENE_MAP: IndustrySceneEntry[] = [
  {
    patterns: /electric|energy|power|utility|grid|substation|electrical|capacitor|transformer|switchgear|industrial automation|automation|voltage/i,
    clientScene:
      'A premium electrification environment with grid infrastructure silhouettes, high-voltage equipment depth, engineered metallic surfaces, brand-colored indicator lights, and dramatic industrial atmosphere.',
    serverScene:
      'A realistic industrial electrification scene: transmission infrastructure, switchgear halls, brand-colored indicator lights, metallic reflections, control panel detail, and dramatic directional lighting suggesting enterprise power-systems credibility.',
  },
  {
    patterns: /bank|finance|financial|fintech|wealth|invest|insurance|capital|trading|mortgage|loan|accounting|payment/i,
    clientScene:
      'A high-trust financial environment with premium glass-tower offices, executive lighting, subtle market data screens, polished wood and marble surfaces, and corporate authority.',
    serverScene:
      'A realistic premium finance scene: executive boardroom or trading floor, glass tower reflections, financial data screens, warm directional lighting, and premium corporate surfaces conveying trust and authority.',
  },
  {
    patterns: /car|auto|automotive|showroom|dealer|vehicle|suv|sedan|ev\b|motor|garage|tire|tyre/i,
    clientScene:
      'A premium automotive showroom with polished reflective floors, controlled directional spotlight staging, hero vehicle positioning, and luxury commercial precision.',
    serverScene:
      'A realistic automotive showroom or launch event: polished reflective floors, dramatic spotlighting on a hero vehicle position, subtle brand-colored ambient light, and premium commercial staging.',
  },
  {
    patterns: /estate|real estate|property|broker|realtor|housing|residential|commercial property|developer|rental/i,
    clientScene:
      'An aspirational property environment with modern architectural lines, premium interior finishes or skyline views, trust-building natural light, and polished presentation.',
    serverScene:
      'A realistic real estate presentation scene: modern architecture, premium interior design elements, large windows with skyline or landscape views, natural warm lighting, and aspirational lifestyle cues.',
  },
  {
    patterns: /hospital|medical|clinic|health|healthcare|doctor|pharma|wellness|biotech|dental|nursing/i,
    clientScene:
      'A clean healthcare setting with modern clinical spaces, trust-building cool lighting, premium equipment context, and calm professional clarity.',
    serverScene:
      'A realistic healthcare scene: modern clinical environment, clean surfaces, premium medical equipment, cool trust-building lighting, and professional calm atmosphere.',
  },
  {
    patterns: /school|education|college|university|academy|course|training|learning|edtech|tutor/i,
    clientScene:
      'A modern education environment with smart learning spaces, campus context, optimistic warm lighting, and professional academic credibility.',
    serverScene:
      'A realistic education scene: modern campus or smart classroom, collaborative learning setup, natural optimistic lighting, and professional institutional feel.',
  },
  {
    patterns: /construction|builder|cement|infrastructure|architecture|engineering|contractor|civil|steel|concrete/i,
    clientScene:
      'A strong built-environment scene with architectural structure, active site precision, engineered scale, and premium infrastructure atmosphere.',
    serverScene:
      'A realistic construction or engineering scene: architectural framework, precision engineering detail, site equipment, strong geometric lines, and professional infrastructure scale.',
  },
  {
    patterns: /hotel|restaurant|cafe|travel|tourism|resort|hospitality|airline|booking|catering/i,
    clientScene:
      'An elevated hospitality environment with premium interiors, warm ambient lighting, destination atmosphere, and polished guest-experience cues.',
    serverScene:
      'A realistic hospitality scene: premium hotel lobby, resort atmosphere, warm curated lighting, destination cues, and elevated guest-experience storytelling.',
  },
  {
    patterns: /retail|fashion|beauty|cosmetic|jewelry|store|boutique|ecommerce|apparel|clothing|luxury goods/i,
    clientScene:
      'A polished retail environment with premium merchandising display, controlled spotlight lighting, intentional surface textures, and clean brand storytelling.',
    serverScene:
      'A realistic retail or fashion scene: premium store display, curated product staging, editorial lighting, clean surfaces, and aspirational brand atmosphere.',
  },
  {
    patterns: /saas|software|platform|product|ai\b|automation|data|analytics|cloud|cyber|startup|devops|tech/i,
    clientScene:
      'A modern tech workspace with collaboration screens, product UI context, clean architectural lines, and an innovative, future-focused atmosphere.',
    serverScene:
      'A realistic tech workspace scene: professionals around analytics screens, product UI context, clean modern office, architectural glass, and innovative atmosphere.',
  },
  {
    patterns: /logistics|supply|warehouse|shipping|transport|freight|courier|fleet|trucking|distribution/i,
    clientScene:
      'An organized logistics environment with warehouse scale, shipping workflow precision, strong leading lines, and operational efficiency atmosphere.',
    serverScene:
      'A realistic logistics operations scene: organized warehouse or distribution center, shipping containers, fleet vehicles, strong perspective lines, and operational precision.',
  },
  {
    patterns: /manufactur|factory|production|assembly|machining|fabricat|plant|foundry|textile/i,
    clientScene:
      'A precision manufacturing environment with active production lines, metallic surfaces, engineered lighting, and industrial craftsmanship.',
    serverScene:
      'A realistic manufacturing scene: active production line, precision machinery, metallic surfaces, controlled industrial lighting, and professional craftsmanship.',
  },
  {
    patterns: /agricultur|farm|food|beverage|organic|dairy|crop|harvest|agri|grain/i,
    clientScene:
      'A fresh agriculture or food production environment with natural landscapes, clean processing facilities, warm golden-hour light, and wholesome professional atmosphere.',
    serverScene:
      'A realistic agriculture or food scene: natural farmland or modern processing facility, warm golden-hour lighting, fresh produce or ingredient context, and clean professional atmosphere.',
  },
  {
    patterns: /telecom|mobile|network|fiber|broadband|wireless|5g|satellite|connectivity|isp/i,
    clientScene:
      'A connected telecommunications environment with tower infrastructure, fiber-optic detail, signal-wave visualization, and high-tech network atmosphere.',
    serverScene:
      'A realistic telecommunications scene: cell tower infrastructure, fiber-optic connections, network operations center, data-flow visualization, and high-tech connectivity atmosphere.',
  },
  {
    patterns: /oil|gas|petroleum|mining|mineral|drill|pipeline|refinery|extraction/i,
    clientScene:
      'A bold energy extraction environment with infrastructure scale, pipeline corridors, refinery silhouettes, and dramatic industrial-strength atmosphere.',
    serverScene:
      'A realistic oil, gas, or mining scene: refinery or extraction infrastructure, pipeline systems, dramatic sky, heavy equipment, and industrial-strength atmosphere.',
  },
  {
    patterns: /legal|law\b|attorney|consult|advisory|compliance|audit|firm/i,
    clientScene:
      'A premium professional services environment with executive conference settings, dark wood and leather details, trust-building formal lighting, and authoritative corporate depth.',
    serverScene:
      'A realistic legal or consulting scene: premium conference room, law library or executive office, dark wood surfaces, formal directional lighting, and authoritative professional atmosphere.',
  },
  {
    patterns: /media|entertainment|broadcast|studio|music|film|gaming|content|publish/i,
    clientScene:
      'A dynamic media production environment with studio lighting rigs, creative workspace energy, screen arrays, and vibrant production atmosphere.',
    serverScene:
      'A realistic media or entertainment scene: production studio, creative workspace, screen arrays, dramatic studio lighting, and vibrant creative energy.',
  },
  {
    patterns: /ngo|non.?profit|government|civic|public sector|municipal|charity|humanitarian/i,
    clientScene:
      'A purposeful civic environment with community-focused interiors, warm inclusive lighting, institutional trust, and mission-driven atmosphere.',
    serverScene:
      'A realistic civic or non-profit scene: community center or government building, inclusive warm lighting, institutional trust cues, and mission-driven professional atmosphere.',
  },
  {
    patterns: /fitness|gym|sport|athletic|wellness center|yoga|personal training/i,
    clientScene:
      'An energizing fitness environment with modern equipment, dynamic lighting, motivational energy, and active lifestyle atmosphere.',
    serverScene:
      'A realistic fitness or sports scene: modern gym or athletic facility, dynamic lighting, active movement context, and motivational high-energy atmosphere.',
  },
  {
    patterns: /insurance|underwriting|actuary|claims|risk management|coverage/i,
    clientScene:
      'A reassuring insurance environment with premium office interiors, protective symbolism, trust-building corporate lighting, and stability-focused atmosphere.',
    serverScene:
      'A realistic insurance or risk management scene: premium office, protective trust cues, clean corporate lighting, and stability-focused atmosphere.',
  },
  {
    patterns: /aerospace|aviation|defense|military|drone|satellite|space/i,
    clientScene:
      'A precision aerospace environment with advanced engineering, clean-room discipline, dramatic scale, and high-tech defense-grade atmosphere.',
    serverScene:
      'A realistic aerospace or defense scene: advanced engineering facility, precision equipment, dramatic scale, and high-tech professional atmosphere.',
  },
  {
    patterns: /clean|janitorial|facility management|maintenance|sanitation|pest control/i,
    clientScene:
      'A spotless facility management environment with pristine commercial spaces, professional equipment, bright clinical lighting, and operational excellence.',
    serverScene:
      'A realistic cleaning or facility services scene: pristine commercial building, professional equipment, bright operational lighting, and cleanliness-focused atmosphere.',
  },
];

const DEFAULT_CLIENT_SCENE =
  'Build a premium, believable client-specific background that matches the industry, feels custom to the brand, and supports the selected theme without looking generic.';
const DEFAULT_SERVER_SCENE =
  'A realistic professional business scene with a clear subject, purposeful environment context, and strong visual depth.';

/**
 * Resolve the best matching industry scene entry.
 * Priority: explicit `industry` field first, then keyword-match against fallback texts.
 */
function resolveEntry(...sources: Array<string | null | undefined>): IndustrySceneEntry | null {
  const texts = sources
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.toLowerCase());

  // Try each source independently (first source = industry field = highest priority)
  for (const text of texts) {
    const match = INDUSTRY_SCENE_MAP.find((entry) => entry.patterns.test(text));
    if (match) return match;
  }

  // Concatenated fallback for multi-word matches
  const combined = texts.join(' ');
  if (combined) {
    const match = INDUSTRY_SCENE_MAP.find((entry) => entry.patterns.test(combined));
    if (match) return match;
  }

  return null;
}

/**
 * Returns a human-readable scene description for the "Your Vision" textarea.
 * Used by the client-side composeSmartVision() and deriveIndustryBackdropHint replacement.
 */
export function resolveClientScene(...sources: Array<string | null | undefined>): string {
  return resolveEntry(...sources)?.clientScene || DEFAULT_CLIENT_SCENE;
}

/**
 * Returns a detailed scene brief for the server-side AI prompt.
 * Used by deriveSceneBrief() in route.ts.
 */
export function resolveServerScene(...sources: Array<string | null | undefined>): string {
  return resolveEntry(...sources)?.serverScene || DEFAULT_SERVER_SCENE;
}
