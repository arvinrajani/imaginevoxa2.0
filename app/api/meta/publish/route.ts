import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  parseMetaPages,
  publishToFacebookPage,
  publishToInstagramAccount,
} from "@/lib/social/meta";

const inputSchema = z.object({
  channel: z.enum(["facebook", "instagram"]),
  postId: z.string().uuid().optional().nullable(),
  message: z.string().min(1, "Post message is required"),
  imageUrl: z.string().url().optional().nullable(),
  facebookPageId: z.string().optional().nullable(),
  instagramAccountId: z.string().optional().nullable(),
});

function isMissingMetaTable(message: string | undefined) {
  if (!message) return false;
  return /relation\s+"?[^"\s]*meta_connections[^"\s]*"?\s+does\s+not\s+exist/i.test(
    message
  );
}

function mergePublishChannels(value: unknown, channel: "facebook" | "instagram") {
  const channels = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (!channels.includes(channel)) {
    channels.push(channel);
  }

  return channels;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const publishPost =
      input.postId
        ? await supabase
            .from("posts")
            .select("id, user_id, publish_channels, publish_results")
            .eq("id", input.postId)
            .eq("user_id", user.id)
            .maybeSingle()
        : null;

    if (publishPost?.error) {
      return NextResponse.json({ error: "Failed to load the selected post." }, { status: 500 });
    }

    if (input.postId && !publishPost?.data) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    // Load Meta connection
    const { data: connection, error: connError } = await supabase
      .from("meta_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connError) {
      if (isMissingMetaTable(connError.message)) {
        return NextResponse.json(
          {
            error:
              "Meta setup missing. Run supabase/meta-social.sql in Supabase SQL Editor.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Failed to load Meta connection." },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json(
        { error: "Meta account not connected. Please connect via Settings." },
        { status: 400 }
      );
    }

    // Check token expiry
    if (connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "Meta token expired. Please reconnect your Meta account." },
          { status: 401 }
        );
      }
    }

    const pages = parseMetaPages(connection.pages);
    if (pages.length === 0) {
      return NextResponse.json(
        { error: "No Facebook pages found. Please reconnect your Meta account." },
        { status: 400 }
      );
    }

    // ─── Facebook Publishing ───
    if (input.channel === "facebook") {
      let persistenceWarning: string | null = null;
      const targetPageId =
        input.facebookPageId ||
        connection.default_facebook_page_id ||
        pages[0]?.id;

      const page = pages.find((p) => p.id === targetPageId);
      if (!page) {
        return NextResponse.json(
          { error: "Facebook page not found. Please reconnect your Meta account." },
          { status: 400 }
        );
      }

      const result = await publishToFacebookPage({
        pageId: page.id,
        pageAccessToken: page.access_token,
        message: input.message,
        imageUrl: input.imageUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Facebook publishing failed." },
          { status: 500 }
        );
      }

      if (input.postId && publishPost?.data) {
        const publishResults = asRecord(publishPost.data.publish_results);
        publishResults.facebook = {
          status: "published",
          published_at: new Date().toISOString(),
          page_id: page.id,
          page_name: page.name,
          post_id: result.postId || null,
          object_id: result.objectId || null,
          permalink_url: result.permalinkUrl || null,
        };

        const { error: postUpdateError } = await supabase
          .from("posts")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            facebook_page_id: page.id,
            facebook_post_id: result.postId || null,
            publish_channels: mergePublishChannels(publishPost.data.publish_channels, "facebook"),
            publish_results: publishResults,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.postId)
          .eq("user_id", user.id);

        if (postUpdateError) {
          persistenceWarning = "Facebook published, but saving the publish result failed.";
          console.error("Facebook publish persistence error:", postUpdateError);
        }
      }

      return NextResponse.json({
        success: true,
        channel: "facebook",
        postId: result.postId,
        objectId: result.objectId,
        permalinkUrl: result.permalinkUrl || null,
        pageName: page.name,
        pageId: page.id,
        warning: persistenceWarning,
      });
    }

    // ─── Instagram Publishing ───
    if (input.channel === "instagram") {
      let persistenceWarning: string | null = null;
      const targetIgId =
        input.instagramAccountId ||
        connection.default_instagram_account_id ||
        pages.find((p) => p.instagram_business_account_id)
          ?.instagram_business_account_id;

      if (!targetIgId) {
        return NextResponse.json(
          {
            error:
              "No Instagram Business account linked. Link an Instagram account to a Facebook page first.",
          },
          { status: 400 }
        );
      }

      // Find the page that owns this IG account to get the page access token
      const ownerPage = pages.find(
        (p) => p.instagram_business_account_id === targetIgId
      );
      if (!ownerPage) {
        return NextResponse.json(
          {
            error:
              "Could not find the Facebook page token for this Instagram account.",
          },
          { status: 400 }
        );
      }

      if (!input.imageUrl) {
        return NextResponse.json(
          { error: "Instagram requires an image. Please add an image to your post." },
          { status: 400 }
        );
      }

      const result = await publishToInstagramAccount({
        instagramAccountId: targetIgId,
        pageAccessToken: ownerPage.access_token,
        caption: input.message,
        imageUrl: input.imageUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Instagram publishing failed." },
          { status: 500 }
        );
      }

      if (input.postId && publishPost?.data) {
        const publishResults = asRecord(publishPost.data.publish_results);
        publishResults.instagram = {
          status: "published",
          published_at: new Date().toISOString(),
          account_id: targetIgId,
          username: ownerPage.instagram_username || null,
          owner_page_id: ownerPage.id,
          owner_page_name: ownerPage.name,
          media_id: result.mediaId || null,
          creation_id: result.creationId || null,
          permalink_url: result.permalinkUrl || null,
        };

        const { error: postUpdateError } = await supabase
          .from("posts")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            instagram_account_id: targetIgId,
            instagram_media_id: result.mediaId || null,
            publish_channels: mergePublishChannels(publishPost.data.publish_channels, "instagram"),
            publish_results: publishResults,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.postId)
          .eq("user_id", user.id);

        if (postUpdateError) {
          persistenceWarning = "Instagram published, but saving the publish result failed.";
          console.error("Instagram publish persistence error:", postUpdateError);
        }
      }

      return NextResponse.json({
        success: true,
        channel: "instagram",
        mediaId: result.mediaId,
        creationId: result.creationId,
        permalinkUrl: result.permalinkUrl || null,
        pageName: ownerPage.name,
        pageId: ownerPage.id,
        instagramAccountId: targetIgId,
        igUsername: ownerPage.instagram_username,
        warning: persistenceWarning,
      });
    }

    return NextResponse.json(
      { error: "Unsupported channel." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((e: { message: string }) => e.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("Meta publish endpoint error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Meta publishing failed.",
      },
      { status: 500 }
    );
  }
}
