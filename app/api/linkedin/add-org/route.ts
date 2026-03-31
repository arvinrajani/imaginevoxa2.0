import { NextResponse } from "next/server";

export const maxDuration = 60;
import { createServerSupabase } from "@/lib/supabase/server";

type LinkedInOrg = {
  id: string;
  urn: string;
  name: string;
  logo?: string;
};

// DEV: Endpoint to manually add organization pages
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { orgId?: string | number; orgName?: string };
    const { orgId, orgName } = body;

    if (!orgId || !orgName) {
      return NextResponse.json({ error: "Missing orgId or orgName" }, { status: 400 });
    }

    // Get current linkedin connection
    const { data: connection, error: connError } = await supabase
      .from("linkedin_connections")
      .select("id, orgs")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: "LinkedIn not connected" }, { status: 400 });
    }

    // Add the new org - orgId can be numeric ID or URL slug
    const currentOrgs = Array.isArray(connection.orgs)
      ? (connection.orgs as LinkedInOrg[])
      : [];
    
    // Clean the orgId - extract just the ID part
    let cleanOrgId = orgId.toString().trim();
    // Remove any URL parts if someone pasted a full URL
    if (cleanOrgId.includes('/')) {
      cleanOrgId = cleanOrgId.split('/').filter(Boolean).pop() || cleanOrgId;
    }
    // Remove query params
    if (cleanOrgId.includes('?')) {
      cleanOrgId = cleanOrgId.split('?')[0];
    }
    
    const newOrg = {
      id: cleanOrgId,
      urn: `urn:li:organization:${cleanOrgId}`,
      name: orgName,
    };

    // Check if org already exists
    if (currentOrgs.some(o => o.id === cleanOrgId || o.urn === newOrg.urn)) {
      return NextResponse.json({ error: "Organization already added" }, { status: 400 });
    }

    const updatedOrgs = [...currentOrgs, newOrg];

    // Update the connection
    const { error: updateError } = await supabase
      .from("linkedin_connections")
      .update({ orgs: updatedOrgs })
      .eq("id", connection.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Added ${orgName}`,
      orgs: updatedOrgs
    });
  } catch (error) {
    console.error("Add org error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Get current orgs
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: connection } = await supabase
      .from("linkedin_connections")
      .select("orgs")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({ orgs: Array.isArray(connection?.orgs) ? connection.orgs : [] });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Delete an organization
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const { data: connection, error: connError } = await supabase
      .from("linkedin_connections")
      .select("id, orgs")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: "LinkedIn not connected" }, { status: 400 });
    }

    const currentOrgs = Array.isArray(connection.orgs)
      ? (connection.orgs as LinkedInOrg[])
      : [];
    const updatedOrgs = currentOrgs.filter(o => o.id !== orgId);

    const { error: updateError } = await supabase
      .from("linkedin_connections")
      .update({ orgs: updatedOrgs })
      .eq("id", connection.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true, orgs: updatedOrgs });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}