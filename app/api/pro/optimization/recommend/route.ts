import { NextResponse } from "next/server";

export const maxDuration = 60;

import { createServerSupabase } from "@/lib/supabase/server";

type PostRow = {
  id: string;
  title: string | null;
  post_content: string | null;
  created_at: string;
  posted_at: string | null;
  engagement_views: number | null;
  engagement_likes: number | null;
  engagement_comments: number | null;
  engagement_shares: number | null;
};

type ScoredPost = PostRow & {
  score: number;
  lengthBucket: "short" | "standard" | "long";
  hookType: "question" | "data" | "story" | "statement";
  hasCTA: boolean;
  hashtagCount: number;
  postHour: number;
  postDay: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toScore(post: PostRow) {
  const views = Number(post.engagement_views || 0);
  const likes = Number(post.engagement_likes || 0);
  const comments = Number(post.engagement_comments || 0);
  const shares = Number(post.engagement_shares || 0);
  return views + likes * 5 + comments * 10 + shares * 15;
}

function detectLengthBucket(text: string): "short" | "standard" | "long" {
  const chars = text.trim().length;
  if (chars < 700) return "short";
  if (chars > 1500) return "long";
  return "standard";
}

function detectHookType(text: string): "question" | "data" | "story" | "statement" {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  if (firstLine.includes("?")) return "question";
  if (/^\d+/.test(firstLine) || /\b\d+[%x]\b/i.test(firstLine)) return "data";
  if (/^(i|we)\b/i.test(firstLine) || /\blearned\b/i.test(firstLine)) return "story";
  return "statement";
}

function hasCTA(text: string) {
  return /(comment|share|let me know|what do you think|dm|message me|follow|save this|try this)/i.test(text);
}

function hashtagCount(text: string) {
  return (text.match(/#[a-z0-9_]+/gi) || []).length;
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateBy<T extends string>(posts: ScoredPost[], key: (post: ScoredPost) => T) {
  const map = new Map<T, { count: number; score: number }>();
  for (const post of posts) {
    const bucket = key(post);
    const current = map.get(bucket) || { count: 0, score: 0 };
    current.count += 1;
    current.score += post.score;
    map.set(bucket, current);
  }
  return Array.from(map.entries())
    .map(([name, values]) => ({
      name,
      count: values.count,
      avgScore: values.score / Math.max(1, values.count),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsedWindowDays = Number(searchParams.get("windowDays") || 90);
    const windowDays = Number.isFinite(parsedWindowDays)
      ? Math.min(180, Math.max(14, Math.floor(parsedWindowDays)))
      : 90;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - windowDays);

    const { data: rows, error } = await supabase
      .from("posts")
      .select(
        "id, title, post_content, created_at, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares"
      )
      .eq("user_id", user.id)
      .in("status", ["posted", "published"])
      .gte("created_at", sinceDate.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const scoredPosts: ScoredPost[] = (rows || [])
      .filter((row): row is PostRow => typeof row.post_content === "string" && row.post_content.trim().length > 0)
      .map((row) => {
        const content = row.post_content || "";
        const postedAt = new Date(row.posted_at || row.created_at);
        return {
          ...row,
          score: toScore(row),
          lengthBucket: detectLengthBucket(content),
          hookType: detectHookType(content),
          hasCTA: hasCTA(content),
          hashtagCount: hashtagCount(content),
          postHour: postedAt.getHours(),
          postDay: DAY_LABELS[postedAt.getDay()],
        };
      });

    const scoreValues = scoredPosts.map((post) => post.score);
    const avgScoreOverall = avg(scoreValues);
    const positivePosts = scoredPosts.filter((post) => post.score > 0);
    const basePosts = positivePosts.length >= 3 ? positivePosts : scoredPosts;

    const byHookType = aggregateBy(basePosts, (post) => post.hookType);
    const byLength = aggregateBy(basePosts, (post) => post.lengthBucket);
    const byDayHour = aggregateBy(basePosts, (post) => `${post.postDay} ${post.postHour.toString().padStart(2, "0")}:00`);
    const ctaWith = basePosts.filter((post) => post.hasCTA).map((post) => post.score);
    const ctaWithout = basePosts.filter((post) => !post.hasCTA).map((post) => post.score);

    const bestHook = byHookType[0];
    const bestLength = byLength[0];
    const bestSlots = byDayHour.slice(0, 3);
    const ctaLift = avg(ctaWith) - avg(ctaWithout);
    const avgHashtags = avg(basePosts.map((post) => post.hashtagCount));

    const recommendations: string[] = [];
    if (bestHook) {
      recommendations.push(
        `Lead with a ${bestHook.name} hook. It averages ${Math.round(bestHook.avgScore)} weighted engagement points in your recent posts.`
      );
    }
    if (bestLength) {
      recommendations.push(
        `Use ${bestLength.name} length posts as your default. This format is currently your strongest performer.`
      );
    }
    if (bestSlots.length > 0) {
      recommendations.push(
        `Schedule around ${bestSlots.map((slot) => slot.name).join(", ")} for higher consistency.`
      );
    }
    if (Number.isFinite(ctaLift) && Math.abs(ctaLift) >= 10) {
      recommendations.push(
        ctaLift > 0
          ? "Keep clear CTAs. Posts with direct asks are outperforming those without them."
          : "Reduce hard CTAs. Your audience responds better to insight-first posts."
      );
    }
    if (avgHashtags > 6) {
      recommendations.push("Trim hashtags to 3-5 focused tags. Over-tagging appears to dilute engagement.");
    } else if (avgHashtags < 2) {
      recommendations.push("Add 3-5 targeted hashtags to improve discoverability.");
    }

    const promptBooster = [
      bestHook ? `Start with a ${bestHook.name} hook.` : null,
      bestLength ? `Target ${bestLength.name} length.` : null,
      bestSlots.length > 0 ? `Best posting windows: ${bestSlots.map((slot) => slot.name).join(", ")}.` : null,
      ctaLift > 0 ? "End with a direct CTA inviting comments." : "End with a soft reflection question.",
      "Prioritize practical insight density and one clear takeaway.",
    ]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json({
      windowDays,
      postsAnalyzed: scoredPosts.length,
      insufficientData: scoredPosts.length < 3,
      baseline: {
        averageScore: Math.round(avgScoreOverall),
        averageViews: Math.round(avg(scoredPosts.map((post) => Number(post.engagement_views || 0)))),
        averageLikes: Math.round(avg(scoredPosts.map((post) => Number(post.engagement_likes || 0)))),
        averageComments: Math.round(avg(scoredPosts.map((post) => Number(post.engagement_comments || 0)))),
        averageShares: Math.round(avg(scoredPosts.map((post) => Number(post.engagement_shares || 0)))),
      },
      topPatterns: {
        hookType: byHookType.slice(0, 3),
        length: byLength.slice(0, 3),
        postingWindows: bestSlots,
      },
      recommendations: recommendations.slice(0, 6),
      promptBooster,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
