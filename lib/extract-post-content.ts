const OPENAI_API_BASE = 'https://api.openai.com/v1';

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('Missing OPENAI_API_KEY.');
  return key;
}

export async function extractPostContent(postText: string): Promise<{
  headline: string;
  tagline: string;
  bullets: string[];
}> {
  const safeDefault = {
    headline: postText.slice(0, 60).trim() || 'New Product Launch',
    tagline: '',
    bullets: [] as string[],
  };

  if (!postText || postText.trim().length < 10) return safeDefault;

  try {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You extract structured content from LinkedIn posts for marketing banners.
Return valid JSON only. No markdown. No explanation. No extra fields.

{
  "headline": "5-8 word punchy specific headline",
  "tagline": "supporting line under 8 words",
  "bullets": ["noun phrase benefit 1", "noun phrase benefit 2", "noun phrase benefit 3", "noun phrase benefit 4"]
}

Strict rules:
- headline: specific product claim, no filler words like 'unlock', 'discover', 'empower'
- tagline: what makes this product different, never repeats the headline
- bullets: exactly 4, each 4-6 words, noun phrases not full sentences
- bullets: only real features or benefits mentioned in the post
- bullets: no URLs, no CTAs, no exclamation marks
- never add fields that are not in the schema above`,
          },
          { role: 'user', content: postText },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `[extract-post] OpenAI ${response.status}:`,
        await response.text()
      );
      return safeDefault;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[extract-post] No content in response');
      return safeDefault;
    }

    const parsed = JSON.parse(content) as {
      headline?: string;
      tagline?: string;
      bullets?: string[];
    };

    return {
      headline:
        typeof parsed.headline === 'string' && parsed.headline.trim()
          ? parsed.headline.trim()
          : safeDefault.headline,
      tagline:
        typeof parsed.tagline === 'string' ? parsed.tagline.trim() : '',
      bullets: Array.isArray(parsed.bullets)
        ? parsed.bullets
            .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
            .map((b) => b.trim())
            .slice(0, 6)
        : [],
    };
  } catch (error) {
    console.error(
      '[extract-post] Failed:',
      error instanceof Error ? error.message : error
    );
    return safeDefault;
  }
}
