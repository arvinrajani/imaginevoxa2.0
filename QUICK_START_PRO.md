# PRO Studio Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Supabase account with project setup
- OpenAI API key with GPT-4 and DALL-E 3 access
- LinkedIn Developer account (for publishing)
- Node.js 18+ installed

### 1. Environment Setup (2 minutes)

Create `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=brand-assets

# OpenAI
OPENAI_API_KEY=sk-proj-your-key-here

# LinkedIn (optional - for publishing)
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
```

### 2. Database Setup (1 minute)

In Supabase SQL Editor, run:

```sql
-- 1. Run core schema
-- Copy and paste content from: supabase/schema.sql

-- 2. Run additional tables
-- Copy and paste content from: supabase/schema_v2.sql

-- 3. Enable Row Level Security
-- Copy and paste content from: supabase/rls.sql

-- 4. Create storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand-assets', 'brand-assets', true);

-- Set bucket policy
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'brand-assets');

CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'brand-assets' 
  AND auth.role() = 'authenticated'
);
```

### 3. Install Dependencies (1 minute)

```bash
npm install
# or
pnpm install
```

### 4. Run Development Server (30 seconds)

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000/app/studio](http://localhost:3000/app/studio)

### 5. First Post Workflow (30 seconds)

1. **Sign Up**: Create account at `/signup`
2. **Welcome Screen**: Click "Start Setup"
3. **Analyze Brand**: 
   - Enter LinkedIn profile URL
   - Or paste brand brief
   - Click "Analyze"
4. **Visual Style**:
   - Choose template (Modern Tech, Bold Creative, etc.)
   - Customize colors
   - Click "Complete"
5. **Upload Assets**:
   - Drag & drop logo
   - Optional: Add banner images
   - Click "Continue"
6. **Generate Post**:
   - Go to "Generate" tab
   - Enter topic: "5 tips for startup founders"
   - Click "Generate Posts"
   - Choose your favorite
   - Click "Generate Complete Post"
7. **Review & Publish**:
   - Post saved to drafts automatically
   - Review compliance checks
   - Publish to LinkedIn (optional)

## 📊 What Just Happened?

### Behind the Scenes

1. **Marketing DNA Analysis** (GPT-4)
   - Analyzed LinkedIn profile or brief
   - Extracted tone, colors, visual style
   - Saved to `marketing_dna` table

2. **Brand Kit Creation**
   - Saved colors, fonts, tone guidelines
   - Stored in `brand_kits` table
   - Can be locked later for consistency

3. **Asset Upload**
   - Uploaded logo to Supabase Storage
   - Saved metadata to `image_assets` table
   - Public URLs generated

4. **Two-Phase Image Generation**
   - **Phase 1**: DALL-E 3 generated base image (1792x1024)
   - **Phase 2**: SVG compositor added logo + text
   - Saved to `image_assets` and `posts` tables

5. **Compliance Checking**
   - Checked hashtag count (max 8)
   - Validated emoji ratio (max 8%)
   - Verified tone consistency
   - Results in `compliance_checks` table

6. **Draft Creation**
   - Post content + image saved
   - Status: "draft" (awaiting approval)
   - Ready for human review

## 🎯 Key Features

### Setup (One-Time)
- ✅ LinkedIn profile analysis
- ✅ Brand Kit creation with 4 templates
- ✅ Logo and asset uploads
- ✅ Mood board generation

### Generation (Daily Use)
- ✅ AI post generation (3 variations)
- ✅ Two-phase image system
  - Phase 1: DALL-E 3 base (AI)
  - Phase 2: Brand composition (deterministic)
- ✅ 8 Image Profile templates
- ✅ Compliance checking
- ✅ Draft management

### Publishing
- ✅ Human-in-the-loop approval
- ✅ LinkedIn integration
- ✅ Audit logging
- ✅ Scheduled publishing (coming soon)

## 🔧 Common Tasks

### Create a Post with Custom Image

```typescript
// 1. Generate base image only
const baseResponse = await fetch('/api/pro/image/generate-base', {
  method: 'POST',
  body: JSON.stringify({
    brandId: 'your-brand-id',
    prompt: 'Modern tech office with diverse team collaborating',
    userPrompt: 'Teamwork in action',
  }),
});

const { url: baseImageUrl, assetId } = await baseResponse.json();

// 2. Compose with brand elements
const composeResponse = await fetch('/api/pro/image/compose', {
  method: 'POST',
  body: JSON.stringify({
    postId: 'your-post-id',
    brandId: 'your-brand-id',
    brandKitId: 'your-brand-kit-id',
    baseAssetId: assetId,
    logoPlacement: 'bottom-right',
    logoScale: 0.8,
  }),
});

const { file_url } = await composeResponse.json();
```

### Lock Brand Kit for Consistency

```typescript
await fetch('/api/pro/brand-kit/lock', {
  method: 'POST',
  body: JSON.stringify({
    kitId: 'your-brand-kit-id',
  }),
});

// Now all future posts use this exact brand identity
```

### List All Drafts

```typescript
const response = await fetch(
  '/api/pro/post/list?brandId=your-brand-id&status=draft'
);
const { posts } = await response.json();

posts.forEach(post => {
  console.log(post.post_content);
  console.log(post.image_url);
  console.log(post.compliance_status); // 'pass', 'warn', 'fail'
});
```

### Approve and Publish

```typescript
// 1. Check compliance
await fetch('/api/pro/compliance/check', {
  method: 'POST',
  body: JSON.stringify({ postId: 'your-post-id' }),
});

// 2. Approve and publish
await fetch('/api/pro/publish', {
  method: 'POST',
  body: JSON.stringify({ 
    postId: 'your-post-id',
    publishToLinkedIn: true,  // Set to false to approve without publishing
  }),
});
```

## 🎨 Customization

### Create Custom Image Profile

```typescript
await fetch('/api/pro/image-profiles', {
  method: 'POST',
  body: JSON.stringify({
    brandId: 'your-brand-id',
    name: 'My Custom Layout',
    description: 'Full-width image with corner logo',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        {
          type: 'base_image',
          position: 'fill',
          opacity: 1,
        },
        {
          type: 'gradient_overlay',
          position: 'bottom',
          height: '30%',
          opacity: 0.9,
        },
        {
          type: 'headline',
          position: 'bottom-left',
          fontSize: 48,
          maxWidth: '70%',
          color: '#FFFFFF',
          margin: 40,
        },
        {
          type: 'logo',
          position: 'top-right',
          size: 60,
          margin: 30,
          opacity: 0.95,
        },
      ],
    },
    tags: ['custom', 'hero', 'wide'],
  }),
});
```

### Update Mood Board

```typescript
await fetch('/api/pro/mood-board', {
  method: 'PATCH',
  body: JSON.stringify({
    moodBoardId: 'your-mood-board-id',
    palette_colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    typography_mood: 'playful',
    composition_style: 'dynamic',
  }),
});
```

## 🐛 Troubleshooting

### Issue: "Unauthorized" errors

**Solution**: Check auth state
```typescript
// In your component
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  router.push('/login');
}
```

### Issue: Base image generation fails

**Checklist**:
- [ ] OPENAI_API_KEY is set correctly
- [ ] API key has GPT-4 and DALL-E 3 access
- [ ] Prompt doesn't violate content policy
- [ ] Supabase storage bucket exists

**Test API key**:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Issue: Composition doesn't include logo

**Checklist**:
- [ ] Brand Kit has logo_assets populated
- [ ] Image Profile includes logo layer
- [ ] brandKitId passed to compose API

**Check database**:
```sql
SELECT logo_assets FROM brand_kits WHERE brand_id = 'your-brand-id';
```

### Issue: Posts stuck in draft

**Check compliance**:
```typescript
const response = await fetch(
  `/api/pro/post/list?brandId=your-brand-id&status=draft`
);
const { posts } = await response.json();

posts.forEach(post => {
  if (post.compliance_status === 'fail') {
    console.log('Failed checks:', post.compliance_checks);
  }
});
```

### Issue: LinkedIn publishing fails

**Checklist**:
- [ ] LinkedIn app configured in Developer Portal
- [ ] Redirect URI matches exactly
- [ ] User has connected LinkedIn account
- [ ] Token hasn't expired (re-authenticate)

**Check connection**:
```sql
SELECT * FROM linkedin_connections 
WHERE user_id = 'your-user-id' 
  AND expires_at > NOW();
```

## 📚 Next Steps

1. **Read Full Architecture**: [PRO_STUDIO_ARCHITECTURE.md](./PRO_STUDIO_ARCHITECTURE.md)
2. **Explore API Reference**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
3. **Join Community**: [GitHub Discussions](#)
4. **Report Issues**: [GitHub Issues](#)

## 💡 Pro Tips

### Tip 1: Batch Generate for Efficiency
Generate 10+ posts at once, then review all together. This is faster than one-by-one.

### Tip 2: Lock Brand Kit Early
Once you're happy with your brand identity, lock it. This ensures all future posts maintain consistency.

### Tip 3: Create Campaign Mood Boards
Different campaigns can have different mood boards while keeping the same Brand Kit.

### Tip 4: Use System Templates First
The 8 built-in Image Profiles cover 90% of use cases. Only create custom ones for unique needs.

### Tip 5: Monitor Compliance Trends
If many posts get "warn" status, update your tone guidelines to better match your style.

## 🎬 Video Tutorials (Coming Soon)

- [ ] Complete setup walkthrough
- [ ] Creating your first post
- [ ] Understanding the two-phase image system
- [ ] Custom Image Profile creation
- [ ] Batch generation workflow

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

Need help? Join our [Discord community](#) or email support@prostudio.ai
