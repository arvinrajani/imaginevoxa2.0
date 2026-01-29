import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type EngagementStats = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

const safeNumber = (value: unknown) => Number(value || 0);

const fetchLinkedIn = async (url: string, accessToken: string) => {
  const response = await fetch(url, {
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
};

const getShareStats = async (shareId: string, accessToken: string): Promise<EngagementStats> => {
  const data = await fetchLinkedIn(`https://api.linkedin.com/v2/shares/${shareId}`, accessToken);
  const stats = data.totalShareStatistics || {};

  return {
    views: safeNumber(stats.impressionCount),
    likes: safeNumber(stats.likeCount),
    comments: safeNumber(stats.commentCount),
    shares: safeNumber(stats.shareCount),
  };
};

const getSocialStats = async (postUrn: string, accessToken: string): Promise<EngagementStats> => {
  const encodedUrn = encodeURIComponent(postUrn);
  const data = await fetchLinkedIn(`https://api.linkedin.com/v2/socialActions/${encodedUrn}`, accessToken);

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
};

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: connection, error: connectionError } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError || !connection?.access_token) {
      return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });
    }

    if (connection.expires_at) {
      const expiresAt = new Date(connection.expires_at);
      if (expiresAt <= new Date()) {
        return NextResponse.json(
          { error: "LinkedIn token expired. Please reconnect." },
          { status: 401 }
        );
      }
    }

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, linkedin_post_urn, target_type, target_urn")
      .eq("user_id", user.id)
      .eq("status", "posted")
      .not("linkedin_post_urn", "is", null);

    if (postsError) {
      return NextResponse.json({ error: "Failed to fetch posts." }, { status: 500 });
    }

    let updatedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const post of posts || []) {
      if (!post.linkedin_post_urn) continue;

      try {
        const postUrn: string = post.linkedin_post_urn;
        let shareId: string | null = null;
        let shareStats: EngagementStats | null = null;
        let socialStats: EngagementStats | null = null;

        if (postUrn.startsWith("urn:li:share:")) {
          shareId = postUrn.split(":").pop() || null;
        }

        if (!shareId && postUrn.startsWith("urn:li:ugcPost:")) {
          try {
            const encodedUrn = encodeURIComponent(postUrn);
            const ugcData = await fetchLinkedIn(`https://api.linkedin.com/v2/ugcPosts/${encodedUrn}`, connection.access_token);
            const shareUrn = ugcData?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareUrn;
            if (shareUrn) {
              shareId = shareUrn.split(":").pop() || null;
            }
          } catch (ugcError) {
            console.error(`Failed to fetch UGC post for ${post.id}:`, ugcError);
          }
        }

        if (shareId) {
          try {
            shareStats = await getShareStats(shareId, connection.access_token);
          } catch (shareError) {
            console.error(`Failed to fetch share stats for post ${post.id}:`, shareError);
          }
        }

        try {
          socialStats = await getSocialStats(postUrn, connection.access_token);
        } catch (socialError) {
          console.error(`Failed to fetch social stats for post ${post.id}:`, socialError);
        }

        if (!shareStats && !socialStats) {
          warnings.push(`No analytics data returned for post ${post.id}`);
          continue;
        }

        const mergedStats: EngagementStats = {
          views: shareStats?.views ?? socialStats?.views ?? 0,
          likes: shareStats?.likes ?? socialStats?.likes ?? 0,
          comments: shareStats?.comments ?? socialStats?.comments ?? 0,
          shares: shareStats?.shares ?? socialStats?.shares ?? 0,
        };

        const { error: updateError } = await supabase
          .from("posts")
          .update({
            engagement_views: mergedStats.views,
            engagement_likes: mergedStats.likes,
            engagement_comments: mergedStats.comments,
            engagement_shares: mergedStats.shares,
            engagement_updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        if (updateError) {
          errors.push(`Failed to update post ${post.id}: ${updateError.message}`);
          continue;
        }

        updatedCount += 1;
      } catch (error) {
        console.error(`Error syncing post ${post.id}:`, error);
        errors.push(`Error syncing post ${post.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      syncedAt: new Date().toISOString(),
      errors,
      warnings,
    });
  } catch (error) {
    console.error("Sync endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
