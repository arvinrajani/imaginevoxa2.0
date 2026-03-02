import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseMetaPages } from "@/lib/social/meta";

function isMissingMetaTable(message: string | undefined) {
  if (!message) return false;
  return /relation\s+"?[^"\s]*meta_connections[^"\s]*"?\s+does\s+not\s+exist/i.test(message);
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

    const { data: connection, error } = await supabase
      .from("meta_connections")
      .select(
        "id, user_id, token_expires_at, pages, default_facebook_page_id, default_instagram_account_id, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

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

    const pages = parseMetaPages(connection.pages).map((page) => ({
      id: page.id,
      name: page.name,
      instagram_business_account_id: page.instagram_business_account_id || null,
      instagram_username: page.instagram_username || null,
    }));

    return NextResponse.json({
      connected: true,
      token_expires_at: connection.token_expires_at,
      default_facebook_page_id: connection.default_facebook_page_id,
      default_instagram_account_id: connection.default_instagram_account_id,
      pages,
      created_at: connection.created_at,
      updated_at: connection.updated_at,
    });
  } catch (error) {
    console.error("Meta connection endpoint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
