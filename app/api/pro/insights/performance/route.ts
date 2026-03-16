import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Performance Insights API
 *
 * Analyzes posted content + actual engagement to surface:
 * - What content patterns drive the most engagement
 * - Predicted vs actual performance comparison
 * - Top-performing posts breakdown
 * - Content recommendations grounded in real data
 * - Engagement trends over time
 */

type PostRow = {
  id: string;
  title: string | null;
  post_content: string;
  prompt: string | null;
  tone: string | null;
  created_at: string;
  posted_at: string | null;
  engagement_views: number | null;
  engagement_likes: number | null;
  engagement_comments: number | null;
  engagement_shares: number | null;
  brand_id: string | null;
};

const safeNum = (v: unknown) => Number(v || 0);
const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

function engagementScore(post: PostRow) {
  return (
    safeNum(post.engagement_views) +
    safeNum(post.engagement_likes) * 5 +
    safeNum(post.engagement_comments) * 10 +
    safeNum(post.engagement_shares) * 15
  );
}

function engagementRate(post: PostRow) {
  const views = safeNum(post.engagement_views);
  if (views === 0) return 0;
  const interactions =
    safeNum(post.engagement_likes) +
    safeNum(post.engagement_comments) +
    safeNum(post.engagement_shares);
  return (interactions / views) * 100;
}

function detectHookType(text: string): string {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
  if (firstLine.includes("?")) return "question";
  if (/^\d+/.test(firstLine) || /\b\d+[%x]\b/i.test(firstLine)) return "data-driven";
  if (/^(i|we)\b/i.test(firstLine) || /\b(learned|realized|discovered)\b/i.test(firstLine)) return "personal-story";
  if (/^(stop|don't|never|myth|wrong|nobody|unpopular)/i.test(firstLine)) return "contrarian";
  if (/^(how|here's|step|guide|way)/i.test(firstLine)) return "how-to";
  return "statement";
}

function detectTopic(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(hire|hiring|role|position|team|join us|looking for)\b/.test(lower)) return "hiring";
  if (/\b(product|feature|launch|release|update|ship)\b/.test(lower)) return "product";
  if (/\b(customer|client|case study|result|outcome|testimonial)\b/.test(lower)) return "social-proof";
  if (/\b(tip|tips|lesson|learned|mistake|advice)\b/.test(lower)) return "thought-leadership";
  if (/\b(event|webinar|conference|summit|meetup)\b/.test(lower)) return "event";
  if (/\b(story|journey|experience|remember when|years ago)\b/.test(lower)) return "storytelling";
  return "general";
}

function detectContentFormat(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const emojiListLines = lines.filter((l) => /^[^\w\s]/.test(l.trim())).length;
  if (emojiListLines >= 3) return "emoji-list";
  if (lines.length >= 8 && lines.filter((l) => l.trim().length < 60).length > lines.length * 0.6) return "short-punchy";
  if (text.length > 1500) return "long-form";
  return "standard";
}

function getPostDay(post: PostRow): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(post.posted_at || post.created_at);
  return days[d.getDay()];
}

function getPostHour(post: PostRow): number {
  return new Date(post.posted_at || post.created_at).getHours();
}

type AnalyzedPost = PostRow & {
  score: number;
  rate: number;
  hookType: string;
  topic: string;
  format: string;
  wordCount: number;
  hashtagCount: number;
  emojiCount: number;
  day: string;
  hour: number;
};

function analyzePost(post: PostRow): AnalyzedPost {
  const content = post.post_content || "";
  return {
    ...post,
    score: engagementScore(post),
    rate: engagementRate(post),
    hookType: detectHookType(content),
    topic: detectTopic(content),
    format: detectContentFormat(content),
    wordCount: content.split(/\s+/).length,
    hashtagCount: (content.match(/#\w+/g) || []).length,
    emojiCount: (content.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length,
    day: getPostDay(post),
    hour: getPostHour(post),
  };
}

function topPatternBy<K extends string>(
  posts: AnalyzedPost[],
  keyFn: (p: AnalyzedPost) => K,
  minSamples = 2
) {
  const map = new Map<K, { scores: number[]; rates: number[]; count: number }>();
  for (const p of posts) {
    const key = keyFn(p);
    const entry = map.get(key) || { scores: [], rates: [], count: 0 };
    entry.scores.push(p.score);
    entry.rates.push(p.rate);
    entry.count++;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.count >= minSamples)
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgScore: Math.round(avg(v.scores)),
      avgRate: Number(avg(v.rates).toFixed(2)),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    const windowDays = Math.min(365, Math.max(14, Number(searchParams.get("windowDays") || 90)));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - windowDays);

    let query = supabase
      .from("posts")
      .select(
        "id, title, post_content, prompt, created_at, posted_at, brand_id, engagement_views, engagement_likes, engagement_comments, engagement_shares"
      )
      .eq("user_id", authData.user.id)
      .in("status", ["posted", "published"])
      .gte("posted_at", sinceDate.toISOString())
      .order("posted_at", { ascending: false });

    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const posts = (rows || [])
      .filter((r): r is PostRow => typeof r.post_content === "string" && r.post_content.length > 20)
      .map(analyzePost);

    if (posts.length === 0) {
      return NextResponse.json({
        insufficientData: true,
        message: "No published posts with engagement data found. Publish content and sync engagement first.",
      });
    }

    // ── Overall baseline ──
    const baseline = {
      totalPosts: posts.length,
      avgViews: Math.round(avg(posts.map((p) => safeNum(p.engagement_views)))),
      avgLikes: Math.round(avg(posts.map((p) => safeNum(p.engagement_likes)))),
      avgComments: Math.round(avg(posts.map((p) => safeNum(p.engagement_comments)))),
      avgShares: Math.round(avg(posts.map((p) => safeNum(p.engagement_shares)))),
      avgScore: Math.round(avg(posts.map((p) => p.score))),
      avgEngagementRate: Number(avg(posts.map((p) => p.rate)).toFixed(2)),
    };

    // ── Top performing posts ──
    const topPosts = [...posts]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        hookType: p.hookType,
        topic: p.topic,
        format: p.format,
        score: p.score,
        engagementRate: p.rate,
        views: safeNum(p.engagement_views),
        likes: safeNum(p.engagement_likes),
        comments: safeNum(p.engagement_comments),
        shares: safeNum(p.engagement_shares),
        postedAt: p.posted_at,
        preview: (p.post_content || "").slice(0, 200),
      }));

    // ── Pattern analysis ──
    const byHookType = topPatternBy(posts, (p) => p.hookType);
    const byTopic = topPatternBy(posts, (p) => p.topic);
    const byFormat = topPatternBy(posts, (p) => p.format);
    const byDay = topPatternBy(posts, (p) => p.day, 1);
    const byHourBucket = topPatternBy(posts, (p) => {
      const h = p.hour;
      if (h < 9) return "early-morning";
      if (h < 12) return "morning";
      if (h < 14) return "lunch";
      if (h < 17) return "afternoon";
      return "evening";
    }, 1);

    // ── Word count sweet spot ──
    const byWordBucket = topPatternBy(posts, (p) => {
      if (p.wordCount < 80) return "short (<80 words)";
      if (p.wordCount < 150) return "medium (80-150 words)";
      if (p.wordCount < 250) return "long (150-250 words)";
      return "very-long (250+ words)";
    });

    // ── Engagement trends (weekly) ──
    const weekBuckets = new Map<string, { scores: number[]; count: number }>();
    for (const p of posts) {
      const d = new Date(p.posted_at || p.created_at);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const entry = weekBuckets.get(key) || { scores: [], count: 0 };
      entry.scores.push(p.score);
      entry.count++;
      weekBuckets.set(key, entry);
    }
    const trends = Array.from(weekBuckets.entries())
      .map(([week, data]) => ({
        week,
        posts: data.count,
        avgScore: Math.round(avg(data.scores)),
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ── Generate actionable insights ──
    const insights: string[] = [];

    if (byHookType.length >= 2) {
      const best = byHookType[0];
      const worst = byHookType[byHookType.length - 1];
      if (best.avgScore > worst.avgScore * 1.3) {
        insights.push(
          `${best.name} hooks outperform ${worst.name} hooks by ${Math.round(((best.avgScore - worst.avgScore) / worst.avgScore) * 100)}%. Lead with ${best.name} hooks more often.`
        );
      }
    }

    if (byTopic.length >= 2) {
      insights.push(
        `Your best-performing topic is "${byTopic[0].name}" (avg score: ${byTopic[0].avgScore}). Double down on this content pillar.`
      );
    }

    if (byWordBucket.length >= 2) {
      insights.push(
        `${byWordBucket[0].name} posts perform best for your audience. Target this word count range.`
      );
    }

    if (byDay.length >= 2) {
      const bestDays = byDay.slice(0, 2).map((d) => d.name);
      insights.push(
        `Your highest engagement days are ${bestDays.join(" and ")}. Prioritize posting on these days.`
      );
    }

    if (byHourBucket.length >= 2) {
      insights.push(
        `Posts published in the ${byHourBucket[0].name} get ${Math.round(((byHourBucket[0].avgScore - baseline.avgScore) / baseline.avgScore) * 100)}% more engagement than your average.`
      );
    }

    // Hashtag insight
    const postsWithManyHashtags = posts.filter((p) => p.hashtagCount > 5);
    const postsWithFewHashtags = posts.filter((p) => p.hashtagCount >= 2 && p.hashtagCount <= 5);
    if (postsWithManyHashtags.length >= 2 && postsWithFewHashtags.length >= 2) {
      const manyAvg = avg(postsWithManyHashtags.map((p) => p.score));
      const fewAvg = avg(postsWithFewHashtags.map((p) => p.score));
      if (fewAvg > manyAvg * 1.1) {
        insights.push("Posts with 2-5 hashtags outperform those with 6+. Keep hashtags focused.");
      }
    }

    // Emoji insight
    const postsWithEmoji = posts.filter((p) => p.emojiCount >= 2);
    const postsWithoutEmoji = posts.filter((p) => p.emojiCount === 0);
    if (postsWithEmoji.length >= 2 && postsWithoutEmoji.length >= 2) {
      const withAvg = avg(postsWithEmoji.map((p) => p.score));
      const withoutAvg = avg(postsWithoutEmoji.map((p) => p.score));
      if (withAvg > withoutAvg * 1.15) {
        insights.push("Posts with emojis get significantly more engagement. Keep using 2-4 emojis per post.");
      }
    }

    return NextResponse.json({
      windowDays,
      baseline,
      topPosts,
      patterns: {
        hookType: byHookType,
        topic: byTopic,
        format: byFormat,
        day: byDay,
        timeOfDay: byHourBucket,
        wordCount: byWordBucket,
      },
      trends,
      insights: insights.slice(0, 8),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
