# ⚡ Quick Start - LinkedIn Posting App

## What Was Built

A complete LinkedIn posting automation platform with:
- ✅ **LinkedIn OAuth connection**
- ✅ **AI-powered post generation** (via n8n webhooks)
- ✅ **PDF upload support** for content extraction
- ✅ **One-click approval + direct posting** to LinkedIn
- ✅ **Optional scheduling** for later posting
- ✅ **Organization posting support**

## 🎯 The Main Flow

```
1. User lands on homepage (/)
   ↓
2. Clicks "Continue with LinkedIn"
   ↓
3. Authenticates with LinkedIn OAuth
   ↓
4. Redirected to dashboard (/app)
   ↓
5. Clicks "Connect LinkedIn" → Authorizes posting permissions
   ↓
6. Goes to Generate page (/app/generate)
   ↓
7. Either uploads PDF OR writes a prompt
   ↓
8. AI generates post + image (via n8n webhook)
   ↓
9. Reviews preview
   ↓
10. Clicks "Approve & Post to LinkedIn" ← THIS IS THE KEY CHANGE!
    ↓
11. POST GOES LIVE IMMEDIATELY! ✨
```

## 🔑 Key Changes Made

### 1. **Direct Auto-Posting on Approval** 
**File:** `/app/api/approve/route.ts`

Previously: Approval only sent to n8n for custom logic
Now: Approval immediately posts to LinkedIn

```typescript
// When user approves, the endpoint now:
1. Marks post as "approved"
2. Calls LinkedIn API directly
3. Updates post status to "posted"
4. Returns success with LinkedIn post ID
```

### 2. **PDF Upload Support**
**Files:** 
- `/app/app/generate/page.tsx` - UI with drag-drop PDF upload
- `/app/api/generate/route.ts` - Handles FormData with PDF

Users can now:
- Upload PDF files (max 10MB)
- Add optional context/prompt
- Or just write a prompt (no PDF needed)

### 3. **Simplified UI**
- Removed separate "Send for approval" button
- Single "Approve & Post to LinkedIn" button
- Clear visual feedback when posting

## 🚀 To Get Started

1. **Set up environment:**
   ```bash
   cp .env.local.example .env.local
   # Fill in your values
   ```

2. **Ensure you have:**
   - [ ] Supabase project with tables created
   - [ ] LinkedIn Developer App with posting scope
   - [ ] n8n instance with two webhooks
   
3. **Install & run:**
   ```bash
   npm install
   npm run dev
   # Visit http://localhost:3000
   ```

4. **Test the flow:**
   - Login with LinkedIn
   - Connect LinkedIn account
   - Generate a post (try both prompt and PDF)
   - Click "Approve & Post to LinkedIn"
   - Post should appear on your LinkedIn profile instantly!

## 📝 Important Configuration

### `.env.local` Must Include

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# LinkedIn OAuth  
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback

# n8n Webhooks
N8N_GENERATE_WEBHOOK_URL=https://your-n8n/webhook/generate
N8N_APPROVE_WEBHOOK_URL=https://your-n8n/webhook/approve
N8N_X_API_KEY=...
```

### LinkedIn Scopes Required

Must request:
- `r_liteprofile` - Read profile
- `r_emailaddress` - Read email  
- **`w_member_social`** - Write social posts (REQUIRED!)

## 🎨 UI Components Updated

| File | Change |
|------|--------|
| `/app/app/generate/page.tsx` | Added PDF upload UI + new form validation |
| `/app/api/approve/route.ts` | Auto-posts to LinkedIn on approval |
| `/app/api/generate/route.ts` | Handles PDF uploads via FormData |

## 🧠 How It Works

### Generation Flow
```
User Input (PDF + Prompt)
    ↓
/api/generate endpoint
    ↓
Create FormData with PDF
    ↓
POST to n8n webhook
    ↓
n8n extracts PDF content
    ↓
n8n calls AI (OpenAI/Claude)
    ↓
Returns: {title, post_content, image_url}
    ↓
Saved to database as "draft"
    ↓
User sees preview
```

### Approval → Posting Flow
```
User clicks "Approve & Post to LinkedIn"
    ↓
/api/approve endpoint
    ↓
Fetch LinkedIn connection (tokens)
    ↓
Call LinkedIn API /v2/ugcPosts
    ↓
Post goes LIVE
    ↓
Update database: status = "posted"
    ↓
Return LinkedIn post URN
    ↓
User sees success message
```

## 🔍 Testing Each Component

### Test PDF Upload
1. Go to `/app/generate`
2. Click PDF upload area
3. Select any PDF file
4. Should show filename

### Test Generation
1. Add prompt or use PDF
2. Click "Generate"
3. Should call n8n webhook
4. Preview should populate

### Test Posting
1. After generation, review preview
2. Click "Approve & Post to LinkedIn"
3. Should post to your LinkedIn profile within 5 seconds
4. Check your LinkedIn - post should be there!

## 💾 Database Tables

All data automatically synced:
- `profiles` - User info
- `linkedin_connections` - OAuth tokens & permissions
- `posts` - All generated posts with status

## 🐛 Common Issues

**"LinkedIn post failed"**
- Check LinkedIn token hasn't expired
- Verify user has `w_member_social` scope
- Check LinkedIn API response in network tab

**"n8n not configured"**
- Verify N8N_GENERATE_WEBHOOK_URL is accessible
- Test: `curl -X POST https://your-n8n.../webhook/generate`

**"PDF not uploading"**
- Max size is 10MB
- Must be .pdf file
- Check network tab for 400 errors

## 📊 Status Codes

Posts can have these statuses:
- `draft` - Generated, not yet approved
- `approved` - Approved by user
- `posted` - Successfully posted to LinkedIn
- `scheduled` - Scheduled for future posting
- `failed` - Error during posting

## ✨ What's Next

Optional enhancements:
1. Add image editing before posting
2. Add hashtag suggestions
3. Add post scheduling UI
4. Add post performance analytics
5. Add team approval workflows
6. Add brand guidelines/templates

## 📞 Debug Tips

- Check browser console for frontend errors
- Check server logs for backend errors
- Use network tab to inspect API calls
- Verify all env vars are set: `console.log(process.env)`
- Test n8n webhooks independently

---

**You're all set! The app is ready to use. Start by connecting your LinkedIn and generating your first post!** 🎉
