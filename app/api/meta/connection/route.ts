import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseMetaPages } from "@/lib/social/meta";

const updateDefaultsSchema = z
  .object({
    defaultFacebookPageId: z.string().trim().min(1).nullable().optional(),
    defaultInstagramAccountId: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.defaultFacebookPageId !== undefined ||
      value.defaultInstagramAccountId !== undefined,
    { message: "At least one default target must be provided." }
  );

function isMissingMetaTable(message: string | undefined) {
  if (!message) return false;
  return /relation\s+"?[^"\s]*meta_connections[^"\s]*"?\s+does\s+not\s+exist/i.test(message);
}

type MetaConnectionRow = {
  id: string;
  user_id: string;
  token_expires_at: string | null;
  pages: unknown;
  default_facebook_page_id: string | null;
  default_instagram_account_id: string | null;
  created_at: string;
  updated_at: string;
};

function formatConnection(connection: MetaConnectionRow) {
  const pages = parseMetaPages(connection.pages).map((page) => ({
    id: page.id,
    name: page.name,
    category: page.category || "Local Business",
    picture_url: page.picture_url || null,
    instagram_business_account_id: page.instagram_business_account_id || null,
    instagram_name: page.instagram_name || null,
    instagram_username: page.instagram_username || null,
    instagram_profile_picture_url: page.instagram_profile_picture_url || null,
  }));

  return {
    connected: pages.length > 0,
    token_expires_at: connection.token_expires_at,
    default_facebook_page_id: connection.default_facebook_page_id,
    default_instagram_account_id: connection.default_instagram_account_id,
    pages,
    created_at: connection.created_at,
    updated_at: connection.updated_at,
  };
}

async function loadConnection(userId: string) {
  const supabase = await createServerSupabase();
  const result = await supabase
    .from("meta_connections")
    .select(
      "id, user_id, token_expires_at, pages, default_facebook_page_id, default_instagram_account_id, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  return { supabase, ...result };
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: connection, error } = await loadConnection(user.id);

    if (error) {
      if (isMissingMetaTable(error.message)) {
        return NextResponse.json(
          { error: "Meta setup missing. Run supabase/meta-social.sql in Supabase SQL Editor." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to load Meta connection." }, { status: 500 });
    }

    if (!connection) {
      return NextResponse.json(null);
    }

    return NextResponse.json(formatConnection(connection as MetaConnectionRow));
  } catch (error) {
    console.error("Meta connection endpoint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = updateDefaultsSchema.parse(await request.json());
    const { data: connection, error: loadError } = await loadConnection(user.id);

    if (loadError) {
      if (isMissingMetaTable(loadError.message)) {
        return NextResponse.json(
          { error: "Meta setup missing. Run supabase/meta-social.sql in Supabase SQL Editor." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to load Meta connection." }, { status: 500 });
    }

    if (!connection) {
      return NextResponse.json(
        { error: "Meta account not connected. Please connect Meta first." },
        { status: 400 }
      );
    }

    const pages = parseMetaPages(connection.pages);
    const nextDefaultFacebookPageId =
      payload.defaultFacebookPageId !== undefined
        ? payload.defaultFacebookPageId
        : connection.default_facebook_page_id;
    const nextDefaultInstagramAccountId =
      payload.defaultInstagramAccountId !== undefined
        ? payload.defaultInstagramAccountId
        : connection.default_instagram_account_id;

    if (
      nextDefaultFacebookPageId &&
      !pages.some((page) => page.id === nextDefaultFacebookPageId)
    ) {
      return NextResponse.json(
        { error: "Selected Facebook page is not available for this Meta connection." },
        { status: 400 }
      );
    }

    if (
      nextDefaultInstagramAccountId &&
      !pages.some(
        (page) => page.instagram_business_account_id === nextDefaultInstagramAccountId
      )
    ) {
      return NextResponse.json(
        { error: "Selected Instagram account is not available for this Meta connection." },
        { status: 400 }
      );
    }

    const updatePayload: {
      default_facebook_page_id?: string | null;
      default_instagram_account_id?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (payload.defaultFacebookPageId !== undefined) {
      updatePayload.default_facebook_page_id = payload.defaultFacebookPageId;
    }

    if (payload.defaultInstagramAccountId !== undefined) {
      updatePayload.default_instagram_account_id = payload.defaultInstagramAccountId;
    }

    const { data: updatedConnection, error: updateError } = await supabase
      .from("meta_connections")
      .update(updatePayload)
      .eq("user_id", user.id)
      .select(
        "id, user_id, token_expires_at, pages, default_facebook_page_id, default_instagram_account_id, created_at, updated_at"
      )
      .single();

    if (updateError || !updatedConnection) {
      return NextResponse.json(
        { error: "Failed to update Meta publish defaults." },
        { status: 500 }
      );
    }

    return NextResponse.json(formatConnection(updatedConnection as MetaConnectionRow));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(", ") },
        { status: 400 }
      );
    }

    console.error("Meta connection update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}