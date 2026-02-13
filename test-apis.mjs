// Test both generation endpoints
const BASE = 'http://localhost:3000';

async function test(label, url, body) {
  console.log(`\n=== ${label} ===`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 600));
  } catch (e) {
    console.error('Network error:', e.message);
  }
}

async function main() {
  // Test 1: The lightweight generate-options (no DB needed)
  await test('generate-options (lite)', `${BASE}/api/generate-options`, {
    prompt: 'Why AI is the future',
    count: 1,
    tone: 'professional',
  });

  // Test 2: The pro post-options (needs Supabase)
  await test('pro/post-options', `${BASE}/api/pro/post-options`, {
    brandId: '014c4274-b2bd-4093-a080-385e95b8a835',
    prompt: 'Why AI is the future',
    count: 1,
    solutionMode: true,
  });

  // Test 3: The image generation
  await test('pro/image/asset/generate', `${BASE}/api/pro/image/asset/generate`, {
    brandId: 'default',
    type: 'background',
    brandName: 'Test',
    brandColors: ['#0A66C2'],
    prompt: 'Abstract tech background, professional',
  });

  // Test 4: The base /api/generate
  console.log('\n=== /api/generate (FormData) ===');
  try {
    const form = new FormData();
    form.append('prompt', 'Why AI is the future');
    form.append('tone', 'professional');
    form.append('wantImage', 'false');
    form.append('approvalRequired', 'false');
    form.append('contentSource', 'text');
    const res = await fetch(`${BASE}/api/generate`, { method: 'POST', body: form });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 600));
  } catch (e) {
    console.error('Network error:', e.message);
  }
}

main();
