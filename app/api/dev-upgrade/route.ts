// TEMPORARY DEV ENDPOINT - Remove in production!
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = await request.json();
    
    if (!['starter', 'pro', 'business'].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // First check if profile exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (profile) {
      // Update existing profile
      const { error } = await supabase
        .from('profiles')
        .update({ plan })
        .eq('id', user.id);

      if (error) {
        console.error('Upgrade error:', error);
        return NextResponse.json({ error: "Failed to upgrade: " + error.message }, { status: 500 });
      }
    } else {
      // Create profile with plan
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          plan
        });

      if (error) {
        console.error('Insert error:', error);
        return NextResponse.json({ error: "Failed to create profile: " + error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Upgraded to ${plan} plan!`,
      plan 
    });
  } catch (error) {
    console.error('Dev upgrade error:', error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ 
      plan: profile?.plan || 'starter',
      userId: user.id
    });
  } catch (error) {
    console.error('Dev upgrade error:', error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
