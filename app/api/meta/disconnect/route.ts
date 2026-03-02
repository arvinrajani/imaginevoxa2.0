import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

function isMissingMetaTable(message: string | undefined) {
  if (!message) return false;
  return /relation\s+"?[^"\s]*meta_connections[^"\s]*"?\s+does\s+not\s+exist/i.test(message);
}

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("meta_connections")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      if (isMissingMetaTable(error.message)) {
        return NextResponse.json(
          { error: "Meta setup missing. Run supabase/meta-social.sql in Supabase SQL Editor." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to disconnect Meta." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Meta disconnect endpoint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
