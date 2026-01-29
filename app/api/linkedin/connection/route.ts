import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: connectionRows, error } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", user.id)
      .limit(1);
    const connection = connectionRows?.[0] ?? null;

    if (error) {
      console.error("LinkedIn connection query error:", error);
      return NextResponse.json(
        { error: "Failed to load LinkedIn connection." },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json(null);
    }

    const orgConnected = Boolean(
      (connection as { org_access_token?: string | null }).org_access_token
    );

    return NextResponse.json({
      ...connection,
      org_connected: orgConnected,
    });
  } catch (error) {
    console.error("LinkedIn connection endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
