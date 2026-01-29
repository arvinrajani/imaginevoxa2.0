# 🎯 Quick Reference Card

## Installation (Copy-Paste Ready)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.local.example .env.local

# 3. Edit .env.local with your values
# (Use your LinkedIn, Supabase, and n8n credentials)

# 4. Run development server
npm run dev

# 5. Open http://localhost:3000
```

## Environment Variables (Minimum Required)

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
LINKEDIN_CLIENT_ID=your_linkedin_id
LINKEDIN_CLIENT_SECRET=your_linkedin_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
N8N_GENERATE_WEBHOOK_URL=your_n8n_webhook_generate
N8N_X_API_KEY=your_n8n_api_key
```

## Key Files Modified

| File | What Changed |
|------|-------------|
| `/app/api/approve/route.ts` | ⭐ Now posts directly to LinkedIn |
| `/app/app/generate/page.tsx` | ✨ Added PDF upload UI |
| `/app/api/generate/route.ts` | ✨ Handles PDF files |

## User Journey

```
Landing → Login → Connect LinkedIn → Generate → Approve & Post → Done!
```

## Important URLs

- **Dev:** `http://localhost:3000`
- **Landing:** `/`
- **Login:** `/login`
- **Dashboard:** `/app`
- **Generate Post:** `/app/generate`
- **Connect LinkedIn:** `/app/linkedin`

## API Endpoints (Main Ones)

```
POST /api/generate          # Generate post
POST /api/approve           # Approve & auto-post
GET  /api/linkedin/start    # Start LinkedIn OAuth
GET  /api/linkedin/callback # Handle OAuth callback
```

## Database Tables

```
- profiles (user info)
- linkedin_connections (OAuth tokens)
- posts (generated posts)
```

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Run production
npm run lint     # Check code
```

## Common Issues & Fixes

### "LinkedIn not configured"
→ Check `.env.local` has all LinkedIn variables

### "n8n not configured"
→ Check `N8N_GENERATE_WEBHOOK_URL` and `N8N_X_API_KEY`

### "Post not appearing on LinkedIn"
→ Check user has `w_member_social` scope and is connected

### "PDF upload fails"
→ File must be under 10MB and be valid PDF

## Testing the Flow

1. ✅ Open `http://localhost:3000`
2. ✅ Click "Continue with LinkedIn"
3. ✅ Complete OAuth
4. ✅ Go to `/app/linkedin` and connect
5. ✅ Go to `/app/generate`
6. ✅ Write prompt or upload PDF
7. ✅ Click "Generate"
8. ✅ Wait for preview
9. ✅ Click "Approve & Post to LinkedIn"
10. ✅ Check LinkedIn - post should appear!

## Documentation Map

```
README_NEW.md
├── Quick start overview
├── Features list
└── Project structure

QUICK_START.md
├── 5-minute overview
├── Main flow diagram
└── Testing steps

SETUP_GUIDE.md
├── Detailed setup
├── LinkedIn app setup
├── n8n configuration
└── Troubleshooting

API_DOCUMENTATION.md
├── All endpoints
├── Request/response examples
└── n8n webhook contracts

DEPLOYMENT_CHECKLIST.md
├── Pre-deployment tests
├── Deployment options
└── Rollback procedures

TROUBLESHOOTING.md
└── Common issues & fixes
```

## n8n Webhook Requirements

### Generate Webhook
- **URL:** `POST /webhook/generate`
- **Headers:** `x-api-key: YOUR_KEY`
- **Input:** `prompt`, `pdf` (optional), `wantImage`, `userId`
- **Output:** `{ title, post_content, image_url }`

### Approve Webhook
- **URL:** `POST /webhook/approve`
- **Headers:** `x-api-key: YOUR_KEY`
- **Input:** `postId`, `userId`, `title`, `post_content`, `image_url`
- **Output:** Any 2xx status code

## Security Checklist

- ✅ CSRF tokens on OAuth
- ✅ Row-level security in Supabase
- ✅ User auth required on all endpoints
- ✅ Tokens encrypted in database
- ✅ Post ownership validated

## Performance Targets

- Page load: < 2 seconds
- Post generation: 30-60 seconds (via n8n)
- Post to LinkedIn: < 5 seconds
- Database queries: < 100ms

## Port Numbers

- **Dev Server:** 3000
- **n8n (default):** 5678
- **Database:** 5432 (Supabase cloud)

## File Size Limits

- **PDF Upload:** 10MB max
- **Image:** No hard limit
- **Post Text:** LinkedIn limit ~3000 chars

## Rate Limits

- **LinkedIn:** ~100 posts/day per user
- **n8n:** Configure per your plan
- **Supabase:** Generous free tier limits

## Deployment Options

1. **Vercel** - Best for Next.js
   ```bash
   vercel
   ```

2. **Self-Hosted** - Docker or VPS
   ```bash
   docker build -t app .
   docker run -p 3000:3000 app
   ```

3. **Railway/Render** - PaaS platforms

## Quick Debug Steps

1. Check browser console for errors
2. Check browser DevTools → Network tab
3. Check server logs in terminal
4. Test API endpoint with curl
5. Check database in Supabase console
6. Check n8n workflow logs

## Status Monitoring

- **LinkedIn API:** https://developer.linkedin.com/support
- **Supabase:** https://status.supabase.com
- **n8n:** Check your instance health

## LinkedIn Scopes Required

```
r_liteprofile       (read profile)
r_emailaddress      (read email)
w_member_social     (write posts) ⭐ MOST IMPORTANT
```

## Next Steps After Setup

1. Test complete flow locally
2. Set up error tracking (Sentry, etc.)
3. Configure monitoring/alerts
4. Test with real LinkedIn post
5. Deploy to production
6. Monitor for errors

## Emergency Commands

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :3000   # Windows

# Reset database
# Supabase → Backups → Restore

# Revoke GitHub tokens if leaked
# Settings → Developer settings → Personal access tokens
```

## Success Signs

✅ User can login with LinkedIn
✅ Connection shows member URN
✅ Post generates with preview
✅ Post appears on LinkedIn within 30 seconds
✅ No errors in console
✅ Database shows post with "posted" status

## Reach Out If...

- [x] Setup complete but login doesn't work
- [x] Generation works but posting fails
- [x] PDF upload not working
- [x] App crashes/500 errors
- [x] Slow performance

→ Check TROUBLESHOOTING.md first, then review logs

---

**Everything set? Start building! 🚀**
