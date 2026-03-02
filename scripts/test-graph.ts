import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase.from("meta_connections").select("access_token").limit(1);
    if (error || !data || data.length === 0) {
        console.error("Error fetching token:", error);
        return;
    }
    const token = data[0].access_token;

    const url = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url},category&limit=100&access_token=${token}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.error(e);
    }
}
main();
