import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brandId } = body;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the user's posting history
    const { data: posts } = await supabase
      .from('posts')
      .select('id, created_at, posted_at, status, engagement_views, engagement_likes, engagement_comments, engagement_shares')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Fetch marketing DNA if available
    let marketingDna = null;
    if (brandId) {
      const { data: dna } = await supabase
        .from('marketing_dna')
        .select('cadence, post_types, tone')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      marketingDna = dna;
    }

    // Analyze posting patterns from real data
    const publishedPosts = (posts || []).filter(p => p.status === 'posted' && p.posted_at);
    
    // Calculate day/hour distribution
    const dayHourMap: Record<string, Record<number, { count: number; engagement: number }>> = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (const post of publishedPosts) {
      const date = new Date(post.posted_at!);
      const day = dayNames[date.getDay()];
      const hour = date.getHours();
      
      if (!dayHourMap[day]) dayHourMap[day] = {};
      if (!dayHourMap[day][hour]) dayHourMap[day][hour] = { count: 0, engagement: 0 };
      
      dayHourMap[day][hour].count++;
      dayHourMap[day][hour].engagement += 
        Number(post.engagement_views || 0) + 
        Number(post.engagement_likes || 0) * 5 + 
        Number(post.engagement_comments || 0) * 10 + 
        Number(post.engagement_shares || 0) * 15;
    }

    // Use AI to analyze patterns and provide recommendations
    const postingSummary = publishedPosts.length > 0
      ? `User has ${publishedPosts.length} published posts. Day distribution: ${
          Object.entries(dayHourMap)
            .map(([day, hours]) => `${day}: ${Object.keys(hours).length} posts`)
            .join(', ')
        }. Average engagement per post: ${
          publishedPosts.length > 0
            ? Math.round(
                publishedPosts.reduce((sum, p) => 
                  sum + Number(p.engagement_views || 0) + Number(p.engagement_likes || 0), 0
                ) / publishedPosts.length
              )
            : 0
        }.`
      : 'User has no published posts yet. Provide general LinkedIn best practices.';

    const analysis = await createStructuredChatCompletion<{
      bestTimes: Array<{ day: string; time: string; score: number; reason: string }>;
      audienceActivity: { peakHours: string[]; peakDays: string[] };
      competitorGaps: Array<{ day: string; time: string; opportunity: string }>;
      recommendations: string[];
    }>({
      model: 'gpt-4o',
      system: `You are a LinkedIn scheduling optimization expert. Analyze the user's posting history and provide optimal posting times.
      
Return a JSON object with:
- bestTimes: Array of 4 recommended time slots with day, time (HH:MM AM/PM), score (0-100), and reason
- audienceActivity: { peakHours: string[], peakDays: string[] }
- competitorGaps: Array of 2-3 opportunity windows where competition is low
- recommendations: Array of 4-5 actionable scheduling tips

Base recommendations on:
1. The user's actual posting data and engagement patterns
2. LinkedIn's general best practices (Tue-Thu mornings perform best)
3. Industry patterns from their marketing DNA
4. Avoiding oversaturated posting times`,
      user: `Posting history summary: ${postingSummary}
${marketingDna ? `Marketing DNA: Tone: ${marketingDna.tone}, Post types: ${JSON.stringify(marketingDna.post_types)}, Cadence: ${JSON.stringify(marketingDna.cadence)}` : 'No marketing DNA available.'}

Analyze and provide optimal scheduling recommendations.`,
      schema: {
        name: 'scheduling_analysis',
        schema: {
          type: 'object',
          properties: {
            bestTimes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  time: { type: 'string' },
                  score: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['day', 'time', 'score', 'reason'],
                additionalProperties: false,
              },
            },
            audienceActivity: {
              type: 'object',
              properties: {
                peakHours: { type: 'array', items: { type: 'string' } },
                peakDays: { type: 'array', items: { type: 'string' } },
              },
              required: ['peakHours', 'peakDays'],
              additionalProperties: false,
            },
            competitorGaps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  time: { type: 'string' },
                  opportunity: { type: 'string' },
                },
                required: ['day', 'time', 'opportunity'],
                additionalProperties: false,
              },
            },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['bestTimes', 'audienceActivity', 'competitorGaps', 'recommendations'],
          additionalProperties: false,
        },
      },
      temperature: 0.4,
    });

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error('Scheduling analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze scheduling' },
      { status: 500 }
    );
  }
}
