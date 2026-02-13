import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { PROMPT_TEMPLATES, renderPromptTemplate } from "@/lib/studio/prompt-copilot";

const inputSchema = z.object({
  templateId: z.string(),
  values: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ templates: PROMPT_TEMPLATES });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = inputSchema.parse(await request.json());
    const template = PROMPT_TEMPLATES.find((item) => item.id === input.templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const prompt = renderPromptTemplate(template.template, (input.values || {}) as Record<string, string | undefined>);
    return NextResponse.json({ prompt, template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
