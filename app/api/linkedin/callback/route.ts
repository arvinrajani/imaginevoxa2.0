import { NextResponse } from "next/server";
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 60;
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOAuthRedirectUri } from "@/lib/auth/oauth-origin";

type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

type LinkedInProfileResponse = {
  id: string;
};

type OrgAclResponse = {
  elements: { organization: string }[];
};

type OrgDetailsResponse = {
  results: Record<string, { localizedName?: string }>;
};

const encodeError = (message: string) => encodeURIComponent(message);

const toColumnSet = (rows: { column_name: string }[] | null | undefined) =>
  new Set((rows || []).map((row) => row.column_name));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const description = errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : "";
    return NextResponse.redirect(
      new URL(`/app/linkedin?error=${encodeError(error)}${description}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/app/linkedin?error=Missing+OAuth+code", request.url)
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("linkedin_oauth_state")?.value;
  const storedTarget = cookieStore.get("linkedin_oauth_target")?.value;
  const storedUserId = cookieStore.get("linkedin_oauth_user")?.value;
  const storedRedirect = cookieStore.get("linkedin_oauth_redirect")?.value;
  const target = storedTarget === "organization" ? "organization" : "personal";

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/app/linkedin?error=Invalid+state", request.url)
    );
  }

  const clientId =
    target === "organization"
      ? process.env.LINKEDIN_ORG_CLIENT_ID
      : process.env.LINKEDIN_CLIENT_ID;
  const clientSecret =
    target === "organization"
      ? process.env.LINKEDIN_ORG_CLIENT_SECRET
      : process.env.LINKEDIN_CLIENT_SECRET;
  const resolvedRedirect =
    target === "organization"
      ? resolveOAuthRedirectUri(request, {
          storedRedirectUri: storedRedirect,
          configuredRedirectUri: process.env.LINKEDIN_ORG_REDIRECT_URI,
          configuredBaseUrl: process.env.APP_BASE_URL?.trim(),
          fallbackPath: "",
        })
      : resolveOAuthRedirectUri(request, {
          storedRedirectUri: storedRedirect,
          configuredRedirectUri: process.env.LINKEDIN_REDIRECT_URI,
          configuredBaseUrl: process.env.APP_BASE_URL?.trim(),
          fallbackPath: "",
        });

  if (!clientId || !clientSecret) {
    const url = new URL("/app/linkedin", request.url);
    url.searchParams.set("error", "LinkedIn not configured");
    url.searchParams.set(
      "error_description",
      [
        !clientId
          ? target === "organization"
            ? "Missing LINKEDIN_ORG_CLIENT_ID."
            : "Missing LINKEDIN_CLIENT_ID."
          : null,
        !clientSecret
          ? target === "organization"
            ? "Missing LINKEDIN_ORG_CLIENT_SECRET."
            : "Missing LINKEDIN_CLIENT_SECRET."
          : null,
        `Callback URL in use: ${resolvedRedirect}`,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return NextResponse.redirect(
      url
    );
  }

  const tokenRes = await fetchWithTimeout("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: resolvedRedirect,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    const hint = errorText ? `&error_description=${encodeURIComponent(errorText.slice(0, 200))}` : "";
    return NextResponse.redirect(
      new URL(`/app/linkedin?error=Token+exchange+failed${hint}`, request.url)
    );
  }

  const tokenData = (await tokenRes.json()) as LinkedInTokenResponse;
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const supabase = await createServerSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const userId = user?.id || storedUserId;

  if (userError && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/app/linkedin?error=Missing+user+session", request.url));
  }

  const admin = createAdminClient();
  const db = user ? supabase : admin;

  // Try to get the member URN from LinkedIn API
  let memberUrn = "";
  
  // First, try the userinfo endpoint (OpenID Connect)
  try {
    const userinfoRes = await fetchWithTimeout("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (userinfoRes.ok) {
      const userinfo = await userinfoRes.json();
      if (userinfo.sub) {
        memberUrn = `urn:li:person:${userinfo.sub}`;
      }
    }
  } catch {
    // Silent fail, will try alternative method
  }

  // If userinfo didn't work, try the legacy /me endpoint
  if (!memberUrn) {
    try {
      const profileRes = await fetchWithTimeout("https://api.linkedin.com/v2/me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });

      if (profileRes.ok) {
        const profile = (await profileRes.json()) as LinkedInProfileResponse;
        if (profile.id) {
          memberUrn = `urn:li:person:${profile.id}`;
        }
      }
    } catch {
      // Silent fail
    }
  }

  // If still no memberUrn, try decoding the id_token (OpenID Connect)
  if (!memberUrn && tokenData.id_token) {
    try {
      const payload = tokenData.id_token.split(".")[1];
      if (payload) {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(normalized, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded) as { sub?: string };
        if (parsed.sub) {
          memberUrn = `urn:li:person:${parsed.sub}`;
        }
      }
    } catch {
      // Ignore decode errors
    }
  }

  const scopeList = tokenData.scope?.split(" ").filter(Boolean) || ["w_member_social"];

  if (!memberUrn) {
    const scopeDebug = scopeList.length > 0 ? scopeList.join(" ") : "none";
    return NextResponse.redirect(
      new URL(
        `/app/linkedin?error=Could+not+get+LinkedIn+profile&error_description=${encodeError(
          `LinkedIn did not return a member identifier. Granted scopes: ${scopeDebug}. Ensure the LinkedIn app has Sign In with LinkedIn using OpenID Connect enabled and LINKEDIN_SCOPES includes openid profile w_member_social.`
        )}`,
        request.url
      )
    );
  }

  const memberId = memberUrn.split(":").pop() || "";

  // Try to get organizations, but don't fail if we can't
  let orgs: { id: string; urn: string; name: string }[] = [];
  try {
    console.log("ðŸ¢ Fetching LinkedIn organizations...");
    
    // Method 1: Try organizationalEntityAcls (for pages you admin)
    const orgAclRes = await fetchWithTimeout(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    console.log("organizationalEntityAcls status:", orgAclRes.status);

    if (orgAclRes.ok) {
      const orgData = (await orgAclRes.json()) as OrgAclResponse;
      console.log("organizationalEntityAcls response:", JSON.stringify(orgData));
      
      const orgUrns = orgData.elements?.map((entry) => entry.organization) || [];
      console.log("Found org URNs:", orgUrns);
      
      if (orgUrns.length > 0) {
        const ids = orgUrns.map((urn) => urn.replace("urn:li:organization:", ""));
        console.log("Fetching org details for IDs:", ids);
        
        const detailsRes = await fetchWithTimeout(
          `https://api.linkedin.com/v2/organizations?ids=List(${ids.join(",")})`,
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );

        console.log("Organization details status:", detailsRes.status);

        if (detailsRes.ok) {
          const details = (await detailsRes.json()) as OrgDetailsResponse;
          console.log("Organization details:", JSON.stringify(details));
          
          orgs = orgUrns.map((urn) => {
            const id = urn.replace("urn:li:organization:", "");
            const entry = details.results?.[id] ?? details.results?.[urn];
            return {
              id,
              urn,
              name: entry?.localizedName || `Organization ${id}`,
            };
          });
        } else {
          const errorText = await detailsRes.text();
          console.warn("Organization details fetch failed:", errorText.substring(0, 300));
          orgs = orgUrns.map((urn) => {
            const id = urn.replace("urn:li:organization:", "");
            return { id, urn, name: `Organization ${id}` };
          });
        }
      }
    } else {
      const errorText = await orgAclRes.text();
      console.warn("organizationalEntityAcls fetch failed:", orgAclRes.status, errorText.substring(0, 300));
    }

    console.log("âœ… Final orgs array:", JSON.stringify(orgs));
  } catch (error) {
    console.error("âŒ Failed to fetch organizations:", error);
    // Continue anyway - orgs will be empty
  }

  const { data: existing, error: selectError } = await db
    .from("linkedin_connections")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    return NextResponse.redirect(
      new URL(`/app/linkedin?error=Storage+failed&error_description=${encodeError(selectError.message)}`, request.url)
    );
  }

  let columnSet: Set<string> | null = null;
  try {
    const { data: columnRows } = await admin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "linkedin_connections");
    columnSet = toColumnSet(columnRows as { column_name: string }[]);
  } catch {
    columnSet = null;
  }

  const nowIso = new Date().toISOString();
  const basePayload =
    target === "organization"
      ? {
          user_id: userId,
          org_access_token: tokenData.access_token,
          org_refresh_token: tokenData.refresh_token ?? null,
          org_expires_at: expiresAt,
          org_scopes: scopeList,
          orgs,
          member_urn: memberUrn,
          linkedin_member_urn: memberUrn,
          linkedin_member_id: memberId,
          updated_at: nowIso,
        }
      : {
          user_id: userId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: expiresAt,
          token_expires_at: expiresAt,
          scopes: scopeList,
          org_scopes: scopeList,
          orgs,
          member_urn: memberUrn,
          linkedin_member_urn: memberUrn,
          linkedin_member_id: memberId,
          is_active: true,
          last_used_at: nowIso,
          updated_at: nowIso,
        };

  if (columnSet && target === "organization" && !columnSet.has("org_access_token")) {
    return NextResponse.redirect(
      new URL(
        `/app/linkedin?error=Insert+failed&error_description=${encodeError(
          "Organization connections are not supported in the current database schema."
        )}`,
        request.url
      )
    );
  }

  const legacyColumns = new Set([
    "user_id",
    "provider",
    "access_token",
    "refresh_token",
    "expires_at",
    "org_access_token",
    "org_refresh_token",
    "org_expires_at",
    "member_urn",
    "orgs",
    "scopes",
    "created_at",
    "updated_at",
  ]);

  const effectiveColumns =
    columnSet && columnSet.size > 0 ? columnSet : legacyColumns;

  const payload = Object.fromEntries(
    Object.entries(basePayload).filter(([key]) => effectiveColumns.has(key))
  );

  const writeWithRetry = async () => {
    const currentPayload = { ...payload };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = existing
        ? await db.from("linkedin_connections").update(currentPayload).eq("id", existing.id)
        : await db.from("linkedin_connections").insert(currentPayload);

      if (!result.error) {
        return { ok: true };
      }

      const message = result.error.message || "";
      const match = message.match(/Could not find the '([^']+)' column/i);
      if (match && match[1] && match[1] in currentPayload) {
        delete (currentPayload as Record<string, unknown>)[match[1]];
        continue;
      }

      return { ok: false, message };
    }

    return { ok: false, message: "Insert failed after retrying schema columns." };
  };

  const writeResult = await writeWithRetry();

  if (!writeResult.ok) {
    return NextResponse.redirect(
      new URL(
        `/app/linkedin?error=Insert+failed&error_description=${encodeError(writeResult.message || "Insert failed")}`,
        request.url
      )
    );
  }

  cookieStore.delete("linkedin_oauth_state");
  cookieStore.delete("linkedin_oauth_target");
  cookieStore.delete("linkedin_oauth_user");
  cookieStore.delete("linkedin_oauth_redirect");

  return NextResponse.redirect(new URL("/app/linkedin?status=connected", request.url));
}