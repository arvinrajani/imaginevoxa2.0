# Pro Studio - Complete Marketing Studio Guide

## Overview

Pro Studio is a comprehensive AI-powered marketing studio designed to replace traditional LinkedIn content creators. It provides end-to-end brand management, content generation, and visual design capabilities.

## Key Features

### 🎨 Brand Analysis & Definition
- **LinkedIn Profile Analysis**: Automatically analyze existing LinkedIn profiles to extract brand DNA
- **Manual Brand Brief**: Define your brand through natural language descriptions
- **AI-Powered Extraction**: Extract colors, tone, visual style, and content patterns
- **Visual Style Wizard**: Interactive setup flow to define your complete brand identity

### 🎯 Style Templates
Pre-built templates for quick setup:
- **Modern Tech**: Clean, minimal, data-driven aesthetic
- **Bold Creative**: Vibrant, attention-grabbing, playful
- **Premium Elegant**: Sophisticated, luxury, authoritative
- **Friendly & Approachable**: Warm, human-centered, accessible

### 🖼️ Asset Management
- **Logo Upload**: Support for multiple logo variations (primary, secondary, icon)
- **Banner Management**: Background images and patterns for posts
- **Drag & Drop**: Intuitive file upload with preview
- **Asset Library**: Organize and access all brand assets in one place

### ✨ AI Post Generator
- **Topic-Based Generation**: Enter any topic and get 3+ post variations
- **Brand-Aware**: All posts generated match your brand style automatically
- **Real-Time Preview**: See LinkedIn-style preview before publishing
- **Image Generation**: AI-generated images that match your brand colors and style
- **Regeneration**: Don't like a post? Regenerate with one click

### 🎨 Advanced Image Editor
- **Canvas-Based Editor**: Full control over every element
- **Text Layers**: Add and customize text with brand fonts and colors
- **Image Layers**: Upload logos, photos, graphics with positioning control
- **Background Options**: Solid colors, gradients, or custom images
- **Brand Integration**: Automatic use of brand colors and logo
- **Export**: Download finished images ready for LinkedIn

### 📊 Dashboard & Analytics
- **Activity Tracking**: Monitor posts generated, images created, scheduled content
- **Recent Activity**: Timeline of all studio actions
- **Brand Profile Summary**: Quick view of your brand settings
- **Quick Actions**: Fast access to common tasks

## Components Architecture

### Core Components

#### `BrandAnalyzer` (`components/studio/brand-analyzer.tsx`)
Handles brand discovery through multiple methods:
- LinkedIn profile URL analysis
- Manual brand brief input
- Asset upload and analysis

**Props:**
```typescript
{
  brandId: string;
  onAnalysisComplete: (analysis: LinkedInAnalysis) => void;
}
```

#### `VisualStyleWizard` (`components/studio/visual-style-wizard.tsx`)
3-step wizard for defining brand style:
1. Choose template or start from scratch
2. Customize colors and typography
3. Define tone and content pillars

**Props:**
```typescript
{
  onComplete: (profile: StyleProfile) => void;
  initialProfile?: Partial<StyleProfile>;
}
```

#### `AssetManager` (`components/studio/asset-manager.tsx`)
Manage all brand assets:
- Logo variations with type classification
- Banner and background images
- Drag-and-drop upload
- AI generation suggestions

**Props:**
```typescript
{
  brandId: string;
  brandKitId?: string;
  onLogosUpdate: (logos: LogoAsset[]) => void;
  onBannersUpdate: (banners: BannerAsset[]) => void;
}
```

#### `PostGenerator` (`components/studio/post-generator.tsx`)
Generate and preview posts:
- Multiple post variations
- Real-time LinkedIn preview
- Image generation integration
- Copy and export functionality

**Props:**
```typescript
{
  brandId: string;
  brandColors?: string[];
  logoUrl?: string;
  onPostGenerated: (post: GeneratedPost) => void;
}
```

#### `ImageEditor` (`components/studio/image-editor.tsx`)
Full-featured image editor:
- Canvas-based editing (1200x627px LinkedIn size)
- Text and image layers
- Background customization
- Export to PNG

**Props:**
```typescript
{
  baseImageUrl?: string;
  logoUrl?: string;
  brandColors?: string[];
  onExport: (imageData: string) => void;
}
```

## Setup Flow

### New User Experience

1. **Welcome Screen**
   - Overview of Pro Studio features
   - Quick start guide
   - Option to skip if already setup

2. **Brand Analysis (Step 1)**
   - Analyze LinkedIn profile
   - OR enter brand brief
   - OR upload brand assets
   - AI extracts brand DNA

3. **Visual Style (Step 2)**
   - Choose from 4 templates
   - Customize color palette
   - Preview live changes
   - Select typography mood

4. **Asset Upload (Step 3)**
   - Upload logos (multiple variations)
   - Add banners/backgrounds
   - AI generation option
   - Complete setup

5. **Studio Ready**
   - Access full studio
   - Generate first post
   - Explore all features

## Usage Examples

### Generate a Post

```typescript
// User enters topic
const topic = "Announcing our Q4 results - 150% revenue growth";

// System generates 3 variations with brand style
// User selects preferred version
// Optional: Generate matching image
// Export or schedule post
```

### Create Custom Image

```typescript
// Start with base image or gradient
// Add brand logo (automatically positioned)
// Add headline text (brand colors)
// Add body text or graphics
// Export as PNG (1200x627px)
```

### Update Brand Style

```typescript
// Access settings
// Modify color palette
// Update tone preferences
// All future posts automatically use new style
```

## API Routes

### Brand Asset Upload
- **POST** `/api/pro/brand-kit/logo` - Upload logo assets
- **POST** `/api/pro/brand-kit/banner` - Upload banner/background images

### LinkedIn Analysis
- **POST** `/api/pro/linkedin/analyze` - Analyze LinkedIn posts for brand DNA
- **POST** `/api/pro/linkedin/fetch` - Fetch posts from LinkedIn profile

### Brand Intake
- **POST** `/api/pro/brand-intake` - Process brand brief and generate profile

### Post Generation
- **POST** `/api/pro/post-options` - Generate post variations
- **POST** `/api/pro/image/base` - Generate base images
- **POST** `/api/pro/image/compose` - Compose text + image

## Database Schema

### Key Tables

#### `brand_kits`
```sql
- id (uuid)
- brand_id (uuid)
- name (text)
- primary_colors (text[])
- secondary_colors (text[])
- accent_colors (text[])
- logo_assets (jsonb)
- font_personality (text)
- tone_guidelines (text[])
- allowed_image_styles (text[])
```

#### `marketing_identities`
```sql
- id (uuid)
- brand_id (uuid)
- voice_traits (text[])
- positioning (text)
- audience_personas (text[])
- do_not_use (text[])
- preferred_phrases (text[])
```

#### `mood_boards`
```sql
- id (uuid)
- brand_id (uuid)
- name (text)
- palette_colors (text[])
- typography_mood (text)
- image_density (text)
- composition_style (text)
- emotional_tone (text)
```

## Customization

### Adding New Templates

Edit `components/studio/visual-style-wizard.tsx`:

```typescript
const STYLE_TEMPLATES = [
  {
    id: 'your-template',
    name: 'Your Template Name',
    preview: { primary: '#COLOR1', secondary: '#COLOR2', accent: '#COLOR3' },
    description: 'Template description',
    profile: {
      colorScheme: { /* colors */ },
      typography: { /* fonts */ },
      imagery: { /* styles */ },
      tone: { /* voice */ },
      content: { /* pillars */ },
    },
  },
];
```

### Customizing Image Editor

Modify `components/studio/image-editor.tsx`:
- Change canvas size: `canvasSize`
- Add new tools: extend `tool` state
- Custom fonts: add to font family options

### Extending Post Generator

Update `components/studio/post-generator.tsx`:
- Add more post options
- Customize preview template
- Add scheduling integration

## Best Practices

### Brand Setup
1. Always start with LinkedIn analysis if profile exists
2. Use templates as starting point, then customize
3. Upload multiple logo variations for flexibility
4. Define at least 3 content pillars

### Post Generation
1. Be specific with topics for better results
2. Generate 3+ variations to choose from
3. Always preview before publishing
4. Add images for better engagement

### Image Creation
1. Use brand colors consistently
2. Keep text readable (high contrast)
3. Position logo consistently
4. Export at LinkedIn recommended size (1200x627px)

## Troubleshooting

### LinkedIn Analysis Fails
- Ensure profile is public
- Check if user has recent posts (need 3+ posts)
- Try manual brand brief instead

### Image Upload Issues
- Check file size (max 5MB)
- Verify image format (PNG, JPG, SVG)
- Ensure brand ID is valid

### Post Generation Slow
- AI generation takes 5-15 seconds
- Image generation takes 15-30 seconds
- Check API quotas if consistently slow

## Future Enhancements

### Planned Features
- [ ] Video post support
- [ ] Carousel post creator
- [ ] A/B testing for posts
- [ ] Performance analytics
- [ ] Team collaboration
- [ ] Content calendar view
- [ ] Hashtag suggestions
- [ ] Competitor analysis
- [ ] Brand voice fine-tuning
- [ ] Multi-language support

## Support

For issues or questions:
1. Check this documentation
2. Review component props and types
3. Check browser console for errors
4. Verify API endpoints are accessible

## Credits

Built with:
- Next.js 14
- React 18
- Tailwind CSS
- Supabase
- OpenAI GPT-4
- Lucide Icons
