type GraphErrorShape = {
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
  id?: string;
};

export type MetaPageConnection = {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  instagram_business_account_id?: string | null;
  instagram_username?: string | null;
  instagram_profile_picture_url?: string | null;
};

export type FacebookPublishResult = {
  success: boolean;
  postId?: string;
  error?: string;
};

export type InstagramPublishResult = {
  success: boolean;
  mediaId?: string;
  creationId?: string;
  error?: string;
};

const META_GRAPH_BASE = process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com/v22.0";

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphPost(path: string, params: Record<string, string>): Promise<GraphErrorShape> {
  const url = `${META_GRAPH_BASE}${path}`;
  const body = new URLSearchParams(params);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  let payload: GraphErrorShape = {};
  try {
    payload = (await response.json()) as GraphErrorShape;
  } catch {
    payload = {};
  }

  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Meta Graph error (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function graphGet(path: string, params: Record<string, string>): Promise<GraphErrorShape> {
  const query = new URLSearchParams(params);
  const url = `${META_GRAPH_BASE}${path}?${query.toString()}`;
  const response = await fetch(url, { method: "GET" });

  let payload: GraphErrorShape = {};
  try {
    payload = (await response.json()) as GraphErrorShape;
  } catch {
    payload = {};
  }

  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Meta Graph error (${response.status})`;
    throw new Error(message);
  }

  return payload;
}


export function parseMetaPages(data: unknown): MetaPageConnection[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const row = item as Record<string, unknown>;

      const id = toNonEmptyString(row.id);
      const name = toNonEmptyString(row.name);
      const category = toNonEmptyString(row.category);
      const access_token = toNonEmptyString(row.access_token) || toNonEmptyString(row.pageAccessToken);

      if (!id || !name || !access_token) return null;

      return {
        id,
        name,
        category: category || "Local Business",
        access_token,
        instagram_business_account_id: toNonEmptyString(row.instagram_business_account_id),
        instagram_username: toNonEmptyString(row.instagram_username),
        instagram_profile_picture_url: toNonEmptyString(row.instagram_profile_picture_url),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null) as MetaPageConnection[];
}

export async function publishToFacebookPage(options: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string | null;
}): Promise<FacebookPublishResult> {
  try {
    const hasImage = Boolean(toNonEmptyString(options.imageUrl));
    const endpoint = hasImage ? `/${options.pageId}/photos` : `/${options.pageId}/feed`;
    const params: Record<string, string> = {
      access_token: options.pageAccessToken,
    };

    if (hasImage) {
      params.url = options.imageUrl as string;
      params.caption = options.message;
      params.published = "true";
    } else {
      params.message = options.message;
    }

    const payload = await graphPost(endpoint, params);
    const postId = toNonEmptyString(payload.id);
    if (!postId) {
      return { success: false, error: "Facebook publish response did not include a post id." };
    }

    return { success: true, postId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Facebook publishing error.",
    };
  }
}

export async function publishToInstagramAccount(options: {
  instagramAccountId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl?: string | null;
}): Promise<InstagramPublishResult> {
  const imageUrl = toNonEmptyString(options.imageUrl);
  if (!imageUrl) {
    return {
      success: false,
      error: "Instagram publishing requires an image URL.",
    };
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    return {
      success: false,
      error: "Instagram requires a public HTTP(S) image URL.",
    };
  }

  try {
    const creation = await graphPost(`/${options.instagramAccountId}/media`, {
      access_token: options.pageAccessToken,
      image_url: imageUrl,
      caption: options.caption,
    });

    const creationId = toNonEmptyString(creation.id);
    if (!creationId) {
      return {
        success: false,
        error: "Instagram media creation failed (missing creation id).",
      };
    }

    let statusCode = "IN_PROGRESS";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await graphGet(`/${creationId}`, {
        access_token: options.pageAccessToken,
        fields: "status_code",
      });
      statusCode = toNonEmptyString((status as Record<string, unknown>).status_code) || "IN_PROGRESS";
      if (statusCode === "FINISHED" || statusCode === "PUBLISHED") break;
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        return {
          success: false,
          creationId,
          error: `Instagram media processing failed with status ${statusCode}.`,
        };
      }
      await sleep(2000);
    }

    const publish = await graphPost(`/${options.instagramAccountId}/media_publish`, {
      access_token: options.pageAccessToken,
      creation_id: creationId,
    });

    const mediaId = toNonEmptyString(publish.id);
    if (!mediaId) {
      return {
        success: false,
        creationId,
        error: "Instagram publish failed (missing media id).",
      };
    }

    return {
      success: true,
      mediaId,
      creationId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Instagram publishing error.",
    };
  }
}
