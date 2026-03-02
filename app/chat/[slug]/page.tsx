import { createAdminClient } from '@/lib/supabase/admin';
import { ChatInterface } from './ChatInterface';

type BrandRow = {
    id: string;
    name: string;
    website: string | null;
    chatbot_enabled: boolean | null;
    chatbot_slug: string | null;
    chatbot_welcome_message: string | null;
};

type BrandKitRow = {
    id: string;
    brand_id: string;
    primary_colors: string[] | null;
    accent_colors: string[] | null;
    font_personality: string | null;
    is_active: boolean | null;
};

type BrandAssetRow = {
    id: string;
    brand_id: string;
    image_asset_id: string;
    kind: string;
    is_primary: boolean | null;
};

type ImageAssetRow = {
    id: string;
    file_url: string | null;
};

export default async function ChatPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const admin = createAdminClient();

    // Fetch brand by chatbot slug
    const { data: brand } = await admin
        .from('brands')
        .select('id, name, website, chatbot_enabled, chatbot_slug, chatbot_welcome_message')
        .eq('chatbot_slug', slug)
        .maybeSingle<BrandRow>();

    if (!brand) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <div className="mx-4 max-w-md rounded-2xl border border-slate-800 bg-white/80 p-10 text-center backdrop-blur-xl">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
                        <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                        </svg>
                    </div>
                    <h1 className="mb-2 text-xl font-semibold text-gray-900">Chatbot Not Available</h1>
                    <p className="text-sm text-gray-500">
                        This chatbot is not currently active. Please check the link and try again.
                    </p>
                    <a
                        href="https://voxa.app"
                        className="mt-6 inline-block text-xs text-gray-400 transition hover:text-gray-500"
                    >
                        Powered by Voxa
                    </a>
                </div>
            </div>
        );
    }

    // Fetch brand kit
    const { data: brandKit } = await admin
        .from('brand_kits')
        .select('id, brand_id, primary_colors, accent_colors, font_personality, is_active')
        .eq('brand_id', brand.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<BrandKitRow>();

    // Fetch primary logo
    let logoUrl: string | null = null;

    const { data: brandAsset } = await admin
        .from('brand_assets')
        .select('id, brand_id, image_asset_id, kind, is_primary')
        .eq('brand_id', brand.id)
        .eq('kind', 'logo')
        .eq('is_primary', true)
        .maybeSingle<BrandAssetRow>();

    if (brandAsset?.image_asset_id) {
        const { data: imageAsset } = await admin
            .from('image_assets')
            .select('id, file_url')
            .eq('id', brandAsset.image_asset_id)
            .maybeSingle<ImageAssetRow>();

        logoUrl = imageAsset?.file_url ?? null;
    }

    return (
        <ChatInterface
            brand={{
                id: brand.id,
                name: brand.name,
                website: brand.website,
                welcomeMessage:
                    brand.chatbot_welcome_message ||
                    `Hi! I can answer questions about ${brand.name}. How can I help you?`,
            }}
            brandKit={{
                primaryColor: brandKit?.primary_colors?.[0] ?? '#1a1a2e',
                accentColor: brandKit?.accent_colors?.[0] ?? '#e94560',
            }}
            logoUrl={logoUrl}
        />
    );
}
