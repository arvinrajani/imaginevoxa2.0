# LinkedIn Auto-Posting Application

A complete LinkedIn post generation and publishing platform built with **Next.js**, **Supabase**, and **n8n**.

Generate LinkedIn posts from prompts or PDFs, review AI-generated content, and post directly to LinkedIn with one click.

## ✨ Key Features

- ✅ **LinkedIn OAuth Authentication** - Secure login with LinkedIn
- ✅ **AI Post Generation** - Generate posts from prompts or PDF uploads
- ✅ **One-Click Publishing** - Approve and post directly to LinkedIn instantly
- ✅ **PDF Support** - Upload PDFs for content extraction and post generation
- ✅ **Image Generation** - AI-generated images for posts
- ✅ **Organization Posting** - Post to personal profile or organization pages
- ✅ **Post Scheduling** - Schedule posts for later publishing
- ✅ **Post History** - Track all generated and posted content
- ✅ **Row-Level Security** - User data isolated and protected

## 🚀 Quick Start (3 minutes)

```bash
# 1. Clone and install
git clone <repo-url>
cd linkedin-posting
npm install

# 2. Set up environment
cp .env.local.example .env.local
# Edit .env.local with your credentials

# 3. Run development server
npm run dev

# 4. Open browser
# Visit http://localhost:3000
```

Then see **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for detailed configuration.

## 📋 User Flow

```
1. User lands on homepage → Sees product overview
   ↓
2. Clicks "Continue with LinkedIn" → LinkedIn OAuth
   ↓
3. Completes OAuth → Authenticated and profile created
   ↓
4. Connects LinkedIn account → OAuth approval for posting
   ↓
5. Goes to Generate page → Upload PDF or write prompt
   ↓
6. AI generates post + image → Sees preview
   ↓
7. Clicks "Approve & Post to LinkedIn" → POST GOES LIVE! ✨
   ↓
8. Post appears on LinkedIn within seconds
```

## 🔧 Requirements

- **Node.js 18+**
- **npm or yarn**
- **Supabase** account (free tier ok)
- **LinkedIn Developer App** with API access
- **n8n** instance (for AI generation)

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[QUICK_START.md](QUICK_START.md)** | 5-minute overview & key changes |
| **[SETUP_GUIDE.md](SETUP_GUIDE.md)** | Complete setup & configuration |
| **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** | API endpoints & contracts |
| **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** | Pre/post deployment guide |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Common issues & solutions |
| **[CHANGES_SUMMARY.md](CHANGES_SUMMARY.md)** | Technical changes made |

## 🏗️ Architecture

### Frontend
- **Next.js 16** - React framework
- **React Hook Form** - Form management
- **Zod** - Schema validation
- **Shadcn UI** - UI components
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations

### Backend
- **Next.js API Routes** - Server endpoints
- **Supabase** - Database & Auth
- **LinkedIn OAuth** - Authentication & posting
- **n8n** - AI generation & approval workflows

### Database
- **PostgreSQL** (via Supabase)
- **Row-Level Security** - Data isolation
- **Real-time subscriptions** - Live updates

## 🔐 Security

✅ **Implemented Security Features:**
- CSRF protection on OAuth flows
- Row-level security policies
- User authentication required
- Access token encryption
- Post ownership validation
- Secure credential handling

## 📦 Project Structure

```
app/
├── page.tsx                    # Landing page
├── login/page.tsx             # Login page
├── app/
│   ├── page.tsx               # Dashboard
│   ├── generate/page.tsx      # Post generation (main feature)
│   ├── linkedin/page.tsx      # Connection management
│   └── posts/page.tsx         # Post history
└── api/
    ├── generate/              # AI post generation ⭐
    ├── approve/               # Approval + auto-post ⭐
    ├── post/                  # Manual posting
    ├── schedule/              # Schedule posting
    └── linkedin/              # OAuth endpoints

components/
├── linkedin/linkedin-client.tsx  # Connection UI
├── ui/                            # Shadcn components
└── providers/                     # Context & providers

lib/
└── supabase/
    ├── client.ts              # Client Supabase
    ├── server.ts              # Server Supabase
    └── admin.ts               # Admin operations

supabase/
├── schema.sql                 # Database schema
└── rls.sql                    # Security policies
```

## 🔑 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
LINKEDIN_SCOPES=r_liteprofile r_emailaddress w_member_social

# n8n Webhooks
N8N_GENERATE_WEBHOOK_URL=https://your-n8n/webhook/generate
N8N_APPROVE_WEBHOOK_URL=https://your-n8n/webhook/approve
N8N_X_API_KEY=your_n8n_api_key

NODE_ENV=development
```

See `.env.local.example` for all variables.

## 🎯 Main Features Explained

### 1. LinkedIn OAuth
- Secure login with LinkedIn
- Stores access tokens securely
- Fetches organizations where user is admin
- Supports both personal and organization posting

### 2. Post Generation
- **From Prompt:** Write description → AI generates post
- **From PDF:** Upload PDF → Extract content → Generate post
- **Validation:** Either prompt (10+ chars) or PDF required
- **n8n Integration:** Webhook processes content → calls OpenAI/Claude

### 3. Approval → Auto-Posting ⭐
- User reviews generated post
- Clicks "Approve & Post to LinkedIn"
- **NEW:** Post goes directly to LinkedIn (no manual step)
- Saved with LinkedIn post ID
- Instant feedback with toast notification

### 4. Image Generation
- Optional AI-generated images
- Uses DALL-E, Midjourney, or similar
- Generated by n8n workflow
- Included in LinkedIn post

## 🚀 Deployment

### Development
```bash
npm run dev
# Runs at http://localhost:3000
```

### Production Build
```bash
npm run build
npm run start
# Or deploy to Vercel, Docker, self-hosted
```

See **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** for detailed deployment steps.

## 🐛 Troubleshooting

Common issues and solutions in **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**:
- LinkedIn login problems
- PDF upload issues
- Posting failures
- Performance issues
- And more...

## 📊 Database Schema

### `posts` table
- `id` - UUID primary key
- `user_id` - References auth.users
- `prompt` - Original user input
- `title` - Generated post title
- `post_content` - Generated post text
- `image_url` - Generated image URL
- `status` - draft | approved | posted | scheduled | failed
- `posted_at` - When post went live
- `linkedin_post_urn` - LinkedIn's post ID

### `linkedin_connections` table
- `id` - UUID primary key
- `user_id` - References auth.users
- `access_token` - OAuth access token
- `refresh_token` - OAuth refresh token
- `member_urn` - User's LinkedIn member URN
- `orgs` - JSON array of organizations

### `profiles` table
- `id` - UUID primary key (references auth.users)
- `full_name` - User's name
- `avatar_url` - Profile picture
- `created_at` - Account creation time

## 📈 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Generate post from prompt/PDF |
| POST | `/api/approve` | Approve post + auto-post to LinkedIn |
| POST | `/api/post` | Manual post (deprecated) |
| POST | `/api/schedule` | Schedule post for later |
| GET | `/api/linkedin/connection` | Get connection status |
| GET | `/api/linkedin/start` | Start OAuth flow |
| GET | `/api/linkedin/callback` | Handle OAuth callback |
| POST | `/api/linkedin/disconnect` | Revoke connection |

Full docs in **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)**.

## 🧪 Testing

```bash
# Lint code
npm run lint

# Build (checks for errors)
npm run build

# Start production server
npm run start
```

## 📝 What's Included

✅ Complete user authentication (Supabase)
✅ LinkedIn OAuth integration
✅ Post generation via n8n webhooks
✅ PDF upload and processing
✅ One-click approval → auto-posting
✅ Image generation support
✅ Organization posting
✅ Post scheduling
✅ Database schema & RLS policies
✅ Comprehensive documentation
✅ Error handling & validation
✅ Production-ready code

## 🎉 Getting Started

1. **Clone the repository** and run `npm install`
2. **Read [SETUP_GUIDE.md](SETUP_GUIDE.md)** for configuration
3. **Create LinkedIn Developer App** and get credentials
4. **Set up Supabase** project and run database schema
5. **Configure n8n** webhooks for post generation
6. **Copy `.env.local.example` to `.env.local`** and fill credentials
7. **Run `npm run dev`** and test locally
8. **Follow [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** to deploy

## 🤝 Contributing

Improvements and bug fixes welcome!

## 📞 Support

1. Check **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** for common issues
2. Review **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for configuration help
3. See **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** for API details

---

**Ready to automate your LinkedIn posting? Let's go! 🚀**

Built with ❤️ using Next.js, Supabase, and n8n
