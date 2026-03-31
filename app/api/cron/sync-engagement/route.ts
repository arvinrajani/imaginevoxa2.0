import { NextResponse } from "next/server";
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 60;

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron job: auto-sync LinkedIn engagement metrics for recently posted content.
 * Runs on a schedule (e.g. every 6 hours) to keep engagement data fresh.
 *
 * Fetches metrics at 3 intervals:
 *   - 24h after posting  (early signal)
 *   - 48h after posting  (mid signal)
 *   - 7d after posting   (final snapshot)
 *
 * After 7d, posts stop being synced unless engagement is still growing.
 */

export const dynamic = "force-dynamic";

type EngagementStats = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

const safeNumber = (value: unknown) => Number(value || 0);

async function fetchLinkedIn(url: string, accessToken: string) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text.substring(0, 300)}`);
  }
  return response.json();
}

async function getEngagement(postUrn: string, accessToken: string): Promise<EngagementStats> {
  // Try social actions API first (most reliable)
  const encodedUrn = encodeURIComponent(postUrn);
  const data = await fetchLinkedIn(
    `https://api.linkedin.com/v2/socialActions/${encodedUrn}`,
    accessToken
  );
  return {
    views: safeNumber(data.totalShareStatistics?.impressionCount),
    likes: safeNumber(data.likesSummary?.totalCount || data.likeSummary?.totalCount),
    comments: safeNumber(data.commentsSummary?.totalCount),
    shares: safeNumber(
      data.shareStatistics?.shareCount ||
        data.totalShareStatistics?.shareCount ||
        data.shareCount
    ),
  };
}

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    const header = request.headers.get("x-cron-secret")?.trim();
    if (!secret || !header || secret.length !== header.length ||
        !require('crypto').timingSafeEqual(Buffer.from(header), Buffer.from(secret))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();

    // Find posts that were published within the last 10 days and have a linkedin_post_urn
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: posts, error: postsError } = await admin
      .from("posts")
      .select(
        "id, user_id, linkedin_post_urn, posted_at, engagement_views, engagement_likes, engagement_comments, engagement_shares, engagement_updated_at"
      )
      .in("status", ["posted", "published"])
      .not("linkedin_post_urn", "is", null)
      .gte("posted_at", tenDaysAgo)
      .order("posted_at", { ascending: false })
      .limit(50);

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: "No recent posts to sync." });
    }

    // Group posts by user to fetch connection tokens efficiently
    const userIds = [...new Set(posts.map((p) => p.user_id))];
    const { data: connections } = await admin
      .from("linkedin_connections")
      .select("user_id, access_token, org_access_token, expires_at")
      .in("user_id", userIds);

    const tokenMap = new Map<string, string>();
    for (const conn of connections || []) {
      if (!conn.access_token) continue;
      if (conn.expires_at && new Date(conn.expires_at) <= now) continue;
      tokenMap.set(conn.user_id, conn.access_token);
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const post of posts) {
      const accessToken = tokenMap.get(post.user_id);
      if (!accessToken || !post.linkedin_post_urn) {
        skipped++;
        continue;
      }

      // Skip if already synced within the last 4 hours
      if (post.engagement_updated_at) {
        const lastSync = new Date(post.engagement_updated_at);
        const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync < 4) {
          skipped++;
          continue;
        }
      }

      // Determine sync priority based on post age
      const postedAt = new Date(post.posted_at);
      const hoursOld = (now.getTime() - postedAt.getTime()) / (1000 * 60 * 60);

      // Skip posts older than 10 days unless they're still getting engagement growth
      if (hoursOld > 240) {
        const prevTotal =
          safeNumber(post.engagement_views) +
          safeNumber(post.engagement_likes) +
          safeNumber(post.engagement_comments) +
          safeNumber(post.engagement_shares);
        // If engagement is very low or stale, stop syncing
        if (prevTotal < 5) {
          skipped++;
          continue;
        }
      }

      try {
        const stats = await getEngagement(post.linkedin_post_urn, accessToken);

        const { error: updateError } = await admin
          .from("posts")
          .update({
            engagement_views: stats.views,
            engagement_likes: stats.likes,
            engagement_comments: stats.comments,
            engagement_shares: stats.shares,
            engagement_updated_at: now.toISOString(),
          })
          .eq("id", post.id);

        if (updateError) {
          errors.push(`Update failed for ${post.id}: ${updateError.message}`);
        } else {
          synced++;
        }
      } catch (err) {
        errors.push(`Fetch failed for ${post.id}: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      // Rate-limit: small delay between LinkedIn API calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: posts.length,
      errors: errors.slice(0, 10),
      syncedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Engagement sync cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
