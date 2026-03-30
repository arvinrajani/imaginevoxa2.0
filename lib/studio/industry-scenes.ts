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
      'A realistic industrial electrification environment shot on a 35mm lens: transmission towers receding into atmospheric perspective, switchgear halls with polished busbar reflections, copper-winding close-ups showing machining marks and patina, brand-colored LED indicators casting colored spill onto brushed-steel panels, dramatic directional key light from high-left revealing the engineered geometry of power infrastructure. Floor surfaces show painted concrete or diamond-plate steel. Background depth shows receding equipment bays with warm sodium-vapor practicals.',
  },
  {
    patterns: /bank|finance|financial|fintech|wealth|invest|insurance|capital|trading|mortgage|loan|accounting|payment/i,
    clientScene:
      'A high-trust financial environment with premium glass-tower offices, executive lighting, subtle market data screens, polished wood and marble surfaces, and corporate authority.',
    serverScene:
      'A premium finance environment at golden-hour: floor-to-ceiling glass walls reflecting the city skyline, executive conference table in polished walnut with visible grain, warm directional light from floor-standing lamps creating pools of authority, multiple financial data screens showing chart patterns in brand colors with anti-glare coating, marble and brass architectural details catching specular highlights, depth created through receding glass-partition offices with warm-cool color temperature contrast.',
  },
  {
    patterns: /car|auto|automotive|showroom|dealer|vehicle|suv|sedan|ev\b|motor|garage|tire|tyre/i,
    clientScene:
      'A premium automotive showroom with polished reflective floors, controlled directional spotlight staging, hero vehicle positioning, and luxury commercial precision.',
    serverScene:
      'A premium automotive showroom with mirror-polished epoxy floor reflecting a perfectly staged vehicle position, dramatic overhead spot lighting creating clean shadow modeling on body panels, subtle blue-tinted fill light from showroom glass walls, car paint showing deep clear-coat reflections with orange-peel micro-texture, chrome trim catching crisp specular highlights, background showing receding showroom architecture with brand-colored accent lighting.',
  },
  {
    patterns: /estate|real estate|property|broker|realtor|housing|residential|commercial property|developer|rental/i,
    clientScene:
      'An aspirational property environment with modern architectural lines, premium interior finishes or skyline views, trust-building natural light, and polished presentation.',
    serverScene:
      'A premium architectural interior shot at wide angle: floor-to-ceiling windows flooding natural warm light across polished hardwood or marble floors, modern furnishings with visible material quality (leather grain, brushed metal legs, woven upholstery), city skyline or landscaped garden visible through glass with atmospheric depth, warm interior vs cool exterior color temperature creating richness, architectural details like reveals, shadow gaps, and material transitions rendered with precision.',
  },
  {
    patterns: /hospital|medical|clinic|health|healthcare|doctor|pharma|wellness|biotech|dental|nursing/i,
    clientScene:
      'A clean healthcare setting with modern clinical spaces, trust-building cool lighting, premium equipment context, and calm professional clarity.',
    serverScene:
      'A modern healthcare environment with cool-white LED panel lighting creating clean shadow-free work surfaces, premium medical equipment showing brushed stainless steel and high-gloss plastic housings, epoxy-coated floors with subtle reflection, glass partition walls with frosted privacy bands, monitors showing diagnostic displays in brand colors, environmental depth through receding corridor with atmospheric perspective and warm accent lighting at nurse stations.',
  },
  {
    patterns: /school|education|college|university|academy|course|training|learning|edtech|tutor/i,
    clientScene:
      'A modern education environment with smart learning spaces, campus context, optimistic warm lighting, and professional academic credibility.',
    serverScene:
      'A modern educational space with natural daylight streaming through large campus windows, smart-board display showing content in brand colors, clean white walls with visible paint texture, warm wood furniture and fixtures, students\' workspace with laptops and notebooks creating depth layers, architectural details like exposed ceiling structure or feature wall with institutional materials, warm optimistic color temperature with cool shadow fill.',
  },
  {
    patterns: /construction|builder|cement|infrastructure|architecture|engineering|contractor|civil|steel|concrete/i,
    clientScene:
      'A strong built-environment scene with architectural structure, active site precision, engineered scale, and premium infrastructure atmosphere.',
    serverScene:
      'A dramatic construction or engineering scene shot at golden hour: steel structural framework catching warm directional sunlight with long shadow modeling, concrete forms showing aggregate texture and formwork marks, precision measurement equipment with engineered metal finishes, tower crane silhouette creating strong leading lines into the sky, safety-yellow accent equipment providing color contrast, atmospheric dust particles catching volumetric light rays, depth through receding structural bays.',
  },
  {
    patterns: /hotel|restaurant|cafe|travel|tourism|resort|hospitality|airline|booking|catering/i,
    clientScene:
      'An elevated hospitality environment with premium interiors, warm ambient lighting, destination atmosphere, and polished guest-experience cues.',
    serverScene:
      'A premium hospitality interior with warm tungsten accent lighting creating intimate pools, polished marble or terrazzo floor showing subtle vein patterns, plush upholstered seating with visible fabric weave, copper or brass fixtures catching warm specular highlights, fresh floral arrangements and curated details, depth through arched doorways or corridors leading to softly lit destination views, color temperature separation between warm interior and cool blue-hour exterior.',
  },
  {
    patterns: /retail|fashion|beauty|cosmetic|jewelry|store|boutique|ecommerce|apparel|clothing|luxury goods/i,
    clientScene:
      'A polished retail environment with premium merchandising display, controlled spotlight lighting, intentional surface textures, and clean brand storytelling.',
    serverScene:
      'A luxury retail environment with track-lit product displays creating dramatic pools of warm light, polished glass shelving showing reflections and transparency, premium flooring (marble, terrazzo, or dark hardwood) with visible material quality, carefully styled merchandise showing fabric drape or product finish, warm accent lighting from display cases, depth through receding store architecture with brand-colored feature walls, clean negative space between displays creating gallery-like breathing room.',
  },
  {
    patterns: /saas|software|platform|product|ai\b|automation|data|analytics|cloud|cyber|startup|devops|tech/i,
    clientScene:
      'A modern tech workspace with collaboration screens, product UI context, clean architectural lines, and an innovative, future-focused atmosphere.',
    serverScene:
      'A premium tech workspace with multiple ultra-wide monitors showing product UI in brand colors with anti-glare coating visible, clean white desk surfaces with subtle matte texture, exposed concrete or polished aggregate feature wall, modern task lighting casting directional warm pools, glass meeting rooms in background creating depth layers, cable management and engineering-grade peripherals showing attention to detail, cool-warm color temperature mix between monitor glow and overhead lighting.',
  },
  {
    patterns: /logistics|supply|warehouse|shipping|transport|freight|courier|fleet|trucking|distribution/i,
    clientScene:
      'An organized logistics environment with warehouse scale, shipping workflow precision, strong leading lines, and operational efficiency atmosphere.',
    serverScene:
      'A large-scale logistics environment with towering warehouse racking creating strong perspective lines receding into atmospheric depth, high-bay LED lighting casting even illumination with subtle shadow modeling, organized shipping containers or palletized goods showing clean operational discipline, polished concrete floors with forklift tire marks adding authenticity, loading dock opening showing exterior daylight creating dramatic light-dark contrast, brand-colored safety markings and signage providing color accents.',
  },
  {
    patterns: /manufactur|factory|production|assembly|machining|fabricat|plant|foundry|textile/i,
    clientScene:
      'A precision manufacturing environment with active production lines, metallic surfaces, engineered lighting, and industrial craftsmanship.',
    serverScene:
      'A precision manufacturing floor with CNC machines showing brushed stainless steel housings and machining-oil sheen, organized tool stations with chrome hand tools catching specular highlights, active production line with work-in-progress parts showing raw material transitions, high-bay industrial lighting creating dramatic top-down modeling, concrete floors with epoxy coating showing slight reflection, depth through receding production bays with warm sodium practicals in the background, metal chips and coolant detail adding authenticity.',
  },
  {
    patterns: /agricultur|farm|food|beverage|organic|dairy|crop|harvest|agri|grain/i,
    clientScene:
      'A fresh agriculture or food production environment with natural landscapes, clean processing facilities, warm golden-hour light, and wholesome professional atmosphere.',
    serverScene:
      'A premium agricultural scene at golden hour with warm directional sunlight creating long shadows across crop rows or processing equipment, rich soil texture and green foliage showing natural detail, modern processing facility with stainless steel surfaces and food-grade finishes in the background, natural atmospheric perspective through fields receding to a treeline horizon, practical elements like irrigation equipment or harvest machinery providing scale and authenticity, warm above cool color temperature with amber sun and blue sky.',
  },
  {
    patterns: /telecom|mobile|network|fiber|broadband|wireless|5g|satellite|connectivity|isp/i,
    clientScene:
      'A connected telecommunications environment with tower infrastructure, fiber-optic detail, signal-wave visualization, and high-tech network atmosphere.',
    serverScene:
      'A telecommunications infrastructure scene with cell tower lattice work against twilight sky showing brand-colored aviation lights, fiber-optic cable bundles showing individual glass strand detail catching light, network operations center with rack-mounted equipment showing LED status indicators in brand colors, clean cable management visible, multiple monitoring screens showing network topology, cool blue lighting with warm amber accent practicals, depth through data center corridor receding into atmospheric perspective.',
  },
  {
    patterns: /oil|gas|petroleum|mining|mineral|drill|pipeline|refinery|extraction/i,
    clientScene:
      'A bold energy extraction environment with infrastructure scale, pipeline corridors, refinery silhouettes, and dramatic industrial-strength atmosphere.',
    serverScene:
      'A dramatic oil and gas facility at blue hour with refinery infrastructure silhouetted against deep blue sky, pipeline systems showing welded steel joints and valve wheels with industrial patina, flare stack with subtle flame glow providing warm color accent, heavy equipment showing weathered paint and engineered surfaces, puddle reflections doubling the infrastructure silhouettes, dramatic scale conveyed through small-figure human reference points, atmospheric haze creating depth layers through receding processing units.',
  },
  {
    patterns: /legal|law\b|attorney|consult|advisory|compliance|audit|firm/i,
    clientScene:
      'A premium professional services environment with executive conference settings, dark wood and leather details, trust-building formal lighting, and authoritative corporate depth.',
    serverScene:
      'A premium legal or consulting environment with dark walnut bookshelves showing leather-bound volumes with gold-embossed spines, executive leather chair showing natural hide pores and stitching detail, warm directional desk lamp creating pools of authoritative light, polished mahogany conference table reflecting the warm interior, city view through floor-to-ceiling windows providing depth and prestige, brass desk accessories and framed credentials catching specular highlights, warm-on-warm lighting with subtle cool fill from windows.',
  },
  {
    patterns: /media|entertainment|broadcast|studio|music|film|gaming|content|publish/i,
    clientScene:
      'A dynamic media production environment with studio lighting rigs, creative workspace energy, screen arrays, and vibrant production atmosphere.',
    serverScene:
      'A dynamic media production environment with professional studio lighting rigs visible overhead — Fresnel spots, LED panels, and softboxes creating dramatic modeling light, multiple production monitors showing content with brand-colored UI, audio mixing console or editing suite with backlit buttons, sound-dampening wall panels showing fabric texture, creative energy through organized equipment and cables, depth through control room glass looking into a live studio space, dramatic light-dark contrast between lit talent position and shadowed production area.',
  },
  {
    patterns: /ngo|non.?profit|government|civic|public sector|municipal|charity|humanitarian/i,
    clientScene:
      'A purposeful civic environment with community-focused interiors, warm inclusive lighting, institutional trust, and mission-driven atmosphere.',
    serverScene:
      'A warm civic or community-focused interior with natural window light flooding a meeting space, institutional materials (polished terrazzo, clean brick, painted block) rendered with authentic texture, community gathering furniture arranged for collaboration, warm inclusive lighting with no harsh shadows, mission-focused wall displays or community materials visible, depth through connected spaces showing human-scale civic architecture, color palette balancing institutional trust with warm approachability.',
  },
  {
    patterns: /fitness|gym|sport|athletic|wellness center|yoga|personal training/i,
    clientScene:
      'An energizing fitness environment with modern equipment, dynamic lighting, motivational energy, and active lifestyle atmosphere.',
    serverScene:
      'An energizing fitness environment with premium equipment showing chrome and rubber textures, dramatic directional spotlighting creating high-contrast modeling on equipment surfaces, rubber gym flooring with visible texture, mirrored walls creating depth multiplication, kettlebells and plates showing cast iron patina and weight markings, active dynamic mood through dramatic overhead LED lighting with brand-colored accent strips, athletic equipment arranged with intentional negative space.',
  },
  {
    patterns: /insurance|underwriting|actuary|claims|risk management|coverage/i,
    clientScene:
      'A reassuring insurance environment with premium office interiors, protective symbolism, trust-building corporate lighting, and stability-focused atmosphere.',
    serverScene:
      'A premium insurance office environment with warm natural wood and stone finishes conveying stability, soft directional lighting creating calm and trust, premium leather furnishings with visible material quality, panoramic city or landscape view through windows providing scale and permanence, clean organized desk surfaces with precision accessories, depth through glass-partitioned offices showing professional activity, color palette balancing corporate authority with reassuring warmth.',
  },
  {
    patterns: /aerospace|aviation|defense|military|drone|satellite|space/i,
    clientScene:
      'A precision aerospace environment with advanced engineering, clean-room discipline, dramatic scale, and high-tech defense-grade atmosphere.',
    serverScene:
      'A precision aerospace facility with clean-room white surfaces showing engineering discipline, advanced composite materials with visible carbon-fiber weave, dramatic scale conveyed through hangar proportions with tiny human figures, high-intensity overhead lighting creating clean shadow modeling on aircraft or component surfaces, tooling fixtures showing machined aluminum precision, blue-tinted fill lighting creating a high-tech atmosphere, depth through receding assembly stations with atmospheric perspective.',
  },
  {
    patterns: /clean|janitorial|facility management|maintenance|sanitation|pest control/i,
    clientScene:
      'A spotless facility management environment with pristine commercial spaces, professional equipment, bright clinical lighting, and operational excellence.',
    serverScene:
      'A pristine commercial facility interior with mirror-polished floors showing perfect reflections, professional cleaning equipment with brand-colored housings, bright even LED lighting creating shadowless clean surfaces, glass and stainless steel architectural details catching specular highlights, depth through receding commercial corridors showing operational scale, premium material finishes demonstrating cleaning excellence.',
  },
];

const DEFAULT_CLIENT_SCENE =
  'Build a premium, believable client-specific background that matches the industry, feels custom to the brand, and supports the selected theme without looking generic.';
const DEFAULT_SERVER_SCENE =
  'A premium professional business environment with real architectural depth: glass-partitioned offices receding into atmospheric perspective, modern furnishings showing material quality (polished wood grain, brushed metal, woven fabric), directional warm key light creating modeling shadows, and environmental details that tell a specific business story — not a generic stock-photo office.';

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
