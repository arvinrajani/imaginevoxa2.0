import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase.from("meta_connections").select("id, pages").limit(5);
    if (error) {
        console.error("Error fetching:", error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

main();
