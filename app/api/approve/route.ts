import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeTranscodeWithZencoder } from "@/lib/video";

type ApproveRequest = {
  postId: string;
  autoPost?: boolean;
  targetType?: 'person' | 'organization';
  targetUrn?: string;
  imageUrl?: string;
  imageUrls?: string[];
  content?: string;
};

type LinkedInSharePayload = {
  owner: string;
  text: { text: string };
  distribution: { linkedInDistributionTarget: Record<string, never> };
};

type LinkedInPostsPayload = {
  author: string;
  commentary: string;
  visibility: "PUBLIC";
  distribution: {
    feedDistribution: "MAIN_FEED";
    targetEntities: string[];
    thirdPartyDistributionChannels: string[];
  };
  lifecycleState: "PUBLISHED";
  isReshareDisabledByAuthor: boolean;
  content?: {
    media: {
      title: string;
      id?: string;
    };
  };
};

type LinkedInUgcMediaItem = {
  status: "READY";
  description: { text: string };
  media?: string | null;
  title: { text: string };
};

type LinkedInUgcPayload = {
  author: string;
  lifecycleState: "PUBLISHED";
  specificContent: {
    "com.linkedin.ugc.ShareContent": {
      shareCommentary: { text: string };
      shareMediaCategory: "VIDEO" | "IMAGE" | "NONE";
      media?: LinkedInUgcMediaItem[];
    };
  };
  visibility: {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC";
  };
};

// Helper function to upload image to LinkedIn using the v2 Assets API
async function uploadImageToLinkedIn(
  imageUrl: string,
  accessToken: string,
  authorUrn: string
): Promise<string | null> {
  try {
    const isDataUrl = imageUrl.startsWith("data:");
    console.log("🖼️ Step 1: Downloading image from:", isDataUrl ? "data-url" : imageUrl);

    let imageBody: ArrayBuffer | Buffer;
    let contentType = "image/jpeg";

    if (isDataUrl) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        console.error("❌ Invalid data URL format");
        return null;
      }
      contentType = match[1] || contentType;
      imageBody = Buffer.from(match[2], "base64");
      console.log("✅ Data URL decoded, size:", imageBody.byteLength, "bytes, type:", contentType);
    } else {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error("❌ Failed to download image:", imageResponse.status);
        return null;
      }

      imageBody = await imageResponse.arrayBuffer();
      contentType = imageResponse.headers.get("content-type") || contentType;
      console.log("✅ Image downloaded, size:", imageBody.byteLength, "bytes, type:", contentType);
    }

    // Step 2: Register upload with LinkedIn's v2 Assets API
    console.log("🖼️ Step 2: Registering upload with LinkedIn...");
    const registerResponse = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.error("❌ Failed to register upload:", registerResponse.status, errorText.substring(0, 300));
      return null;
    }

    const registerData = await registerResponse.json();
    console.log("✅ Upload registered:", JSON.stringify(registerData).substring(0, 300));
    
    const uploadUrl = registerData?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      console.error("❌ Missing uploadUrl or assetUrn in response");
      return null;
    }

    // Step 3: Upload the actual image binary
    console.log("🖼️ Step 3: Uploading image binary to:", uploadUrl.substring(0, 80) + "...");
    const uploadBody =
      imageBody instanceof ArrayBuffer ? new Uint8Array(imageBody) : new Uint8Array(imageBody);
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: uploadBody,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("❌ Failed to upload image binary:", uploadResponse.status, errorText.substring(0, 200));
      return null;
    }

    console.log("✅ Image uploaded successfully! Asset URN:", assetUrn);
    
    // Wait for LinkedIn to process the image
    console.log("⏳ Waiting 3 seconds for LinkedIn to process...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return assetUrn;
  } catch (error) {
    console.error("❌ Error in uploadImageToLinkedIn:", error);
    return null;
  }
}

// Helper function to upload video to LinkedIn using the v2 Assets API
async function uploadVideoToLinkedIn(
  videoFile: File,
  accessToken: string,
  authorUrn: string
): Promise<string | null> {
  try {
    const contentType = videoFile.type || "video/mp4";
    console.log("🎬 Step 1: Preparing video upload:", videoFile.name, contentType);

    const registerResponse = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
          supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
        },
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.error("❌ Failed to register video upload:", registerResponse.status, errorText.substring(0, 300));
      return null;
    }

    const registerData = await registerResponse.json();
    const uploadUrl =
      registerData?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      console.error("❌ Missing video uploadUrl or assetUrn in response");
      return null;
    }

    const videoBuffer = await videoFile.arrayBuffer();
    console.log("🎬 Step 2: Uploading video binary:", videoBuffer.byteLength, "bytes");

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: videoBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("❌ Failed to upload video binary:", uploadResponse.status, errorText.substring(0, 200));
      return null;
    }

    console.log("✅ Video uploaded successfully! Asset URN:", assetUrn);
    console.log("⏳ Waiting 5 seconds for LinkedIn to process video...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    return assetUrn;
  } catch (error) {
    console.error("❌ Error in uploadVideoToLinkedIn:", error);
    return null;
  }
}

// Helper function to post to LinkedIn using the REST API (Posts API)
// This newer API is more permissive for organization posting
async function postToLinkedIn(
  accessToken: string,
  authorUrn: string,
  text: string,
  imageAssetUrns?: string[],
  videoAssetUrn?: string | null
): Promise<{ success: boolean; postUrn?: string; error?: string }> {
  try {
    console.log("📤 Creating LinkedIn post...");
    console.log("Author URN:", authorUrn);
    console.log("Image count:", imageAssetUrns?.length || 0);
    console.log("Has video:", !!videoAssetUrn);

    // For organizations, we need to use a specific API approach
    const isOrganization = authorUrn.includes('organization');
    const hasVideo = !!videoAssetUrn;
    const hasImages = !hasVideo && !!imageAssetUrns && imageAssetUrns.length > 0;
    const hasMultipleImages = hasImages && !!imageAssetUrns && imageAssetUrns.length > 1;
    
    if (isOrganization && !hasImages && !hasVideo) {
      console.log("🏢 Posting as organization - trying Community Management approach");
      
      // Try the Share API (sometimes works for organizations)
      const sharePayload: LinkedInSharePayload = {
        owner: authorUrn,
        text: {
          text: text
        },
        distribution: {
          linkedInDistributionTarget: {}
        }
      };

      console.log("📋 Share payload:", JSON.stringify(sharePayload, null, 2));

      const shareResponse = await fetch("https://api.linkedin.com/v2/shares", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(sharePayload),
      });

      console.log("LinkedIn Share API response status:", shareResponse.status);

      if (shareResponse.ok || shareResponse.status === 201) {
        const responseData = await shareResponse.json();
        const postUrn = responseData?.id || responseData?.activity;
        console.log("✅ Organization post created via Share API! URN:", postUrn);
        return { success: true, postUrn };
      }
      
      const shareError = await shareResponse.text();
      console.log("Share API error:", shareError.substring(0, 300));
      
      // If Share API fails, try UGC Posts API with organization
      console.log("⚠️ Share API failed, trying UGC Posts API for organization...");
    } else if (isOrganization && (hasImages || hasVideo)) {
      console.log("Skipping Share API because media is attached");
    }

    // Try the versioned Posts API first
    const postPayload: LinkedInPostsPayload = {
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    };

    // Add image if present
    if (hasImages && !hasMultipleImages) {
      postPayload.content = {
        media: {
          title: "Image",
          id: imageAssetUrns?.[0]
        }
      };
    }

    console.log("📋 Post payload (Posts API):", JSON.stringify(postPayload, null, 2).substring(0, 700));

    // Try the versioned Posts API
    const shouldUsePostsApi = !hasVideo && !hasMultipleImages;
    let response: Response | null = null;
    if (shouldUsePostsApi) {
      response = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": "202401"
        },
        body: JSON.stringify(postPayload),
      });
    } else {
      console.log("Skipping Posts API because media is not supported");
    }

    if (response) {
      console.log("LinkedIn Posts API response status:", response.status);

      if (response.ok || response.status === 201) {
        const postUrn = response.headers.get("x-restli-id") || response.headers.get("x-linkedin-id");
        console.log("✅ Post created successfully via Posts API! URN:", postUrn);
        return { success: true, postUrn: postUrn || undefined };
      }
    }

    // If Posts API fails or is skipped, fall back to UGC Posts API
    if (response) {
      console.log("Posts API failed, trying UGC Posts API...");
    } else {
      console.log("Using UGC Posts API for multi-image post...");
    }
    
    // Build media array if we have an image
    const media: LinkedInUgcMediaItem[] | undefined = hasVideo
      ? [
          {
            status: "READY",
            description: {
              text: "Video",
            },
            media: videoAssetUrn,
            title: {
              text: "Video",
            },
          },
        ]
      : hasImages
      ? imageAssetUrns?.map(
          (assetUrn): LinkedInUgcMediaItem => ({
            status: "READY",
            description: {
              text: "Image",
            },
            media: assetUrn,
            title: {
              text: "Image",
            },
          })
        )
      : undefined;

    // Build the UGC post payload
    const ugcPayload: LinkedInUgcPayload = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: text,
          },
          shareMediaCategory: hasVideo ? "VIDEO" : hasImages ? "IMAGE" : "NONE",
          ...(media && { media }),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    console.log("📋 UGC Post payload:", JSON.stringify(ugcPayload, null, 2).substring(0, 700));

    response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(ugcPayload),
    });

    console.log("LinkedIn UGC API response status:", response.status);

    if (response.ok || response.status === 201) {
      const responseData = await response.json();
      const postUrn = responseData?.id;
      console.log("✅ Post created successfully via UGC API! URN:", postUrn);
      return { success: true, postUrn };
    } else {
      const errorText = await response.text();
      console.error("❌ LinkedIn API error:", response.status, errorText.substring(0, 500));
      
      // Check for permission errors
      if (response.status === 403) {
        // Check if this is an organization posting error
        if (authorUrn.includes('organization')) {
          return { 
            success: false, 
            error: `Cannot post as organization. Your LinkedIn app needs "w_organization_social" scope which requires Marketing Developer Platform approval from LinkedIn. For now, please post as your personal profile instead.` 
          };
        }
        return { 
          success: false, 
          error: `LinkedIn permission denied. Error: ${errorText.substring(0, 200)}` 
        };
      }
      
      return { success: false, error: `LinkedIn API Error (${response.status}): ${errorText.substring(0, 300)}` };
    }
  } catch (error) {
    console.error("❌ Error in postToLinkedIn:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const cronHeader = request.headers.get("x-cron-secret")?.trim();
    const isCron = Boolean(cronSecret && cronHeader && cronHeader === cronSecret);

    const supabase = isCron ? createAdminClient() : await createServerSupabase();
    const userResult = isCron ? { data: { user: null }, error: null } : await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!isCron && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    let body: ApproveRequest;
    let videoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = {
        postId: (formData.get("postId") as string) || "",
        content: (formData.get("content") as string) || "",
        targetType: (formData.get("targetType") as "person" | "organization") || undefined,
        targetUrn: (formData.get("targetUrn") as string) || undefined,
        imageUrl: (formData.get("imageUrl") as string) || undefined,
        imageUrls: formData.getAll("imageUrls").map(value => String(value)),
      };
      const maybeVideo = formData.get("video");
      videoFile = maybeVideo instanceof File ? maybeVideo : null;
    } else {
      body = (await request.json()) as ApproveRequest;
    }
    if (!body.postId) {
      return NextResponse.json({ error: "Missing post id." }, { status: 400 });
    }

    const postQuery = supabase
      .from("posts")
      .select("*")
      .eq("id", body.postId);
    if (!isCron && user?.id) {
      postQuery.eq("user_id", user.id);
    }

    const { data: post, error: postError } = await postQuery.single();

    if (postError || !post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const effectiveUserId = user?.id || post.user_id;
    if (!effectiveUserId) {
      return NextResponse.json({ error: "Missing post owner." }, { status: 400 });
    }

    const updatedContent = body.content?.trim();
    const postContent = updatedContent && updatedContent.length > 0 ? updatedContent : post.post_content;

    // Update post status to approved first
    const { data: updated, error: updateError } = await supabase
      .from("posts")
      .update({
        status: "approved",
        ...(updatedContent ? { post_content: postContent } : {}),
      })
      .eq("id", post.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Failed to update post." }, { status: 500 });
    }

    // Send to n8n for any custom approval workflows (optional)
    const webhookUrl = process.env.N8N_APPROVE_WEBHOOK_URL;
    const apiKey = process.env.N8N_X_API_KEY;
    if (webhookUrl && apiKey) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            postId: post.id,
            userId: effectiveUserId,
            title: post.title,
            post_content: postContent,
            image_url: post.image_url,
          }),
        });
      } catch {
        // Don't fail if n8n webhook fails
      }
    }

    // If autoPost is true or not specified, post to LinkedIn
    if (body.autoPost !== false) {
      console.log("🔵 Starting auto-post to LinkedIn...");

      const { data: connection, error: connectionError } = await supabase
        .from("linkedin_connections")
        .select("*")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      console.log("LinkedIn connection check:", {
        hasConnection: !!connection,
        hasToken: !!connection?.access_token,
        hasOrgToken: !!connection?.org_access_token,
        memberUrn: connection?.member_urn,
        error: connectionError,
      });

      if (connectionError || !connection) {
        console.error("? LinkedIn connection missing");
        return NextResponse.json({
          ...updated,
          message: "Approved but not posted - LinkedIn not connected",
        });
      }

      const targetUrn = body.targetUrn || post.target_urn || connection.member_urn;
      const targetType = body.targetType || post.target_type || 'person';
      
      const isOrgPost = targetType === "organization";
      const accessToken = isOrgPost ? connection.org_access_token : connection.access_token;
      const tokenExpiresAt = isOrgPost ? connection.org_expires_at : connection.expires_at;
      const connectionScopes = (isOrgPost ? connection.org_scopes : connection.scopes) as string[] | null;

      if (!accessToken) {
        return NextResponse.json({
          ...updated,
          status: "failed",
          message: isOrgPost
            ? "Organization app not connected. Please connect the organization LinkedIn app."
            : "LinkedIn not connected.",
        });
      }

      // Check if token is expired
      if (tokenExpiresAt) {
        const expiresAt = new Date(tokenExpiresAt);
        if (expiresAt <= new Date()) {
          console.error("? LinkedIn token expired");
          return NextResponse.json({
            ...updated,
            status: "failed",
            message: "LinkedIn token expired. Please reconnect.",
          });
        }
      }

      if (!targetUrn || !targetUrn.startsWith("urn:li:")) {
        console.error("❌ Invalid target URN:", targetUrn);
        return NextResponse.json({
          ...updated,
          status: "failed",
          message: "Missing or invalid LinkedIn URN",
        });
      }

      console.log("📤 Posting to LinkedIn as:", targetType, targetUrn);
      
      // Validate URN format for organizations
      if (targetType === 'organization') {
        // Organization URN must be numeric: urn:li:organization:12345678
        const orgIdMatch = targetUrn.match(/urn:li:organization:(\d+)/);
        if (!orgIdMatch) {
          console.error("❌ Invalid organization URN format:", targetUrn);
          console.error("Organization URNs must use numeric IDs, not URL slugs!");
          return NextResponse.json({
            ...updated,
            status: "failed",
            message: `Invalid organization ID. LinkedIn requires a numeric organization ID (like urn:li:organization:12345678), but got: ${targetUrn}. Go to your company page and find the numeric ID in the URL.`,
          });
        }
        
        // Check if we have organization posting permission
        const scopes = connectionScopes || [];
        const hasOrgPermission = scopes.includes('w_organization_social');
        
        if (!hasOrgPermission) {
          console.warn("⚠️ No w_organization_social scope - organization posting may fail");
          console.warn("Available scopes:", scopes);
        }
      }
      
      // Update post with target info
      await supabase
        .from("posts")
        .update({
          target_type: targetType,
          target_urn: targetUrn,
        })
        .eq("id", post.id);

      const requestImageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter((url) => typeof url === "string" && url.length > 0)
        : [];

      if (body.imageUrl) {
        requestImageUrls.unshift(body.imageUrl);
      }

      let videoUrn: string | null = null;
      if (videoFile) {
        // optional preprocessing/transcoding (zencoder stub) before sending
        try {
          videoFile = await maybeTranscodeWithZencoder(videoFile);
        } catch (err) {
          console.warn("🛠️ video preprocessing error, continuing with original file", err);
        }

        videoUrn = await uploadVideoToLinkedIn(videoFile!, accessToken, targetUrn);
        if (!videoUrn) {
          console.warn("⚠️ Video upload failed, posting without video");
        }
      }

      const imageUrns: string[] = [];
      if (!videoUrn) {
        const fallbackImageUrls = post.image_url ? [post.image_url] : [];
        const imageSources = requestImageUrls.length > 0 ? requestImageUrls : fallbackImageUrls;
        const uniqueImageSources: string[] = [];

        imageSources.forEach((source) => {
          if (source && !uniqueImageSources.includes(source)) {
            uniqueImageSources.push(source);
          }
        });

        for (const source of uniqueImageSources.slice(0, 4)) {
          const imageUrn = await uploadImageToLinkedIn(
            source,
            accessToken,
            targetUrn
          );
          if (imageUrn) {
            imageUrns.push(imageUrn);
          }
        }

        if (uniqueImageSources.length > 0 && imageUrns.length === 0) {
          console.warn("⚠️ Image upload failed, posting without images");
        }
      }

      // Post to LinkedIn
      const result = await postToLinkedIn(
        accessToken,
        targetUrn,
        postContent,
        imageUrns.length ? imageUrns : undefined,
        videoUrn
      );

      if (result.success) {
        // Update post status
        await supabase
          .from("posts")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            linkedin_post_urn: result.postUrn || null,
            error_message: null,
          })
          .eq("id", post.id);

        return NextResponse.json({
          ...updated,
          status: "posted",
          message: "✅ Posted to LinkedIn successfully!",
          linkedin_post_urn: result.postUrn,
        });
      } else {
        // Save error
        await supabase
          .from("posts")
          .update({
            status: "failed",
            error_message: result.error,
          })
          .eq("id", post.id);

        return NextResponse.json({
          ...updated,
          status: "failed",
          message: result.error,
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Approve endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
