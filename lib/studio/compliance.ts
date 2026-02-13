type ComplianceCheck = {
  type: string;
  status: "pass" | "warn" | "fail";
  score?: number;
  details?: Record<string, unknown>;
};

type ComplianceInput = {
  content: string;
  hashtags?: string[];
  doNotUse?: string[];
  toneGuidelines?: string[];
};

const MAX_HASHTAGS = 8;
const MAX_EMOJI_RATIO = 0.08;

const countEmojis = (text: string) => {
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
};

const countWords = (text: string) => {
  const matches = text.trim().match(/\b[\w'-]+\b/g);
  return matches ? matches.length : 0;
};

const detectRepeatedLines = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts = new Map<string, number>();
  lines.forEach((line) => {
    const normalized = line.toLowerCase();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  return Array.from(counts.entries()).filter(([, count]) => count > 1);
};

const detectAllCaps = (text: string) => {
  const words = text.match(/\b[A-Z]{4,}\b/g) || [];
  return words.length;
};

const detectDoNotUse = (text: string, doNotUse: string[]) => {
  const hits: string[] = [];
  const lower = text.toLowerCase();
  doNotUse.forEach((term) => {
    if (term && lower.includes(term.toLowerCase())) {
      hits.push(term);
    }
  });
  return hits;
};

const detectOutcomeStructure = (text: string) => {
  const lower = text.toLowerCase();
  const problemMarkers = ["problem", "pain", "challenge", "struggle", "issue"];
  const solutionMarkers = ["solution", "approach", "framework", "method", "how we"];
  const proofMarkers = ["result", "outcome", "%", "x", "case", "evidence", "proved"];
  const ctaMarkers = ["comment", "dm", "book", "learn more", "reply", "download", "join"];
  return {
    hasProblem: problemMarkers.some((marker) => lower.includes(marker)),
    hasSolution: solutionMarkers.some((marker) => lower.includes(marker)),
    hasProof: proofMarkers.some((marker) => lower.includes(marker)),
    hasCta: ctaMarkers.some((marker) => lower.includes(marker)),
  };
};

export function runComplianceChecks(input: ComplianceInput): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];
  const content = input.content || "";
  const hashtags = input.hashtags || [];
  const wordCount = countWords(content);
  const emojiCount = countEmojis(content);
  const emojiRatio = wordCount > 0 ? emojiCount / wordCount : 0;

  if (hashtags.length > MAX_HASHTAGS) {
    checks.push({
      type: "spam_pattern",
      status: "warn",
      score: Math.min(1, hashtags.length / (MAX_HASHTAGS * 2)),
      details: { hashtags_count: hashtags.length, limit: MAX_HASHTAGS },
    });
  } else {
    checks.push({
      type: "spam_pattern",
      status: "pass",
      score: 1,
      details: { hashtags_count: hashtags.length },
    });
  }

  if (emojiRatio > MAX_EMOJI_RATIO) {
    checks.push({
      type: "automation_risk",
      status: "warn",
      score: 1 - Math.min(1, emojiRatio),
      details: { emoji_ratio: Number(emojiRatio.toFixed(3)) },
    });
  } else {
    checks.push({
      type: "automation_risk",
      status: "pass",
      score: 1,
      details: { emoji_ratio: Number(emojiRatio.toFixed(3)) },
    });
  }

  const repeated = detectRepeatedLines(content);
  if (repeated.length > 0) {
    checks.push({
      type: "spam_pattern",
      status: "warn",
      score: 0.6,
      details: { repeated_lines: repeated.map(([line, count]) => ({ line, count })) },
    });
  }

  const caps = detectAllCaps(content);
  if (caps > 3) {
    checks.push({
      type: "spam_pattern",
      status: "warn",
      score: 0.6,
      details: { all_caps_words: caps },
    });
  }

  const forbidden = detectDoNotUse(content, input.doNotUse || []);
  if (forbidden.length > 0) {
    checks.push({
      type: "brand_consistency",
      status: "fail",
      score: 0,
      details: { do_not_use_hits: forbidden },
    });
  } else {
    checks.push({
      type: "brand_consistency",
      status: "pass",
      score: 1,
      details: { do_not_use_hits: [] },
    });
  }

  if (input.toneGuidelines && input.toneGuidelines.length > 0) {
    checks.push({
      type: "brand_consistency",
      status: "pass",
      score: 0.9,
      details: { tone_guidelines: input.toneGuidelines },
    });
  }

  const structure = detectOutcomeStructure(content);
  const structureParts = [structure.hasProblem, structure.hasSolution, structure.hasProof, structure.hasCta];
  const structureScore = structureParts.filter(Boolean).length / structureParts.length;
  checks.push({
    type: "custom",
    status: structureScore >= 0.75 ? "pass" : structureScore >= 0.5 ? "warn" : "fail",
    score: Number(structureScore.toFixed(2)),
    details: structure,
  });

  return checks;
}
