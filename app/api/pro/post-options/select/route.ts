import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  postId: z.string().uuid(),
  optionIndex: z.number().int().min(0),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: options, error: optionsError } = await supabase
      .from("post_options")
      .select("*")
      .eq("post_id", input.postId)
      .order("option_index", { ascending: true });

    if (optionsError || !options || options.length === 0) {
      return NextResponse.json({ error: "Post options not found" }, { status: 404 });
    }

    const selected = options.find((option) => option.option_index === input.optionIndex);
    if (!selected) {
      return NextResponse.json({ error: "Option not found" }, { status: 404 });
    }

    await supabase
      .from("post_options")
      .update({ status: "rejected" })
      .eq("post_id", input.postId);

    await supabase
      .from("post_options")
      .update({ status: "accepted" })
      .eq("post_id", input.postId)
      .eq("option_index", input.optionIndex);

    await supabase
      .from("posts")
      .update({
        title: selected.title,
        post_content: selected.post_content,
        intent_locked_at: new Date().toISOString(),
      })
      .eq("id", input.postId);

    const { data: existingVersions } = await supabase
      .from("post_versions")
      .select("version")
      .eq("post_id", input.postId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (existingVersions?.[0]?.version || 0) + 1;

    await supabase.from("post_versions").insert({
      post_id: input.postId,
      version: nextVersion,
      title: selected.title,
      post_content: selected.post_content,
      source: "ai",
      created_by: user.id,
      change_reason: "Selected AI option",
    });

    const { data: post } = await supabase
      .from("posts")
      .select("brand_id")
      .eq("id", input.postId)
      .single();

    await supabase.from("audit_logs").insert({
      brand_id: post?.brand_id ?? null,
      actor_id: user.id,
      action: "post_option_selected",
      entity_type: "post",
      entity_id: input.postId,
      metadata: { option_index: input.optionIndex },
    });

    return NextResponse.json({ selected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
