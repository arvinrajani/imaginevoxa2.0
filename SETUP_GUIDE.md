# LinkedIn Posting Application - Complete Setup Guide

## 🚀 Overview

This application enables users to:
1. **Connect their LinkedIn account** via OAuth
2. **Generate LinkedIn posts** from prompts or PDF uploads using AI
3. **Approve and auto-post** directly to their LinkedIn profile/organization
4. **Schedule posts** for later publishing
5. **Track post history** and performance

## 📋 Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Supabase** account with a project
- **LinkedIn Developer App** with API access
- **n8n** instance (self-hosted or cloud) for AI generation & approval workflows

## 🔧 Environment Setup

### 1. Create `.env.local` file

Copy the example configuration:

```bash
cp .env.local.example .env.local
```

Then fill in your values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
LINKEDIN_SCOPES=r_liteprofile r_emailaddress w_member_social

# n8n Webhooks
N8N_GENERATE_WEBHOOK_URL=https://your-n8n-instance/webhook/generate
N8N_APPROVE_WEBHOOK_URL=https://your-n8n-instance/webhook/approve
N8N_X_API_KEY=your_n8n_api_key

NODE_ENV=development
```

### 2. LinkedIn Developer App Setup

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers)
2. Create a new application
3. In **Settings → Authorized redirect URLs**, add:
   - `http://localhost:3000/api/linkedin/callback` (dev)
   - `https://yourdomain.com/api/linkedin/callback` (prod)

4. Request the following **Sign In with LinkedIn** scopes:
   - `r_liteprofile` - Read profile
   - `r_emailaddress` - Read email
   - `w_member_social` - **REQUIRED for posting**

5. Copy your **Client ID** and **Client Secret** to `.env.local`

### 3. Supabase Database Setup

#### Create Tables & Functions

Run the SQL from `supabase/schema.sql` in your Supabase SQL editor:

```sql
-- Tables for profiles, LinkedIn connections, and posts
-- Includes auto-trigger to create profile on new user signup
```

Then enable **Row Level Security (RLS)** by running `supabase/rls.sql`:

```sql
-- Enables security policies so users can only access their own data
```

**Key Tables:**
- `profiles` - User information
- `linkedin_connections` - OAuth tokens & organization access
- `posts` - Generated posts with status tracking

#### Set Auth Redirect URLs

In **Supabase → Authentication → URL Configuration**, add:
- `http://localhost:3000/app` (Redirect URL)
- `http://localhost:3000/login` (Site URL)  
- `http://localhost:3000/api/linkedin/callback` (LinkedIn callback)

### 4. n8n Workflow Setup

Your n8n instance needs two webhook endpoints:

**Webhook 1: Generate (`/webhook/generate`)**
- Receives: `prompt`, `userId`, `wantImage`, optional `pdf` file
- Returns: `{ title, post_content, image_url }`
- This should call your AI service (OpenAI, Claude, etc.) to generate the post

**Webhook 2: Approve (`/webhook/approve`)**
- Receives: `postId`, `userId`, `title`, `post_content`, `image_url`
- Optional: Can trigger notifications, logging, or additional processing
- The actual posting to LinkedIn happens in the `/api/approve` route

**Example n8n Webhook Configuration:**
```
Method: POST
Headers: x-api-key: ${N8N_X_API_KEY}
Content-Type: multipart/form-data (for generate with PDF)
```

## 📦 Installation & Running

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Navigate to http://localhost:3000
```

## 🎯 User Flow

### 1. **Landing Page** (`/`)
- User sees product overview
- Options to Sign In or View Demo

### 2. **Login** (`/login`)
- Click "Continue with LinkedIn"
- Redirected to Supabase OAuth → LinkedIn OAuth

### 3. **Dashboard** (`/app`)
- Shows connection status
- Recent posts history
- Quick actions

### 4. **Connect LinkedIn** (`/app/linkedin`)
- User clicks "Connect LinkedIn"
- OAuth flow → LinkedIn authorization
- Tokens & organization permissions saved to database

### 5. **Generate Post** (`/app/generate`)
- **Option A: Upload PDF**
  - Click upload area → select PDF file
  - n8n webhook processes PDF → extracts content → generates post
  
- **Option B: Write Prompt**
  - Enter detailed prompt or context
  - AI generates post and image
  
- **Review & Approve**
  - See preview of generated post + image
  - Click **"Approve & Post to LinkedIn"**
  - Post goes live immediately to their profile

### 6. **Optional: Schedule Post**
- Instead of instant posting
- Select date/time for scheduled posting
- Post queued for later delivery

## 🔐 Security Features

✅ **User Authentication** via Supabase Auth  
✅ **Row Level Security** - Users can only access their own posts  
✅ **Encrypted Tokens** - LinkedIn access tokens stored securely  
✅ **CSRF Protection** - State validation on OAuth callbacks  
✅ **Server-Side Validation** - All requests validated on backend  

## 📁 Project Structure

```
app/
├── page.tsx              # Landing page
├── login/                # Login page
├── app/
│   ├── page.tsx         # Dashboard
│   ├── generate/        # Post generation page (main flow)
│   ├── linkedin/        # Connection management
│   └── posts/           # Post history
├── api/
│   ├── generate/        # AI generation endpoint
│   ├── approve/         # Approval + auto-post endpoint ⭐ KEY
│   ├── post/            # Manual posting endpoint
│   ├── schedule/        # Schedule post endpoint
│   └── linkedin/
│       ├── start/       # OAuth initiation
│       ├── callback/    # OAuth callback
│       ├── connection/  # Get connection status
│       └── disconnect/  # Revoke connection

components/
├── linkedin/
│   └── linkedin-client.tsx  # Connection UI
├── ui/                      # Shadcn UI components
└── providers/               # Context providers

lib/
└── supabase/
    ├── client.ts       # Client-side Supabase
    ├── server.ts       # Server-side Supabase
    └── admin.ts        # Admin operations
```

## 🎨 Key Implementation Details

### Approval → Auto-Post Flow

**File:** [app/api/approve/route.ts](app/api/approve/route.ts)

When user clicks **"Approve & Post to LinkedIn"**:

```typescript
1. Mark post as "approved" in database
2. Call n8n approval webhook (optional custom logic)
3. Fetch LinkedIn connection & tokens
4. Call LinkedIn API to post immediately
5. Update post status to "posted" with LinkedIn URN
6. Return success/error response
```

**This is the KEY CHANGE** - Previously it only marked as approved, now it auto-posts!

### PDF Upload Support

**File:** [app/app/generate/page.tsx](app/app/generate/page.tsx)

- User can upload PDF files (max 10MB)
- FormData sent to `/api/generate` endpoint
- n8n webhook receives PDF + optional prompt
- Processes PDF (extract text/images) + generates post

### LinkedIn OAuth Integration

**Files:**
- [app/api/linkedin/start/route.ts](app/api/linkedin/start/route.ts) - Initiates OAuth
- [app/api/linkedin/callback/route.ts](app/api/linkedin/callback/route.ts) - Handles callback
- [components/linkedin/linkedin-client.tsx](components/linkedin/linkedin-client.tsx) - UI

Supports:
- Personal profile posting
- Organization page posting (if user is admin)
- Automatic token refresh

## 🚨 Troubleshooting

### "LinkedIn is not configured"
- Check `.env.local` has `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`
- Verify redirect URI matches LinkedIn app settings exactly

### "n8n not configured"
- Check `N8N_GENERATE_WEBHOOK_URL` and `N8N_X_API_KEY` in `.env.local`
- Test webhook manually: `curl -X POST https://your-n8n-instance/webhook/generate -H "x-api-key: your_key" -d "{}"`

### "LinkedIn not connected"
- User hasn't connected their LinkedIn account yet
- Go to `/app/linkedin` and click "Connect LinkedIn"
- Check OAuth callback is working properly

### Post marked as "draft" but not generating
- Check n8n webhook is accessible and returning valid response
- Verify n8n workflow has correct input mapping for `prompt`, `userId`, `wantImage`

### Posts not appearing on LinkedIn
- Verify LinkedIn access token hasn't expired (check `linkedin_connections.expires_at`)
- Confirm user has `w_member_social` permission scope
- Check LinkedIn API response in browser console for errors

## 📊 Database Schema

### `posts` table
- `id` - UUID (Primary Key)
- `user_id` - References auth.users
- `prompt` - Original user prompt/PDF content
- `title` - Generated post title
- `post_content` - Generated post text
- `image_url` - Generated image URL
- `status` - 'draft' | 'approved' | 'posted' | 'failed'
- `target_type` - 'person' | 'org'
- `target_urn` - LinkedIn URN of posting target
- `linkedin_post_urn` - LinkedIn's post ID after posting
- `scheduled_for` - Optional timestamp for scheduled posts
- `posted_at` - Timestamp when post went live
- `created_at` - Record creation timestamp

## 🤝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Generate post from prompt/PDF |
| POST | `/api/approve` | Approve post + auto-post to LinkedIn |
| POST | `/api/post` | Manual post (deprecated, use approve) |
| POST | `/api/schedule` | Schedule post for later |
| GET | `/api/linkedin/connection` | Get LinkedIn connection status |
| GET | `/api/linkedin/start` | Start OAuth flow |
| GET | `/api/linkedin/callback` | Handle OAuth callback |
| POST | `/api/linkedin/disconnect` | Revoke LinkedIn connection |

## 🧪 Testing

```bash
# Run linter
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## 📝 Notes

- Posts are stored with full audit trail (status, timestamps, errors)
- LinkedIn API rate limits: ~100 posts per day per user
- Images are generated by n8n workflow (configure DALL-E, Midjourney, etc.)
- Tokens auto-refresh when posting (handled in approval endpoint)

## 🎉 Success Checklist

- [ ] Environment variables configured
- [ ] Supabase project set up with tables & RLS
- [ ] LinkedIn app created with scopes
- [ ] n8n webhooks created and tested
- [ ] User can login with LinkedIn
- [ ] User can connect LinkedIn
- [ ] User can generate post (with prompt or PDF)
- [ ] User can approve & post directly to LinkedIn
- [ ] Post appears on user's LinkedIn profile within seconds

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review environment variable setup
3. Test each API endpoint independently
4. Check browser console and server logs for errors

---

**Happy posting! 🚀**
