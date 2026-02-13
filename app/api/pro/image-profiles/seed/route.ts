import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_IMAGE_PROFILES } from "@/lib/studio/image-profiles";

const inputSchema = z.object({
  brandId: z.string().uuid(),
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

    const payload = DEFAULT_IMAGE_PROFILES.map((profile) => ({
      brand_id: input.brandId,
      name: profile.name,
      category: profile.category,
      description: profile.description,
      layout_spec: profile.layout_spec,
      allowed_text_zones: profile.allowed_text_zones,
      logo_rules: profile.logo_rules,
      label_rules: profile.label_rules,
      typography_hierarchy: profile.typography_hierarchy,
      is_system: true,
    }));

    const { data, error } = await supabase
      .from("image_profiles")
      .insert(payload)
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "image_profiles_seeded",
      entity_type: "image_profile",
      metadata: { count: payload.length },
    });

    return NextResponse.json({ profiles: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
