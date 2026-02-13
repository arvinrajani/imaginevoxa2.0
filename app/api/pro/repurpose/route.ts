import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, brandId, tone, audience, goal } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch and extract content from the URL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let pageContent = '';
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VoxaBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

      const html = await res.text();
      // Strip HTML tags, scripts, styles
      pageContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000); // Limit for token size
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return NextResponse.json({ error: 'URL fetch timed out' }, { status: 408 });
      }
      return NextResponse.json({ error: `Could not fetch URL: ${err.message}` }, { status: 400 });
    }

    if (!pageContent || pageContent.length < 50) {
      return NextResponse.json({ error: 'Could not extract meaningful content from the URL' }, { status: 400 });
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    // Generate multiple LinkedIn post variations
    const result = await createStructuredChatCompletion<{
      posts: Array<{
        headline: string;
        body: string;
        hashtags: string[];
        angle: string;
        hook_type: string;
      }>;
      source_summary: string;
      key_takeaways: string[];
    }>({
      model,
      system: `You are a LinkedIn content strategist. Your job is to transform web content (articles, blog posts, product pages) into engaging LinkedIn posts. 

Rules:
- Generate 3 different LinkedIn post variations, each with a different angle/hook
- Posts should be 100-300 words, optimized for LinkedIn engagement
- Use proven hooks: question, bold statement, story, data point, contrarian take
- Include relevant hashtags (3-5 per post)
- Match the requested tone and audience
- Add a clear CTA at the end of each post
- Do NOT copy the article verbatim — repurpose and add unique perspective
- Make posts feel authentic and personal, not robotic`,
      user: `Repurpose this web content into LinkedIn posts.

URL: ${url}
Content: ${pageContent}

${tone ? `Tone: ${tone}` : 'Tone: professional but approachable'}
${audience ? `Target audience: ${audience}` : ''}
${goal ? `Goal: ${goal}` : 'Goal: engagement and thought leadership'}

Generate 3 unique LinkedIn post variations with different hooks and angles.`,
      schema: {
        name: 'repurposed_posts',
        schema: {
          type: 'object',
          properties: {
            posts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  headline: { type: 'string' },
                  body: { type: 'string' },
                  hashtags: { type: 'array', items: { type: 'string' } },
                  angle: { type: 'string' },
                  hook_type: { type: 'string' },
                },
                required: ['headline', 'body', 'hashtags', 'angle', 'hook_type'],
                additionalProperties: false,
              },
            },
            source_summary: { type: 'string' },
            key_takeaways: { type: 'array', items: { type: 'string' } },
          },
          required: ['posts', 'source_summary', 'key_takeaways'],
          additionalProperties: false,
        },
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Content repurposing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to repurpose content' },
      { status: 500 }
    );
  }
}
