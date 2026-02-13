import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { runVisualQaChecks } from "@/lib/studio/visual-qa";

const inputSchema = z.object({
  canvas: z
    .object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
  logoPlacement: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).optional(),
  logoScale: z.number().min(0.4).max(2).optional(),
  logoRect: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
    })
    .optional()
    .nullable(),
  textZones: z
    .array(
      z.object({
        id: z.string().optional(),
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
      })
    )
    .optional(),
  brandColors: z.array(z.string()).optional(),
  dominantColors: z.array(z.string()).optional(),
  overlayOpacity: z.number().min(0).max(1).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const input = inputSchema.parse(body);
    const result = runVisualQaChecks(input);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
