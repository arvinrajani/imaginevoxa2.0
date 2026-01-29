# 🚀 Deployment Checklist

## Pre-Deployment Testing

Use this checklist to verify everything works before going live.

### ✅ Local Development Setup

- [ ] Node.js 18+ installed
- [ ] `.env.local` file created with all variables
- [ ] `npm install` completed
- [ ] `npm run dev` starts without errors
- [ ] App accessible at `http://localhost:3000`

### ✅ Supabase Configuration

- [ ] Project created and URL/keys in `.env.local`
- [ ] `schema.sql` executed (tables created)
- [ ] `rls.sql` executed (security policies enabled)
- [ ] Auth redirect URLs configured:
  - `http://localhost:3000/app`
  - `http://localhost:3000/login`
  - `http://localhost:3000/api/linkedin/callback`

### ✅ LinkedIn Developer App

- [ ] Developer app created
- [ ] Client ID and Secret in `.env.local`
- [ ] Redirect URI added: `http://localhost:3000/api/linkedin/callback`
- [ ] Scopes requested: `r_liteprofile`, `r_emailaddress`, `w_member_social`
- [ ] App status: "Live" (not sandbox)

### ✅ n8n Setup

- [ ] n8n instance running (self-hosted or cloud)
- [ ] Two webhooks created:
  - [ ] `/webhook/generate` endpoint
  - [ ] `/webhook/approve` endpoint
- [ ] Both webhooks accept `x-api-key` header
- [ ] API key generated and in `.env.local` as `N8N_X_API_KEY`
- [ ] Generate webhook tested independently
- [ ] Approve webhook tested independently

### ✅ Frontend Testing

#### Landing Page (`/`)
- [ ] Page loads
- [ ] "Continue with LinkedIn" button visible
- [ ] Links work

#### Login Page (`/login`)
- [ ] "Continue with LinkedIn" button works
- [ ] LinkedIn OAuth popup/redirect works
- [ ] After login, redirected to `/app`

#### Dashboard (`/app`)
- [ ] Loads for authenticated user
- [ ] Shows connection status
- [ ] Recent activity section visible

#### LinkedIn Connection (`/app/linkedin`)
- [ ] "Connect LinkedIn" button visible
- [ ] Clicking connects to LinkedIn
- [ ] After connection:
  - [ ] Member URN displayed
  - [ ] Organizations listed (if any)
  - [ ] Disconnect button available
- [ ] Can disconnect and reconnect

#### Generate Page (`/app/generate`)
- [ ] Form loads
- [ ] PDF upload area visible
- [ ] Can select and upload PDF
- [ ] Can clear uploaded PDF
- [ ] Prompt textarea works
- [ ] Image/approval selects work
- [ ] Target type select works

### ✅ API Testing

#### Generate Endpoint
- [ ] POST with prompt generates post
- [ ] POST with PDF generates post
- [ ] Generation appears in preview
- [ ] Image appears in preview

#### Approve Endpoint
- [ ] POST approve marks as approved
- [ ] Post appears on LinkedIn within 30 seconds
- [ ] Status changes to "posted"
- [ ] Success toast appears

#### LinkedIn OAuth
- [ ] Start endpoint redirects to LinkedIn
- [ ] Callback endpoint exchanges code for token
- [ ] Token saved to database
- [ ] Connection status returns valid data

### ✅ Database Testing

- [ ] User profile created after signup
- [ ] LinkedIn connection saved after auth
- [ ] Posts saved with correct status
- [ ] Post status updates after posting
- [ ] RLS policies enforce user isolation

### ✅ Error Handling

- [ ] Missing env vars show clear error
- [ ] LinkedIn OAuth failures handled gracefully
- [ ] n8n webhook failures handled gracefully
- [ ] Invalid PDF uploads show error message
- [ ] Network errors show toast notification

---

## Production Deployment Checklist

### ✅ Environment Setup

- [ ] Production `.env.local` created with:
  - [ ] Production Supabase URL/keys
  - [ ] Production LinkedIn app credentials
  - [ ] Production n8n endpoint
  - [ ] `NODE_ENV=production`

### ✅ Supabase Production

- [ ] Separate production Supabase project created
- [ ] Schema and RLS policies migrated
- [ ] Auth redirect URLs updated to production domain:
  - `https://yourdomain.com/app`
  - `https://yourdomain.com/login`
  - `https://yourdomain.com/api/linkedin/callback`

### ✅ LinkedIn Production App

- [ ] New LinkedIn app created (don't reuse dev app)
- [ ] Production redirect URI: `https://yourdomain.com/api/linkedin/callback`
- [ ] App status verified as "Live"
- [ ] Credentials in production env

### ✅ n8n Production

- [ ] n8n deployed to production server
- [ ] Webhooks configured with production URLs
- [ ] API key secured (use secrets management)
- [ ] Webhooks tested from production

### ✅ Build & Deployment

- [ ] `npm run build` succeeds
- [ ] No TypeScript errors
- [ ] No ESLint warnings (or acknowledged)
- [ ] `npm run start` works locally
- [ ] Docker image builds (if using containers)

### ✅ Security Audit

- [ ] All secrets moved to environment variables
- [ ] No hardcoded credentials in code
- [ ] `.env.local` added to `.gitignore`
- [ ] HTTPS enforced on all endpoints
- [ ] CORS configured if needed
- [ ] Rate limiting configured (recommended)

### ✅ Monitoring Setup

- [ ] Error tracking configured (Sentry, etc.)
- [ ] Logging configured for API calls
- [ ] Database backups configured
- [ ] Uptime monitoring configured
- [ ] Alert thresholds set

### ✅ Performance

- [ ] `npm run build` completes in <5 min
- [ ] Bundle size acceptable
- [ ] No console warnings
- [ ] Images optimized
- [ ] Database queries optimized

### ✅ DNS & SSL

- [ ] Domain DNS records configured
- [ ] SSL certificate installed
- [ ] HTTPS working on all pages
- [ ] Redirects HTTP → HTTPS

---

## Production Deployment Steps

### Option 1: Vercel (Recommended for Next.js)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login and deploy
vercel

# 3. Configure env vars in Vercel dashboard
# 4. Set production domains
# 5. Verify deployment
```

### Option 2: Self-Hosted (VPS/EC2)

```bash
# 1. Clone repo
git clone https://github.com/yourusername/linkedin-posting.git

# 2. Install dependencies
cd linkedin-posting
npm install

# 3. Configure env vars
cp .env.local.example .env.local
# Edit with production values

# 4. Build
npm run build

# 5. Use PM2 or systemd to run
npm install -g pm2
pm2 start npm --name "linkedin-posting" -- start

# 6. Configure Nginx reverse proxy
# Point to http://localhost:3000
```

### Option 3: Docker

```bash
# 1. Create Dockerfile
docker build -t linkedin-posting .

# 2. Run container
docker run -d \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -e LINKEDIN_CLIENT_ID=... \
  -p 3000:3000 \
  linkedin-posting
```

---

## Post-Deployment Verification

### ✅ Smoke Tests

- [ ] Home page loads (`https://yourdomain.com/`)
- [ ] Can login with LinkedIn
- [ ] Dashboard displays correctly
- [ ] Can connect LinkedIn
- [ ] Can generate post from prompt
- [ ] Can generate post from PDF
- [ ] Can approve and post to LinkedIn
- [ ] Post appears on LinkedIn within 1 minute

### ✅ Real-World Testing

- [ ] Login from different browser
- [ ] Login from mobile device
- [ ] Test with different PDF sizes
- [ ] Test with different prompts
- [ ] Generate and post 3 test posts
- [ ] Verify posts on actual LinkedIn profile

### ✅ Monitoring

- [ ] No errors in error tracking
- [ ] Response times acceptable (<2s)
- [ ] Database performance good
- [ ] n8n webhooks responsive
- [ ] LinkedIn API responses normal

---

## Rollback Plan

If something breaks in production:

1. **Immediate:** Revert to previous stable version
   ```bash
   git revert HEAD
   npm run build
   npm run start
   ```

2. **Database:** Restore from backup
   ```bash
   # In Supabase dashboard → Backups
   ```

3. **Environment:** Revert env variables to previous version

4. **LinkedIn OAuth:** Use dev credentials temporarily while fixing

5. **Notify Users:** Post status update

---

## Maintenance Schedule

- [ ] Weekly: Review error logs
- [ ] Weekly: Monitor database usage
- [ ] Monthly: Review and update dependencies
- [ ] Monthly: Test disaster recovery
- [ ] Quarterly: Security audit
- [ ] Quarterly: Performance optimization review

---

## Production Support

### Common Issues & Solutions

**"LinkedIn not posting"**
1. Check access token hasn't expired
2. Verify w_member_social scope enabled
3. Check LinkedIn API rate limits
4. Review error in application logs

**"n8n webhook timeout"**
1. Check n8n instance is running
2. Verify webhook URL is accessible
3. Check API key is correct
4. Increase webhook timeout

**"PDF not processing"**
1. Verify file size <10MB
2. Check it's valid PDF format
3. Review n8n workflow logs
4. Test with different PDF

**"High database usage"**
1. Review slow queries
2. Add indexes for frequent filters
3. Archive old posts
4. Optimize n8n queries

---

## Signoff

- [ ] Product Manager: Verified requirements met
- [ ] Tech Lead: Verified code quality
- [ ] DevOps: Verified infrastructure
- [ ] QA: Verified testing complete
- [ ] Security: Verified security checklist

---

**Ready for production! 🚀**

Document Version: 1.0
Last Updated: January 2026
