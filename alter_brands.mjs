import pkg from 'pg';
const { Client } = pkg;

async function run() {
    const client = new Client({
        connectionString: "postgresql://postgres.npxfcvttvtsqovshbdrb:arvinrajani4@71@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    });

    try {
        await client.connect();
        await client.query("ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT false;");
        console.log("Column added successfully!");
    } catch (error) {
        console.error("Error adding column:", error);
    } finally {
        await client.end();
    }
}

run();
