import { NextResponse } from "next/server";

export const maxDuration = 60;
import { createServerSupabase } from "@/lib/supabase/server";

type CheckResult = { name: string; status: "ok" | "missing" | "error"; detail?: string };

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const checks: CheckResult[] = [];
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const storageBucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim();
    const textModel = process.env.OPENAI_TEXT_MODEL?.trim();

    checks.push({
      name: "auth",
      status: "ok",
      detail: `Signed in as ${user.email || user.id}`,
    });
    checks.push({
      name: "OPENAI_API_KEY",
      status: openaiKey ? "ok" : "missing",
      detail: openaiKey ? "Configured" : "Missing in env",
    });
    checks.push({
      name: "SUPABASE_STORAGE_BUCKET",
      status: storageBucket ? "ok" : "missing",
      detail: storageBucket ? storageBucket : "Missing in env",
    });
    checks.push({
      name: "OPENAI_TEXT_MODEL",
      status: textModel ? "ok" : "missing",
      detail: textModel || "Using default (gpt-4o)",
    });
    checks.push({
      name: "OPENAI_IMAGE_MODEL",
      status: imageModel ? "ok" : "missing",
      detail: imageModel || "Using default (gpt-image-1)",
    });

    const hasErrors = checks.some((check) => check.status !== "ok");
    return NextResponse.json({
      status: hasErrors ? "needs attention" : "ok",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}