import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRole) {
    throw new Error("Missing Supabase service role env vars.");
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
