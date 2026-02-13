# PRO Studio Architecture

## Overview

PRO Studio is a professional LinkedIn marketing automation platform that **replaces graphic designers with AI** while keeping **human control** in the loop. It's built with a two-phase image system, deterministic composition, and brand-first design.

## Core Philosophy

### What We Are
- **AI + Human Collaboration**: AI generates base images, humans approve before publishing
- **Brand-First**: Everything flows from Brand Kit → Mood Board → Marketing DNA → Image Profiles
- **Deterministic**: Same inputs = same outputs (Phase 2 composition is 100% reproducible)
- **Professional**: No shortcuts, no n8n, no auto-posting without approval

### What We Are NOT
- **Not automated spam**: Every post requires human review
- **Not generic templates**: Uses your actual brand colors, logos, and style
- **Not unpredictable**: Phase 2 composition is deterministic (no AI randomness)

## Architecture: Two-Phase Image System

### Phase 1: AI Base Generation (DALL-E 3)
- **Input**: Text prompt + mood board context
- **Output**: 1792x1024 HD base image
- **Important**: NO text, NO logos, NO brand elements (pure scene/composition)
- **API**: `/api/pro/image/generate-base`
- **Storage**: Saved to `image_assets` table as `base_generated`

### Phase 2: Deterministic Composition (SVG/Canvas)
- **Input**: Base image + Brand Kit + Image Profile + text/logo
- **Output**: Final composed image with brand elements
- **Technology**: SVG composition (currently), Sharp/Canvas (future)
- **Important**: 100% repeatable - same inputs = exact same output
- **API**: `/api/pro/image/compose`
- **Storage**: Saved to `image_assets` table as `composed_post`

## Data Model

### Core Entities

#### 1. Brand Kit
**Purpose**: Source of truth for all brand assets and colors

```typescript
{
  id: uuid,
  brand_id: uuid,
  logo_assets: string[],        // URLs to uploaded logos
  primary_colors: string[],     // ['#0A66C2']
  secondary_colors: string[],   // ['#0F172A', '#1E293B']
  accent_colors: string[],      // ['#22D3EE', '#06B6D4']
  font_personality: string,     // 'modern', 'elegant', 'bold'
  tone_guidelines: string[],    // ['Professional', 'Friendly', 'Technical']
  locked_at: timestamp,         // When locked (prevents changes)
  locked_by: uuid
}
```

#### 2. Mood Board
**Purpose**: Visual style guidance for AI image generation

```typescript
{
  id: uuid,
  brand_id: uuid,
  palette_colors: string[],          // Color scheme for mood
  typography_mood: string,           // 'bold', 'elegant', 'playful'
  composition_style: string,         // 'minimal', 'dynamic', 'layered'
  visual_references: string[],       // Reference image URLs
  locked_at: timestamp,
  locked_by: uuid
}
```

#### 3. Marketing DNA
**Purpose**: AI-analyzed brand personality from LinkedIn profile

```typescript
{
  id: uuid,
  brand_id: uuid,
  source: 'linkedin_analysis' | 'manual_brief',
  tone: {
    primary: string,              // 'professional'
    secondary: string,            // 'innovative'
    avoid: string[]              // ['salesy', 'jargony']
  },
  colors: {
    detected: string[],          // Colors seen in LinkedIn posts
    confidence: number
  },
  image_style: {
    preferred: string,           // 'photography', 'illustration', 'abstract'
    characteristics: string[]    // ['clean', 'modern', 'vibrant']
  },
  post_types: string[],         // ['thought-leadership', 'case-study', 'tips']
  cta_style: string,            // 'direct', 'question', 'subtle'
  visual_density: number,       // 0.0-1.0 (minimal to busy)
  consistency_score: number,    // 0.0-1.0 (brand consistency)
  evidence: object,             // Raw analysis data
  analyzed_at: timestamp
}
```

#### 4. Image Profile (Templates)
**Purpose**: System-level layout templates (8 predefined + custom)

```typescript
{
  id: uuid,
  brand_id: uuid,               // null for system templates
  profile_name: string,         // 'LinkedIn Hero Post'
  description: string,
  layout_config: {
    canvas: { width: 1200, height: 627 },
    layers: [
      {
        type: 'base_image',
        position: 'fill',
        opacity: 1
      },
      {
        type: 'gradient_overlay',
        position: 'bottom',
        height: '40%',
        opacity: 0.8
      },
      {
        type: 'headline',
        position: 'center',
        fontSize: 48,
        maxWidth: '80%',
        color: '#FFFFFF'
      },
      {
        type: 'logo',
        position: 'bottom-right',
        size: 60,
        margin: 30,
        opacity: 0.9
      }
    ]
  },
  tags: string[]               // ['hero', 'announcement', 'feature']
}
```

**System Templates**:
1. LinkedIn Hero Post
2. Stat Highlight
3. Quote Card
4. Split Layout
5. Minimal Text
6. Story Card
7. Branded Frame
8. Comparison Layout

#### 5. Image Assets
**Purpose**: Track all generated and uploaded images

```typescript
{
  id: uuid,
  brand_id: uuid,
  asset_type: 'logo' | 'banner' | 'base_generated' | 'composed_post',
  file_path: string,           // Supabase Storage path
  public_url: string,
  width: number,
  height: number,
  metadata: {
    phase: 'phase_1_base' | 'phase_2_composed',
    base_image?: string,       // For composed images
    profile_used?: string,     // Which template
    composition_data?: object,
    original_name?: string,
    logo_type?: string,
    banner_category?: string
  },
  created_at: timestamp
}
```

#### 6. Posts
**Purpose**: Generated content awaiting approval

```typescript
{
  id: uuid,
  brand_id: uuid,
  created_by: uuid,
  post_content: text,
  status: 'draft' | 'approved' | 'published' | 'rejected',
  image_url: string,
  image_composition_id: uuid,
  compliance_status: 'pass' | 'warn' | 'fail',
  approved_by: uuid,
  approved_at: timestamp,
  published_at: timestamp,
  metadata: {
    headline: string,
    body: string,
    cta: string,
    hashtags: string[],
    image_prompt: string,
    base_image_url: string,
    base_asset_id: uuid
  }
}
```

## API Workflows

### Setup Workflow (One-Time)

1. **Analyze Brand** → `/api/pro/marketing-dna`
   - Input: LinkedIn profile URL or manual brief
   - Output: Marketing DNA (tone, colors, style)
   - Powered by: GPT-4

2. **Create Brand Kit** → `/api/pro/brand-kit/save`
   - Input: Logos, colors, fonts, tone
   - Output: Brand Kit ID
   - Can be locked to prevent changes

3. **Generate Mood Board** → `/api/pro/mood-board`
   - Input: Brand Kit + Marketing DNA
   - Output: Mood Board ID
   - Can be auto-suggested or manually created

4. **Upload Assets** → `/api/pro/brand-kit/logo` + `/api/pro/brand-kit/banner`
   - Input: Image files
   - Output: Asset URLs
   - Stored in Supabase Storage

### Content Generation Workflow (Daily)

#### Option A: Complete Workflow (Recommended)
`POST /api/pro/workflow/generate`

**Input**:
```json
{
  "brandId": "uuid",
  "headline": "5 Tips to Scale Your Startup",
  "bodyText": "Learn how successful founders...",
  "cta": "Read the full guide →",
  "hashtags": ["#startup", "#growth"],
  "imagePrompt": "Modern tech office with diverse team",
  "profileName": "LinkedIn Hero Post"
}
```

**What It Does**:
1. Generates base image (Phase 1 - DALL-E 3)
2. Composes with brand elements (Phase 2 - SVG)
3. Creates draft post in database
4. Runs compliance checks
5. Logs audit trail

**Output**:
```json
{
  "success": true,
  "postId": "uuid",
  "baseImageUrl": "https://...",
  "composedImageUrl": "https://...",
  "compositionId": "uuid",
  "message": "Post generated successfully. Review and publish when ready."
}
```

#### Option B: Step-by-Step

1. **Generate Post Options** → `/api/pro/post-options`
   - Input: Topic/prompt
   - Output: 3 headline/body/CTA variations
   - Powered by: GPT-4

2. **Generate Base Image** → `/api/pro/image/generate-base`
   - Input: Prompt + mood board context
   - Output: Base image URL
   - Powered by: DALL-E 3

3. **Compose Final Image** → `/api/pro/image/compose`
   - Input: Base image + Brand Kit + Image Profile
   - Output: Composed image URL
   - Powered by: SVG compositor

4. **Save Draft** → `/api/pro/post/save-draft`
   - Input: Post content + image URL
   - Output: Post ID

5. **Run Compliance** → `/api/pro/compliance/check`
   - Input: Post ID
   - Output: Pass/warn/fail status

### Approval & Publishing Workflow

1. **Review Drafts** → `GET /api/pro/post/list?brandId=uuid&status=draft`
   - Returns all draft posts with compliance data

2. **Approve & Publish** → `/api/pro/publish`
   - Input: Post ID + publishToLinkedIn flag
   - Checks compliance status
   - Creates approval record
   - Optionally posts to LinkedIn
   - Requires: Human approval (no auto-posting)

## Compliance System

### Check Types

1. **Spam Pattern Detection**
   - Max 8 hashtags
   - No repeated lines
   - Max 3 ALL CAPS words
   - Status: pass/warn

2. **Automation Risk**
   - Max 8% emoji ratio
   - No bot-like patterns
   - Status: pass/warn

3. **Brand Consistency**
   - Checks against "do not use" terms
   - Validates tone guidelines
   - Status: pass/fail

4. **Overall Compliance**
   - Any "fail" → Post blocked
   - Any "warn" → Requires review
   - All "pass" → Ready to publish

## Component Architecture

### Setup Components
- `BrandAnalyzer`: LinkedIn profile analysis
- `VisualStyleWizard`: Brand Kit creation (4 templates)
- `AssetManager`: Logo/banner uploads

### Generation Components
- `PostGenerator`: Topic → 3 post options → image generation
- `AdvancedComposer`: Phase 2 composition controls
- `TemplateLibrary`: Browse 8+ Image Profile templates

### Management Components
- `SmartScheduler`: Calendar view of scheduled posts
- `BrandStampDesigner`: Custom watermark designer
- `ImageEditor`: Manual post-composition edits

## Tech Stack

### Frontend
- **Next.js 14**: App Router + Server Components
- **React 18**: Client-side interactivity
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Custom CSS**: `studio.css` (268 lines of animations)

### Backend
- **Next.js API Routes**: 32+ endpoints
- **Supabase**: PostgreSQL + Storage + Auth + RLS
- **OpenAI API**: GPT-4 (analysis) + DALL-E 3 (images)
- **SVG Composition**: Deterministic image layering

### AI Services
- **GPT-4**: Marketing DNA analysis, post generation, tone checking
- **DALL-E 3**: HD base image generation (1792x1024)
- **Future**: Fine-tuned models for brand consistency

## Security & Access Control

### Row Level Security (RLS)
- All tables filter by `brand_id` → `brands.owner_user_id` → `auth.uid()`
- Users can only access their own brands' data
- Enforced at database level (not just API)

### Brand Kit Locking
- Once locked, Brand Kit cannot be modified
- Ensures consistency across all generated content
- Lock can be released by owner

### Audit Logs
- All major actions logged: `audit_logs` table
- Tracks: brand creation, post approval, image generation, compliance checks
- Immutable record for compliance

## Development Roadmap

### ✅ Completed
- Two-phase image system architecture
- Brand Kit + Mood Board + Marketing DNA
- 8 Image Profile templates
- DALL-E 3 base generation
- SVG composition engine
- Compliance checking
- LinkedIn publishing integration
- Asset upload to Supabase Storage
- Complete workflow API
- Audit logging

### 🚧 In Progress
- Enhanced Phase 2 composition (Sharp/Canvas)
- More Image Profile templates
- Fine-tuned brand consistency models

### 📋 Planned
- Batch generation (10+ posts at once)
- Content calendar with auto-suggestions
- A/B testing for posts
- Performance analytics
- Team collaboration features
- Brand voice fine-tuning
- Video post support

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_STORAGE_BUCKET=brand-assets

# OpenAI
OPENAI_API_KEY=sk-xxx

# LinkedIn (for publishing)
LINKEDIN_CLIENT_ID=xxx
LINKEDIN_CLIENT_SECRET=xxx
```

## Database Setup

Run migrations in order:
1. `supabase/schema.sql` - Core tables
2. `supabase/schema_v2.sql` - Additional tables
3. `supabase/rls.sql` - Security policies

Create storage bucket:
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand-assets', 'brand-assets', true);
```

## Usage Examples

### 1. One-Click Post Generation

```typescript
const response = await fetch('/api/pro/workflow/generate', {
  method: 'POST',
  body: JSON.stringify({
    brandId: 'uuid',
    headline: '5 Ways to Boost Engagement',
    bodyText: 'Engagement is the key to...',
    cta: 'Learn more →',
    hashtags: ['#marketing', '#socialmedia'],
  }),
});

const { postId, composedImageUrl } = await response.json();
// Post is now in drafts, ready for review
```

### 2. Custom Image Profile

```typescript
await fetch('/api/pro/image-profiles', {
  method: 'POST',
  body: JSON.stringify({
    brandId: 'uuid',
    name: 'Custom Hero Layout',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'base_image', position: 'fill' },
        { type: 'logo', position: 'top-left', size: 80 },
        { type: 'headline', position: 'center', fontSize: 56 }
      ]
    },
    tags: ['custom', 'hero']
  })
});
```

### 3. Approve and Publish

```typescript
// Check compliance
await fetch('/api/pro/compliance/check', {
  method: 'POST',
  body: JSON.stringify({ postId: 'uuid' })
});

// Approve and publish
await fetch('/api/pro/publish', {
  method: 'POST',
  body: JSON.stringify({ 
    postId: 'uuid',
    publishToLinkedIn: true 
  })
});
```

## Best Practices

### 1. Always Lock Brand Kit After Setup
Once your brand identity is finalized, lock it to ensure consistency.

### 2. Use System Templates First
Start with the 8 system Image Profiles before creating custom ones.

### 3. Review All Posts Before Publishing
Never auto-publish without human review. Compliance checks help but don't replace human judgment.

### 4. Keep Marketing DNA Updated
Re-analyze LinkedIn profile quarterly to adapt to brand evolution.

### 5. Monitor Compliance Scores
If posts consistently get "warn" status, update tone guidelines in Brand Kit.

### 6. Use Mood Boards for Campaigns
Create campaign-specific mood boards for seasonal or themed content.

## Support & Troubleshooting

### Common Issues

**Q: Base image generation fails**
- Check OpenAI API key is valid
- Ensure prompt isn't flagged by content policy
- Verify Supabase storage bucket exists

**Q: Composition doesn't include logo**
- Verify Brand Kit has logo_assets populated
- Check Image Profile includes logo layer
- Ensure brandKitId is passed to compose API

**Q: Posts stuck in "draft" status**
- Run compliance check: `/api/pro/compliance/check`
- Check compliance_status field in posts table
- Review compliance_checks table for failures

**Q: LinkedIn publishing fails**
- Verify LinkedIn connection is active
- Check linkedin_connections table
- Ensure post complies with LinkedIn's API limits

---

Built with ❤️ for marketers who want AI to do the heavy lifting without losing control.
