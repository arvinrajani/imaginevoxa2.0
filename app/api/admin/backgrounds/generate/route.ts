import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const SCENE_VARIANTS: Record<string, [string, string]> = {
  electrical: [
    'electrical substation at night, high-voltage transmission towers with corona glow, dark navy blue atmosphere, amber and blue indicator lights on control panels, distant city lights, 3 depth layers, cinematic',
    'interior switchgear room, rows of metal cabinets with colored indicator lights, industrial ceiling, dramatic hard shadows, premium dark industrial atmosphere',
  ],
  manufacturing: [
    'heavy manufacturing plant floor at night, robotic assembly arms under spotlights, polished floor reflections, dark industrial atmosphere',
    'CNC machining facility, precision cutting machines, dramatic overhead lighting, steel chrome surfaces',
  ],
  technology: [
    'data center corridor at night, server racks with blue LED strips to vanishing point, reflective floor, cool atmospheric lighting',
    'network operations center, walls of monitors, cool blue ambient, dark premium atmosphere',
  ],
  construction: [
    'construction site at golden hour, steel framework silhouette, tower cranes, dramatic amber sky',
    'high-rise under construction at night, concrete core, urban development, industrial lighting',
  ],
  healthcare: [
    'modern hospital corridor at night, clinical white blue lighting, medical equipment through glass',
    'medical imaging suite, MRI environment, precise cool lighting, premium healthcare atmosphere',
  ],
  automotive: [
    'premium car showroom at night, vehicles under spotlights, polished floor reflections, dark sophisticated',
    'automotive manufacturing, robotic welding arms with sparks, dramatic industrial lighting',
  ],
  general: [
    'premium corporate headquarters lobby at night, glass and steel, dramatic directional lighting',
    'modern business district at night, office buildings with lit windows, city reflections',
  ],
};

const OPENAI_API_BASE = 'https://api.openai.com/v1';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== process.env.ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await req.json()) as { industry?: string };
    const industry = body.industry?.trim()?.toLowerCase();

    if (!industry || !SCENE_VARIANTS[industry]) {
      return NextResponse.json(
        { error: `industry must be one of: ${Object.keys(SCENE_VARIANTS).join(', ')}` },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const scenes = SCENE_VARIANTS[industry];

    // Generate both in parallel
    const generateOne = async (scene: string, index: number) => {
      const fullPrompt = `Premium atmospheric background plate for a LinkedIn marketing banner.
Scene: ${scene}
Requirements: cinematic quality, 3 depth layers, real material textures,
dramatic directional lighting, dark rich tones.
ABSOLUTE PROHIBITIONS: NO text. NO logos. NO people. NO UI elements.
NO watermarks. NO generic gradients with nothing in them.
Background plate only.`;

      const genResponse = await fetch(`${OPENAI_API_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: fullPrompt,
          size: '1536x1024',
          quality: 'high',
        }),
      });

      if (!genResponse.ok) {
        const errText = await genResponse.text();
        console.error(`[bg-generate] OpenAI error for scene ${index}:`, errText);
        throw new Error(`Image generation failed for variant ${index + 1}`);
      }

      const genData = (await genResponse.json()) as {
        data?: Array<{ b64_json?: string }>;
      };

      const b64 = genData.data?.[0]?.b64_json;
      if (!b64) throw new Error(`No image data returned for variant ${index + 1}`);

      const rawBuffer = Buffer.from(b64, 'base64');

      const fullBuffer = await sharp(rawBuffer)
        .resize(1536, 1024, { fit: 'cover' })
        .png()
        .toBuffer();

      const previewBuffer = await sharp(rawBuffer)
        .resize(384, 256, { fit: 'cover' })
        .png()
        .toBuffer();

      const adminClient = createAdminClient();
      const timestamp = Date.now();
      const name = `${industry}-${index + 1}`;
      const fullPath = `backgrounds/${industry}/${name}-${timestamp}.png`;
      const previewPath = `backgrounds/${industry}/${name}-${timestamp}-preview.png`;

      const { error: uploadFullErr } = await adminClient.storage
        .from('banner-assets')
        .upload(fullPath, fullBuffer, { contentType: 'image/png' });

      if (uploadFullErr) {
        console.error(`[bg-generate] Full upload error ${index}:`, uploadFullErr.message);
        throw new Error('Failed to upload background');
      }

      const { error: uploadPreviewErr } = await adminClient.storage
        .from('banner-assets')
        .upload(previewPath, previewBuffer, { contentType: 'image/png' });

      if (uploadPreviewErr) {
        console.error(`[bg-generate] Preview upload error ${index}:`, uploadPreviewErr.message);
      }

      const {
        data: { publicUrl: storageUrl },
      } = adminClient.storage.from('banner-assets').getPublicUrl(fullPath);

      const {
        data: { publicUrl: previewUrl },
      } = adminClient.storage.from('banner-assets').getPublicUrl(previewPath);

      const { data: row, error: insertErr } = await adminClient
        .from('banner_backgrounds')
        .insert({
          name: `${industry.charAt(0).toUpperCase() + industry.slice(1)} ${index + 1}`,
          industry,
          storage_url: storageUrl,
          preview_url: previewUrl,
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) {
        console.error(`[bg-generate] Insert error ${index}:`, insertErr.message);
        throw new Error('Failed to save background record');
      }

      return row;
    };

    const results = await Promise.all([
      generateOne(scenes[0], 0),
      generateOne(scenes[1], 1),
    ]);

    return NextResponse.json(results);
  } catch (error) {
    console.error(
      '[bg-generate] Unhandled:',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
