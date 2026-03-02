import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type Brand = {
    id: string;
    name: string;
    website: string | null;
    chatbot_enabled: boolean | null;
    chatbot_welcome_message: string | null;
};

type KnowledgeChunk = {
    chunk_text: string;
    similarity: number;
};

type KnowledgeChunkRow = {
    chunk_text: string | null;
    embedding: unknown;
};

type ChatMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
};

type ChatSession = {
    id: string;
    brand_id: string;
    session_token: string;
    messages: ChatMessage[];
};

type EmbeddingResponse = {
    data: Array<{ embedding: number[] }>;
};

type ChatCompletionResponse = {
    choices?: Array<{
        message?: { content?: string };
    }>;
};

const MAX_MESSAGE_CHARS = 2000;
const FALLBACK_MATCH_THRESHOLD = 0.7;
const FALLBACK_MATCH_COUNT = 5;

function normalizeUserMessage(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\u0000/g, '').trim().slice(0, MAX_MESSAGE_CHARS);
}

function parseEmbedding(raw: unknown): number[] | null {
    if (Array.isArray(raw)) {
        const values = raw.map((x) => Number(x)).filter((x) => Number.isFinite(x));
        return values.length > 0 ? values : null;
    }

    if (typeof raw !== 'string' || !raw.trim()) return null;
    const trimmed = raw.trim();

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
            const values = parsed.map((x) => Number(x)).filter((x) => Number.isFinite(x));
            return values.length > 0 ? values : null;
        }
    } catch {
        // Fallback parser below for vector-style strings.
    }

    const normalized = trimmed
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x));

    return normalized.length > 0 ? normalized : null;
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || a.length !== b.length) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function searchKnowledge(
    admin: ReturnType<typeof createAdminClient>,
    brandId: string,
    queryEmbedding: number[]
): Promise<KnowledgeChunk[]> {
    try {
        const { data } = await admin.rpc('match_brand_knowledge', {
            query_embedding: queryEmbedding,
            match_brand_id: brandId,
            match_threshold: FALLBACK_MATCH_THRESHOLD,
            match_count: FALLBACK_MATCH_COUNT,
        });

        if (Array.isArray(data)) {
            return (data as Array<{ chunk_text?: string; similarity?: number }>)
                .filter((row) => typeof row?.chunk_text === 'string' && row.chunk_text.trim().length > 0)
                .map((row) => ({
                    chunk_text: String(row.chunk_text),
                    similarity: Number(row.similarity ?? 0),
                }));
        }
    } catch {
        // Fallback below for environments where RPC/pgvector is not installed.
    }

    const { data: rows } = await admin
        .from('brand_knowledge_chunks')
        .select('chunk_text, embedding')
        .eq('brand_id', brandId)
        .limit(1000);

    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    return (rows as KnowledgeChunkRow[])
        .map((row) => {
            const rowEmbedding = parseEmbedding(row.embedding);
            const chunkText = typeof row.chunk_text === 'string' ? row.chunk_text.trim() : '';
            if (!rowEmbedding || !chunkText) return null;
            const similarity = cosineSimilarity(queryEmbedding, rowEmbedding);
            return { chunk_text: chunkText, similarity };
        })
        .filter((row): row is KnowledgeChunk => row !== null && row.similarity >= FALLBACK_MATCH_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, FALLBACK_MATCH_COUNT);
}

async function createEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI embeddings failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as EmbeddingResponse;
    return data.data[0].embedding;
}

async function chatCompletion(
    messages: Array<{ role: string; content: string }>
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 500,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI chat failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No response content from OpenAI');
    return content;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { brand_id, session_token } = body as {
            brand_id?: string;
            session_token?: string;
        };
        const message = normalizeUserMessage((body as { message?: unknown }).message);

        if (!brand_id || !session_token || !message) {
            return NextResponse.json(
                { error: 'brand_id, session_token, and message are required' },
                { status: 400 }
            );
        }

        const admin = createAdminClient();

        // Fetch brand and verify chatbot is enabled
        const { data: brand, error: brandError } = await admin
            .from('brands')
            .select('id, name, website, chatbot_enabled, chatbot_welcome_message')
            .eq('id', brand_id)
            .maybeSingle<Brand>();

        if (brandError || !brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        // Get or create session
        let session: ChatSession | null = null;

        const { data: existingByToken } = await admin
            .from('chatbot_sessions')
            .select('id, brand_id, session_token, messages')
            .eq('session_token', session_token)
            .maybeSingle<ChatSession>();

        if (existingByToken && existingByToken.brand_id !== brand_id) {
            return NextResponse.json(
                { error: 'Session token does not belong to this brand' },
                { status: 403 }
            );
        }

        if (existingByToken) {
            session = existingByToken;
        } else {
            const { data: newSession, error: sessionError } = await admin
                .from('chatbot_sessions')
                .insert({
                    brand_id,
                    session_token,
                    visitor_metadata: {},
                    messages: [],
                })
                .select('id, brand_id, session_token, messages')
                .single<ChatSession>();

            if (sessionError || !newSession) {
                return NextResponse.json(
                    { error: 'Failed to create chat session' },
                    { status: 500 }
                );
            }
            session = newSession;
        }

        // Generate embedding for user message
        const queryEmbedding = await createEmbedding(message);

        // Search brand knowledge via RPC
        const knowledgeChunks = await searchKnowledge(admin, brand_id, queryEmbedding);
        const hasKnowledge = knowledgeChunks.length > 0;

        // Build system prompt
        let systemPrompt: string;

        if (hasKnowledge) {
            const knowledgeBlock = knowledgeChunks
                .map((c, i) => `[${i + 1}] ${c.chunk_text}`)
                .join('\n\n');
            const fallbackLine = brand.website
                ? `I don't have that specific information. For more details please visit [${brand.name} website](${brand.website}).`
                : 'I don\'t have that specific information right now. Please contact the team for further details.';

            systemPrompt = `You are a knowledgeable and professional product assistant for ${brand.name}.

Your job is to answer questions accurately and helpfully using ONLY the product knowledge provided below.

FORMATTING RULES (always follow these):
- Use **bold** for product names, key specs, and important terms
- Use bullet points (- item) for features, benefits, and lists
- Use numbered lists (1. 2. 3.) for steps or ranked items
- Use short paragraphs — never write walls of text
- Add a blank line between sections for readability
- Keep responses focused and scannable
- If listing multiple products or options, use a separate bullet or section for each

CONTENT RULES:
- Answer ONLY from the product knowledge below — never invent specs, prices, or features
- If the answer is not in the knowledge base respond with exactly: "${fallbackLine}"
- For pricing questions, give exact figures from the knowledge base
- For comparisons, clearly structure differences side by side
${brand.website ? `- Brand website: ${brand.website}` : ''}

PRODUCT KNOWLEDGE:
${knowledgeBlock}`;
        } else {
            systemPrompt = `You are a helpful and friendly assistant for ${brand.name}.
You don't have specific product information available right now.
${brand.website ? `Direct the user to visit ${brand.website} for product details.` : 'Ask the user to contact the team directly for product details.'}
Be polite, concise, and use bullet points where helpful.`;
        }

        // Get previous messages (last 10)
        const previousMessages = Array.isArray(session.messages)
            ? session.messages
                .filter(
                    (m): m is ChatMessage =>
                        (m?.role === 'user' || m?.role === 'assistant') &&
                        typeof m?.content === 'string' &&
                        m.content.trim().length > 0
                )
                .slice(-10)
            : [];

        // Call OpenAI chat
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...previousMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: message },
        ];

        const reply = await chatCompletion(chatMessages);

        // Determine if we should show website button
        const showWebsiteButton =
            !hasKnowledge ||
            reply.toLowerCase().includes('website') ||
            reply.toLowerCase().includes('visit');

        // Update session messages
        const updatedMessages: ChatMessage[] = [
            ...(Array.isArray(session.messages) ? session.messages : []),
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: reply },
        ].slice(-40);

        await admin
            .from('chatbot_sessions')
            .update({
                messages: updatedMessages,
                updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);

        return NextResponse.json({
            reply,
            session_token: session.session_token,
            show_website_button: showWebsiteButton,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
